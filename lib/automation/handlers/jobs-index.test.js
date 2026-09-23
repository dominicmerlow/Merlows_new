// lib/automation/handlers/jobs-index.test.js — GET /api/automation/jobs
//
// 2026-09-23 fix: this used to Promise.all one kv.get per job id. It now goes
// through mgetBatched (sequential MGET, batchSize 200) — see lib/kv.js and
// lib/kv-batch.test.js for the low-level batching behaviour. This file covers
// the caller: batching at the real index size, status/ruleId filtering, null
// dropping, and that it never falls back to a per-key kv.get.
//
// No injectable deps on this handler, so — same workaround as
// api/cron/publish.test.js — the shared `kv` singleton is monkeypatched per
// test and restored in `finally`. Never touches real KV.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import handler from './jobs-index.js';
import { kv } from '../../kv.js';

function mkRes() {
  const r = { statusCode: 200, body: null };
  r.status = c => { r.statusCode = c; return r; };
  r.json   = b => { r.body = b;       return r; };
  return r;
}

async function withKv({ lrange, mget, get }, testFn) {
  const origLrange = kv.lrange;
  const origMget = kv.mget;
  const origGet = kv.get;
  kv.lrange = lrange;
  if (mget) kv.mget = mget;
  if (get) kv.get = get;
  try {
    await testFn();
  } finally {
    kv.lrange = origLrange;
    kv.mget = origMget;
    kv.get = origGet;
  }
}

describe('GET /api/automation/jobs (jobs-index handler)', () => {
  it('returns [] and calls mget zero times when the index is empty', async () => {
    let mgetCalls = 0;
    await withKv({ lrange: async () => [], mget: async (...keys) => { mgetCalls++; return keys.map(() => null); } }, async () => {
      const res = mkRes();
      await handler({ method: 'GET', query: {} }, res);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, []);
      assert.equal(mgetCalls, 0);
    });
  });

  it('batches 450 ids into MGET calls of 200/200/50, uses mget (never per-key get), and drops nulls', async () => {
    const N = 450;
    const ids = Array.from({ length: N }, (_, i) => `job${i}`);
    const seed = {};
    ids.forEach((id, i) => {
      // every 5th job record missing
      seed[`automation:job:${id}`] = (i % 5 === 0) ? null : { id, status: 'pending_review', ruleId: 'r1' };
    });
    const mgetCallSizes = [];
    let getCalls = 0;
    await withKv({
      lrange: async () => ids,
      mget: async (...keys) => { mgetCallSizes.push(keys.length); return keys.map(k => seed[k] ?? null); },
      get: async () => { getCalls++; return null; },
    }, async () => {
      const res = mkRes();
      await handler({ method: 'GET', query: {} }, res);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(mgetCallSizes, [200, 200, 50]);
      assert.equal(getCalls, 0);
      const expectedCount = ids.filter((_, i) => i % 5 !== 0).length;
      assert.equal(res.body.length, expectedCount);
      assert.ok(res.body.every(j => j !== null));
    });
  });

  it('filters by status and ruleId query params', async () => {
    const ids = ['1', '2', '3', '4'];
    const seed = {
      'automation:job:1': { id: '1', status: 'pending_review', ruleId: 'ruleA' },
      'automation:job:2': { id: '2', status: 'done',           ruleId: 'ruleA' },
      'automation:job:3': { id: '3', status: 'pending_review', ruleId: 'ruleB' },
      'automation:job:4': null,
    };
    await withKv({
      lrange: async () => ids,
      mget: async (...keys) => keys.map(k => seed[k] ?? null),
    }, async () => {
      const res = mkRes();
      await handler({ method: 'GET', query: { status: 'pending_review', ruleId: 'ruleA' } }, res);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].id, '1');
    });
  });

  it('rejects non-GET with 405', async () => {
    const res = mkRes();
    await handler({ method: 'POST', query: {} }, res);
    assert.equal(res.statusCode, 405);
  });
});
