// processTimeouts convergence. Before 2026-08-19 a failing /api/automation/
// approve call left a past-timeout job in pending_review forever (103 jobs
// were stuck for five weeks). These tests pin the fix: every path must either
// succeed or move the job toward a terminal status.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { processTimeouts } from './run.js';

// The approve call is server-to-server: it authenticates with the internal
// CRON_SECRET bearer (lib/cron-auth.js internalAuthHeaders), so the secret must
// be set for processTimeouts to reach the endpoint at all.
process.env.CRON_SECRET ??= 'test-cron-secret';

const NOW = '2026-08-19T12:00:00.000Z';
const TWO_HOURS_AGO = '2026-08-19T10:00:00.000Z';

function mkKv(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    lrange: async (key) => store.get(key) || [],
    get: async (key) => store.get(key) ?? null,
    mget: async (...keys) => keys.map(k => store.get(k) ?? null),
    set: async (key, val) => { store.set(key, val); },
  };
}

function seedOneJob({ job = {}, rule = {} } = {}) {
  return mkKv({
    'automation:jobs:index': ['j1'],
    'automation:job:j1': {
      id: 'j1', ruleId: 'r1', status: 'pending_review',
      createdAt: TWO_HOURS_AGO, ...job,
    },
    'automation:rule:r1': rule === null ? null : {
      review: { timeoutHours: 1, onTimeout: 'approve', ...(rule.review || {}) },
    },
  });
}

const okFetch = async () => ({ ok: true, status: 200 });
const failFetch = async () => ({ ok: false, status: 500 });
const throwFetch = async () => { throw new Error('ECONNREFUSED'); };

describe('processTimeouts', () => {
  it('leaves the job alone when approve succeeds (approve endpoint owns the status)', async () => {
    const kv = seedOneJob();
    await processTimeouts(NOW, okFetch, kv);
    const job = kv.store.get('automation:job:j1');
    assert.equal(job.status, 'pending_review');
    assert.equal(job.timeoutAttempts, undefined);
  });

  it('calls approve with the internal bearer and the timeout channel', async () => {
    const kv = seedOneJob();
    const calls = [];
    await processTimeouts(NOW, async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 200 }; }, kv);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/automation\/approve$/);
    assert.equal(calls[0].opts.headers.Authorization, `Bearer ${process.env.CRON_SECRET}`);
    assert.equal(JSON.parse(calls[0].opts.body).channel, 'timeout');
  });

  it('counts a failed approve attempt on the job', async () => {
    const kv = seedOneJob();
    await processTimeouts(NOW, failFetch, kv);
    const job = kv.store.get('automation:job:j1');
    assert.equal(job.timeoutAttempts, 1);
    assert.equal(job.status, 'pending_review'); // not terminal yet
  });

  it('marks timeout_failed once attempts reach the cap', async () => {
    const kv = seedOneJob({ job: { timeoutAttempts: 2 } }); // cap defaults to 3
    await processTimeouts(NOW, failFetch, kv);
    const job = kv.store.get('automation:job:j1');
    assert.equal(job.timeoutAttempts, 3);
    assert.equal(job.status, 'timeout_failed');
  });

  it('treats a thrown fetch the same as a non-ok response', async () => {
    const kv = seedOneJob();
    await processTimeouts(NOW, throwFetch, kv);
    const job = kv.store.get('automation:job:j1');
    assert.equal(job.timeoutAttempts, 1);
  });

  it('marks a job orphaned when its rule no longer exists', async () => {
    const kv = seedOneJob({ rule: null });
    kv.store.set('automation:rule:r1', null);
    await processTimeouts(NOW, throwFetch, kv);
    const job = kv.store.get('automation:job:j1');
    assert.equal(job.status, 'orphaned');
  });

  it('still marks timed_out on the skip path (regression guard)', async () => {
    const kv = seedOneJob({ rule: { review: { onTimeout: 'skip' } } });
    await processTimeouts(NOW, throwFetch, kv);
    const job = kv.store.get('automation:job:j1');
    assert.equal(job.status, 'timed_out');
  });

  it('does not touch a job that is not yet past its timeout', async () => {
    const kv = seedOneJob({ job: { createdAt: '2026-08-19T11:45:00.000Z' } }); // 15 min old, 1h timeout
    await processTimeouts(NOW, failFetch, kv);
    const job = kv.store.get('automation:job:j1');
    assert.equal(job.status, 'pending_review');
    assert.equal(job.timeoutAttempts, undefined);
  });

  it('reads jobs in batched MGETs across the 200-key boundary and still actions every due job', async () => {
    // 250 jobs on the index — mgetBatched (batchSize 200) must issue two
    // sequential MGET calls (200 + 50), not one 250-key call and not 250
    // individual kv.get calls (the bug this fix replaces). Use onTimeout:'skip'
    // so no fetchFn is needed. Half the jobs are past their 1h timeout.
    const ids = Array.from({ length: 250 }, (_, i) => `j${i}`);
    const seed = { 'automation:jobs:index': ids, 'automation:rule:r1': { review: { timeoutHours: 1, onTimeout: 'skip' } } };
    for (let i = 0; i < ids.length; i++) {
      seed[`automation:job:${ids[i]}`] = {
        id: ids[i], ruleId: 'r1', status: 'pending_review',
        createdAt: i % 2 === 0 ? TWO_HOURS_AGO : '2026-08-19T11:45:00.000Z', // even = due, odd = not yet
      };
    }
    const store = new Map(Object.entries(seed));
    const mgetCalls = [];
    const kv = {
      store,
      lrange: async (key) => store.get(key) || [],
      get: async (key) => store.get(key) ?? null,
      mget: async (...keys) => { mgetCalls.push(keys.length); return keys.map(k => store.get(k) ?? null); },
      set: async (key, val) => { store.set(key, val); },
    };
    await processTimeouts(NOW, throwFetch, kv);
    assert.deepEqual(mgetCalls, [200, 50]);
    for (let i = 0; i < ids.length; i++) {
      const job = store.get(`automation:job:${ids[i]}`);
      if (i % 2 === 0) assert.equal(job.status, 'timed_out', `job ${ids[i]} should be timed_out`);
      else assert.equal(job.status, 'pending_review', `job ${ids[i]} should be untouched`);
    }
  });
});
