// lib/social/handlers/connections.js
// GET  /api/social/connections           → per-platform env-var status (does NOT leak values)
// POST /api/social/connections/test      → body { platform } → live verification call
//
// The UI uses this to render the in-app Connections pane. Secrets stay server-side;
// the response only ever returns booleans + diagnostic strings.

import crypto from 'crypto';
import OAuth from 'oauth-1.0a';
import { kv } from '../../kv.js';

const HEALTH_KEY = (platform) => `social:conn-health:${platform}`;

const PLATFORMS = {
  openrouter: {
    label: 'OpenRouter',
    purpose: 'Text + image generation',
    envVars: ['OPENROUTER_API_KEY'],
  },
  fal: {
    label: 'FAL.ai',
    purpose: 'Video generation (Kling v2.1)',
    envVars: ['FAL_KEY'],
  },
  instagram: {
    label: 'Instagram',
    purpose: 'Reel + photo posting',
    envVars: ['INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_BUSINESS_ACCOUNT_ID'],
  },
  facebook: {
    label: 'Facebook',
    purpose: 'Page posting',
    envVars: ['FACEBOOK_ACCESS_TOKEN', 'FACEBOOK_PAGE_ID'],
  },
  linkedin: {
    label: 'LinkedIn',
    purpose: 'UGC post',
    envVars: ['LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_PERSON_ID'],
  },
  twitter: {
    label: 'X / Twitter',
    purpose: '3-tweet thread',
    envVars: ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET'],
  },
  tiktok: {
    label: 'TikTok',
    purpose: 'Video posting',
    envVars: ['TIKTOK_ACCESS_TOKEN'],
  },
  zernio: {
    label: 'Zernio',
    purpose: 'Instagram + TikTok publishing (Merlows News)',
    envVars: ['ZERNIO_API_KEY'],
  },
};

function statusFor(platform) {
  const def = PLATFORMS[platform];
  const missing = def.envVars.filter(v => !process.env[v]);
  return {
    id: platform,
    label: def.label,
    purpose: def.purpose,
    envVars: def.envVars,
    missing,
    configured: missing.length === 0,
  };
}

// ── Per-platform live verification calls ───────────────────────────────────

async function testOpenRouter() {
  const r = await fetch('https://openrouter.ai/api/v1/key', {
    headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` },
  });
  if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
  const d = await r.json().catch(() => ({}));
  const credit = d?.data?.usage != null && d?.data?.limit != null
    ? `$${(d.data.limit - d.data.usage).toFixed(2)} credit remaining`
    : 'key valid';
  // OpenRouter's key label (the masked key or the name given to it in the dashboard)
  // identifies which OpenRouter account/key is plugged in, without exposing the key.
  const label = d?.data?.label ? ` · key ${d.data.label}` : '';
  return { ok: true, detail: credit + label };
}

async function testFal() {
  // FAL has no cheap GET endpoint, so just check key shape (kkkk-...)
  const k = process.env.FAL_KEY || '';
  if (!/^[a-z0-9-]{20,}:[a-f0-9]{32,}$/i.test(k)) {
    return { ok: false, detail: 'key format looks wrong (expected id:secret)' };
  }
  return { ok: true, detail: 'key format valid (no cheap probe endpoint)' };
}

async function testInstagram() {
  const id = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  const tok = process.env.INSTAGRAM_ACCESS_TOKEN;
  const r = await fetch(`https://graph.facebook.com/v19.0/${id}?fields=username&access_token=${tok}`);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, detail: d?.error?.message || `HTTP ${r.status}` };
  return { ok: true, detail: `connected as @${d.username || 'unknown'}` };
}

async function testFacebook() {
  const id = process.env.FACEBOOK_PAGE_ID;
  const tok = process.env.FACEBOOK_ACCESS_TOKEN;
  const r = await fetch(`https://graph.facebook.com/v19.0/${id}?fields=name&access_token=${tok}`);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, detail: d?.error?.message || `HTTP ${r.status}` };
  return { ok: true, detail: `connected to "${d.name || 'unknown'}"` };
}

async function testLinkedIn() {
  const tok = process.env.LINKEDIN_ACCESS_TOKEN;
  const r = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { 'Authorization': `Bearer ${tok}` },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, detail: d?.message || `HTTP ${r.status}` };
  return { ok: true, detail: `connected as ${d.name || d.email || 'unknown'}` };
}

async function testTwitter() {
  const url = 'https://api.twitter.com/2/users/me';
  const oauth = new OAuth({
    consumer: { key: process.env.TWITTER_API_KEY, secret: process.env.TWITTER_API_SECRET },
    signature_method: 'HMAC-SHA1',
    hash_function: (b, k) => crypto.createHmac('sha1', k).update(b).digest('base64'),
  });
  const headers = oauth.toHeader(oauth.authorize(
    { url, method: 'GET' },
    { key: process.env.TWITTER_ACCESS_TOKEN, secret: process.env.TWITTER_ACCESS_SECRET }
  ));
  const r = await fetch(url, { headers });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, detail: d?.title || d?.detail || `HTTP ${r.status}` };
  return { ok: true, detail: `connected as @${d.data?.username || 'unknown'}` };
}

async function testTikTok() {
  const r = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name', {
    headers: { 'Authorization': `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}` },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d?.error?.code) {
    return { ok: false, detail: d?.error?.message || `HTTP ${r.status}` };
  }
  return { ok: true, detail: `connected as ${d.data?.user?.display_name || 'unknown'}` };
}

const ZERNIO_API = 'https://zernio.com/api/v1';
// Zernio publishes to both of these; the social autopilot needs each one live.
const ZERNIO_REQUIRED_PLATFORMS = ['instagram', 'tiktok'];

