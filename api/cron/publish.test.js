// api/cron/publish.test.js — GET /api/cron/publish (the scheduled-publish cron).
//
// This handler has no injectable store/fetchFn (unlike lib/automation/handlers/
// run.js or lib/content/handlers/llm-proxy.js, which take a third `{ fetchFn }`
// arg for exactly this reason) — it calls the shared `kv` singleton from
// lib/kv.js and the global `fetch` directly. `kv` is a plain, unfrozen object
// (see lib/kv.js), so its methods are monkeypatched here for the duration of
// each test and restored in `finally` — this is a workaround for the missing
// injectable deps, not the project's normal test style (see llm-proxy.test.js /
// run-timeouts.test.js), reported rather than "fixed" here since fixing it
// would mean editing production source. `node --test` isolates each test FILE
// in its own process, but not each test within a file, so restoration matters
// within this file. Never touches real KV.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import handler from './publish.js';
import { kv } from '../../lib/kv.js';

function mkRes() {
  const r = { statusCode: null, body: null };
  r.status = c => { r.statusCode = c; return r; };
  r.json   = b => { r.body = b;       return r; };
  return r;
}

let savedSecret, savedAppUrl;
function setEnv() {
  savedSecret = process.env.CRON_SECRET;
  savedAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.CRON_SECRET = 'test-secret';
  process.env.NEXT_PUBLIC_APP_URL = 'https://example.test';
}
function restoreEnv() {
  if (savedSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = savedSecret;
  if (savedAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL = savedAppUrl;
}

// Run a test with kv.lrange/kv.get monkeypatched, always restoring originals.
async function withKv({ lrange, get }, testFn) {
  const origLrange = kv.lrange;
  const origGet = kv.get;
  kv.lrange = lrange;
  kv.get = get;
  setEnv();
  try {
    await testFn();
  } finally {
    kv.lrange = origLrange;
    kv.get = origGet;
    restoreEnv();
  }
}

describe('GET /api/cron/publish', () => {
  it('rejects a request with no Authorization header', async () => {
    setEnv();
    try {
      const res = mkRes();
      await handler({ headers: {} }, res);
      assert.equal(res.statusCode, 401);
      assert.deepEqual(res.body, { error: 'Unauthorized' });
    } finally {
      restoreEnv();
    }
  });

  it('answers 503 when CRON_SECRET is unset — even to `Bearer undefined`, which the old inline compare accepted', async () => {
    setEnv();
    delete process.env.CRON_SECRET;
    try {
      const res = mkRes();
      await handler({ headers: { authorization: 'Bearer undefined' } }, res);
      assert.equal(res.statusCode, 503);
      assert.match(res.body.error, /CRON_SECRET/);
    } finally {
      restoreEnv();
    }
  });

  it('rejects a wrong secret', async () => {
    setEnv();
    try {
      const res = mkRes();
      await handler({ headers: { authorization: 'Bearer wrong' } }, res);
      assert.equal(res.statusCode, 401);
    } finally {
      restoreEnv();
    }
  });

  it('returns all-zero counts and never calls kv.get when the index is empty', async () => {
    let getCalls = 0;
    await withKv({ lrange: async () => [], get: async () => { getCalls++; return null; } }, async () => {
      const res = mkRes();
      await handler({ headers: { authorization: 'Bearer test-secret' } }, res);
      assert.deepEqual(res.body, { published: 0, failed: 0, total: 0 });
      assert.equal(getCalls, 0);
    });
  });

  it('publishes only items that are scheduled and due, ignoring drafts and future-dated items', async () => {
    const now = Date.now();
    const items = {
      'content:1': { id: '1', status: 'scheduled', scheduledAt: new Date(now - 60000).toISOString() }, // due
      'content:2': { id: '2', status: 'draft', scheduledAt: new Date(now - 60000).toISOString() },     // wrong status
      'content:3': { id: '3', status: 'scheduled', scheduledAt: new Date(now + 60000).toISOString() }, // future
      'content:4': null, // missing record
    };
    const fetchedContentIds = [];
    const fetchedAuth = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      const body = JSON.parse(opts.body);
      fetchedContentIds.push(body.contentId);
      fetchedAuth.push(opts.headers?.Authorization);
      return { ok: true, status: 200 };
    };
    try {
      await withKv({
        lrange: async () => ['1', '2', '3', '4'],
        get: async (key) => items[key] ?? null,
      }, async () => {
        const res = mkRes();
        await handler({ headers: { authorization: 'Bearer test-secret' } }, res);
        assert.deepEqual(fetchedContentIds, ['1']);
        // /api/publish is gated: the cron authenticates with the internal bearer
        // (it used to send an `x-cron` header that nothing read).
        assert.deepEqual(fetchedAuth, ['Bearer test-secret']);
        assert.deepEqual(res.body, { published: 1, failed: 0, total: 1 });
      });
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('counts a rejected publish fetch as failed, not published', async () => {
    const now = Date.now();
    const items = {
      'content:1': { id: '1', status: 'scheduled', scheduledAt: new Date(now - 60000).toISOString() },
    };
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('ECONNRESET'); };
    try {
      await withKv({
        lrange: async () => ['1'],
        get: async (key) => items[key] ?? null,
      }, async () => {
        const res = mkRes();
        await handler({ headers: { authorization: 'Bearer test-secret' } }, res);
        assert.deepEqual(res.body, { published: 0, failed: 1, total: 1 });
      });
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
