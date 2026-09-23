// lib/social/handlers/digest.js
// The daily Telegram digest: what went out, what failed, what was held back.
//
// This is the only routine moment when a person is told what the autopilot did in their
// brand's name. It therefore reports what actually happened rather than what was attempted —
// a post is "posted" when a platform confirmed it, not when Zernio accepted the request.
//
// It also deliberately leads with the bad news. A digest that opens with a success count is
// read as "fine" and closed; the failures and the drops are the reason to send it at all.

import { kv } from '../../kv.js';
import { listPacks } from '../pack/store.js';
import { SLOTS_KEY, gridDate } from '../pack/schedule.js';

const DIGEST_WINDOW_MS = 24 * 60 * 60_000;

/**
 * Summarise the last 24 hours.
 *
 * Pure apart from the reads, so the shape can be asserted without a Telegram account.
 */
export async function buildDigest({ now = Date.now(), store = kv, limit = 100 } = {}) {
  const packs = await listPacks(limit);
  const since = now - DIGEST_WINDOW_MS;
  const recent = packs.filter((pack) => {
    const at = Date.parse(pack.updatedAt ?? pack.createdAt ?? '');
    return Number.isFinite(at) && at >= since;
  });

  const posted = [];
  const failedPosts = [];
  const scheduled = [];
  for (const pack of recent) {
    for (const post of pack.posts ?? []) {
      const entry = { contentId: pack.contentId, title: pack.title ?? pack.social?.headline ?? 'Untitled', ...post };
      if (post.status === 'published') posted.push(entry);
      else if (post.status === 'failed') failedPosts.push(entry);
      else scheduled.push(entry);
    }
  }

  const dropped = recent.filter((pack) => pack.status === 'dropped');
  const failedPacks = recent.filter((pack) => pack.status === 'failed');
  const awaitingReview = recent.filter(
    (pack) => pack.status === 'rendered' && pack.review?.requestedAt && !pack.review?.decision,
  );
  const slots = (await store.get(SLOTS_KEY(gridDate(now))).catch(() => null)) ?? {};

  return {
    date: gridDate(now),
    posted,
    failedPosts,
    scheduled,
    dropped,
    failedPacks,
    awaitingReview,
    slotsFilled: Object.keys(slots).length,
    // A TikTok URL arrives minutes after publishing, via a separate event. Saying so stops
    // "no link" being read as "the post is missing".
    awaitingUrl: posted.filter((p) => !p.url).length,
  };
}

const esc = (text) => String(text ?? '').replace(/[_*[\]()~`>#+=|{}.!-]/g, (ch) => `\\${ch}`);

/** The message. Problems first, then what went out, then what is still queued. */
export function digestMessage(digest) {
  const lines = [`*Merlows social — ${esc(digest.date)}*`];

  if (digest.failedPosts.length) {
    lines.push('', `🔴 *${digest.failedPosts.length} post\\(s\\) failed*`);
    for (const post of digest.failedPosts.slice(0, 6)) {
      lines.push(`· ${esc(post.format)} — ${esc(post.title)}: ${esc(String(post.error ?? '').slice(0, 90))}`);
    }
  }
  if (digest.failedPacks.length) {
    lines.push('', `🔴 *${digest.failedPacks.length} story\\(s\\) failed to produce*`);
    for (const pack of digest.failedPacks.slice(0, 6)) {
      lines.push(`· ${esc(pack.title ?? pack.contentId)}: ${esc(String(pack.error?.message ?? '').slice(0, 90))}`);
    }
  }
  if (digest.dropped.length) {
    lines.push('', `⚪ ${digest.dropped.length} dropped \\(aged out or rejected\\)`);
  }

  lines.push('', `✅ *${digest.posted.length} posted*`);
  for (const post of digest.posted.slice(0, 10)) {
    lines.push(post.url ? `· [${esc(post.format)}](${post.url}) — ${esc(post.title)}` : `· ${esc(post.format)} — ${esc(post.title)} \\(link pending\\)`);
  }
  if (digest.awaitingUrl) {
    lines.push(`_${digest.awaitingUrl} TikTok link\\(s\\) still resolving — they arrive a few minutes after posting\\._`);
  }

  if (digest.scheduled.length) lines.push('', `🕒 ${digest.scheduled.length} scheduled and not yet due`);
  if (digest.awaitingReview.length) {
    lines.push('', `⏳ *${digest.awaitingReview.length} waiting on your review* — they auto\\-approve on the usual timer`);
  }
  if (!digest.posted.length && !digest.scheduled.length && !digest.failedPosts.length) {
    lines.push('', '_Nothing went out today\\._');
  }
  return lines.join('\n');
}

/** Send it. Returns what was sent so the cron response says something useful. */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const digest = await buildDigest();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return res.status(503).json({ error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not configured', digest });
  }

  let sent = false;
  let error = null;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: digestMessage(digest),
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
      }),
    });
    const body = await response.json().catch(() => ({}));
    sent = Boolean(body?.ok);
    if (!sent) error = String(body?.description ?? `HTTP ${response.status}`).slice(0, 200);
  } catch (err) {
    error = String(err?.message ?? err).slice(0, 200);
  }

  // A digest that fails to send is exactly the situation nobody finds out about, so it is
  // logged loudly as well as returned.
  if (!sent) console.error(`[digest] could not send: ${error}`);
  return res.status(200).json({ sent, ...(error ? { error } : {}), digest });
}