async function zernioGet(path) {
  const r = await fetch(`${ZERNIO_API}${path}`, {
    headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}` },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
  return d;
}

// Healthy means: an Instagram and a TikTok account are connected, each can post
// without a reconnect, and TikTok offers PUBLIC_TO_EVERYONE. Without that last
// one TikTok would only accept private posts (its unaudited-app restriction), so
// "connected" alone would hide a pipeline that publishes to nobody.
async function testZernio() {
  const { accounts = [] } = await zernioGet('/accounts/health');
  const found = [];
  const problems = [];
  for (const platform of ZERNIO_REQUIRED_PLATFORMS) {
    const acct = accounts.find(a => a.platform === platform);
    if (!acct) { problems.push(`no ${platform} account connected`); continue; }
    found.push(`${platform} @${acct.username} (${acct.accountId})`);
    if (!acct.canPost || acct.needsReconnect) {
      problems.push(`${platform} @${acct.username} cannot post: ${acct.status}${acct.needsReconnect ? ', needs reconnect' : ''}`);
    }
  }
  const tiktok = accounts.find(a => a.platform === 'tiktok');
  if (tiktok) {
    const info = await zernioGet(`/accounts/${encodeURIComponent(tiktok.accountId)}/tiktok/creator-info?mediaType=video`);
    const levels = (info.privacyLevels || []).map(p => p.value);
    if (!levels.includes('PUBLIC_TO_EVERYONE')) {
      problems.push(`tiktok cannot post publicly (privacy levels: ${levels.join(', ') || 'none'})`);
    }
  }
  return { ok: problems.length === 0, detail: [...found, ...problems].join(' · ') };
}

const TESTS = {
  openrouter: testOpenRouter,
  fal: testFal,
  instagram: testInstagram,
  facebook: testFacebook,
  linkedin: testLinkedIn,
  twitter: testTwitter,
  tiktok: testTikTok,
  zernio: testZernio,
};

// ── Run a single platform test, persist health record, return result ──
async function runAndPersist(platform) {
  const now = new Date().toISOString();
  const status = statusFor(platform);
  if (!status.configured) {
    const record = { ok: false, detail: `Missing env vars: ${status.missing.join(', ')}`, checkedAt: now };
    await kv.set(HEALTH_KEY(platform), record).catch(() => {});
    return record;
  }
  let result;
  try {
    result = await TESTS[platform]();
  } catch (err) {
    result = { ok: false, detail: err.message || 'test failed' };
  }
  // Preserve lastGoodAt across failures so the UI can show "last good 3 days ago"
  const prior = await kv.get(HEALTH_KEY(platform)).catch(() => null);
  const record = {
    ok: result.ok,
    detail: result.detail,
    checkedAt: now,
    lastGoodAt: result.ok ? now : (prior?.lastGoodAt || null),
  };
  await kv.set(HEALTH_KEY(platform), record).catch(() => {});
  return record;
}

async function sendTelegramAlert(failures) {
  const tok = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!tok || !chatId || !failures.length) return;
  // Telegram's legacy Markdown rejects the WHOLE message on an unmatched `_`, `*`, `` ` ``
  // or `[` — and failure details carry values like SELF_ONLY or reauth_required — so
  // escape everything we interpolate, and log a rejected send instead of swallowing it.
  const md = (s) => String(s ?? '').replace(/([_*`\[])/g, '\\$1');
  const lines = failures.map(f => `• *${md(f.label)}* — ${md(f.detail)}`).join('\n');
  const text = `🚨 *Social Connections — ${failures.length} platform(s) failing*\n\n${lines}\n\nDashboard: merlows.vercel.app → Social → Connections`;
  try {
    const r = await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
    if (!r.ok) console.error('[connections] Telegram alert rejected:', r.status, await r.text().catch(() => ''));
  } catch (err) {
    console.error('[connections] Telegram alert failed:', err.message);
  }
}

export default async function handler(req, res, action) {
  // GET /api/social/connections
  if (req.method === 'GET' && !action) {
    const platforms = await Promise.all(Object.keys(PLATFORMS).map(async (id) => {
      const status = statusFor(id);
      const health = await kv.get(HEALTH_KEY(id)).catch(() => null);
      return { ...status, health: health || null };
    }));
    return res.status(200).json({ platforms });
  }

  // POST /api/social/connections/test  body { platform }
  if (req.method === 'POST' && action === 'test') {
    const { platform } = req.body || {};
    if (!platform || !PLATFORMS[platform]) {
      return res.status(400).json({ error: `Unknown platform: ${platform}` });
    }
    const result = await runAndPersist(platform);
    return res.status(200).json(result);
  }

  // GET or POST /api/social/connections/check — called by Vercel cron (GET) or manual trigger.
  // Tests every configured platform, persists health record, sends Telegram alert on failure.
  // Auth lives in the catch-all (api/social/[...slug].js) via verifyCronSecret. The inline
  // check that used to sit here trusted a client-spoofable `x-vercel-cron` header and fell
  // open whenever CRON_SECRET was unset.
  if (action === 'check') {
    const ids = Object.keys(PLATFORMS);
    const results = {};
    const failures = [];
    for (const id of ids) {
      const status = statusFor(id);
      if (!status.configured) {
        // Skip unconfigured platforms — don't alert on the empty state
        results[id] = { skipped: 'not configured' };
        continue;
      }
      const r = await runAndPersist(id);
      results[id] = r;
      if (!r.ok) failures.push({ id, label: PLATFORMS[id].label, detail: r.detail });
    }
    await sendTelegramAlert(failures);
    return res.status(200).json({ checkedAt: new Date().toISOString(), results, failureCount: failures.length });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
