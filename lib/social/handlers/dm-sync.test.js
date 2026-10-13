// lib/social/handlers/dm-sync.js — the thin cron handler around syncDmAutomations. The auth gate
// (CRON_SECRET) is exercised in social-router.test.js; this file is only the handler's own
// contract: what it does with the sweeper's return value and thrown errors. `sync` is injected,
// so nothing here reaches KV or Zernio.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import dmSyncHandler from './dm-sync.js';

function mkRes() {
  const r = { statusCode: null, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

describe('dm-sync handler', () => {
  it('answers 200 with ok:true and the sweep summary spread in', async () => {
    const summary = {
      enabled: true, candidates: 3, pending: 1, created: 1, adopted: 0,
      rejected: 0, retrying: 0, gaveUp: 0, busy: 0, deferred: 0,
    };
    const res = mkRes();
    await dmSyncHandler({}, res, { sync: async () => summary });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true, ...summary });
  });

  it('the switch being off (enabled:false, no other fields) is still an ordinary 200', async () => {
    const res = mkRes();
    await dmSyncHandler({}, res, { sync: async () => ({ enabled: false }) });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true, enabled: false });
  });

  it('a thrown 503 (comment-to-DM on but not configured) becomes a 503 response carrying the message', async () => {
    const res = mkRes();
    await dmSyncHandler({}, res, {
      sync: async () => {
        throw Object.assign(new Error('comment-to-DM is on but not configured: ZERNIO_DM_API_KEY'), { status: 503 });
      },
    });
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, { ok: false, error: 'comment-to-DM is on but not configured: ZERNIO_DM_API_KEY' });
  });

  it('a thrown error with no status defaults to 500, not 503 or 200', async () => {
    const res = mkRes();
    await dmSyncHandler({}, res, { sync: async () => { throw new Error('kv is unreachable'); } });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { ok: false, error: 'kv is unreachable' });
  });

  it('a summary reporting rejected, gaveUp or errors is still 200, not turned into a failure response', async () => {
    const summary = {
      enabled: true, candidates: 4, pending: 4, created: 1, adopted: 0,
      rejected: 1, retrying: 0, gaveUp: 1, busy: 0, deferred: 0, errors: 1,
    };
    const res = mkRes();
    await dmSyncHandler({}, res, { sync: async () => summary });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.rejected, 1);
    assert.equal(res.body.gaveUp, 1);
    assert.equal(res.body.errors, 1);
  });

  it('logs to console.error when the summary needs attention (rejected, gaveUp or errors), and stays quiet otherwise', async () => {
    const calls = [];
    const savedError = console.error;
    console.error = (...args) => calls.push(args.join(' '));
    try {
      await dmSyncHandler({}, mkRes(), { sync: async () => ({ enabled: true, created: 3, rejected: 0, gaveUp: 0 }) });
      assert.equal(calls.length, 0, 'a clean run must not log');

      await dmSyncHandler({}, mkRes(), { sync: async () => ({ enabled: true, gaveUp: 1 }) });
      assert.equal(calls.length, 1);
      assert.match(calls[0], /needs attention/);
      assert.match(calls[0], /"gaveUp":1/);
    } finally {
      console.error = savedError;
    }
  });

  it('wires to the real syncDmAutomations when no sync override is given (SOCIAL_DM off short-circuits before any KV/network call)', async () => {
    const savedDm = process.env.SOCIAL_DM;
    delete process.env.SOCIAL_DM;
    try {
      const res = mkRes();
      await dmSyncHandler({}, res); // no third argument: exercises the real default, not a stub
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, { ok: true, enabled: false });
    } finally {
      if (savedDm === undefined) delete process.env.SOCIAL_DM; else process.env.SOCIAL_DM = savedDm;
    }
  });
});
