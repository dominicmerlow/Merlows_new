// lib/social/handlers/connections.js — POST /api/social/connections/test
// Covers the new Zernio platform (testZernio) and the OpenRouter key-label
// suffix added this session. Auth is no longer this handler's job (it moved to
// the api/social/[...slug].js catch-all — see social-router.test.js), so these
// tests call the exported default handler directly with action 'test'.
//
// globalThis.fetch and the kv singleton are both stubbed per test and restored
// afterwards — kv is shared with another company's production data, and
// zernio.com/openrouter.ai must never see a real request from a test run.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import handler from './connections.js';
import { kv } from '../../kv.js';

function mkRes() {
  const r = { statusCode: null, body: null };
  r.status = c => { r.statusCode = c; return r; };
  r.json   = b => { r.body = b;       return r; };
  return r;
}

function jsonResponse(status, data) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

// Every env var any PLATFORMS entry checks, plus Telegram — the ambient shell
// this repo runs in has real OPENROUTER_API_KEY / ZERNIO_API_KEY values set
// (outside this test's control), which would otherwise leak into the 'check'
// action's all-platforms loop and make an unrelated platform "configured".
const ENV_KEYS = [
  'ZERNIO_API_KEY', 'OPENROUTER_API_KEY', 'MERLOWS_OPENROUTER_KEY', 'FAL_KEY',
  'INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_BUSINESS_ACCOUNT_ID',
  'FACEBOOK_ACCESS_TOKEN', 'FACEBOOK_PAGE_ID',
  'LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_PERSON_ID',
  'TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET',
  'TIKTOK_ACCESS_TOKEN',
  'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID',
];
let savedFetch, savedKvGet, savedKvSet, savedEnv;
beforeEach(() => {
  savedFetch = globalThis.fetch;
  savedKvGet = kv.get;
  savedKvSet = kv.set;
  savedEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k]; // clean slate; each test opts in explicitly
  kv.get = async () => null;   // no prior health record
  kv.set = async () => {};     // persistence is not under test here
});
afterEach(() => {
  globalThis.fetch = savedFetch;
  kv.get = savedKvGet;
  kv.set = savedKvSet;
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k];
  }
});

