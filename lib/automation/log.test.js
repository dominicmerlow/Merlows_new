// lib/automation/log.test.js — readLogs (lib/automation/log.js)
//
// 2026-09-23 fix: readLogs used to Promise.all one kv.get per log id; it now
// goes through mgetBatched. This covers the caller: uses mget (not per-key
// get), respects `limit`, and drops null records.
//
// No injectable deps here, so — same workaround as api/cron/publish.test.js —
// the shared `kv` singleton is monkeypatched per test and restored in
// `finally`. Never touches real KV.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readLogs, writeLog } from './log.js';
import { kv } from '../kv.js';

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

describe('readLogs', () => {
  it('returns [] and never calls mget when the index is empty', async () => {
    let mgetCalls = 0;
    await withKv({ lrange: async () => [], mget: async (...keys) => { mgetCalls++; return keys.map(() => null); } }, async () => {
      const result = await readLogs(100);
      assert.deepEqual(result, []);
      assert.equal(mgetCalls, 0);
    });
  });

  it('requests lrange with the limit-derived stop index and drops null records', async () => {
    let lrangeArgs;
    const ids = ['l1', 'l2', 'l3'];
    const seed = {
      'automation:log:l1': { id: 'l1', message: 'one' },
      'automation:log:l2': null, // missing record
      'automation:log:l3': { id: 'l3', message: 'three' },
    };
    await withKv({
      lrange: async (key, start, stop) => { lrangeArgs = [key, start, stop]; return ids; },
      mget: async (...keys) => keys.map(k => seed[k] ?? null),
    }, async () => {
      const result = await readLogs(3);
      assert.deepEqual(lrangeArgs, ['automation:logs:index', 0, 2]);
      assert.deepEqual(result.map(r => r.id), ['l1', 'l3']);
    });
  });

  it('uses mget in batches, never falls back to per-key get', async () => {
    const N = 250;
    const ids = Array.from({ length: N }, (_, i) => `l${i}`);
    const seed = {};
    ids.forEach(id => { seed[`automation:log:${id}`] = { id }; });
    const mgetCallSizes = [];
    let getCalls = 0;
    await withKv({
      lrange: async () => ids,
      mget: async (...keys) => { mgetCallSizes.push(keys.length); return keys.map(k => seed[k] ?? null); },
      get: async () => { getCalls++; return null; },
    }, async () => {
      const result = await readLogs(N);
      assert.deepEqual(mgetCallSizes, [200, 50]);
      assert.equal(getCalls, 0);
      assert.equal(result.length, N);
    });
  });

  it('defaults to limit 100 when called with no argument', async () => {
    let lrangeArgs;
    await withKv({
      lrange: async (key, start, stop) => { lrangeArgs = [key, start, stop]; return []; },
      mget: async (...keys) => keys.map(() => null),
    }, async () => {
      await readLogs();
      assert.deepEqual(lrangeArgs, ['automation:logs:index', 0, 99]);
    });
  });
});

describe('writeLog size caps', () => {
  async function capture(entry) {
    const orig = { set: kv.set, lpush: kv.lpush, ltrim: kv.ltrim };
    let stored;
    kv.set = async (_key, rec) => { stored = rec; };
    kv.lpush = async () => 1;
    kv.ltrim = async () => 'OK';
    try {
      await writeLog(entry);
    } finally {
      Object.assign(kv, orig);
    }
    return stored;
  }

  it('truncates an oversized message to 4000 chars', async () => {
    const rec = await capture({ message: 'x'.repeat(5_000_000) });
    assert.equal(rec.message.length, 4000);
  });

  it('replaces oversized meta with a truncation marker but keeps small meta', async () => {
    assert.deepEqual((await capture({ message: 'm', meta: { blob: 'y'.repeat(20_000) } })).meta, { truncated: true });
    assert.deepEqual((await capture({ message: 'm', meta: { a: 1 } })).meta, { a: 1 });
  });

  it('holds a record of escape-inflating characters to the 16 KB byte budget', async () => {
    const ctl = String.fromCharCode(1);
    const rec = await capture({
      message: ctl.repeat(1_000_000), ruleName: ctl.repeat(10_000), ruleId: ctl.repeat(10_000),
      jobId: ctl.repeat(10_000), contentId: ctl.repeat(10_000), level: ctl.repeat(10_000),
      meta: { x: ctl.repeat(10_000) },
    });
    assert.ok(Buffer.byteLength(JSON.stringify(rec), 'utf8') <= 16 * 1024);
    assert.equal(rec.ruleName.length, 200);
    assert.deepEqual(rec.meta, { truncated: true });
  });

  it('keeps ordinary entries unchanged', async () => {
    const rec = await capture({ level: 'success', ruleName: 'R', message: 'Generated article: T' });
    assert.equal(rec.level, 'success');
    assert.equal(rec.ruleName, 'R');
    assert.equal(rec.message, 'Generated article: T');
    assert.equal(rec.meta, null);
    assert.equal(rec.jobId, null);
  });
});