describe('POST /api/social/connections/test — platform zernio', () => {
  it('reports ok when Instagram and TikTok are both healthy and TikTok can post publicly', async () => {
    process.env.ZERNIO_API_KEY = 'zk_test';
    globalThis.fetch = async (url) => {
      if (url.includes('/accounts/health')) {
        return jsonResponse(200, {
          accounts: [
            { accountId: '6ab29cf6', platform: 'instagram', username: 'merlows.news', status: 'healthy', canPost: true, needsReconnect: false },
            { accountId: '6ab29cb5', platform: 'tiktok',    username: 'merlows.news', status: 'healthy', canPost: true, needsReconnect: false },
          ],
        });
      }
      if (url.includes('/tiktok/creator-info')) {
        return jsonResponse(200, { privacyLevels: [{ value: 'PUBLIC_TO_EVERYONE', label: 'Everyone' }] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    const res = mkRes();
    await handler({ method: 'POST', body: { platform: 'zernio' } }, res, 'test');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.match(res.body.detail, /instagram @merlows\.news \(6ab29cf6\)/);
    assert.match(res.body.detail, /tiktok @merlows\.news \(6ab29cb5\)/);
  });

  it('reports not ok when no TikTok account is connected', async () => {
    process.env.ZERNIO_API_KEY = 'zk_test';
    globalThis.fetch = async (url) => {
      if (url.includes('/accounts/health')) {
        return jsonResponse(200, {
          accounts: [
            { accountId: '6ab29cf6', platform: 'instagram', username: 'merlows.news', status: 'healthy', canPost: true, needsReconnect: false },
          ],
        });
      }
      throw new Error(`unexpected fetch: ${url}`); // no tiktok account → no creator-info call
    };
    const res = mkRes();
    await handler({ method: 'POST', body: { platform: 'zernio' } }, res, 'test');
    assert.equal(res.body.ok, false);
    assert.match(res.body.detail, /no tiktok account connected/);
  });

  it('reports not ok when TikTok cannot post publicly (no PUBLIC_TO_EVERYONE)', async () => {
    process.env.ZERNIO_API_KEY = 'zk_test';
    globalThis.fetch = async (url) => {
      if (url.includes('/accounts/health')) {
        return jsonResponse(200, {
          accounts: [
            { accountId: 'ig1', platform: 'instagram', username: 'merlows.news', status: 'healthy', canPost: true, needsReconnect: false },
            { accountId: 'tt1', platform: 'tiktok',    username: 'merlows.news', status: 'healthy', canPost: true, needsReconnect: false },
          ],
        });
      }
      if (url.includes('/tiktok/creator-info')) {
        return jsonResponse(200, { privacyLevels: [{ value: 'SELF_ONLY', label: 'Only me' }] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    const res = mkRes();
    await handler({ method: 'POST', body: { platform: 'zernio' } }, res, 'test');
    assert.equal(res.body.ok, false);
    assert.match(res.body.detail, /tiktok cannot post publicly \(privacy levels: SELF_ONLY\)/);
  });

  it('reports not ok when Instagram needs reconnecting', async () => {
    process.env.ZERNIO_API_KEY = 'zk_test';
    globalThis.fetch = async (url) => {
      if (url.includes('/accounts/health')) {
        return jsonResponse(200, {
          accounts: [
            { accountId: 'ig1', platform: 'instagram', username: 'merlows.news', status: 'reauth_required', canPost: false, needsReconnect: true },
            { accountId: 'tt1', platform: 'tiktok',    username: 'merlows.news', status: 'healthy',        canPost: true,  needsReconnect: false },
          ],
        });
      }
      if (url.includes('/tiktok/creator-info')) {
        return jsonResponse(200, { privacyLevels: [{ value: 'PUBLIC_TO_EVERYONE', label: 'Everyone' }] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    const res = mkRes();
    await handler({ method: 'POST', body: { platform: 'zernio' } }, res, 'test');
    assert.equal(res.body.ok, false);
    assert.match(res.body.detail, /instagram @merlows\.news cannot post: reauth_required, needs reconnect/);
  });

  it('carries the upstream error message in detail when Zernio rejects the request (401)', async () => {
    process.env.ZERNIO_API_KEY = 'zk_bad';
    globalThis.fetch = async (url) => {
      if (url.includes('/accounts/health')) {
        return jsonResponse(401, { error: 'Invalid API key' });
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    const res = mkRes();
    await handler({ method: 'POST', body: { platform: 'zernio' } }, res, 'test');
    assert.equal(res.body.ok, false);
    assert.equal(res.body.detail, 'Invalid API key');
  });

  it('reports the missing env var and never calls fetch when ZERNIO_API_KEY is unset', async () => {
    delete process.env.ZERNIO_API_KEY;
    globalThis.fetch = async () => { throw new Error('fetch should not be called when unconfigured'); };
    const res = mkRes();
    await handler({ method: 'POST', body: { platform: 'zernio' } }, res, 'test');
    assert.equal(res.body.ok, false);
    assert.equal(res.body.detail, 'Missing env vars: ZERNIO_API_KEY');
  });
});

describe('POST /api/social/connections/test — platform openrouter', () => {
  it('appends the OpenRouter key label to the detail when the API returns one', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test';
    globalThis.fetch = async (url) => {
      assert.equal(url, 'https://openrouter.ai/api/v1/key');
      return jsonResponse(200, { data: { usage: 1.5, limit: 10, label: 'merlows-prod' } });
    };
    const res = mkRes();
    await handler({ method: 'POST', body: { platform: 'openrouter' } }, res, 'test');
    assert.equal(res.body.ok, true);
    assert.equal(res.body.detail, '$8.50 credit remaining · key merlows-prod');
  });

  it('omits the key-label suffix when OpenRouter returns no label', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test';
    globalThis.fetch = async () => jsonResponse(200, { data: { usage: 1.5, limit: 10 } });
    const res = mkRes();
    await handler({ method: 'POST', body: { platform: 'openrouter' } }, res, 'test');
    assert.equal(res.body.detail, '$8.50 credit remaining');
  });
});

describe('POST /api/social/connections/test — platform openrouterSocial', () => {
  it('probes OpenRouter with MERLOWS_OPENROUTER_KEY, not the article key', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-article';
    process.env.MERLOWS_OPENROUTER_KEY = 'sk-or-social';
    let auth = null;
    globalThis.fetch = async (url, init) => {
      assert.equal(url, 'https://openrouter.ai/api/v1/key');
      auth = init.headers.Authorization;
      return jsonResponse(200, { data: { usage: 1, limit: 5, label: 'merlows-social' } });
    };
    const res = mkRes();
    await handler({ method: 'POST', body: { platform: 'openrouterSocial' } }, res, 'test');
    assert.equal(auth, 'Bearer sk-or-social');
    assert.equal(res.body.ok, true);
    assert.equal(res.body.detail, '$4.00 credit remaining · key merlows-social');
  });
});

describe('GET /api/social/connections/check — social OpenRouter key', () => {
  it('raises a Telegram alert naming the social key when OpenRouter rejects it', async () => {
    process.env.MERLOWS_OPENROUTER_KEY = 'sk-or-social-bad';
    process.env.TELEGRAM_BOT_TOKEN = 'tg_token';
    process.env.TELEGRAM_CHAT_ID = '12345';
    let telegramText = null;
    globalThis.fetch = async (url, init) => {
      if (url === 'https://openrouter.ai/api/v1/key') return jsonResponse(401, {});
      if (url.startsWith('https://api.telegram.org/')) {
        telegramText = JSON.parse(init.body).text;
        return jsonResponse(200, { ok: true });
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    const res = mkRes();
    await handler({ method: 'GET', body: {} }, res, 'check');
    assert.equal(res.body.failureCount, 1);
    assert.equal(res.body.results.openrouterSocial.ok, false);
    assert.match(telegramText, /OpenRouter \(social\)\* — HTTP 401/);
  });
});

// GET|POST /api/social/connections/check — the daily cron health sweep. Only
// ZERNIO_API_KEY (+ Telegram vars) is set below, so every other platform in
// PLATFORMS is reported unconfigured by statusFor() and skipped before any
// fetch — these tests only ever see zernio + Telegram network calls.
describe('GET /api/social/connections/check — Telegram alert escaping + logging', () => {
  it('escapes underscores from the failure detail and username before sending to Telegram', async () => {
    process.env.ZERNIO_API_KEY = 'zk_test';
    process.env.TELEGRAM_BOT_TOKEN = 'tg_token';
    process.env.TELEGRAM_CHAT_ID = '12345';
    let telegramBody = null;
    globalThis.fetch = async (url, opts) => {
      if (url.includes('/accounts/health')) {
        return jsonResponse(200, {
          accounts: [
            { accountId: 'ig1', platform: 'instagram', username: 'merlows_news', status: 'healthy', canPost: true, needsReconnect: false },
            { accountId: 'tt1', platform: 'tiktok',    username: 'merlows_news', status: 'healthy', canPost: true, needsReconnect: false },
          ],
        });
      }
      if (url.includes('/tiktok/creator-info')) {
        // TikTok's unaudited-app restriction: only SELF_ONLY offered, no public option.
        return jsonResponse(200, { privacyLevels: [{ value: 'SELF_ONLY', label: 'Only me' }] });
      }
      if (url.includes('api.telegram.org')) {
        telegramBody = JSON.parse(opts.body);
        return jsonResponse(200, { ok: true });
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    const res = mkRes();
    await handler({ method: 'GET', body: {} }, res, 'check');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.failureCount, 1);
    assert.ok(telegramBody, 'Telegram sendMessage should have been called');
    assert.equal(telegramBody.parse_mode, 'Markdown');
    // Escaped forms present...
    assert.match(telegramBody.text, /SELF\\_ONLY/);
    assert.match(telegramBody.text, /merlows\\_news/);
    // ...and the raw, unescaped forms are NOT present anywhere in the message.
    assert.equal(telegramBody.text.includes('SELF_ONLY'), false);
    assert.equal(telegramBody.text.includes('merlows_news'), false);
  });

  it('logs a console.error when Telegram rejects the alert (400) instead of failing silently', async () => {
    process.env.ZERNIO_API_KEY = 'zk_test';
    process.env.TELEGRAM_BOT_TOKEN = 'tg_token';
    process.env.TELEGRAM_CHAT_ID = '12345';
    globalThis.fetch = async (url) => {
      if (url.includes('/accounts/health')) {
        // No TikTok account connected — one failure, no creator-info call needed.
        return jsonResponse(200, {
          accounts: [
            { accountId: 'ig1', platform: 'instagram', username: 'merlows_news', status: 'healthy', canPost: true, needsReconnect: false },
          ],
        });
      }
      if (url.includes('api.telegram.org')) {
        return { ok: false, status: 400, text: async () => "Bad Request: can't parse entities" };
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    const savedConsoleError = console.error;
    const calls = [];
    console.error = (...args) => { calls.push(args); };
    try {
      const res = mkRes();
      await handler({ method: 'GET', body: {} }, res, 'check');
      assert.equal(res.body.failureCount, 1);
    } finally {
      console.error = savedConsoleError;
    }
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], '[connections] Telegram alert rejected:');
    assert.equal(calls[0][1], 400);
  });

  it('sends no Telegram request when every configured platform passes', async () => {
    process.env.ZERNIO_API_KEY = 'zk_test';
    process.env.TELEGRAM_BOT_TOKEN = 'tg_token';
    process.env.TELEGRAM_CHAT_ID = '12345';
    let telegramCalled = false;
    globalThis.fetch = async (url) => {
      if (url.includes('/accounts/health')) {
        return jsonResponse(200, {
          accounts: [
            { accountId: 'ig1', platform: 'instagram', username: 'merlows_news', status: 'healthy', canPost: true, needsReconnect: false },
            { accountId: 'tt1', platform: 'tiktok',    username: 'merlows_news', status: 'healthy', canPost: true, needsReconnect: false },
          ],
        });
      }
      if (url.includes('/tiktok/creator-info')) {
        return jsonResponse(200, { privacyLevels: [{ value: 'PUBLIC_TO_EVERYONE', label: 'Everyone' }] });
      }
      if (url.includes('api.telegram.org')) { telegramCalled = true; return jsonResponse(200, { ok: true }); }
      throw new Error(`unexpected fetch: ${url}`);
    };
    const res = mkRes();
    await handler({ method: 'GET', body: {} }, res, 'check');
    assert.equal(res.body.failureCount, 0);
    assert.equal(telegramCalled, false);
  });
});
