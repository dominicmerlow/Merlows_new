// lib/social/handlers/autopilot.js — the social autopilot worker: runTick (cron) plus the
// packs/retry/review routes.
//
// autopilot.js and store.js both import the `kv` singleton straight from ../../kv.js, so —
// same approach as social-router.test.js and store.test.js — each test monkey-patches kv's
// methods and restores them afterwards. runTick's two built-in stage runners are not
// individually injectable, so the 'queued' stage is driven for real through a stubbed
// globalThis.fetch (buildPack's default fetchFn); the 'scripted' stage (voicePack) needs a
// lazy `@vercel/blob` import with no injection point, so it is deliberately left untouched
// here and only reached via the "no runner yet" / budget / failure paths that never call it.
//
// The 'review' action resolves the approver via lib/auth.js `getCurrentUser`, which reads a
// signed session cookie and then `kv.get('users')` — so those tests additionally sign a real
// session with `signSession` (same helper + cookie shape as route-auth.test.js and
// social-router.test.js) and stub kv.get to answer the 'users' key alongside the pack key.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { kv } from '../../kv.js';
import { PACK_KEY, QUEUE_KEY, INDEX_KEY } from '../pack/store.js';
import { RENDER_MAX_MS } from '../pack/render.js';
import { DECISION_KEY, AUTO_APPROVE_KEY } from '../pack/review.js';
import { SLOTS_KEY, gridDate } from '../pack/schedule.js';
import { signSession } from '../../auth.js';
import handler, { runTick, isPaused, isPausedNow, isStale, takeUpload } from './autopilot.js';

// JWT_SECRET is read lazily by lib/auth.js (never at import), so it's safe to set this here
// rather than needing a dynamic import — `??=` so a file that already set a different value
// (route-auth.test.js, social-router.test.js) is left alone if this ever shares a process.
process.env.JWT_SECRET ??= 'test-jwt-secret-autopilot-review';

const throwKv = async () => { throw new Error('kv method should not have been called'); };
/** Comfortably past the render deadline, derived so a change to the constant can't rot it. */
const wellPastDeadline = () => Date.now() - (RENDER_MAX_MS + 60_000);
const near = (value, target, tolerance = 2000) => Math.abs(value - target) <= tolerance;
/**
 * `MAX_PACK_AGE_MS` isn't exported (it's a module-load-time const derived from
 * `SOCIAL_MAX_PACK_AGE_HOURS`), so these tests pin the documented default — 24h, since that
 * env var is unset in this suite — rather than reaching into the module's internals.
 */
const ONE_HOUR_MS = 60 * 60_000;
const DEFAULT_MAX_AGE_MS = 24 * ONE_HOUR_MS;

// SOCIAL_REVIEW_HOLD_SENSITIVE is read live; every test starts with it UNSET (the production
// default) and is restored afterwards, deleting it when it was originally unset.
let savedHoldSensitive;
beforeEach(() => { savedHoldSensitive = process.env.SOCIAL_REVIEW_HOLD_SENSITIVE; delete process.env.SOCIAL_REVIEW_HOLD_SENSITIVE; });
afterEach(() => {
  if (savedHoldSensitive === undefined) delete process.env.SOCIAL_REVIEW_HOLD_SENSITIVE;
  else process.env.SOCIAL_REVIEW_HOLD_SENSITIVE = savedHoldSensitive;
});

let saved;
beforeEach(() => {
  saved = {
    get: kv.get, set: kv.set, zadd: kv.zadd, zrem: kv.zrem,
    zrangebyscore: kv.zrangebyscore, lrange: kv.lrange, mget: kv.mget, del: kv.del,
  };
});
afterEach(() => {
  kv.get = saved.get; kv.set = saved.set; kv.zadd = saved.zadd; kv.zrem = saved.zrem;
  kv.zrangebyscore = saved.zrangebyscore; kv.lrange = saved.lrange; kv.mget = saved.mget; kv.del = saved.del;
});

/** kv.set answering like Upstash: 'OK', and null for SET NX on a key that already exists. */
function upstashSet(db) {
  return async (key, val, opts) => {
    if (opts?.nx && db.has(key)) return null;
    db.set(key, val);
    return 'OK';
  };
}

function mkRes() {
  const r = { statusCode: null, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

// ── isStale — has this story gone off before anyone started work on it? ────────────────────
// A pure function: no kv involved, so these drive it directly rather than through a tick.
describe('isStale', () => {
  it('is stale once a queued pack is older than the default age limit', () => {
    const now = Date.now();
    const pack = { status: 'queued', createdAt: new Date(now - DEFAULT_MAX_AGE_MS - 1).toISOString() };
    assert.equal(isStale(pack, now), true);
  });

  it('is not stale exactly at the age-limit boundary — only strictly older counts', () => {
    const now = Date.now();
    const pack = { status: 'queued', createdAt: new Date(now - DEFAULT_MAX_AGE_MS).toISOString() };
    assert.equal(isStale(pack, now), false);
  });

  it('is not stale one second under the age limit', () => {
    const now = Date.now();
    const pack = { status: 'queued', createdAt: new Date(now - DEFAULT_MAX_AGE_MS + 1000).toISOString() };
    assert.equal(isStale(pack, now), false);
  });

  it('never treats a pack that has moved past queued as stale, however old it is', () => {
    const now = Date.now();
    const ancientCreatedAt = new Date(now - DEFAULT_MAX_AGE_MS * 100).toISOString();
    for (const status of ['scripted', 'voiced', 'imaged', 'rendering', 'rendered', 'slotted', 'done', 'failed']) {
      assert.equal(isStale({ status, createdAt: ancientCreatedAt }, now), false, `status "${status}" must never be stale`);
    }
  });

  it('a missing createdAt is not evidence of age', () => {
    assert.equal(isStale({ status: 'queued' }, Date.now()), false);
  });

  it('an unparseable createdAt is not evidence of age', () => {
    assert.equal(isStale({ status: 'queued', createdAt: 'not-a-real-date' }, Date.now()), false);
  });

  it('an empty-string createdAt is not evidence of age', () => {
    assert.equal(isStale({ status: 'queued', createdAt: '' }, Date.now()), false);
  });
});

describe('runTick', () => {
  it('advances a queued pack through the real script stage (fetch stubbed, no network)', async () => {
    const pack = { contentId: 'c1', status: 'queued', attempts: {}, categoryId: 'diplomatic-analysis' };
    const article = {
      title: 'Talks resume in Geneva',
      category: 'diplomatic-analysis',
      body:
        'Diplomats gathered in Geneva to discuss a fragile truce. Officials said sixty seven ' +
        'families have already returned home under the deal. World leaders welcomed the news cautiously.',
      wpPostId: 1,
    };
    const draft = {
      hooks: ['A fragile truce finally holds in Geneva.'],
      // No headline — toPack falls back to article.title, which is always self-supporting
      // since the title is prepended to the text the fact guard checks against. A title-case
      // headline here would otherwise trip the now-checked NAME guard on ordinary words.
      points: [
        { caption: 'Families return home', vo: 'Officials said sixty seven families have already returned home.' },
        { caption: 'Truce remains fragile', vo: 'The truce remains fragile but is holding for now.' },
        { caption: 'World reaction grows', vo: 'World leaders welcomed the news cautiously.' },
      ],
    };

    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.get = async (key) => {
      if (key === PACK_KEY('c1')) return pack;
      if (key === 'content:c1') return article;
      return null;
    };
    const setCalls = [];
    kv.set = async (key, val) => { setCalls.push({ key, val }); };
    kv.zadd = async () => {};

    const savedKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'test-key';
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(draft) } }] }) });

    let result;
    try {
      result = await runTick();
    } finally {
      globalThis.fetch = savedFetch;
      if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = savedKey;
    }

    assert.deepEqual(result.results, [{ contentId: 'c1', from: 'queued', to: 'scripted' }]);
    // claim's own lease-save + advance's final save = 2 kv.set calls now; the LAST one holds
    // the finished stage.
    assert.equal(setCalls.length, 2);
    const finalSave = setCalls[setCalls.length - 1].val;
    assert.equal(finalSave.status, 'scripted');
    assert.equal(finalSave.social.hook, 'A fragile truce finally holds in Geneva.');
    assert.equal(finalSave.leaseUntil, null); // lease cleared once the stage completes
  });

  it('records the script call\'s cost onto pack.cost when the queued stage advances', async () => {
    const pack = { contentId: 'c1', status: 'queued', attempts: {}, categoryId: 'diplomatic-analysis' };
    const article = {
      title: 'Talks resume in Geneva',
      category: 'diplomatic-analysis',
      body:
        'Diplomats gathered in Geneva to discuss a fragile truce. Officials said sixty seven ' +
        'families have already returned home under the deal. World leaders welcomed the news cautiously.',
      wpPostId: 1,
    };
    const draft = {
      hooks: ['A fragile truce finally holds in Geneva.'],
      points: [
        { caption: 'Families return home', vo: 'Officials said sixty seven families have already returned home.' },
        { caption: 'Truce remains fragile', vo: 'The truce remains fragile but is holding for now.' },
        { caption: 'World reaction grows', vo: 'World leaders welcomed the news cautiously.' },
      ],
    };

    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.get = async (key) => {
      if (key === PACK_KEY('c1')) return pack;
      if (key === 'content:c1') return article;
      return null;
    };
    const setCalls = [];
    kv.set = async (key, val) => { setCalls.push({ key, val }); };
    kv.zadd = async () => {};

    const savedKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'test-key';
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(draft) } }], usage: { cost: 0.0123 } }),
    });

    let result;
    try {
      result = await runTick();
    } finally {
      globalThis.fetch = savedFetch;
      if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = savedKey;
    }

    assert.equal(result.results[0].to, 'scripted');
    const finalSave = setCalls[setCalls.length - 1].val;
    assert.equal(finalSave.cost.script.usd, 0.0123);
    assert.equal(finalSave.cost.script.estimated, false);
    assert.equal(finalSave.cost.totalUsd, 0.0123);
  });

  it('records a failure without throwing when a stage errors', async () => {
    const pack = { contentId: 'c1', status: 'queued', attempts: {}, categoryId: 'diplomatic-analysis' };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    // No `content:c1` record — loadArticle throws "content record c1 is gone" before any
    // network call is attempted.
    kv.get = async (key) => (key === PACK_KEY('c1') ? pack : null);
    kv.set = async () => {};
    kv.zadd = async () => {};

    const result = await runTick(); // must resolve, not reject
    assert.equal(result.processed, 1);
    assert.equal(result.results[0].contentId, 'c1');
    assert.equal(result.results[0].terminal, false);
    assert.match(result.results[0].error, /content record c1 is gone/);
  });

  it('a script-stage failure still saves what was billed for the failed call', async () => {
    const pack = { contentId: 'c1', status: 'queued', attempts: {}, categoryId: 'diplomatic-analysis' };
    const article = {
      title: 'Talks resume in Geneva',
      category: 'diplomatic-analysis',
      body: 'Diplomats gathered in Geneva to discuss a fragile truce.',
      wpPostId: 1,
    };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.get = async (key) => {
      if (key === PACK_KEY('c1')) return pack;
      if (key === 'content:c1') return article;
      return null;
    };
    const setCalls = [];
    kv.set = async (key, val) => { setCalls.push({ key, val }); };
    kv.zadd = async () => {};

    const savedKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'test-key';
    const savedFetch = globalThis.fetch;
    // Every model call is billed but returns an unusable draft, so buildPack ultimately
    // throws — proving the spend on a failed script still lands on the pack's cost record.
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ hooks: [], points: [] }) } }], usage: { cost: 0.02 } }),
    });

    try {
      await runTick();
    } finally {
      globalThis.fetch = savedFetch;
      if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = savedKey;
    }

    const finalSave = setCalls[setCalls.length - 1].val;
    assert.equal(finalSave.status, 'queued'); // stays failable/retryable at its original stage
    assert.ok(finalSave.cost.script.usd > 0);
  });

  it('respects the per-tick budget and never claims a pack once it is spent', async () => {
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = throwKv; // claim must never be reached once the budget check trips

    const result = await runTick({ startedAt: Date.now() - 999_999_999 });
    assert.deepEqual(result.results, [{ contentId: 'c1', skipped: 'tick budget spent' }]);
    assert.equal(result.processed, 1);
  });

  it('holds — not drops — a pack whose stage has no runner yet, so it stays recoverable', async () => {
    // `claim` itself now saves the lease (kv.set) and re-adds the queue entry (kv.zadd)
    // before the runner lookup even happens, so both must be stubbed to capture, not throw.
    // `rendered` is the first stage with no runner now that script/voice/images/render
    // exist; the next one to build is the Phase 3 posting grid.
    const pack = { contentId: 'c1', status: 'unknown-stage', attempts: {} };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.get = async (key) => (key === PACK_KEY('c1') ? pack : null);
    const setCalls = [];
    const zaddCalls = [];
    kv.set = async (key, val) => { setCalls.push(val); };
    kv.zadd = async (key, arg) => { zaddCalls.push(arg); };

    const result = await runTick();

    assert.deepEqual(result.results, [{ contentId: 'c1', status: 'unknown-stage', held: 'no runner for this stage yet' }]);
    // claim's lease-save + hold's held-save = 2 kv.set calls; the LAST one is hold's.
    const heldRecord = setCalls[setCalls.length - 1];
    assert.equal(typeof heldRecord.heldUntil, 'number');
    assert.equal(heldRecord.leaseUntil, null);
    // Still in the queue with a future score — a dropped pack never comes back once the
    // later stages ship; a held one does.
    assert.equal(zaddCalls[zaddCalls.length - 1].member, 'c1');
    assert.equal(zaddCalls[zaddCalls.length - 1].score > Date.now(), true);
  });
});

// ── Stale packs — dropped without spending, without eating the work budget ─────────────────
describe('runTick — the stale gate against a real queue', () => {
  /**
   * A queue stub that HONOURS the score range, which the other tests' `async () => [ids]`
   * does not. The whole point of reading the two ends of the queue separately is invisible to
   * a stub that returns everything whatever it is asked for.
   */
  const scoredQueue = (entries) => {
    const queue = new Map(entries); // contentId -> score
    kv.zrangebyscore = async (_key, min, max) =>
      [...queue.entries()]
        .filter(([, score]) => score >= min && score <= max)
        .sort((a, b) => a[1] - b[1])
        .map(([member]) => member);
    kv.zrem = async (_key, member) => (queue.delete(member) ? 1 : 0);
    kv.zadd = async (_key, { score, member }) => { queue.set(member, score); };
    return queue;
  };

  it('reaches a fresh pack even when the stale backlog is larger than the scan window', async () => {
    // The regression: taking the first N ids overall meant that once the backlog passed the
    // window size, every id the tick could see was stale and today's story was never claimed.
    const staleCreatedAt = new Date(Date.now() - DEFAULT_MAX_AGE_MS - ONE_HOUR_MS).toISOString();
    const backlog = 60; // deliberately larger than STALE_SCAN_MAX (40)
    const packs = new Map();
    const entries = [];
    for (let i = 0; i < backlog; i++) {
      const id = `old-${i}`;
      packs.set(id, { contentId: id, status: 'queued', attempts: {}, createdAt: staleCreatedAt });
      entries.push([id, Date.parse(staleCreatedAt) + i]); // scored at enqueue time, as the queue does
    }
    packs.set('today', { contentId: 'today', status: 'unknown-stage', attempts: {}, createdAt: new Date().toISOString() });
    entries.push(['today', Date.now() - 60_000]);

    scoredQueue(entries);
    kv.get = async (key) => {
      for (const [id, pack] of packs) if (key === PACK_KEY(id)) return pack;
      return null;
    };
    kv.set = async (_key, val) => { packs.set(val.contentId, val); };

    const result = await runTick();

    // `rendered` has no runner, so the fresh pack reports as held — the point is that it was
    // reached AT ALL, in the same tick as a backlog nearly twice the scan window.
    const today = result.results.find((r) => r.contentId === 'today');
    assert.ok(today, 'the fresh pack was never reached behind the stale backlog');
    assert.equal(today.held, 'no runner for this stage yet');
    assert.equal(result.counts.dropped, 40); // the scan window's worth, cleared this tick
    assert.equal(packs.get('today').status, 'unknown-stage'); // untouched, not dropped
  });

  it('does not drop a pack a person has just retried, however old the article is', async () => {
    // The board's Retry resumes a script-stage failure at `queued`. Judged on `createdAt`,
    // retrying anything older than the age limit spent one of three manual retries and then
    // had the pack retired on the very next tick, with no route back from `dropped`.
    const ancient = new Date(Date.now() - DEFAULT_MAX_AGE_MS * 10).toISOString();
    const pack = {
      contentId: 'c1', status: 'failed', attempts: { queued: 3 }, createdAt: ancient,
      error: { stage: 'queued', message: 'model refused' },
    };
    const store = new Map([['c1', pack]]);
    scoredQueue([]);
    kv.get = async (key) => (key === PACK_KEY('c1') ? store.get('c1') : null);
    kv.set = async (_key, val) => { store.set(val.contentId, val); };

    const res = mkRes();
    await handler({ method: 'POST', body: { contentId: 'c1' } }, res, 'retry');
    assert.equal(res.statusCode, 200);
    assert.equal(store.get('c1').status, 'queued');
    assert.equal(typeof store.get('c1').requeuedAt, 'string');

    // Now let a tick see it. It must be worked, not retired.
    assert.equal(isStale(store.get('c1')), false);
    const result = await runTick();
    assert.equal(result.results.some((r) => r.dropped === 'stale'), false);
    assert.notEqual(store.get('c1').status, 'dropped');
  });
});

describe('runTick — stale packs', () => {
  it('drops a stale queued pack without invoking any stage runner — nothing is spent', async () => {
    const staleCreatedAt = new Date(Date.now() - DEFAULT_MAX_AGE_MS - ONE_HOUR_MS).toISOString();
    const pack = { contentId: 'c1', status: 'queued', attempts: {}, createdAt: staleCreatedAt };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.get = async (key) => {
      if (key === PACK_KEY('c1')) return pack;
      // stageScript's loadArticle would read `content:c1` — reaching it means the stage ran.
      throw new Error(`stage runner must not read ${key} for a stale pack`);
    };
    const setCalls = [];
    kv.set = async (key, val) => { setCalls.push(val); };
    kv.zadd = async () => {};
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('no network call should be made for a stale pack'); };

    let result;
    try {
      result = await runTick();
    } finally {
      globalThis.fetch = savedFetch;
    }

    assert.deepEqual(result.results, [{ contentId: 'c1', dropped: 'stale' }]);
    const finalSave = setCalls[setCalls.length - 1];
    assert.equal(finalSave.status, 'dropped');
    assert.notEqual(finalSave.status, 'failed');
    assert.equal(finalSave.leaseUntil, null);
    assert.equal(typeof finalSave.droppedAt, 'string');
  });

  it('never drops a pack that has already started work, however old — the money is already spent', async () => {
    // `rendered` has no stage runner yet, so this exercises the same "held" path as the
    // existing no-runner test above, but with a createdAt far past the age limit: age must
    // not matter once a pack is off `queued`.
    const ancientCreatedAt = new Date(Date.now() - DEFAULT_MAX_AGE_MS * 100).toISOString();
    const pack = { contentId: 'c1', status: 'unknown-stage', attempts: {}, createdAt: ancientCreatedAt };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.get = async (key) => (key === PACK_KEY('c1') ? pack : null);
    const setCalls = [];
    kv.set = async (key, val) => { setCalls.push(val); };
    kv.zadd = async () => {};

    const result = await runTick();

    assert.deepEqual(result.results, [{ contentId: 'c1', status: 'unknown-stage', held: 'no runner for this stage yet' }]);
    const finalSave = setCalls[setCalls.length - 1];
    assert.notEqual(finalSave.status, 'dropped');
    assert.equal(finalSave.status, 'unknown-stage');
  });

  it('a queued pack with an unparseable createdAt is worked normally, not dropped', async () => {
    const pack = { contentId: 'c1', status: 'queued', attempts: {}, createdAt: 'not-a-real-date' };
    const article = {
      title: 'Talks resume in Geneva',
      category: 'diplomatic-analysis',
      body:
        'Diplomats gathered in Geneva to discuss a fragile truce. Officials said sixty seven ' +
        'families have already returned home under the deal. World leaders welcomed the news cautiously.',
      wpPostId: 1,
    };
    const draft = {
      hooks: ['A fragile truce finally holds in Geneva.'],
      points: [
        { caption: 'Families return home', vo: 'Officials said sixty seven families have already returned home.' },
        { caption: 'Truce remains fragile', vo: 'The truce remains fragile but is holding for now.' },
        { caption: 'World reaction grows', vo: 'World leaders welcomed the news cautiously.' },
      ],
    };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.get = async (key) => {
      if (key === PACK_KEY('c1')) return pack;
      if (key === 'content:c1') return article;
      return null;
    };
    const setCalls = [];
    kv.set = async (key, val) => { setCalls.push(val); };
    kv.zadd = async () => {};
    const savedKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'test-key';
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(draft) } }] }) });

    let result;
    try {
      result = await runTick();
    } finally {
      globalThis.fetch = savedFetch;
      if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = savedKey;
    }

    assert.deepEqual(result.results, [{ contentId: 'c1', from: 'queued', to: 'scripted' }]);
    const finalSave = setCalls[setCalls.length - 1];
    assert.equal(finalSave.status, 'scripted');
  });

  it('drops a backlog of stale packs without spending the tick budget, so a fresh pack behind them still gets worked', async () => {
    // This is the property that stops yesterday's queue starving today's stories: more stale
    // packs than PACKS_PER_TICK sit ahead of a fresh one in the due-list, and the fresh pack
    // must still be worked in the SAME tick.
    const staleCreatedAt = new Date(Date.now() - DEFAULT_MAX_AGE_MS - ONE_HOUR_MS).toISOString();
    const staleIds = ['s1', 's2', 's3', 's4', 's5']; // more than PACKS_PER_TICK (3)
    const packs = new Map(staleIds.map((id) => [id, { contentId: id, status: 'queued', attempts: {}, createdAt: staleCreatedAt }]));
    packs.set('fresh-1', { contentId: 'fresh-1', status: 'unknown-stage', attempts: {} }); // no runner yet — cheap to assert "worked"

    kv.zrangebyscore = async () => [...staleIds, 'fresh-1'];
    kv.zrem = async () => 1;
    kv.get = async (key) => {
      for (const [id, pack] of packs) if (key === PACK_KEY(id)) return pack;
      if (String(key).startsWith('content:')) throw new Error(`stage runner must not read ${key} for a stale backlog pack`);
      return null;
    };
    const setCalls = [];
    kv.set = async (key, val) => { setCalls.push(val); };
    kv.zadd = async () => {};
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('no network call expected while clearing a stale backlog'); };

    let result;
    try {
      result = await runTick();
    } finally {
      globalThis.fetch = savedFetch;
    }

    const dropped = result.results.filter((r) => r.dropped === 'stale').map((r) => r.contentId).sort();
    assert.deepEqual(dropped, [...staleIds].sort());
    // The fresh pack behind the backlog was still WORKED this tick (held, since 'unknown-stage' has
    // no runner) — not skipped as "tick full", which is what would happen if each stale drop
    // had consumed a slot of the PACKS_PER_TICK budget.
    const freshResult = result.results.find((r) => r.contentId === 'fresh-1');
    assert.deepEqual(freshResult, { contentId: 'fresh-1', status: 'unknown-stage', held: 'no runner for this stage yet' });
    assert.ok(setCalls.some((v) => v.contentId === 'fresh-1' && v.status === 'unknown-stage'));
  });

  it('re-queues a fresh pack the tick has no room for, with its lease cleared — not left leased, not dropped', async () => {
    const ids = ['w1', 'w2', 'w3', 'w4']; // PACKS_PER_TICK is 3, so w4 has no room this tick
    const packs = new Map(ids.map((id) => [id, { contentId: id, status: 'unknown-stage', attempts: {} }]));
    kv.zrangebyscore = async () => ids;
    kv.zrem = async () => 1;
    kv.get = async (key) => {
      for (const [id, pack] of packs) if (key === PACK_KEY(id)) return pack;
      return null;
    };
    const setCalls = [];
    const zaddCalls = [];
    kv.set = async (key, val) => { setCalls.push(val); };
    kv.zadd = async (key, arg) => { zaddCalls.push(arg); };

    const result = await runTick();

    // w1-w3 consumed the work budget (held — 'unknown-stage' has no runner yet).
    assert.equal(result.results.filter((r) => r.held).length, 3);
    // w4 is neither worked nor dropped — it does not appear in the results at all.
    assert.equal(result.results.some((r) => r.contentId === 'w4'), false);
    // Its final saved state has the lease cleared (not left leased from claim)...
    const lastW4Save = setCalls.filter((v) => v.contentId === 'w4').pop();
    assert.equal(lastW4Save.status, 'unknown-stage'); // unchanged, not dropped
    assert.equal(lastW4Save.leaseUntil, null);
    // ...and it was put back on the queue for the next tick, immediately (not held for a
    // full lease period), not left off the queue entirely.
    const w4Requeue = zaddCalls.filter((a) => a.member === 'w4').pop();
    assert.ok(w4Requeue);
    assert.equal(near(w4Requeue.score, Date.now()), true);
  });
});

// ── imaged / rendering stages ───────────────────────────────────────────────
// stageStartRenders and stagePollRenders call startRender/pollRender/renderStill from
// ../pack/render.js WITHOUT passing a fetchFn, so (like the 'queued' stage above) they are
// driven for real through a stubbed globalThis.fetch — no real render service is ever hit.
describe('runTick — imaged stage (starts renders)', () => {
  let savedUrl, savedSecret;
  beforeEach(() => {
    savedUrl = process.env.RENDER_SERVICE_URL;
    savedSecret = process.env.RENDER_API_SECRET;
    process.env.RENDER_SERVICE_URL = 'https://render.example';
    process.env.RENDER_API_SECRET = 'top-secret';
  });
  afterEach(() => {
    if (savedUrl === undefined) delete process.env.RENDER_SERVICE_URL; else process.env.RENDER_SERVICE_URL = savedUrl;
    if (savedSecret === undefined) delete process.env.RENDER_API_SECRET; else process.env.RENDER_API_SECRET = savedSecret;
  });

  it('renders each still once and skips a still already stored', async () => {
    const pack = {
      contentId: 'c1', status: 'imaged', attempts: {},
      social: { points: [{ caption: 'p1' }, { caption: 'p2' }] },
      renders: {
        stills: { cover: 'https://existing.example/cover.jpg' },
        // Both cuts already have a handle from an earlier attempt — keeps this test only
        // about the stills loop (the video-handle loop is covered separately below).
        handles: { reel: { sandboxId: 'sb-r', cmdId: 'cmd-r' }, tiktok: { sandboxId: 'sb-t', cmdId: 'cmd-t' } },
      },
    };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.get = async (key) => (key === PACK_KEY('c1') ? pack : null);
    const setCalls = [];
    kv.set = async (key, val) => { setCalls.push(val); };
    kv.zadd = async () => {};
    const stillCalls = [];
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(init.body);
      stillCalls.push(body.name);
      return { ok: true, json: async () => ({ url: `https://render.example/${body.name}.jpg`, size: 9000 }) };
    };

    let result;
    try {
      result = await runTick();
    } finally {
      globalThis.fetch = savedFetch;
    }

    assert.deepEqual(result.results, [{ contentId: 'c1', from: 'imaged', to: 'rendering' }]);
    assert.equal(setCalls.length, 2); // claim's lease-save + advance's final save
    assert.deepEqual(stillCalls.sort(), ['cta', 'slide-1', 'slide-2', 'story']); // cover already stored — never re-requested
    const finalSave = setCalls[setCalls.length - 1];
    assert.deepEqual(finalSave.renders.stills, {
      cover: 'https://existing.example/cover.jpg',
      'slide-1': 'https://render.example/slide-1.jpg',
      'slide-2': 'https://render.example/slide-2.jpg',
      cta: 'https://render.example/cta.jpg',
      story: 'https://render.example/story.jpg',
    });
    assert.deepEqual(finalSave.renders.handles, pack.renders.handles); // untouched
  });

  it('starts a video render per cut but does not restart a cut that already has a finished video', async () => {
    const pack = {
      contentId: 'c1', status: 'imaged', attempts: {},
      social: { points: [] }, // no points -> cover/cta/story only, keeps this test off the stills loop
      renders: {
        stills: { cover: 'u', cta: 'u', story: 'u' }, // all already made
        videos: { reel: { url: 'https://cdn.example/reel-existing.mp4', size: 5_000_000 } },
      },
    };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.get = async (key) => (key === PACK_KEY('c1') ? pack : null);
    const setCalls = [];
    kv.set = async (key, val) => { setCalls.push(val); };
    kv.zadd = async () => {};
    const startCalls = [];
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(init.body);
      startCalls.push(body.name);
      return { ok: true, json: async () => ({ sandboxId: 'sb-tiktok', cmdId: 'cmd-tiktok' }) };
    };

    try {
      await runTick();
    } finally {
      globalThis.fetch = savedFetch;
    }

    assert.deepEqual(startCalls, ['tiktok']); // reel skipped: already has a finished video
    const finalSave = setCalls[setCalls.length - 1];
    assert.equal(finalSave.renders.handles.reel, undefined);
    assert.equal(finalSave.renders.handles.tiktok.cut, 'tiktok');
    assert.equal(finalSave.renders.handles.tiktok.sandboxId, 'sb-tiktok');
    assert.equal(finalSave.renders.handles.tiktok.cmdId, 'cmd-tiktok');
    assert.equal(typeof finalSave.renders.handles.tiktok.startedAt, 'number');
    assert.deepEqual(finalSave.renders.videos.reel, { url: 'https://cdn.example/reel-existing.mp4', size: 5_000_000 }); // survives untouched
  });
});

describe('runTick — rendering stage (polls renders)', () => {
  let savedUrl, savedSecret;
  beforeEach(() => {
    savedUrl = process.env.RENDER_SERVICE_URL;
    savedSecret = process.env.RENDER_API_SECRET;
    process.env.RENDER_SERVICE_URL = 'https://render.example';
    process.env.RENDER_API_SECRET = 'top-secret';
  });
  afterEach(() => {
    if (savedUrl === undefined) delete process.env.RENDER_SERVICE_URL; else process.env.RENDER_SERVICE_URL = savedUrl;
    if (savedSecret === undefined) delete process.env.RENDER_API_SECRET; else process.env.RENDER_API_SECRET = savedSecret;
  });

  it('stays at rendering and re-queues — a render in progress is not a failure and must not spend an attempt', async () => {
    const pack = {
      contentId: 'c1', status: 'rendering', attempts: {},
      renders: { handles: { reel: { sandboxId: 'sb-reel', cmdId: 'cmd-reel' } }, videos: {} },
    };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.get = async (key) => (key === PACK_KEY('c1') ? pack : null);
    const setCalls = [];
    const zaddCalls = [];
    kv.set = async (key, val) => { setCalls.push(val); };
    kv.zadd = async (key, arg) => { zaddCalls.push(arg); };
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ stage: 'rendering', overallProgress: 0.4 }) });

    let result;
    try {
      result = await runTick();
    } finally {
      globalThis.fetch = savedFetch;
    }

    assert.deepEqual(result.results, [{ contentId: 'c1', status: 'rendering', waiting: '1 render(s) still running' }]);
    assert.equal(setCalls.length, 2); // claim's lease-save + the stay-path save
    const finalSave = setCalls[setCalls.length - 1];
    assert.equal(finalSave.status, 'rendering'); // never advanced
    assert.equal(finalSave.attempts.rendering, undefined); // no attempt spent
    assert.equal(finalSave.error, undefined); // fail() was never called
    assert.equal(zaddCalls[zaddCalls.length - 1].member, 'c1'); // requeued for another poll, not dropped
    assert.equal(zaddCalls[zaddCalls.length - 1].score > Date.now(), true);
  });

  it('advances to rendered with the video URLs once every cut is done', async () => {
    const pack = {
      contentId: 'c1', status: 'rendering', attempts: {},
      renders: {
        handles: {
          reel: { sandboxId: 'sb-reel', cmdId: 'cmd-reel' },
          tiktok: { sandboxId: 'sb-tiktok', cmdId: 'cmd-tiktok' },
        },
        videos: {},
      },
    };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.get = async (key) => (key === PACK_KEY('c1') ? pack : null);
    const setCalls = [];
    kv.set = async (key, val) => { setCalls.push(val); };
    kv.zadd = async () => {};
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const sandboxId = new URL(url).searchParams.get('sandboxId');
      return {
        ok: true,
        json: async () => ({ stage: 'done', url: `https://blob.example/${sandboxId}.mp4`, size: 4_000_000, contentType: 'video/mp4' }),
      };
    };

    let result;
    try {
      result = await runTick();
    } finally {
      globalThis.fetch = savedFetch;
    }

    assert.deepEqual(result.results, [{ contentId: 'c1', from: 'rendering', to: 'rendered' }]);
    assert.equal(setCalls.length, 2); // claim's lease-save + advance's final save
    const finalSave = setCalls[setCalls.length - 1];
    assert.equal(finalSave.status, 'rendered');
    assert.deepEqual(finalSave.renders.videos.reel, { url: 'https://blob.example/sb-reel.mp4', size: 4_000_000 });
    assert.deepEqual(finalSave.renders.videos.tiktok, { url: 'https://blob.example/sb-tiktok.mp4', size: 4_000_000 });
    assert.equal(typeof finalSave.renderedAt, 'string');
  });

  it('sends the pack back to `imaged` when a render comes back failed, so the cut is started again', async () => {
    const pack = {
      contentId: 'c1', status: 'rendering', attempts: {},
      renders: {
        handles: { reel: { sandboxId: 'sb-reel', cmdId: 'cmd-reel', startedAt: Date.now() } },
        videos: { tiktok: { url: 'https://cdn.example/tiktok.mp4', size: 4_000_000 } },
        cutAttempts: { reel: 1, tiktok: 1 },
      },
    };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.get = async (key) => (key === PACK_KEY('c1') ? pack : null);
    const setCalls = [];
    kv.set = async (key, val) => { setCalls.push(val); };
    kv.zadd = async () => {};
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ stage: 'error', message: 'sandbox crashed' }) });

    let result;
    try {
      result = await runTick();
    } finally {
      globalThis.fetch = savedFetch;
    }

    assert.deepEqual(result.results, [{ contentId: 'c1', status: 'rendering', waiting: 're-rendering reel' }]);
    assert.equal(setCalls.length, 2); // claim's lease-save + the stay-path save
    const finalSave = setCalls[setCalls.length - 1];
    // Back a stage: `imaged` is the ONE place that starts renders, and it skips the stills
    // and the cut that already finished, so the re-render only pays for the failed cut.
    assert.equal(finalSave.status, 'imaged');
    assert.deepEqual(finalSave.renders.handles, {}); // the dead handle is dropped
    assert.deepEqual(finalSave.renders.videos.tiktok, { url: 'https://cdn.example/tiktok.mp4', size: 4_000_000 });
    assert.equal(finalSave.attempts.rendering, undefined); // a failed cut is retried, not counted against the stage
  });

  it('polls a handle that is past the deadline before writing it off — a finished render is not thrown away', async () => {
    // Applying the deadline BEFORE polling discarded videos that had rendered and uploaded
    // perfectly: the answer was sitting on the service and was never asked for. The cron is
    // 10 minutes apart, so a handle can easily be older than the render took.
    const pack = {
      contentId: 'c1', status: 'rendering', attempts: {},
      renders: {
        handles: {
          reel: { sandboxId: 'sb-reel', cmdId: 'cmd-reel', startedAt: wellPastDeadline() },
          tiktok: { sandboxId: 'sb-tiktok', cmdId: 'cmd-tiktok', startedAt: wellPastDeadline() },
        },
        videos: {},
        cutAttempts: { reel: 1, tiktok: 1 },
      },
    };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.get = async (key) => (key === PACK_KEY('c1') ? pack : null);
    const setCalls = [];
    kv.set = async (key, val) => { setCalls.push(val); };
    kv.zadd = async () => {};
    let polls = 0;
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const sandboxId = new URL(url).searchParams.get('sandboxId');
      // Count RENDER polls only. Once every cut is rendered the stage also pre-uploads the
      // TikTok video to Zernio, which is another fetch through this same stub — counting it
      // here would make this assertion about the upload rather than about polling, which is
      // what it is for. That pre-upload is best-effort and covered by its own tests.
      if (sandboxId) polls++;
      return {
        ok: true,
        json: async () => ({ stage: 'done', url: `https://blob.example/${sandboxId}.mp4`, size: 4_000_000, contentType: 'video/mp4' }),
      };
    };

    let result;
    try {
      result = await runTick();
    } finally {
      globalThis.fetch = savedFetch;
    }

    assert.equal(polls, 2); // both handles were actually asked, despite being past the deadline
    assert.deepEqual(result.results, [{ contentId: 'c1', from: 'rendering', to: 'rendered' }]);
    const finalSave = setCalls[setCalls.length - 1];
    assert.deepEqual(finalSave.renders.videos.reel, { url: 'https://blob.example/sb-reel.mp4', size: 4_000_000 });
  });

  // The TikTok video is uploaded into Zernio's storage as soon as every cut is rendered, so a
  // retry costs nothing and Approve → published is one API call. This is the wiring — the
  // upload logic itself is covered in schedule.test.js.
  it('pre-uploads the TikTok cut to Zernio once the renders finish, and stores it on the pack', async () => {
    const pack = {
      contentId: 'c1', status: 'rendering', attempts: {},
      renders: {
        handles: { reel: { sandboxId: 'sb-reel', cmdId: 'cmd-reel', startedAt: Date.now() } },
        videos: { tiktok: { url: 'https://blob.example/tiktok.mp4', size: 4_000_000 } },
        cutAttempts: { reel: 1, tiktok: 1 },
      },
    };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.get = async (key) => (key === PACK_KEY('c1') ? pack : null);
    const setCalls = [];
    kv.set = async (key, val) => { setCalls.push(val); };
    kv.zadd = async () => {};
    const savedKey = process.env.ZERNIO_API_KEY;
    process.env.ZERNIO_API_KEY = 'test-zernio-key';
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const href = String(url);
      if (href.includes('sandboxId')) {
        return { ok: true, json: async () => ({ stage: 'done', url: 'https://blob.example/sb-reel.mp4', size: 4_000_000, contentType: 'video/mp4' }) };
      }
      if (href.includes('/media/presign')) {
        return { ok: true, json: async () => ({ uploadUrl: 'https://b.r2.cloudflarestorage.com/t?X-Amz-Signature=s', publicUrl: 'https://media.zernio.com/temp/t.mp4' }) };
      }
      if (href.includes('r2.cloudflarestorage.com')) return { ok: true, status: 200 };
      // Reading our own rendered video back out of Blob.
      return { ok: true, headers: { get: () => 'video/mp4' }, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
    };

    let result;
    try {
      result = await runTick();
    } finally {
      globalThis.fetch = savedFetch;
      if (savedKey === undefined) delete process.env.ZERNIO_API_KEY; else process.env.ZERNIO_API_KEY = savedKey;
    }

    assert.deepEqual(result.results, [{ contentId: 'c1', from: 'rendering', to: 'rendered' }]);
    const finalSave = setCalls[setCalls.length - 1];
    assert.equal(
      finalSave.uploads?.['https://blob.example/tiktok.mp4']?.url,
      'https://media.zernio.com/temp/t.mp4',
      'the pre-upload was not stored, so scheduling will pay for the transfer again',
    );
    assert.ok(finalSave.uploads['https://blob.example/tiktok.mp4'].expiresAt > Date.now());
  });

  // Best effort, never fatal: the pack is finished and paid for, and schedulePost will upload
  // inline if this did not happen. Failing the pack here would throw the whole story away.
  it('still reaches `rendered` when the pre-upload fails', async () => {
    const pack = {
      contentId: 'c1', status: 'rendering', attempts: {},
      renders: {
        handles: { reel: { sandboxId: 'sb-reel', cmdId: 'cmd-reel', startedAt: Date.now() } },
        videos: { tiktok: { url: 'https://blob.example/tiktok.mp4', size: 4_000_000 } },
        cutAttempts: { reel: 1, tiktok: 1 },
      },
    };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.get = async (key) => (key === PACK_KEY('c1') ? pack : null);
    const setCalls = [];
    kv.set = async (key, val) => { setCalls.push(val); };
    kv.zadd = async () => {};
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const href = String(url);
      if (href.includes('sandboxId')) {
        return { ok: true, json: async () => ({ stage: 'done', url: 'https://blob.example/sb-reel.mp4', size: 4_000_000, contentType: 'video/mp4' }) };
      }
      return { ok: false, status: 500, json: async () => ({ error: 'blob is down' }) };
    };

    let result;
    try {
      result = await runTick();
    } finally {
      globalThis.fetch = savedFetch;
    }

    assert.deepEqual(result.results, [{ contentId: 'c1', from: 'rendering', to: 'rendered' }]);
    const finalSave = setCalls[setCalls.length - 1];
    assert.equal(finalSave.status, 'rendered');
    assert.deepEqual(finalSave.renders.videos.reel, { url: 'https://blob.example/sb-reel.mp4', size: 4_000_000 });
  });

  it('gives up on a handle past the deadline that is still reporting in progress', async () => {
    const pack = {
      contentId: 'c1', status: 'rendering', attempts: {},
      renders: {
        handles: { reel: { sandboxId: 'sb-reel', cmdId: 'cmd-reel', startedAt: wellPastDeadline() } },
        videos: { tiktok: { url: 'https://cdn.example/tiktok.mp4', size: 4_000_000 } },
        cutAttempts: { reel: 1, tiktok: 1 },
      },
    };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.get = async (key) => (key === PACK_KEY('c1') ? pack : null);
    const setCalls = [];
    kv.set = async (key, val) => { setCalls.push(val); };
    kv.zadd = async () => {};
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ stage: 'rendering', overallProgress: 0.4 }) });

    let result;
    try {
      result = await runTick();
    } finally {
      globalThis.fetch = savedFetch;
    }

    assert.deepEqual(result.results, [{ contentId: 'c1', status: 'rendering', waiting: 're-rendering reel' }]);
    const finalSave = setCalls[setCalls.length - 1];
    assert.equal(finalSave.status, 'imaged'); // sent back to be started again, not polled forever
    assert.deepEqual(finalSave.renders.handles, {});
  });

  it('never advances to `rendered` with a cut missing — the silent-drop regression', async () => {
    // The reel is done; the tiktok handle is gone (an earlier tick dropped it). Iterating
    // the HANDLES here reported nothing pending and advanced the pack, leaving Phase 3 to
    // look for a TikTok video that was never made.
    const pack = {
      contentId: 'c1', status: 'rendering', attempts: {},
      renders: {
        handles: { reel: { sandboxId: 'sb-reel', cmdId: 'cmd-reel', startedAt: Date.now() } },
        videos: {},
        cutAttempts: { reel: 1, tiktok: 1 },
      },
    };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.get = async (key) => (key === PACK_KEY('c1') ? pack : null);
    const setCalls = [];
    kv.set = async (key, val) => { setCalls.push(val); };
    kv.zadd = async () => {};
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ stage: 'done', url: 'https://blob.example/reel.mp4', size: 4_000_000, contentType: 'video/mp4' }),
    });

    let result;
    try {
      result = await runTick();
    } finally {
      globalThis.fetch = savedFetch;
    }

    assert.deepEqual(result.results, [{ contentId: 'c1', status: 'rendering', waiting: 're-rendering tiktok' }]);
    const finalSave = setCalls[setCalls.length - 1];
    assert.notEqual(finalSave.status, 'rendered');
    assert.equal(finalSave.status, 'imaged');
    assert.deepEqual(finalSave.renders.videos.reel, { url: 'https://blob.example/reel.mp4', size: 4_000_000 });
  });

  it('gives up on a cut that has already been rendered MAX_CUT_ATTEMPTS times, instead of re-rendering forever', async () => {
    const pack = {
      contentId: 'c1', status: 'imaged', attempts: {},
      social: { points: [] },
      renders: {
        stills: { cover: 'u', cta: 'u', story: 'u' },
        videos: { reel: { url: 'https://cdn.example/reel.mp4', size: 4_000_000 } },
        cutAttempts: { reel: 1, tiktok: 2 }, // tiktok has had both its goes
      },
    };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.get = async (key) => (key === PACK_KEY('c1') ? pack : null);
    const setCalls = [];
    kv.set = async (key, val) => { setCalls.push(val); };
    kv.zadd = async () => {};
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('no render should be started'); };

    let result;
    try {
      result = await runTick();
    } finally {
      globalThis.fetch = savedFetch;
    }

    assert.match(result.results[0].error, /tiktok failed 2 time\(s\)/);
    assert.equal(result.results[0].terminal, false); // 1st of 3 stage attempts
    const finalSave = setCalls[setCalls.length - 1];
    assert.equal(finalSave.renders.cutAttempts.tiktok, 2); // not incremented again
    assert.deepEqual(finalSave.renders.videos.reel, { url: 'https://cdn.example/reel.mp4', size: 4_000_000 });
  });

  it('re-renders a cut whose finished file fails QA (too small) rather than shipping it', async () => {
    const pack = {
      contentId: 'c1', status: 'rendering', attempts: {},
      renders: {
        handles: { tiktok: { sandboxId: 'sb-tiktok', cmdId: 'cmd-tiktok', startedAt: Date.now() } },
        videos: { reel: { url: 'https://cdn.example/reel.mp4', size: 4_000_000 } },
        cutAttempts: { reel: 1, tiktok: 1 },
      },
    };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.get = async (key) => (key === PACK_KEY('c1') ? pack : null);
    const setCalls = [];
    kv.set = async (key, val) => { setCalls.push(val); };
    kv.zadd = async () => {};
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ stage: 'done', url: 'https://blob.example/tiktok.mp4', size: 100, contentType: 'video/mp4' }),
    });

    let result;
    try {
      result = await runTick();
    } finally {
      globalThis.fetch = savedFetch;
    }

    assert.deepEqual(result.results, [{ contentId: 'c1', status: 'rendering', waiting: 're-rendering tiktok' }]);
    const finalSave = setCalls[setCalls.length - 1];
    assert.equal(finalSave.status, 'imaged');
    assert.deepEqual(finalSave.renders.handles, {}); // the file that failed QA is not kept as a handle
    assert.equal(finalSave.renders.videos.tiktok, undefined); // and never becomes a video
  });
});

// ── rendered stage (review gate + slot claiming + scheduling) ──────────────────────────────
// stageSchedule calls requestReview/claimSlots/schedulePost without an injectable fetchFn, so
// (like the 'queued' and 'imaged'/'rendering' stages above) these are driven through a stubbed
// globalThis.fetch. ZERNIO_API_KEY is a real, live key in this environment — every test here
// either never reaches Zernio (asserted by making fetch throw) or drives it through this stub.
describe('runTick — rendered stage (review gate)', () => {
  let savedGate, savedToken, savedChat;
  beforeEach(() => {
    savedGate = process.env.SOCIAL_REVIEW_GATE;
    savedToken = process.env.TELEGRAM_BOT_TOKEN;
    savedChat = process.env.TELEGRAM_CHAT_ID;
    process.env.SOCIAL_REVIEW_GATE = 'on';
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    process.env.TELEGRAM_CHAT_ID = 'chat';
  });
  afterEach(() => {
    if (savedGate === undefined) delete process.env.SOCIAL_REVIEW_GATE; else process.env.SOCIAL_REVIEW_GATE = savedGate;
    if (savedToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = savedToken;
    if (savedChat === undefined) delete process.env.TELEGRAM_CHAT_ID; else process.env.TELEGRAM_CHAT_ID = savedChat;
  });

  it('retries a failed review send up to SOCIAL_REVIEW_SEND_ATTEMPTS, then stops sending and holds on the delivery failure', async () => {
    const pack = { contentId: 'c1', status: 'rendered', attempts: {}, social: { headline: 'H', hook: '' }, categoryId: 'breaking-news' };
    const db = new Map([[PACK_KEY('c1'), pack]]);
    kv.get = async (key) => db.get(key) ?? null;
    kv.set = async (key, val) => { db.set(key, val); };
    kv.zrangebyscore = async () => ['c1']; // always "due" — this test is about counting attempts, not timing
    kv.zrem = async () => 1;
    kv.zadd = async () => {};

    let telegramCalls = 0;
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async () => { telegramCalls++; return { json: async () => ({ ok: false, description: 'chat not found' }) }; };
    try {
      for (let i = 0; i < 3; i++) await runTick(); // eslint-disable-line no-await-in-loop
    } finally {
      globalThis.fetch = savedFetch;
    }

    assert.equal(telegramCalls, 3); // one send per tick, up to the cap
    assert.equal(db.get(PACK_KEY('c1')).review.attempts, 3);
    assert.equal(db.get(PACK_KEY('c1')).review.sent, false);
    assert.equal(db.get(PACK_KEY('c1')).status, 'rendered'); // never advanced past the gate

    // A 4th tick must not try Telegram again — the attempt cap has been reached, and the stage
    // falls through to reviewState, which holds on the recorded delivery failure instead.
    globalThis.fetch = async () => { throw new Error('must not retry a 4th time once the attempt cap is reached'); };
    let result;
    try {
      result = await runTick();
    } finally {
      globalThis.fetch = savedFetch;
    }
    assert.match(result.results[0].waiting, /review request not delivered/);
  });
});

describe('runTick — rendered stage (claiming + scheduling)', () => {
  // The review decision lives in its own key, written once with SET NX. A Reject and the
  // auto-approve clock race for that key and exactly one wins. These two tests pin both sides.
  let savedGate, savedAuto;
  beforeEach(() => {
    savedGate = process.env.SOCIAL_REVIEW_GATE;
    savedAuto = process.env.SOCIAL_REVIEW_AUTO_MINUTES;
    process.env.SOCIAL_REVIEW_GATE = 'on';
    process.env.SOCIAL_REVIEW_AUTO_MINUTES = '60';
  });
  afterEach(() => {
    if (savedGate === undefined) delete process.env.SOCIAL_REVIEW_GATE; else process.env.SOCIAL_REVIEW_GATE = savedGate;
    if (savedAuto === undefined) delete process.env.SOCIAL_REVIEW_AUTO_MINUTES; else process.env.SOCIAL_REVIEW_AUTO_MINUTES = savedAuto;
  });

  /** Sent for review two hours ago and never answered, so the 60-minute clock has run out. */
  const expiredPack = () => ({
    contentId: 'c1', status: 'rendered', attempts: {},
    social: { headline: 'H', hook: '' }, categoryId: 'breaking-news',
    renderedAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    renders: {}, // no assets, so a released pack reaches claimSlots and finds no slot — never Zernio
    review: { sent: true, requestedAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString() },
  });

  it('a Reject recorded before the auto-approve claim wins: the pack is dropped and nothing is posted', async () => {
    const db = new Map([
      [PACK_KEY('c1'), expiredPack()],
      // Landed after this tick claimed the pack record, but before the tick's own approval.
      [DECISION_KEY('c1'), { decision: 'rejected', by: 'bob', via: 'telegram', decidedAt: new Date().toISOString() }],
    ]);
    kv.get = async (key) => db.get(key) ?? null;
    kv.set = upstashSet(db);
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.zadd = async () => {};

    const result = await runTick();
    assert.deepEqual(result.results, [{ contentId: 'c1', status: 'rendered', stopped: 'rejected by bob' }]);
    assert.equal(db.get(PACK_KEY('c1')).status, 'dropped');
    assert.equal(db.get(DECISION_KEY('c1')).decision, 'rejected'); // never overwritten by the clock
  });

  it('while a released pack is still waiting for a slot, nothing is recorded and a Reject is still accepted', async () => {
    // Nothing about the story is public yet, so the reviewer must still be able to stop it.
    const db = new Map([[PACK_KEY('c1'), expiredPack()]]);
    kv.get = async (key) => db.get(key) ?? null;
    kv.set = upstashSet(db);
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.zadd = async () => {};

    const result = await runTick();
    assert.deepEqual(result.results, [{ contentId: 'c1', status: 'rendered', waiting: "no free slot in today's grid" }]);
    assert.equal(db.get(DECISION_KEY('c1')), undefined);

    const { decide } = await import('../pack/review.js');
    const reject = await decide('c1', 'rejected', 'bob');
    assert.equal(reject.ok, true);
    assert.equal(db.get(DECISION_KEY('c1')).decision, 'rejected');
  });

  /**
   * A pack that WINS a slot: a TikTok asset, with the clock frozen early in the London day so
   * every slot is still ahead. ZERNIO_TIKTOK_ACCOUNT_ID is unset, so `schedulePost` throws
   * before any network call — the first step that would hand anything to Zernio. Whatever is
   * recorded before that error was recorded before anything could go public.
   */
  async function withSlotWinningPack(t, review, fn) {
    t.mock.timers.enable({ apis: ['Date'] });
    const now = Date.parse('2026-06-15T05:00:00.000Z'); // 06:00 BST — the whole grid is ahead
    t.mock.timers.setTime(now);
    const savedAccount = process.env.ZERNIO_TIKTOK_ACCOUNT_ID;
    delete process.env.ZERNIO_TIKTOK_ACCOUNT_ID;
    try {
      const pack = {
        contentId: 'c1', status: 'rendered', attempts: {},
        social: { headline: 'H', hook: '', tiktokCaption: 'Watch', hashtags: [] },
        categoryId: 'breaking-news',
        renderedAt: new Date(now - 2 * 60 * 60_000).toISOString(),
        renders: { videos: { tiktok: { url: 'https://cdn.example/t.mp4' } } },
        ...(review ? { review: review(now) } : {}),
      };
      await fn(pack, now);
    } finally {
      if (savedAccount === undefined) delete process.env.ZERNIO_TIKTOK_ACCOUNT_ID; else process.env.ZERNIO_TIKTOK_ACCOUNT_ID = savedAccount;
    }
  }

  it('once a slot is won the auto-approval is recorded before scheduling; if nothing then posts it is taken back and a Reject works again', async (t) => {
    await withSlotWinningPack(t, (now) => ({
      sent: true, requestedAt: new Date(now - 2 * 60 * 60_000).toISOString(), chatId: '555', messageId: 77,
    }), async (pack) => {
      const db = new Map([[PACK_KEY('c1'), pack]]);
      kv.get = async (key) => db.get(key) ?? null;
      kv.set = upstashSet(db);
      kv.zrangebyscore = async () => ['c1'];
      kv.zrem = async () => 1;
      kv.zadd = async () => {};
      // What the decision key held at the moment it was retracted — i.e. while the failed
      // scheduling attempt was in flight.
      let heldWhileScheduling = null;
      kv.del = async (key) => { if (key === DECISION_KEY('c1')) heldWhileScheduling = db.get(key); db.delete(key); };

      const telegram = [];
      const savedFetch = globalThis.fetch;
      const savedToken = process.env.TELEGRAM_BOT_TOKEN;
      process.env.TELEGRAM_BOT_TOKEN = 'tok';
      globalThis.fetch = async (url, init) => {
        if (!String(url).startsWith('https://api.telegram.org/')) throw new Error(`unexpected network call: ${url}`);
        telegram.push({ method: String(url).split('/').pop(), body: JSON.parse(init.body) });
        return { json: async () => ({ ok: true }) };
      };
      let result;
      try {
        result = await runTick();
      } finally {
        globalThis.fetch = savedFetch;
        if (savedToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = savedToken;
        kv.del = saved.del;
      }

      // It reached the first Zernio-bound step, which failed with nothing posted...
      assert.match(result.results[0].error, /no Zernio tiktok account configured/);
      // ...having recorded the automatic approval first...
      assert.equal(heldWhileScheduling?.decision, 'approved');
      assert.equal(heldWhileScheduling?.via, 'auto');
      assert.match(heldWhileScheduling?.reason ?? '', /auto-approved after 60 min/);
      // ...then taken it back, and told nobody "being scheduled now" about a story that wasn't.
      assert.equal(db.get(DECISION_KEY('c1')), undefined);
      assert.deepEqual(telegram, []);

      // So the story is still rejectable until something really goes out.
      const { decide } = await import('../pack/review.js');
      const reject = await decide('c1', 'rejected', 'bob');
      assert.equal(reject.ok, true);
      assert.equal(db.get(DECISION_KEY('c1')).decision, 'rejected');
    });
  });

  it('drops a rendered pack that never wins a slot within UNSLOTTED_MAX_HOURS (72h default)', async () => {
    const waitingSince = new Date(Date.now() - 73 * 60 * 60_000).toISOString(); // just past 72h
    const pack = {
      contentId: 'c1', status: 'rendered', attempts: {},
      social: { headline: 'H', hook: '' }, categoryId: 'breaking-news',
      renderedAt: waitingSince,
      renders: {}, // no assets at all — claimSlots can never find it a slot, whatever the grid holds
      review: { sent: true, decision: 'approved', by: 'alice', requestedAt: waitingSince },
    };
    const db = new Map([[PACK_KEY('c1'), pack]]);
    kv.get = async (key) => db.get(key) ?? null;
    kv.set = async (key, val) => { db.set(key, val); };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.zadd = async () => {};

    const result = await runTick();
    assert.deepEqual(result.results, [{ contentId: 'c1', status: 'rendered', stopped: 'gave up waiting for a slot' }]);
    const final = db.get(PACK_KEY('c1'));
    assert.equal(final.status, 'dropped');
    assert.match(final.error.message, /never won a slot within 72h/);
  });

  it('holds (does not drop) a rendered pack still waiting for a slot within the deadline', async () => {
    const renderedAt = new Date(Date.now() - 60_000).toISOString(); // one minute ago — nowhere near 72h
    const pack = {
      contentId: 'c1', status: 'rendered', attempts: {},
      social: { headline: 'H', hook: '' }, categoryId: 'breaking-news',
      renderedAt,
      renders: {}, // no assets — guarantees no slot is won, deterministically
      review: { sent: true, decision: 'approved', by: 'alice', requestedAt: renderedAt },
    };
    const db = new Map([[PACK_KEY('c1'), pack]]);
    kv.get = async (key) => db.get(key) ?? null;
    kv.set = async (key, val) => { db.set(key, val); };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.zadd = async () => {};

    const result = await runTick();
    assert.deepEqual(result.results, [{ contentId: 'c1', status: 'rendered', waiting: "no free slot in today's grid" }]);
    assert.equal(db.get(PACK_KEY('c1')).status, 'rendered'); // untouched, not dropped
  });

  // End-to-end proof of both review.js fixes together: a pack approved via decide() (the
  // decision key) that never had a review message sent — so it carries no `review` block and
  // therefore no `requestedAt` — must be RELEASED (decision checked before requestedAt), not
  // held forever reporting "not yet sent for review"; and it must not be ARCHIVED for want of
  // an answer, even though its renderedAt is old enough to have crossed that would-be deadline,
  // because a pack with a recorded decision is never a candidate for the unanswered-review
  // archive in the first place (see the `!pack.review?.decision` guard in the `!state.released`
  // branch). With no assets at all (`renders: {}`) it can never win a slot, so — once released
  // — it runs into the SEPARATE unslotted-give-up deadline (also 72h by default) instead: a
  // real, different outcome from being stuck at "not yet sent for review", and proof the tick
  // actually reached the slot-claiming logic rather than being turned away at the review gate.
  it('a pack approved via decide() with no review record at all is released and reaches slot logic, never archived, despite a renderedAt older than the archive/unslotted defaults', async () => {
    const renderedAt = new Date(Date.now() - 80 * 60 * 60_000).toISOString(); // 80h ago: past both 72h defaults
    const pack = {
      contentId: 'c1', status: 'rendered', attempts: {},
      social: { headline: 'H', hook: '' }, categoryId: 'breaking-news',
      renderedAt,
      renders: {}, // no assets at all — claimSlots can never find this pack a slot
      // No `review` field whatsoever — this pack was approved directly (e.g. from the app)
      // before any review message was ever sent, so `review.requestedAt` never existed.
    };
    const decision = { decision: 'approved', by: 'alice', via: 'app', decidedAt: new Date().toISOString() };
    const db = new Map([[PACK_KEY('c1'), pack], [DECISION_KEY('c1'), decision]]);
    kv.get = async (key) => db.get(key) ?? null;
    kv.set = async (key, val) => { db.set(key, val); };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.zadd = async () => {};

    const result = await runTick();

    // Reached the slot-claiming logic and gave up on the (separate) unslotted deadline — NOT
    // stuck reporting "not yet sent for review", and NOT archived.
    assert.deepEqual(result.results, [{ contentId: 'c1', status: 'rendered', stopped: 'gave up waiting for a slot' }]);
    const final = db.get(PACK_KEY('c1'));
    assert.equal(final.status, 'dropped');
    assert.notEqual(final.status, 'archived');
    assert.match(final.error.message, /never won a slot within 72h/);
  });

  it('gate "off": the tick records an approved/auto decision before scheduling, even though no review was ever requested', async (t) => {
    process.env.SOCIAL_REVIEW_GATE = 'off';
    await withSlotWinningPack(t, null, async (pack) => {
      const db = new Map([[PACK_KEY('c1'), pack]]);
      kv.get = async (key) => db.get(key) ?? null;
      kv.set = upstashSet(db);
      kv.zrangebyscore = async () => ['c1'];
      kv.zrem = async () => 1;
      kv.zadd = async () => {};

      let heldWhileScheduling = null;
      kv.del = async (key) => { if (key === DECISION_KEY('c1')) heldWhileScheduling = db.get(key); db.delete(key); };
      let result;
      try {
        result = await runTick();
      } finally {
        kv.del = saved.del;
      }
      assert.match(result.results[0].error, /no Zernio tiktok account configured/); // reached scheduling
      assert.equal(heldWhileScheduling?.decision, 'approved');
      assert.equal(heldWhileScheduling?.by, 'autopilot');
      assert.equal(heldWhileScheduling?.via, 'auto');
      assert.equal(heldWhileScheduling?.reason, 'gate off');
      assert.equal(db.get(DECISION_KEY('c1')), undefined); // nothing posted, so taken back
    });
  });

  // ── The Reject-after-claimSlots race ──────────────────────────────────────────────────────
  // Once a slot is won, the auto-approval is recorded with SET NX immediately before the first
  // schedulePost. A Reject pressed at exactly that moment races for the same key. These pin
  // all three outcomes of that race, plus what `releaseSlots` actually gives back.

  it('a Reject landing on the NX write after slots are claimed drops the pack and releases the grid slots it just won', async (t) => {
    await withSlotWinningPack(t, (now) => ({
      sent: true, requestedAt: new Date(now - 2 * 60 * 60_000).toISOString(), chatId: '555', messageId: 77,
    }), async (pack, now) => {
      const dateISO = gridDate(now);
      const slotsKey = SLOTS_KEY(dateISO);
      const db = new Map([[PACK_KEY('c1'), pack]]);
      const gridWrites = [];
      kv.get = async (key) => db.get(key) ?? null;
      // Simulate a Reject landing on the exact NX write: the write "loses" (returns null, the
      // real SET NX semantics for a key someone else just claimed) and, as a side effect,
      // stores the rejection that got there first.
      kv.set = async (key, val, opts) => {
        if (key === slotsKey) gridWrites.push({ ...val });
        if (key === DECISION_KEY('c1') && opts?.nx) {
          if (db.has(key)) return null;
          db.set(key, { decision: 'rejected', by: 'bob', via: 'telegram', decidedAt: new Date().toISOString() });
          return null;
        }
        db.set(key, val);
        return 'OK';
      };
      kv.zrangebyscore = async () => ['c1'];
      kv.zrem = async () => 1;
      kv.zadd = async () => {};

      const result = await runTick();

      assert.deepEqual(result.results, [{ contentId: 'c1', status: 'rendered', stopped: 'rejected by bob' }]);
      assert.equal(db.get(PACK_KEY('c1')).status, 'dropped');
      // Proof the grid DID hold this pack's slot before release: claimSlots' own write.
      assert.ok(gridWrites.length >= 1, 'claimSlots must have written the grid at least once');
      assert.ok(Object.values(gridWrites[0]).includes('c1'), 'the grid must have held a c1 slot before release');
      // After the whole tick, none of c1's slots remain.
      const finalGrid = db.get(slotsKey) ?? {};
      assert.equal(Object.values(finalGrid).includes('c1'), false);
    });
  });

  it('an approval already recorded before the NX write wins: scheduling continues undisturbed', async (t) => {
    await withSlotWinningPack(t, (now) => ({
      sent: true, requestedAt: new Date(now - 2 * 60 * 60_000).toISOString(), chatId: '555', messageId: 77,
    }), async (pack) => {
      const existing = { decision: 'approved', by: 'alice', via: 'app', decidedAt: new Date().toISOString() };
      const db = new Map([[PACK_KEY('c1'), pack], [DECISION_KEY('c1'), existing]]);
      kv.get = async (key) => db.get(key) ?? null;
      kv.set = upstashSet(db);
      kv.zrangebyscore = async () => ['c1'];
      kv.zrem = async () => 1;
      kv.zadd = async () => {};

      const result = await runTick();

      // Reached the first Zernio-bound step — scheduling was never blocked.
      assert.match(result.results[0].error, /no Zernio tiktok account configured/);
      // The pre-existing approval was never touched: still alice/app, not overwritten by autopilot.
      const recorded = db.get(DECISION_KEY('c1'));
      assert.equal(recorded.by, 'alice');
      assert.equal(recorded.via, 'app');
    });
  });

  it('an ambiguous decision key ({} — expired or malformed) at the NX write leaves the pack staying, and nothing is posted', async (t) => {
    await withSlotWinningPack(t, (now) => ({
      sent: true, requestedAt: new Date(now - 2 * 60 * 60_000).toISOString(), chatId: '555', messageId: 77,
    }), async (pack) => {
      const db = new Map([[PACK_KEY('c1'), pack], [DECISION_KEY('c1'), {}]]);
      kv.get = async (key) => db.get(key) ?? null;
      kv.set = upstashSet(db);
      kv.zrangebyscore = async () => ['c1'];
      kv.zrem = async () => 1;
      kv.zadd = async () => {};

      const result = await runTick();

      assert.deepEqual(result.results, [{
        contentId: 'c1', status: 'rendered', waiting: 'could not record the approval; retrying next tick',
      }]);
      const final = db.get(PACK_KEY('c1'));
      assert.equal(final.status, 'rendered'); // untouched
      assert.equal(final.posts, undefined); // nothing posted
    });
  });

  it('releases only the slots this pack has not posted: other packs\' slots and its own already-posted formats survive', async (t) => {
    await withSlotWinningPack(t, (now) => ({
      sent: true, requestedAt: new Date(now - 2 * 60 * 60_000).toISOString(), chatId: '555', messageId: 77,
    }), async (pack, now) => {
      const dateISO = gridDate(now);
      const slotsKey = SLOTS_KEY(dateISO);
      const withPosts = {
        ...pack,
        posts: [{ format: 'reel', platform: 'instagram', at: new Date(now - 60_000).toISOString(), zernioPostId: 'zp0', status: 'published' }],
      };
      const db = new Map([
        [PACK_KEY('c1'), withPosts],
        // A stale grid slot for a format c1 has ALREADY posted, plus a slot held by another
        // pack entirely — releaseSlots must leave both alone.
        [slotsKey, { 'reel@06:30': 'c1', 'story@07:00': 'other-pack' }],
      ]);
      kv.get = async (key) => db.get(key) ?? null;
      kv.set = async (key, val, opts) => {
        if (key === DECISION_KEY('c1') && opts?.nx) {
          if (db.has(key)) return null;
          db.set(key, { decision: 'rejected', by: 'bob', via: 'telegram', decidedAt: new Date().toISOString() });
          return null;
        }
        db.set(key, val);
        return 'OK';
      };
      kv.zrangebyscore = async () => ['c1'];
      kv.zrem = async () => 1;
      kv.zadd = async () => {};

      const result = await runTick();

      assert.deepEqual(result.results, [{ contentId: 'c1', status: 'rendered', stopped: 'rejected by bob' }]);
      const finalGrid = db.get(slotsKey);
      assert.equal(finalGrid['reel@06:30'], 'c1'); // already posted — kept, not this pack's to lose
      assert.equal(finalGrid['story@07:00'], 'other-pack'); // someone else's slot — never touched
      assert.equal('tiktok@08:00' in finalGrid, false); // the fresh, unposted slot IS released
    });
  });

  // ── What actually happens once posting begins: success, and partial failure ────────────────
  // The race tests above prove the DECISION is retracted or kept correctly; these prove what
  // happens to the DECISION and the REVIEWER once real Zernio calls are in the loop — the
  // success path (closeReviewMessage's wording) and the partial-failure path (the decision is
  // kept, not retracted, the moment even one post has gone out).
  describe('runTick — rendered stage: what happens once scheduling actually reaches Zernio', () => {
    let savedApiKey, savedInstagram, savedToken;
    beforeEach(() => {
      savedApiKey = process.env.ZERNIO_API_KEY;
      savedInstagram = process.env.ZERNIO_INSTAGRAM_ACCOUNT_ID;
      savedToken = process.env.TELEGRAM_BOT_TOKEN;
      process.env.ZERNIO_API_KEY = 'test-zernio-key';
      process.env.ZERNIO_INSTAGRAM_ACCOUNT_ID = 'ig-account-1';
      process.env.TELEGRAM_BOT_TOKEN = 'tok';
    });
    afterEach(() => {
      if (savedApiKey === undefined) delete process.env.ZERNIO_API_KEY; else process.env.ZERNIO_API_KEY = savedApiKey;
      if (savedInstagram === undefined) delete process.env.ZERNIO_INSTAGRAM_ACCOUNT_ID; else process.env.ZERNIO_INSTAGRAM_ACCOUNT_ID = savedInstagram;
      if (savedToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = savedToken;
    });

    it('SUCCESS: once a post actually goes out, the auto-approval is KEPT and closeReviewMessage announces it exactly once', async (t) => {
      t.mock.timers.enable({ apis: ['Date'] });
      const now = Date.parse('2026-06-15T05:00:00.000Z'); // 06:00 BST — the whole grid is ahead
      t.mock.timers.setTime(now);
      const pack = {
        contentId: 'c1', status: 'rendered', attempts: {},
        social: { headline: 'H', hook: '', igCaption: 'Watch this', hashtags: ['news'] },
        categoryId: 'breaking-news',
        renderedAt: new Date(now - 2 * 60 * 60_000).toISOString(),
        renders: { videos: { reel: { url: 'https://cdn.example/reel.mp4' } } },
        review: { sent: true, requestedAt: new Date(now - 2 * 60 * 60_000).toISOString(), chatId: '555', messageId: 77 },
      };
      const db = new Map([[PACK_KEY('c1'), pack]]);
      kv.get = async (key) => db.get(key) ?? null;
      kv.set = upstashSet(db);
      kv.zrangebyscore = async () => ['c1'];
      kv.zrem = async () => 1;
      kv.zadd = async () => {};

      const telegram = [];
      const savedFetch = globalThis.fetch;
      globalThis.fetch = async (url, init) => {
        const s = String(url);
        if (s.startsWith('https://api.telegram.org/')) {
          telegram.push({ method: s.split('/').pop(), body: JSON.parse(init.body) });
          return { json: async () => ({ ok: true }) };
        }
        if (s.startsWith('https://zernio.com/api/v1/posts')) {
          return {
            ok: true,
            json: async () => ({
              id: 'zpost1',
              status: 'scheduled',
              platforms: [{ platform: 'instagram', status: 'scheduled', platformPostId: 'ig-post-1' }],
            }),
          };
        }
        throw new Error(`unexpected network call: ${s}`);
      };

      let result;
      try {
        result = await runTick();
      } finally {
        globalThis.fetch = savedFetch;
      }

      assert.deepEqual(result.results, [{ contentId: 'c1', from: 'rendered', to: 'slotted' }]);

      // The auto-approval is KEPT — a post actually went out, so nothing can take it back.
      const decision = db.get(DECISION_KEY('c1'));
      assert.equal(decision.decision, 'approved');
      assert.equal(decision.via, 'auto');

      const final = db.get(PACK_KEY('c1'));
      assert.equal(final.posts.length, 1);
      assert.equal(final.posts[0].format, 'reel');
      assert.equal(final.posts[0].zernioPostId, 'zpost1'); // interpretPost reads the top-level post id
      assert.equal(final.posts[0].status, 'scheduled');

      // closeReviewMessage fires exactly once, on the review's own stored chat/message.
      const edits = telegram.filter((c) => c.method === 'editMessageReplyMarkup');
      const sends = telegram.filter((c) => c.method === 'sendMessage');
      assert.equal(edits.length, 1);
      assert.equal(sends.length, 1);
      assert.equal(edits[0].body.chat_id, '555');
      assert.equal(edits[0].body.message_id, 77);
      assert.equal(sends[0].body.text, '⏱ Auto-approved after 60 min with no answer. It is being scheduled now.');
    });

    it('PARTIAL FAILURE: one post goes out, then the next schedulePost throws — the decision is kept (not retracted), the reviewer is still told, and the error carries the post that already went out', async (t) => {
      t.mock.timers.enable({ apis: ['Date'] });
      const now = Date.parse('2026-06-15T05:00:00.000Z');
      t.mock.timers.setTime(now);
      const pack = {
        contentId: 'c1', status: 'rendered', attempts: {},
        social: { headline: 'H', hook: '', igCaption: 'Watch this', hashtags: ['news'] },
        categoryId: 'breaking-news',
        renderedAt: new Date(now - 2 * 60 * 60_000).toISOString(),
        renders: {
          videos: { reel: { url: 'https://cdn.example/reel.mp4' } },
          stills: { story: 'https://cdn.example/story.jpg' },
        },
        review: { sent: true, requestedAt: new Date(now - 2 * 60 * 60_000).toISOString(), chatId: '555', messageId: 77 },
      };
      const db = new Map([[PACK_KEY('c1'), pack]]);
      kv.get = async (key) => db.get(key) ?? null;
      kv.set = upstashSet(db);
      kv.zrangebyscore = async () => ['c1'];
      kv.zrem = async () => 1;
      kv.zadd = async () => {};

      const telegram = [];
      let zernioCalls = 0;
      const savedFetch = globalThis.fetch;
      globalThis.fetch = async (url, init) => {
        const s = String(url);
        if (s.startsWith('https://api.telegram.org/')) {
          telegram.push({ method: s.split('/').pop(), body: JSON.parse(init.body) });
          return { json: async () => ({ ok: true }) };
        }
        if (s.startsWith('https://zernio.com/api/v1/posts')) {
          zernioCalls += 1;
          // The story slot (10:00) is chronologically before the reel slot (12:30), so it is
          // scheduled first: the first Zernio call succeeds, the second fails.
          if (zernioCalls === 1) {
            return {
              ok: true,
              json: async () => ({
                id: 'zpost-story',
                status: 'scheduled',
                platforms: [{ platform: 'instagram', status: 'scheduled', platformPostId: 'ig-story-1' }],
              }),
            };
          }
          throw new Error('ECONNRESET');
        }
        throw new Error(`unexpected network call: ${s}`);
      };

      let result;
      try {
        result = await runTick();
      } finally {
        globalThis.fetch = savedFetch;
      }

      assert.equal(result.results.length, 1);
      assert.equal(result.results[0].status, 'rendered'); // stayed at its stage — not terminal on the first failure
      assert.equal(result.results[0].terminal, false);
      assert.match(result.results[0].error, /ECONNRESET/);

      // The auto-approval is KEPT: one post already went out, so nothing here can recall it.
      const decision = db.get(DECISION_KEY('c1'));
      assert.equal(decision.decision, 'approved');
      assert.equal(decision.via, 'auto');

      // The error carries what was already posted, so a retry does not pay for it twice.
      const final = db.get(PACK_KEY('c1'));
      assert.equal(final.posts.length, 1);
      assert.equal(final.posts[0].format, 'story');
      assert.equal(final.posts[0].zernioPostId, 'zpost-story'); // interpretPost reads the top-level post id

      // The reviewer is still told — announce() fires once, from inside the catch.
      const edits = telegram.filter((c) => c.method === 'editMessageReplyMarkup');
      const sends = telegram.filter((c) => c.method === 'sendMessage');
      assert.equal(edits.length, 1);
      assert.equal(sends.length, 1);
    });

    // ── mayHaveReachedZernio classification, pinned through a real schedulePost failure ──────
    // A failed FIRST post either certainly never reached Zernio (retract the auto-approval, a
    // Reject works again) or MIGHT have (keep it — the retry reuses the same request id, which
    // Zernio dedupes on; taking the approval back would let a Reject through while the post is
    // actually about to publish). These pin every branch of that classification.
    describe('runTick — rendered stage: mayHaveReachedZernio classifies the first post\'s failure', () => {
      /**
       * A pack that wins an Instagram reel slot, with the POST /posts call answered however
       * `postsFetch` says (thrown error, or an ok:false response). Telegram is always answered
       * `{ok:true}` — its wording is pinned by the SUCCESS/PARTIAL FAILURE tests above, not here.
       */
      async function withFailingPost(t, postsFetch, fn) {
        t.mock.timers.enable({ apis: ['Date'] });
        const now = Date.parse('2026-06-15T05:00:00.000Z'); // 06:00 BST — the whole grid is ahead
        t.mock.timers.setTime(now);
        const pack = {
          contentId: 'c1', status: 'rendered', attempts: {},
          social: { headline: 'H', hook: '', igCaption: 'Watch this', hashtags: ['news'] },
          categoryId: 'breaking-news',
          renderedAt: new Date(now - 2 * 60 * 60_000).toISOString(),
          renders: { videos: { reel: { url: 'https://cdn.example/reel.mp4' } } },
          review: { sent: true, requestedAt: new Date(now - 2 * 60 * 60_000).toISOString(), chatId: '555', messageId: 77 },
        };
        const db = new Map([[PACK_KEY('c1'), pack]]);
        kv.get = async (key) => db.get(key) ?? null;
        kv.set = upstashSet(db);
        kv.del = async (key) => { db.delete(key); };
        kv.zrangebyscore = async () => ['c1'];
        kv.zrem = async () => 1;
        kv.zadd = async () => {};
        const savedFetch = globalThis.fetch;
        globalThis.fetch = async (url, init) => {
          const s = String(url);
          if (s.startsWith('https://api.telegram.org/')) return { json: async () => ({ ok: true }) };
          if (s.startsWith('https://zernio.com/api/v1/posts')) return postsFetch(url, init);
          throw new Error(`unexpected network call: ${s}`);
        };
        try {
          await fn(db);
        } finally {
          globalThis.fetch = savedFetch;
        }
      }

      it('(a) fetch throws AbortError: the auto-approval is KEPT, and a Reject is refused as already approved', async (t) => {
        await withFailingPost(t, async () => {
          throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
        }, async (db) => {
          const result = await runTick();
          assert.equal(result.results[0].status, 'rendered');
          assert.equal(result.results[0].terminal, false);
          const decision = db.get(DECISION_KEY('c1'));
          assert.equal(decision.decision, 'approved');
          assert.equal(decision.via, 'auto');

          const { decide } = await import('../pack/review.js');
          const reject = await decide('c1', 'rejected', 'bob');
          assert.equal(reject.ok, false);
          assert.match(reject.reason, /already approved/);
        });
      });

      it('(b) fetch throws TimeoutError: the auto-approval is KEPT, and a Reject is refused as already approved', async (t) => {
        await withFailingPost(t, async () => {
          throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
        }, async (db) => {
          const result = await runTick();
          assert.equal(result.results[0].status, 'rendered');
          const decision = db.get(DECISION_KEY('c1'));
          assert.equal(decision.decision, 'approved');

          const { decide } = await import('../pack/review.js');
          const reject = await decide('c1', 'rejected', 'bob');
          assert.equal(reject.ok, false);
          assert.match(reject.reason, /already approved/);
        });
      });

      it('(c) fetch throws a bare TypeError (\'fetch failed\'): the auto-approval is KEPT, and a Reject is refused', async (t) => {
        await withFailingPost(t, async () => { throw new TypeError('fetch failed'); }, async (db) => {
          const result = await runTick();
          assert.equal(result.results[0].status, 'rendered');
          const decision = db.get(DECISION_KEY('c1'));
          assert.equal(decision.decision, 'approved');

          const { decide } = await import('../pack/review.js');
          const reject = await decide('c1', 'rejected', 'bob');
          assert.equal(reject.ok, false);
          assert.match(reject.reason, /already approved/);
        });
      });

      it('(d) Zernio answers HTTP 502: the auto-approval is KEPT, and a Reject is refused', async (t) => {
        await withFailingPost(t, async () => ({ ok: false, status: 502, json: async () => ({ error: 'Bad Gateway' }) }), async (db) => {
          const result = await runTick();
          assert.equal(result.results[0].status, 'rendered');
          assert.match(result.results[0].error, /Bad Gateway/);
          const decision = db.get(DECISION_KEY('c1'));
          assert.equal(decision.decision, 'approved');

          const { decide } = await import('../pack/review.js');
          const reject = await decide('c1', 'rejected', 'bob');
          assert.equal(reject.ok, false);
          assert.match(reject.reason, /already approved/);
        });
      });

      it('(e) Zernio answers HTTP 400: the auto-approval is RETRACTED, and the Reject is accepted', async (t) => {
        await withFailingPost(t, async () => ({ ok: false, status: 400, json: async () => ({ error: 'Bad request' }) }), async (db) => {
          const result = await runTick();
          assert.equal(result.results[0].status, 'rendered');
          assert.match(result.results[0].error, /Bad request/);
          assert.equal(db.get(DECISION_KEY('c1')), undefined); // retracted — certainly never reached Zernio

          const { decide } = await import('../pack/review.js');
          const reject = await decide('c1', 'rejected', 'bob');
          assert.equal(reject.ok, true);
          assert.equal(db.get(DECISION_KEY('c1')).decision, 'rejected');
        });
      });

      // A 2xx means Zernio created the post, even when the body then fails to arrive. zernioFetch
      // reads an unreadable 2xx body as `{}`, and schedulePost throws "Zernio accepted the request
      // but …" — found by the security audit against a real socket. Both must keep the approval.
      for (const [label, respond] of [
        ['(f) a 201 whose body fails mid-read', async () => ({ ok: true, status: 201, json: async () => { throw new TypeError('terminated'); } })],
        ['(g) a 202 with an empty body', async () => ({ ok: true, status: 202, json: async () => ({}) })],
      ]) {
        it(`${label}: the auto-approval is KEPT, and a Reject is refused`, async (t) => {
          await withFailingPost(t, respond, async (db) => {
            const result = await runTick();
            // (f) now throws from zernioFetch itself (status 201, reachedZernio: true); (g) still
            // reaches schedulePost's "Zernio accepted the request but …". Either way: it landed.
            assert.match(result.results[0].error, /body could not be read|Zernio accepted the request/);
            assert.equal(db.get(DECISION_KEY('c1')).decision, 'approved');

            const { decide } = await import('../pack/review.js');
            const reject = await decide('c1', 'rejected', 'bob');
            assert.equal(reject.ok, false);
            assert.match(reject.reason, /already approved/);
          });
        });
      }
    });
  });

  // ── tick-budget-aware post scheduling (TIKTOK_MIN_BUDGET_MS / SAVE_MARGIN_MS / post-now) ──
  // TIKTOK_MIN_BUDGET_MS, POST_MIN_BUDGET_MS, SAVE_MARGIN_MS and TICK_BUDGET_MS are all
  // module-load consts (see the SOCIAL_REVIEW_ARCHIVE_HOURS override describe below for the
  // same situation), so overriding any of them needs a cache-busting dynamic import — a fresh
  // query string per test, so each gets its own module evaluation.
  describe('runTick — rendered stage: tick-budget-aware post scheduling', () => {
    let savedApiKey, savedInstagram, savedToken;
    beforeEach(() => {
      savedApiKey = process.env.ZERNIO_API_KEY;
      savedInstagram = process.env.ZERNIO_INSTAGRAM_ACCOUNT_ID;
      savedToken = process.env.TELEGRAM_BOT_TOKEN;
      process.env.ZERNIO_API_KEY = 'test-zernio-key';
      process.env.ZERNIO_INSTAGRAM_ACCOUNT_ID = 'ig-account-1';
      process.env.TELEGRAM_BOT_TOKEN = 'tok';
    });
    afterEach(() => {
      if (savedApiKey === undefined) delete process.env.ZERNIO_API_KEY; else process.env.ZERNIO_API_KEY = savedApiKey;
      if (savedInstagram === undefined) delete process.env.ZERNIO_INSTAGRAM_ACCOUNT_ID; else process.env.ZERNIO_INSTAGRAM_ACCOUNT_ID = savedInstagram;
      if (savedToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = savedToken;
    });

    it('defers TikTok when what SOCIAL_TICK_BUDGET_MS=80000 leaves is under TIKTOK_MIN_BUDGET_MS: stays, status unchanged, this pass\'s auto-approval retracted', async (t) => {
      const savedBudget = process.env.SOCIAL_TICK_BUDGET_MS;
      process.env.SOCIAL_TICK_BUDGET_MS = '80000';
      try {
        await withSlotWinningPack(t, (now) => ({
          sent: true, requestedAt: new Date(now - 2 * 60 * 60_000).toISOString(), chatId: '555', messageId: 77,
        }), async (pack) => {
          const mod = await import('./autopilot.js?tick-budget-tiktok-only-deferred');
          const db = new Map([[PACK_KEY('c1'), pack]]);
          kv.get = async (key) => db.get(key) ?? null;
          kv.set = upstashSet(db);
          kv.zrangebyscore = async () => ['c1'];
          kv.zrem = async () => 1;
          kv.zadd = async () => {};
          let heldWhileScheduling = null;
          kv.del = async (key) => { if (key === DECISION_KEY('c1')) heldWhileScheduling = db.get(key); db.delete(key); };

          const savedFetch = globalThis.fetch;
          // Nothing here should ever reach the network: schedulePost must never be called for
          // the deferred TikTok slot, and with nothing posted, announce() has nothing to say.
          globalThis.fetch = async (url) => { throw new Error(`unexpected network call: ${url}`); };

          let result;
          try {
            result = await mod.runTick();
          } finally {
            globalThis.fetch = savedFetch;
            kv.del = saved.del;
          }

          assert.deepEqual(result.results, [{
            contentId: 'c1', status: 'rendered', waiting: '1 post(s) left for the next pass (not enough tick left)',
          }]);
          const final = db.get(PACK_KEY('c1'));
          assert.equal(final.status, 'rendered'); // never advanced
          assert.deepEqual(final.posts, []); // the slot loop ran, but nothing was ever pushed

          // The auto-approval was recorded before the deferred slot was hit...
          assert.equal(heldWhileScheduling?.decision, 'approved');
          assert.equal(heldWhileScheduling?.via, 'auto');
          // ...then taken back, since this pass posted nothing.
          assert.equal(db.get(DECISION_KEY('c1')), undefined);
        });
      } finally {
        if (savedBudget === undefined) delete process.env.SOCIAL_TICK_BUDGET_MS; else process.env.SOCIAL_TICK_BUDGET_MS = savedBudget;
      }
    });

    it('the same SOCIAL_TICK_BUDGET_MS=80000 that defers a TikTok-only pack still lets a cheaper Instagram reel post: stays, decision KEPT, reviewer announced once', async (t) => {
      const savedBudget = process.env.SOCIAL_TICK_BUDGET_MS;
      process.env.SOCIAL_TICK_BUDGET_MS = '80000';
      try {
        await withSlotWinningPack(t, (now) => ({
          sent: true, requestedAt: new Date(now - 2 * 60 * 60_000).toISOString(), chatId: '555', messageId: 77,
        }), async (pack) => {
          const mod = await import('./autopilot.js?tick-budget-tiktok-and-reel');
          const withReel = {
            ...pack,
            social: { ...pack.social, igCaption: 'Watch this too', hashtags: [] },
            renders: { videos: { ...pack.renders.videos, reel: { url: 'https://cdn.example/reel.mp4' } } },
          };
          const db = new Map([[PACK_KEY('c1'), withReel]]);
          kv.get = async (key) => db.get(key) ?? null;
          kv.set = upstashSet(db);
          kv.zrangebyscore = async () => ['c1'];
          kv.zrem = async () => 1;
          kv.zadd = async () => {};

          const telegram = [];
          const zernioCalls = [];
          const savedFetch = globalThis.fetch;
          globalThis.fetch = async (url, init) => {
            const s = String(url);
            if (s.startsWith('https://api.telegram.org/')) {
              telegram.push({ method: s.split('/').pop(), body: JSON.parse(init.body) });
              return { json: async () => ({ ok: true }) };
            }
            if (s.startsWith('https://zernio.com/api/v1/posts')) {
              const body = JSON.parse(init.body);
              zernioCalls.push(body);
              return {
                ok: true,
                json: async () => ({
                  id: 'zpost-reel',
                  status: 'scheduled',
                  platforms: [{ platform: body.platforms[0].platform, status: 'scheduled', platformPostId: 'ig-post-1' }],
                }),
              };
            }
            throw new Error(`unexpected network call: ${s}`);
          };

          let result;
          try {
            result = await mod.runTick();
          } finally {
            globalThis.fetch = savedFetch;
          }

          // Exactly one Zernio post call, and it is the reel's (instagram) — TikTok's own
          // slot never reached schedulePost at all.
          assert.equal(zernioCalls.length, 1);
          assert.equal(zernioCalls[0].platforms[0].platform, 'instagram');

          assert.deepEqual(result.results, [{
            contentId: 'c1', status: 'rendered', waiting: '1 post(s) left for the next pass (not enough tick left)',
          }]);
          const final = db.get(PACK_KEY('c1'));
          assert.equal(final.status, 'rendered'); // stayed — not advanced to slotted
          assert.equal(final.posts.length, 1);
          assert.equal(final.posts[0].format, 'reel');

          // Something actually posted this pass, so the auto-approval is KEPT, not retracted.
          const decision = db.get(DECISION_KEY('c1'));
          assert.equal(decision.decision, 'approved');
          assert.equal(decision.via, 'auto');

          // announce() fires exactly once, even though the pack as a whole stays.
          const edits = telegram.filter((c) => c.method === 'editMessageReplyMarkup');
          const sends = telegram.filter((c) => c.method === 'sendMessage');
          assert.equal(edits.length, 1);
          assert.equal(sends.length, 1);
        });
      } finally {
        if (savedBudget === undefined) delete process.env.SOCIAL_TICK_BUDGET_MS; else process.env.SOCIAL_TICK_BUDGET_MS = savedBudget;
      }
    });

    it('on the default tick budget TikTok posts normally, with the upload legs getting a budgetMs-derived deadline well above the 75s floor', async (t) => {
      await withSlotWinningPack(t, (now) => ({
        sent: true, requestedAt: new Date(now - 2 * 60 * 60_000).toISOString(), chatId: '555', messageId: 77,
      }), async (pack) => {
        // withSlotWinningPack deletes ZERNIO_TIKTOK_ACCOUNT_ID so the "no account configured"
        // tests elsewhere in this file never reach Zernio; this test wants TikTok to actually
        // post, so it is set here — the helper's own finally restores whatever it was before,
        // either way.
        process.env.ZERNIO_TIKTOK_ACCOUNT_ID = 'tt-account-1';

        const db = new Map([[PACK_KEY('c1'), pack]]);
        kv.get = async (key) => db.get(key) ?? null;
        kv.set = upstashSet(db);
        kv.zrangebyscore = async () => ['c1'];
        kv.zrem = async () => 1;
        kv.zadd = async () => {};

        const telegram = [];
        const zernioCalls = [];
        // A spy, not a fake: node:test's default mock.method calls through to the real
        // setTimeout, so the actual 30s Zernio abort timers and the (much larger)
        // budgetMs-derived ones both still run and are cleared normally — this only records
        // what they were called with.
        const timeoutSpy = t.mock.method(globalThis, 'setTimeout');
        const savedFetch = globalThis.fetch;
        globalThis.fetch = async (url, init) => {
          const s = String(url);
          if (s.startsWith('https://api.telegram.org/')) {
            telegram.push({ method: s.split('/').pop(), body: JSON.parse(init.body) });
            return { json: async () => ({ ok: true }) };
          }
          if (s.includes('/tiktok/creator-info')) {
            return { ok: true, json: async () => ({ privacyLevels: ['PUBLIC_TO_EVERYONE'] }) };
          }
          if (s === 'https://cdn.example/t.mp4') {
            return {
              ok: true,
              headers: { get: (name) => (name === 'content-type' ? 'video/mp4' : null) },
              arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
            };
          }
          if (s.startsWith('https://zernio.com/api/v1/media/presign')) {
            return {
              ok: true,
              json: async () => ({ uploadUrl: 'https://media.zernio.com/upload/xyz', publicUrl: 'https://media.zernio.com/files/xyz' }),
            };
          }
          if (s === 'https://media.zernio.com/upload/xyz') {
            return { ok: true };
          }
          if (s.startsWith('https://zernio.com/api/v1/posts')) {
            const body = JSON.parse(init.body);
            zernioCalls.push(body);
            return {
              ok: true,
              json: async () => ({
                id: 'zpost-tiktok',
                status: 'scheduled',
                platforms: [{ platform: 'tiktok', status: 'scheduled', platformPostId: 'tt-post-1' }],
              }),
            };
          }
          throw new Error(`unexpected network call: ${s}`);
        };

        let result;
        try {
          result = await runTick();
        } finally {
          globalThis.fetch = savedFetch;
        }

        assert.deepEqual(result.results, [{ contentId: 'c1', from: 'rendered', to: 'slotted' }]);
        assert.equal(zernioCalls.length, 1);
        assert.equal(zernioCalls[0].platforms[0].platform, 'tiktok');

        // zernioFetch's own abort timer is a fixed 30s regardless of budgetMs; anything else
        // recorded here is one of rehostMedia's two upload-leg deadlines, sized off what
        // schedulePost actually handed it — that is the number under test.
        const budgetDerived = timeoutSpy.mock.calls
          .map((call) => call.arguments[1])
          .filter((ms) => ms !== 30_000);
        assert.ok(budgetDerived.length > 0, 'expected at least one budgetMs-derived deadline timer');
        for (const ms of budgetDerived) assert.ok(ms >= 75_000, `expected a budgetMs floor of at least 75000ms, got ${ms}`);
      });
    });

    it('a small SOCIAL_TICK_BUDGET_MS post-now run stops mid-way, saving what already posted; a second tick finishes the remaining formats', async (t) => {
      const savedGate = process.env.SOCIAL_REVIEW_GATE;
      process.env.SOCIAL_REVIEW_GATE = 'off'; // postNow only needs `released`; gate off is the simplest way there
      const savedBudget = process.env.SOCIAL_TICK_BUDGET_MS;
      process.env.SOCIAL_TICK_BUDGET_MS = '60000';
      t.mock.timers.enable({ apis: ['Date'] });
      try {
        const mod = await import('./autopilot.js?tick-budget-post-now-stall');
        const pack = {
          contentId: 'c1', status: 'rendered', attempts: {},
          social: { headline: 'H', hook: '', igCaption: 'Watch this', hashtags: [] },
          categoryId: 'breaking-news',
          renders: { videos: { reel: { url: 'https://cdn.example/reel.mp4' } }, stills: { story: 'https://cdn.example/story.jpg' } },
          review: { postNow: true },
        };
        const db = new Map([[PACK_KEY('c1'), pack]]);
        kv.get = async (key) => db.get(key) ?? null;
        kv.set = async (key, val) => { db.set(key, val); };
        kv.zrangebyscore = async () => ['c1'];
        kv.zrem = async () => 1;
        kv.zadd = async () => {};

        const posted = [];
        const savedFetch = globalThis.fetch;
        globalThis.fetch = async (url, init) => {
          const s = String(url);
          if (s.startsWith('https://zernio.com/api/v1/posts')) {
            const body = JSON.parse(init.body);
            posted.push(body.platforms[0].platform);
            // Simulate the real post-now round trip costing most of the tick — the same
            // frozen-clock mechanism `withSlotWinningPack` relies on elsewhere in this file,
            // just advanced deliberately here rather than left at zero.
            t.mock.timers.tick(55_000);
            return {
              ok: true,
              json: async () => ({
                id: 'zpost-reel', status: 'scheduled', platforms: [{ platform: 'instagram', status: 'scheduled', platformPostId: 'ig-post-1' }],
              }),
            };
          }
          throw new Error(`unexpected network call: ${s}`);
        };

        let firstResult;
        try {
          firstResult = await mod.runTick();
        } finally {
          globalThis.fetch = savedFetch;
        }

        assert.deepEqual(firstResult.results, [{ contentId: 'c1', status: 'rendered', waiting: 'tick budget spent mid post-now' }]);
        assert.deepEqual(posted, ['instagram']); // only the reel went out this pass
        const afterFirst = db.get(PACK_KEY('c1'));
        assert.equal(afterFirst.status, 'rendered'); // still not advanced — a stay never calls `advance`
        assert.equal(afterFirst.posts.length, 1);
        assert.equal(afterFirst.posts[0].format, 'reel');

        // A second tick: only 'story' is left (immediateAssignments filters out formats
        // already in pack.posts), and this time there is budget enough to finish it.
        globalThis.fetch = async (url, init) => {
          const s = String(url);
          if (s.startsWith('https://zernio.com/api/v1/posts')) {
            const body = JSON.parse(init.body);
            posted.push(body.platforms[0].platform);
            return {
              ok: true,
              json: async () => ({
                id: 'zpost-story', status: 'scheduled', platforms: [{ platform: 'instagram', status: 'scheduled', platformPostId: 'ig-post-2' }],
              }),
            };
          }
          throw new Error(`unexpected network call: ${s}`);
        };
        let secondResult;
        try {
          secondResult = await mod.runTick();
        } finally {
          globalThis.fetch = savedFetch;
        }

        assert.equal(posted.length, 2);
        assert.deepEqual(posted, ['instagram', 'instagram']); // reel, then story — never repeated
        assert.deepEqual(secondResult.results, [{ contentId: 'c1', from: 'rendered', to: 'slotted' }]);
        const final = db.get(PACK_KEY('c1'));
        assert.equal(final.posts.length, 2);
        assert.deepEqual(final.posts.map((p) => p.format).sort(), ['reel', 'story']);
      } finally {
        if (savedGate === undefined) delete process.env.SOCIAL_REVIEW_GATE; else process.env.SOCIAL_REVIEW_GATE = savedGate;
        if (savedBudget === undefined) delete process.env.SOCIAL_TICK_BUDGET_MS; else process.env.SOCIAL_TICK_BUDGET_MS = savedBudget;
      }
    });

    it('honours SOCIAL_TIKTOK_MIN_BUDGET_MS: a budget that comfortably clears the default 75s floor still defers once the override raises the floor above it', async (t) => {
      const savedFloor = process.env.SOCIAL_TIKTOK_MIN_BUDGET_MS;
      process.env.SOCIAL_TIKTOK_MIN_BUDGET_MS = '300000'; // higher than a whole default tick budget leaves after SAVE_MARGIN_MS
      try {
        await withSlotWinningPack(t, (now) => ({
          sent: true, requestedAt: new Date(now - 2 * 60 * 60_000).toISOString(), chatId: '555', messageId: 77,
        }), async (pack) => {
          const mod = await import('./autopilot.js?tiktok-min-budget-override');
          const db = new Map([[PACK_KEY('c1'), pack]]);
          kv.get = async (key) => db.get(key) ?? null;
          kv.set = upstashSet(db);
          kv.zrangebyscore = async () => ['c1'];
          kv.zrem = async () => 1;
          kv.zadd = async () => {};
          let heldWhileScheduling = null;
          kv.del = async (key) => { if (key === DECISION_KEY('c1')) heldWhileScheduling = db.get(key); db.delete(key); };

          const savedFetch = globalThis.fetch;
          globalThis.fetch = async (url) => { throw new Error(`unexpected network call: ${url}`); };

          let result;
          try {
            result = await mod.runTick();
          } finally {
            globalThis.fetch = savedFetch;
            kv.del = saved.del;
          }

          // On the DEFAULT tick budget this same shape of pack posts normally (see the test
          // above) — it defers here only because the override raised TikTok's own floor past
          // what a full 240s tick leaves after SAVE_MARGIN_MS.
          assert.deepEqual(result.results, [{
            contentId: 'c1', status: 'rendered', waiting: '1 post(s) left for the next pass (not enough tick left)',
          }]);
          assert.equal(db.get(PACK_KEY('c1')).status, 'rendered');
          assert.equal(heldWhileScheduling?.decision, 'approved');
          assert.equal(db.get(DECISION_KEY('c1')), undefined); // retracted — nothing posted
        });
      } finally {
        if (savedFloor === undefined) delete process.env.SOCIAL_TIKTOK_MIN_BUDGET_MS; else process.env.SOCIAL_TIKTOK_MIN_BUDGET_MS = savedFloor;
      }
    });
  });
});

// ── unanswered reviews are archived, not dropped (SOCIAL_REVIEW_ARCHIVE_HOURS) ─────────────
// Clifton's call (2026-09-24): a pack nobody decided on is paid for, so it is parked in the
// archive — out of the queue, everything kept, still approvable — rather than thrown away.
describe('runTick — rendered stage: an unanswered review is archived (SOCIAL_REVIEW_ARCHIVE_HOURS)', () => {
  let savedGate, savedAuto;
  beforeEach(() => {
    savedGate = process.env.SOCIAL_REVIEW_GATE;
    savedAuto = process.env.SOCIAL_REVIEW_AUTO_MINUTES;
    process.env.SOCIAL_REVIEW_GATE = 'on';
    process.env.SOCIAL_REVIEW_AUTO_MINUTES = '60';
  });
  afterEach(() => {
    if (savedGate === undefined) delete process.env.SOCIAL_REVIEW_GATE; else process.env.SOCIAL_REVIEW_GATE = savedGate;
    if (savedAuto === undefined) delete process.env.SOCIAL_REVIEW_AUTO_MINUTES; else process.env.SOCIAL_REVIEW_AUTO_MINUTES = savedAuto;
  });

  it('with the hold ON, archives a SENSITIVE pack once its review has waited past the 72h default, even though it never auto-approves on its own', async () => {
    process.env.SOCIAL_REVIEW_HOLD_SENSITIVE = 'on';
    const requestedAt = new Date(Date.now() - 73 * 60 * 60_000).toISOString(); // just past 72h
    const pack = {
      contentId: 'c1', status: 'rendered', attempts: {},
      social: { headline: 'H', hook: '', sensitive: true }, categoryId: 'breaking-news',
      renderedAt: requestedAt,
      renders: {},
      review: { sent: true, requestedAt },
    };
    const db = new Map([[PACK_KEY('c1'), pack]]);
    kv.get = async (key) => db.get(key) ?? null;
    kv.set = async (key, val) => { db.set(key, val); };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.zadd = async () => {};

    const result = await runTick();

    assert.deepEqual(result.results, [{ contentId: 'c1', status: 'rendered', stopped: 'archived: review never answered' }]);
    const final = db.get(PACK_KEY('c1'));
    assert.equal(final.status, 'archived');
    assert.match(final.archivedReason, /no review decision within 72h \(sensitive — waiting for a person, never auto-approved\)/);
    assert.deepEqual(final.renders, {}); // kept as it was — nothing is thrown away
  });

  it('archives a SENSITIVE pack past 72h when the window is 0 and the hold is off — the clock, not the hold, is what stops it', async () => {
    process.env.SOCIAL_REVIEW_AUTO_MINUTES = '0';
    const requestedAt = new Date(Date.now() - 73 * 60 * 60_000).toISOString();
    const pack = {
      contentId: 'c1', status: 'rendered', attempts: {},
      social: { headline: 'H', hook: '', sensitive: true }, categoryId: 'breaking-news',
      renderedAt: requestedAt,
      renders: {},
      review: { sent: true, requestedAt },
    };
    const db = new Map([[PACK_KEY('c1'), pack]]);
    kv.get = async (key) => db.get(key) ?? null;
    kv.set = async (key, val) => { db.set(key, val); };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.zadd = async () => {};

    const result = await runTick();

    assert.deepEqual(result.results, [{ contentId: 'c1', status: 'rendered', stopped: 'archived: review never answered' }]);
    const final = db.get(PACK_KEY('c1'));
    assert.equal(final.status, 'archived');
    assert.match(final.archivedReason, /no review decision within 72h \(waiting for a decision\)/);
  });

  it('by default (hold unset) a SENSITIVE pack whose 60-minute window passed is released, not archived', async () => {
    const requestedAt = new Date(Date.now() - 2 * 60 * 60_000).toISOString(); // past 60 min, well inside 72h
    const pack = {
      contentId: 'c1', status: 'rendered', attempts: {},
      social: { headline: 'H', hook: '', sensitive: true }, categoryId: 'breaking-news',
      renderedAt: requestedAt,
      renders: {}, // no assets: a released pack reaches claimSlots and finds no slot — never Zernio
      review: { sent: true, requestedAt },
    };
    const db = new Map([[PACK_KEY('c1'), pack]]);
    kv.get = async (key) => db.get(key) ?? null;
    kv.set = upstashSet(db);
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.zadd = async () => {};

    const result = await runTick();

    assert.deepEqual(result.results, [{ contentId: 'c1', status: 'rendered', waiting: "no free slot in today's grid" }]);
    assert.equal(db.get(PACK_KEY('c1')).status, 'rendered');
  });

  it('with the hold ON the identical sensitive pack is NOT released at 2h — it waits for a person', async () => {
    process.env.SOCIAL_REVIEW_HOLD_SENSITIVE = 'on';
    const requestedAt = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    const pack = {
      contentId: 'c1', status: 'rendered', attempts: {},
      social: { headline: 'H', hook: '', sensitive: true }, categoryId: 'breaking-news',
      renderedAt: requestedAt,
      renders: {},
      review: { sent: true, requestedAt },
    };
    const db = new Map([[PACK_KEY('c1'), pack]]);
    kv.get = async (key) => db.get(key) ?? null;
    kv.set = upstashSet(db);
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.zadd = async () => {};

    const result = await runTick();

    assert.deepEqual(result.results, [{ contentId: 'c1', status: 'rendered', waiting: 'sensitive — waiting for a person, never auto-approved' }]);
  });

  it('archives a pack past 72h when SOCIAL_REVIEW_AUTO_MINUTES=0 disables auto-approval entirely', async () => {
    process.env.SOCIAL_REVIEW_AUTO_MINUTES = '0';
    const requestedAt = new Date(Date.now() - 73 * 60 * 60_000).toISOString();
    const pack = {
      contentId: 'c1', status: 'rendered', attempts: {},
      social: { headline: 'H', hook: '' }, categoryId: 'breaking-news',
      renderedAt: requestedAt,
      renders: {},
      review: { sent: true, requestedAt },
    };
    const db = new Map([[PACK_KEY('c1'), pack]]);
    kv.get = async (key) => db.get(key) ?? null;
    kv.set = async (key, val) => { db.set(key, val); };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.zadd = async () => {};

    const result = await runTick();

    assert.deepEqual(result.results, [{ contentId: 'c1', status: 'rendered', stopped: 'archived: review never answered' }]);
    const final = db.get(PACK_KEY('c1'));
    assert.equal(final.status, 'archived');
    assert.match(final.archivedReason, /no review decision within 72h \(waiting for a decision\)/);
  });

  it('archives a pack whose review was never delivered (sent:false), once the send attempts are spent and 72h have passed', async () => {
    const requestedAt = new Date(Date.now() - 73 * 60 * 60_000).toISOString();
    const pack = {
      contentId: 'c1', status: 'rendered', attempts: {},
      social: { headline: 'H', hook: '' }, categoryId: 'breaking-news',
      renderedAt: requestedAt,
      renders: {},
      review: { sent: false, requestedAt, attempts: 3, error: 'chat not found' },
    };
    const db = new Map([[PACK_KEY('c1'), pack]]);
    kv.get = async (key) => db.get(key) ?? null;
    kv.set = async (key, val) => { db.set(key, val); };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.zadd = async () => {};

    const result = await runTick();

    assert.deepEqual(result.results, [{ contentId: 'c1', status: 'rendered', stopped: 'archived: review never answered' }]);
    const final = db.get(PACK_KEY('c1'));
    assert.equal(final.status, 'archived');
    assert.match(final.archivedReason, /no review decision within 72h \(review request not delivered \(chat not found\)\)/);
  });

  it('stays (does not archive) a pack still under the 72h limit, and requeues it about REVIEW_POLL_MS (20 min) out', async () => {
    const requestedAt = new Date(Date.now() - 5 * 60_000).toISOString(); // 5 minutes ago
    const pack = {
      contentId: 'c1', status: 'rendered', attempts: {},
      social: { headline: 'H', hook: '' }, categoryId: 'breaking-news',
      renderedAt: requestedAt,
      renders: {},
      review: { sent: true, requestedAt },
    };
    const db = new Map([[PACK_KEY('c1'), pack]]);
    kv.get = async (key) => db.get(key) ?? null;
    kv.set = async (key, val) => { db.set(key, val); };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    const zaddCalls = [];
    kv.zadd = async (key, arg) => { zaddCalls.push(arg); };

    const result = await runTick();

    assert.deepEqual(result.results, [{ contentId: 'c1', status: 'rendered', waiting: 'waiting for a decision' }]);
    assert.equal(db.get(PACK_KEY('c1')).status, 'rendered'); // untouched, not dropped
    const requeueCall = zaddCalls.filter((a) => a.member === 'c1').pop();
    assert.ok(requeueCall);
    assert.equal(near(requeueCall.score, Date.now() + 20 * 60_000), true);
  });

  it('a successful review send also stays with delayMs ~REVIEW_POLL_MS (20 min), not the shorter default', async () => {
    const savedToken = process.env.TELEGRAM_BOT_TOKEN;
    const savedChat = process.env.TELEGRAM_CHAT_ID;
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    process.env.TELEGRAM_CHAT_ID = 'chat';
    const pack = {
      contentId: 'c1', status: 'rendered', attempts: {},
      social: { headline: 'H', hook: '' }, categoryId: 'breaking-news',
    };
    const db = new Map([[PACK_KEY('c1'), pack]]);
    kv.get = async (key) => db.get(key) ?? null;
    kv.set = async (key, val) => { db.set(key, val); };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    const zaddCalls = [];
    kv.zadd = async (key, arg) => { zaddCalls.push(arg); };
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ json: async () => ({ ok: true, result: { message_id: 99 } }) });

    let result;
    try {
      result = await runTick();
    } finally {
      globalThis.fetch = savedFetch;
      if (savedToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = savedToken;
      if (savedChat === undefined) delete process.env.TELEGRAM_CHAT_ID; else process.env.TELEGRAM_CHAT_ID = savedChat;
    }

    assert.deepEqual(result.results, [{ contentId: 'c1', status: 'rendered', waiting: 'sent for review' }]);
    assert.equal(db.get(PACK_KEY('c1')).review.sent, true);
    const requeueCall = zaddCalls.filter((a) => a.member === 'c1').pop();
    assert.ok(requeueCall);
    assert.equal(near(requeueCall.score, Date.now() + 20 * 60_000), true);
  });

  it('a failed review send keeps the shorter default delay (~60s), not the 20-minute review-poll interval', async () => {
    const savedToken = process.env.TELEGRAM_BOT_TOKEN;
    const savedChat = process.env.TELEGRAM_CHAT_ID;
    delete process.env.TELEGRAM_BOT_TOKEN; // unconfigured — requestReview fails without any network call
    delete process.env.TELEGRAM_CHAT_ID;
    const pack = {
      contentId: 'c1', status: 'rendered', attempts: {},
      social: { headline: 'H', hook: '' }, categoryId: 'breaking-news',
    };
    const db = new Map([[PACK_KEY('c1'), pack]]);
    kv.get = async (key) => db.get(key) ?? null;
    kv.set = async (key, val) => { db.set(key, val); };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    const zaddCalls = [];
    kv.zadd = async (key, arg) => { zaddCalls.push(arg); };

    let result;
    try {
      result = await runTick();
    } finally {
      if (savedToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = savedToken;
      if (savedChat === undefined) delete process.env.TELEGRAM_CHAT_ID; else process.env.TELEGRAM_CHAT_ID = savedChat;
    }

    assert.match(result.results[0].waiting, /review send failed/);
    assert.equal(db.get(PACK_KEY('c1')).review.sent, false);
    const requeueCall = zaddCalls.filter((a) => a.member === 'c1').pop();
    assert.ok(requeueCall);
    assert.equal(near(requeueCall.score, Date.now() + 60_000), true);
  });
});

// A decision can land on the DECISION_KEY at any point between stageSchedule's own
// `readDecision` (at the top of the function, before reviewState is even computed) and the
// moment `archive()` actually removes the pack from the queue — `archive()`'s own `savePack`
// call is used here to inject the race deterministically, since it is the step that happens
// immediately before the queue removal. Without the post-archive re-check, a decision landing
// in that window has its re-queue permanently erased: nothing else ever looks at an archived
// pack again.
describe('runTick — rendered stage: a decision landing between readDecision and archive() is not lost', () => {
  let savedGate, savedAuto;
  beforeEach(() => {
    savedGate = process.env.SOCIAL_REVIEW_GATE;
    savedAuto = process.env.SOCIAL_REVIEW_AUTO_MINUTES;
    process.env.SOCIAL_REVIEW_GATE = 'on';
    // Auto-approval disabled entirely: at 60 (minutes) a review 73 HOURS old would auto-release
    // long before the archive check is ever reached, which defeats the point of this test.
    process.env.SOCIAL_REVIEW_AUTO_MINUTES = '0';
  });
  afterEach(() => {
    if (savedGate === undefined) delete process.env.SOCIAL_REVIEW_GATE; else process.env.SOCIAL_REVIEW_GATE = savedGate;
    if (savedAuto === undefined) delete process.env.SOCIAL_REVIEW_AUTO_MINUTES; else process.env.SOCIAL_REVIEW_AUTO_MINUTES = savedAuto;
  });

  /** An unanswered, undecided review well past the 72h default archive window. */
  const overdue = () => {
    const requestedAt = new Date(Date.now() - 73 * 60 * 60_000).toISOString(); // just past 72h
    return {
      contentId: 'c1', status: 'rendered', attempts: {},
      social: { headline: 'H', hook: '' }, categoryId: 'breaking-news',
      renderedAt: requestedAt,
      renders: {},
      review: { sent: true, requestedAt },
    };
  };

  it('a decision that lands exactly while archive() is saving is still re-queued (zadd, score ~= now)', async () => {
    const db = new Map([[PACK_KEY('c1'), overdue()]]);
    kv.get = async (key) => db.get(key) ?? null;
    const zaddCalls = [];
    kv.zadd = async (key, arg) => { zaddCalls.push(arg); };
    kv.set = async (key, val) => {
      db.set(key, val);
      // Simulate the race: a decision is recorded elsewhere at the exact moment archive()'s
      // own savePack call lands — strictly AFTER stageSchedule's earlier readDecision (which
      // found nothing) and strictly BEFORE stageSchedule's post-archive re-check.
      if (key === PACK_KEY('c1') && val.status === 'archived' && !db.has(DECISION_KEY('c1'))) {
        db.set(DECISION_KEY('c1'), { decision: 'approved', by: 'alice', via: 'app', decidedAt: new Date().toISOString() });
      }
    };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;

    const result = await runTick();

    assert.deepEqual(result.results, [{ contentId: 'c1', status: 'rendered', stopped: 'archived: review never answered' }]);
    const final = db.get(PACK_KEY('c1'));
    assert.equal(final.status, 'archived'); // archived regardless — the race is resolved AFTER archive(), not by skipping it
    // Two zadds for c1: claim's own lease zadd, then the post-archive re-queue with a score
    // close to now (not the lease's future score).
    const c1Zadds = zaddCalls.filter((a) => a.member === 'c1');
    assert.equal(c1Zadds.length, 2);
    assert.equal(near(c1Zadds[1].score, Date.now()), true);
  });

  it('with no decision at all, the pack is archived and NOT re-queued', async () => {
    const db = new Map([[PACK_KEY('c1'), overdue()]]);
    kv.get = async (key) => db.get(key) ?? null;
    const zaddCalls = [];
    kv.zadd = async (key, arg) => { zaddCalls.push(arg); };
    kv.set = async (key, val) => { db.set(key, val); }; // no injected race — nothing ever decides it
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;

    const result = await runTick();

    assert.deepEqual(result.results, [{ contentId: 'c1', status: 'rendered', stopped: 'archived: review never answered' }]);
    assert.equal(db.get(PACK_KEY('c1')).status, 'archived');
    // Only claim's own lease zadd — no post-archive re-queue, because readDecision found nothing.
    const c1Zadds = zaddCalls.filter((a) => a.member === 'c1');
    assert.equal(c1Zadds.length, 1);
  });
});

// SOCIAL_REVIEW_ARCHIVE_HOURS is read once, at module load — like MAX_PACK_AGE_MS elsewhere in
// this file, so proving an override actually takes effect needs a cache-busting dynamic import
// (same technique as review.test.js's SOCIAL_REVIEW_AUTO_MINUTES=0 case).
describe('runTick — SOCIAL_REVIEW_ARCHIVE_HOURS override (module-load const)', () => {
  it('honours a shorter override: a pack under the 72h default but past a 1h override is archived', async () => {
    const savedGate = process.env.SOCIAL_REVIEW_GATE;
    const savedAuto = process.env.SOCIAL_REVIEW_AUTO_MINUTES;
    const savedMaxWait = process.env.SOCIAL_REVIEW_ARCHIVE_HOURS;
    process.env.SOCIAL_REVIEW_GATE = 'on';
    process.env.SOCIAL_REVIEW_AUTO_MINUTES = '600'; // long enough this pack never auto-approves in the test window
    process.env.SOCIAL_REVIEW_ARCHIVE_HOURS = '1';
    try {
      const mod = await import('./autopilot.js?social-review-archive-override');
      const requestedAt = new Date(Date.now() - 2 * 60 * 60_000).toISOString(); // 2h: past a 1h override, under the 72h default
      const pack = {
        contentId: 'c1', status: 'rendered', attempts: {},
        social: { headline: 'H', hook: '' }, categoryId: 'breaking-news',
        renderedAt: requestedAt,
        renders: {},
        review: { sent: true, requestedAt },
      };
      const db = new Map([[PACK_KEY('c1'), pack]]);
      kv.get = async (key) => db.get(key) ?? null;
      kv.set = async (key, val) => { db.set(key, val); };
      kv.zrangebyscore = async () => ['c1'];
      kv.zrem = async () => 1;
      kv.zadd = async () => {};

      const result = await mod.runTick();

      assert.deepEqual(result.results, [{ contentId: 'c1', status: 'rendered', stopped: 'archived: review never answered' }]);
      assert.equal(db.get(PACK_KEY('c1')).status, 'archived');
      assert.match(db.get(PACK_KEY('c1')).archivedReason, /no review decision within 1h/);
    } finally {
      if (savedGate === undefined) delete process.env.SOCIAL_REVIEW_GATE; else process.env.SOCIAL_REVIEW_GATE = savedGate;
      if (savedAuto === undefined) delete process.env.SOCIAL_REVIEW_AUTO_MINUTES; else process.env.SOCIAL_REVIEW_AUTO_MINUTES = savedAuto;
      if (savedMaxWait === undefined) delete process.env.SOCIAL_REVIEW_ARCHIVE_HOURS; else process.env.SOCIAL_REVIEW_ARCHIVE_HOURS = savedMaxWait;
    }
  });
});

// ── slotted stage (confirm posts) ───────────────────────────────────────────────────────────
// stageConfirmPosts calls getPost from ../platforms/zernio.js without an injectable fetchFn, so
// (same pattern as above) it is driven through a stubbed globalThis.fetch.
describe('runTick — slotted stage (confirm posts)', () => {
  let savedKey;
  beforeEach(() => { savedKey = process.env.ZERNIO_API_KEY; process.env.ZERNIO_API_KEY = 'test-zernio-key'; });
  afterEach(() => { if (savedKey === undefined) delete process.env.ZERNIO_API_KEY; else process.env.ZERNIO_API_KEY = savedKey; });

  it('advances to done once every scheduled post is confirmed published', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const pack = {
      contentId: 'c1', status: 'slotted', attempts: {},
      posts: [{ format: 'tiktok', platform: 'tiktok', at: past, zernioPostId: 'zp1', status: 'scheduled' }],
    };
    const db = new Map([[PACK_KEY('c1'), pack]]);
    kv.get = async (key) => db.get(key) ?? null;
    kv.set = async (key, val) => { db.set(key, val); };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.zadd = async () => {};
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ post: { status: 'published', platforms: [{ platform: 'tiktok', status: 'posted', platformPostId: 'zp1' }] } }),
    });
    let result;
    try {
      result = await runTick();
    } finally {
      globalThis.fetch = savedFetch;
    }
    assert.deepEqual(result.results, [{ contentId: 'c1', from: 'slotted', to: 'done' }]);
    assert.equal(db.get(PACK_KEY('c1')).posts[0].status, 'published');
    assert.equal(typeof db.get(PACK_KEY('c1')).postedAt, 'string');
  });

  it('treats a per-platform "published" status as published even when the overall post status is a vaguer summary word', async () => {
    // Zernio's overall status wording varies ('completed', 'partial', 'posted'); any of those
    // read as "still scheduled" unless the per-platform entry is checked as its own authority.
    const past = new Date(Date.now() - 60_000).toISOString();
    const pack = {
      contentId: 'c1', status: 'slotted', attempts: {},
      posts: [{ format: 'reel', platform: 'instagram', at: past, zernioPostId: 'zp2', status: 'scheduled' }],
    };
    const db = new Map([[PACK_KEY('c1'), pack]]);
    kv.get = async (key) => db.get(key) ?? null;
    kv.set = async (key, val) => { db.set(key, val); };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.zadd = async () => {};
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        post: {
          status: 'completed', // not the literal string 'published'
          platforms: [{ platform: 'instagram', status: 'published', platformPostId: 'zp2', url: 'https://instagram.com/p/xyz' }],
        },
      }),
    });
    let result;
    try {
      result = await runTick();
    } finally {
      globalThis.fetch = savedFetch;
    }
    assert.deepEqual(result.results, [{ contentId: 'c1', from: 'slotted', to: 'done' }]);
    assert.equal(db.get(PACK_KEY('c1')).posts[0].status, 'published');
    assert.equal(db.get(PACK_KEY('c1')).posts[0].url, 'https://instagram.com/p/xyz');
  });

  it('marks a post failed once SOCIAL_POST_CONFIRM_MAX_HOURS (6h default) have passed since its slot with no confirmation', async () => {
    const longAgo = new Date(Date.now() - 7 * 60 * 60_000).toISOString(); // just past the 6h default
    const pack = {
      contentId: 'c1', status: 'slotted', attempts: {},
      posts: [{ format: 'story', platform: 'instagram', at: longAgo, zernioPostId: 'zp3', status: 'scheduled' }],
    };
    const db = new Map([[PACK_KEY('c1'), pack]]);
    kv.get = async (key) => db.get(key) ?? null;
    kv.set = async (key, val) => { db.set(key, val); };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.zadd = async () => {};
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ post: { status: 'scheduled', platforms: [{ platform: 'instagram', status: 'scheduled', platformPostId: 'zp3' }] } }),
    });

    const result = await runTick();
    // The post itself is written back as failed straight away...
    assert.equal(db.get(PACK_KEY('c1')).posts[0].status, 'failed');
    assert.equal(db.get(PACK_KEY('c1')).posts[0].error, 'never confirmed');
    // ...but this same tick still reports "stay": a post this code just marked failed is not
    // (also) counted in Zernio's own `failed` list, so it falls into the "still pending" branch
    // and the pack itself is not failed until the NEXT tick sees the post already marked
    // failed and reports it without re-polling. Worth knowing, not something this test tries
    // to fix.
    assert.equal(result.results[0].waiting, '1 post(s) not yet published');

    globalThis.fetch = async () => { throw new Error('the already-failed post must not be re-polled'); };
    let result2;
    try {
      result2 = await runTick();
    } finally {
      globalThis.fetch = savedFetch;
    }
    assert.match(result2.results[0].error, /story: never confirmed/);
  });
});

// ── archived stage: only a decision moves a parked pack, in either direction ───────────────
// An archived pack is out of the queue; `decide()` is what re-queues it (zadd — see
// review.test.js). This runner (`stageArchived`) is what the NEXT tick does once it is back on
// the queue: restore on approval, drop on rejection, or take it back off the queue again if
// nothing decided it (it was re-queued by something else and stays archived either way).
describe('runTick — archived stage (stageArchived)', () => {
  it('restores an approved archived pack to `rendered` with a fresh restoredAt, requeued at once (delayMs 0)', async () => {
    const pack = {
      contentId: 'c1', status: 'archived', attempts: {},
      social: { headline: 'H', hook: '' }, categoryId: 'breaking-news',
      archivedAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
      archivedReason: 'no review decision within 72h (waiting for a decision)',
      renders: { videos: { reel: { url: 'https://cdn.example/reel.mp4' } } },
    };
    const decision = { decision: 'approved', by: 'alice', via: 'app', decidedAt: new Date().toISOString() };
    const db = new Map([[PACK_KEY('c1'), pack], [DECISION_KEY('c1'), decision]]);
    kv.get = async (key) => db.get(key) ?? null;
    kv.set = async (key, val) => { db.set(key, val); };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    const zaddCalls = [];
    kv.zadd = async (key, arg) => { zaddCalls.push(arg); };

    const before = Date.now();
    const result = await runTick();

    assert.deepEqual(result.results, [{
      contentId: 'c1', status: 'archived', waiting: 'restored from the archive (approved by alice)',
    }]);
    const final = db.get(PACK_KEY('c1'));
    assert.equal(final.status, 'rendered');
    assert.equal(typeof final.restoredAt, 'string');
    assert.equal(near(Date.parse(final.restoredAt), before), true);
    // Requeued at once (delayMs 0), not the usual poll delay — the last zadd for this pack.
    const requeueCall = zaddCalls.filter((a) => a.member === 'c1').pop();
    assert.ok(requeueCall);
    assert.equal(near(requeueCall.score, before), true);
    // Nothing else about the pack is touched — everything paid for stays exactly as it was.
    assert.deepEqual(final.renders, { videos: { reel: { url: 'https://cdn.example/reel.mp4' } } });
  });

  it('drops a rejected archived pack, naming the archive explicitly', async () => {
    const pack = {
      contentId: 'c1', status: 'archived', attempts: {},
      social: { headline: 'H', hook: '' }, categoryId: 'breaking-news',
      archivedAt: new Date().toISOString(), archivedReason: 'no review decision within 72h',
    };
    const decision = { decision: 'rejected', by: 'bob', via: 'telegram', decidedAt: new Date().toISOString() };
    const db = new Map([[PACK_KEY('c1'), pack], [DECISION_KEY('c1'), decision]]);
    kv.get = async (key) => db.get(key) ?? null;
    kv.set = async (key, val) => { db.set(key, val); };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.zadd = async () => {};

    const result = await runTick();

    assert.deepEqual(result.results, [{ contentId: 'c1', status: 'archived', stopped: 'rejected by bob' }]);
    const final = db.get(PACK_KEY('c1'));
    assert.equal(final.status, 'dropped');
    assert.match(final.error.message, /review: rejected by bob \(from the archive\)/);
  });

  it('an archived pack found back on the queue with no decision is removed from it again and stays archived', async () => {
    const pack = {
      contentId: 'c1', status: 'archived', attempts: {},
      social: { headline: 'H', hook: '' }, categoryId: 'breaking-news',
      archivedAt: new Date().toISOString(), archivedReason: 'no review decision within 72h',
    };
    const db = new Map([[PACK_KEY('c1'), pack]]); // no decision key at all
    kv.get = async (key) => db.get(key) ?? null;
    kv.set = async (key, val) => { db.set(key, val); };
    kv.zrangebyscore = async () => ['c1'];
    const zremCalls = [];
    kv.zrem = async (key, member) => { zremCalls.push({ key, member }); return 1; };
    kv.zadd = async () => {};

    const result = await runTick();

    assert.deepEqual(result.results, [{ contentId: 'c1', status: 'archived', stopped: 'archived, no decision' }]);
    assert.equal(db.get(PACK_KEY('c1')).status, 'archived'); // untouched
    // Removed from the queue TWICE: once by claim() to take it for this tick, once by
    // stageArchived itself, since nothing decided it and it must not stay on the queue.
    assert.equal(zremCalls.filter((c) => c.key === QUEUE_KEY && c.member === 'c1').length, 2);
  });
});

// The unslotted deadline (UNSLOTTED_MAX_MS, 72h default) used to be measured only from
// `renderedAt`. A pack restored from the archive can have a `renderedAt` from days ago — that
// is not evidence it has been waiting for a SLOT that long, only that it was rendered that
// long ago — so the deadline now prefers `restoredAt` when present.
describe('runTick — rendered stage: the no-slot deadline counts from restoredAt when present', () => {
  it('does not drop a pack restored from the archive, even though its original renderedAt is long past the 72h unslotted deadline', async () => {
    const restoredAt = new Date(Date.now() - 60_000).toISOString(); // 1 minute ago — fresh
    const ancientRenderedAt = new Date(Date.now() - 200 * 60 * 60_000).toISOString(); // 200h ago
    const pack = {
      contentId: 'c1', status: 'rendered', attempts: {},
      social: { headline: 'H', hook: '' }, categoryId: 'breaking-news',
      renderedAt: ancientRenderedAt,
      restoredAt,
      renders: {}, // no assets — guarantees no slot is won, deterministically
      review: { sent: true, decision: 'approved', by: 'alice', requestedAt: ancientRenderedAt },
    };
    const db = new Map([[PACK_KEY('c1'), pack]]);
    kv.get = async (key) => db.get(key) ?? null;
    kv.set = async (key, val) => { db.set(key, val); };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.zadd = async () => {};

    const result = await runTick();

    assert.deepEqual(result.results, [{ contentId: 'c1', status: 'rendered', waiting: "no free slot in today's grid" }]);
    assert.equal(db.get(PACK_KEY('c1')).status, 'rendered'); // untouched, not dropped
  });

  it('DOES drop a restored pack once 72h have passed since restoredAt itself, even though renderedAt alone is recent', async () => {
    const restoredAt = new Date(Date.now() - 73 * 60 * 60_000).toISOString(); // just past 72h since restore
    const freshRenderedAt = new Date(Date.now() - 60_000).toISOString(); // 1 minute ago — would not be stale alone
    const pack = {
      contentId: 'c1', status: 'rendered', attempts: {},
      social: { headline: 'H', hook: '' }, categoryId: 'breaking-news',
      renderedAt: freshRenderedAt,
      restoredAt,
      renders: {},
      review: { sent: true, decision: 'approved', by: 'alice', requestedAt: freshRenderedAt },
    };
    const db = new Map([[PACK_KEY('c1'), pack]]);
    kv.get = async (key) => db.get(key) ?? null;
    kv.set = async (key, val) => { db.set(key, val); };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.zadd = async () => {};

    const result = await runTick();

    assert.deepEqual(result.results, [{ contentId: 'c1', status: 'rendered', stopped: 'gave up waiting for a slot' }]);
    const final = db.get(PACK_KEY('c1'));
    assert.equal(final.status, 'dropped');
    assert.match(final.error.message, /never won a slot within 72h/);
  });
});

describe('handler — cron tick (no action)', () => {
  it('GET runs a tick and returns its shape', async () => {
    kv.zrangebyscore = async () => [];
    const res = mkRes();
    await handler({ method: 'GET' }, res, null);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.processed, 0);
    assert.deepEqual(res.body.results, []);
    assert.equal(typeof res.body.ranAt, 'string');
    assert.equal(Number.isNaN(Date.parse(res.body.ranAt)), false);
  });

  it('rejects a method other than GET/POST with 405 before touching kv', async () => {
    kv.zrangebyscore = throwKv;
    kv.get = throwKv;
    const res = mkRes();
    await handler({ method: 'DELETE' }, res, null);
    assert.equal(res.statusCode, 405);
  });
});

describe('handler — GET packs', () => {
  it('returns the board shape for the UI (via batched mget, not per-id get)', async () => {
    kv.lrange = async (key) => (key === INDEX_KEY ? ['c1', 'c2'] : []);
    kv.get = throwKv; // listPacks must go through mgetBatched now, never a per-id kv.get
    kv.mget = async (...keys) => {
      const byKey = {
        [PACK_KEY('c1')]: {
          contentId: 'c1', title: null, categoryId: 'diplomatic-analysis', status: 'scripted',
          social: { hook: 'A hook', headline: 'A headline', sensitive: true }, voiceName: null,
          error: null, updatedAt: '2026-09-23T00:00:00.000Z',
        },
        [PACK_KEY('c2')]: {
          contentId: 'c2', title: 'Plain title', categoryId: 'breaking-news', status: 'failed',
          error: { stage: 'scripted', message: 'boom' }, updatedAt: '2026-09-23T01:00:00.000Z',
          // The board needs the review state and the scheduled posts; it must NOT receive
          // the script, the audio map or the render handles, which are large and private.
          review: { requestedAt: '2026-09-23T00:30:00.000Z', decision: 'approved', by: 'cliff', extra: 'dropped' },
          posts: [{ format: 'reel', at: '2026-09-23T17:00:00.000Z', status: 'published', url: 'https://x/1', zernioPostId: 'zp_1' }],
          audio: { hook: 'https://blob/hook.mp3' },
          renders: {
            handles: { reel: { sandboxId: 'sb' } },
            videos: { reel: { url: 'https://blob/reel.mp4', size: 4_000_000 }, tiktok: { url: 'https://blob/tt.mp4' } },
            // Deliberately out of order, and with a double-digit slide, to pin the numeric
            // sort — a carousel whose slides render 1, 10, 2 tells the story wrong.
            stills: {
              'slide-10': 'https://blob/s10.jpg',
              cover: 'https://blob/cover.jpg',
              'slide-2': 'https://blob/s2.jpg',
              cta: 'https://blob/cta.jpg',
              story: 'https://blob/story.jpg',
            },
          },
        },
      };
      return keys.map((k) => byKey[k] ?? null);
    };
    const res = mkRes();
    await handler({ method: 'GET', query: {} }, res, 'packs');
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.packs, [
      {
        contentId: 'c1', title: 'A headline', categoryId: 'diplomatic-analysis', status: 'scripted',
        hook: 'A hook', sensitive: true, voice: null, cost: null, error: null, updatedAt: '2026-09-23T00:00:00.000Z',
        review: null, posts: [], points: [],
        media: { reel: null, tiktok: null, cover: null, story: null, slides: [] },
      },
      {
        contentId: 'c2', title: 'Plain title', categoryId: 'breaking-news', status: 'failed',
        hook: null, sensitive: false, voice: null, cost: null, error: { stage: 'scripted', message: 'boom' },
        updatedAt: '2026-09-23T01:00:00.000Z',
        // Projected, not passed through: `extra` and `zernioPostId` are gone, and neither
        // `audio` nor `renders` appears at all.
        review: { requestedAt: '2026-09-23T00:30:00.000Z', decision: 'approved', by: 'cliff' },
        posts: [{ format: 'reel', at: '2026-09-23T17:00:00.000Z', status: 'published', url: 'https://x/1', error: null }],
        points: [],
        // The finished assets DO reach the browser — a reviewer has to watch the video
        // before approving it — while the sandbox handles beside them do not.
        media: {
          reel: 'https://blob/reel.mp4',
          tiktok: 'https://blob/tt.mp4',
          cover: 'https://blob/cover.jpg',
          story: 'https://blob/story.jpg',
          slides: ['https://blob/s2.jpg', 'https://blob/s10.jpg'], // numeric order, not lexical
        },
      },
    ]);
    // Stated separately because a deepEqual on a projection is easy to "fix" by pasting the
    // actual value in: these two must never reach the browser.
    assert.equal('audio' in res.body.packs[1], false);
    assert.equal('renders' in res.body.packs[1], false);
  });

  it('passes the pack cost record straight through to the board, USD by stage plus totalUsd', async () => {
    kv.lrange = async (key) => (key === INDEX_KEY ? ['c1'] : []);
    kv.get = throwKv;
    const cost = {
      script: { usd: 0.01, estimated: false },
      voice: { usd: 0.02, estimated: true },
      images: { usd: 0.03, estimated: true },
      render: { usd: 0.04, estimated: true },
      totalUsd: 0.1,
    };
    kv.mget = async (...keys) => keys.map((k) => (k === PACK_KEY('c1')
      ? { contentId: 'c1', title: 'T', categoryId: 'breaking-news', status: 'rendered', social: {}, cost, updatedAt: '2026-09-24T00:00:00.000Z' }
      : null));
    const res = mkRes();
    await handler({ method: 'GET', query: {} }, res, 'packs');
    assert.deepEqual(res.body.packs[0].cost, cost);
  });

  it('passes a numeric limit through to the underlying lrange call', async () => {
    let seenArgs;
    kv.lrange = async (key, start, stop) => { seenArgs = [key, start, stop]; return []; };
    kv.get = async () => null;
    const res = mkRes();
    await handler({ method: 'GET', query: { limit: '1' } }, res, 'packs');
    assert.deepEqual(seenArgs, [INDEX_KEY, 0, 0]);
  });

  it('shows a decision that exists ONLY in the decision key, merged onto a pack record with no review field at all', async () => {
    kv.lrange = async (key) => (key === INDEX_KEY ? ['c1'] : []);
    kv.get = throwKv;
    kv.mget = async (...keys) => keys.map((k) => {
      if (k === PACK_KEY('c1')) {
        return {
          contentId: 'c1', title: 'T', categoryId: 'breaking-news', status: 'rendered',
          social: {}, updatedAt: '2026-09-23T00:00:00.000Z',
          // No `review` field on the pack record itself — this is exactly the shape `decide()`
          // now leaves behind: the decision lives only in the separate decision key.
        };
      }
      if (k === DECISION_KEY('c1')) {
        return { decision: 'approved', by: 'alice@merlows.com', decidedAt: '2026-09-23T00:05:00.000Z' };
      }
      return null;
    });
    const res = mkRes();
    await handler({ method: 'GET', query: {} }, res, 'packs');
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.packs[0].review, {
      requestedAt: null, decision: 'approved', by: 'alice@merlows.com',
    });
  });
});

describe('handler — GET/POST auto-approve', () => {
  afterEach(async () => {
    // review.js's `boardMinutes` is module-level state; clear it so a later env-based test in
    // this same file (e.g. the SOCIAL_REVIEW_AUTO_MINUTES='600' case) is not left reading a
    // board value this describe block set.
    const { loadAutoApprove: reload } = await import('../pack/review.js');
    await reload({ get: async () => null });
  });

  it('GET returns the current setting, sourced from the board when one is stored', async () => {
    kv.get = async (key) => (key === AUTO_APPROVE_KEY ? { minutes: 45, updatedAt: '2026-09-24T00:00:00.000Z' } : null);
    const res = mkRes();
    await handler({ method: 'GET' }, res, 'auto-approve');
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { enabled: true, minutes: 45, source: 'board', holdSensitive: false });
  });

  it('GET falls back to the env var when no board value has ever been stored', async () => {
    const saved = process.env.SOCIAL_REVIEW_AUTO_MINUTES;
    process.env.SOCIAL_REVIEW_AUTO_MINUTES = '90';
    try {
      kv.get = async () => null;
      const res = mkRes();
      await handler({ method: 'GET' }, res, 'auto-approve');
      assert.deepEqual(res.body, { enabled: true, minutes: 90, source: 'env', holdSensitive: false });
    } finally {
      if (saved === undefined) delete process.env.SOCIAL_REVIEW_AUTO_MINUTES; else process.env.SOCIAL_REVIEW_AUTO_MINUTES = saved;
    }
  });

  it('POST {enabled:true, minutes:60} stores the setting via kv.set and echoes it back', async () => {
    const db = new Map();
    kv.get = async (key) => db.get(key) ?? null;
    let setCall = null;
    kv.set = async (key, val) => { setCall = { key, val }; db.set(key, val); };
    const res = mkRes();
    await handler({ method: 'POST', body: { enabled: true, minutes: 60 } }, res, 'auto-approve');
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { enabled: true, minutes: 60, source: 'board', holdSensitive: false });
    assert.equal(setCall.key, AUTO_APPROVE_KEY);
    assert.equal(setCall.val.minutes, 60);
  });

  it('POST {enabled:false} stores 0 minutes — off, whatever the env var says', async () => {
    const db = new Map();
    kv.get = async (key) => db.get(key) ?? null;
    let setCall = null;
    kv.set = async (key, val) => { setCall = { key, val }; db.set(key, val); };
    const res = mkRes();
    await handler({ method: 'POST', body: { enabled: false } }, res, 'auto-approve');
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { enabled: false, minutes: 0, source: 'board', holdSensitive: false });
    assert.equal(setCall.val.minutes, 0);
  });

  it('GET reports holdSensitive true when SOCIAL_REVIEW_HOLD_SENSITIVE=on', async () => {
    process.env.SOCIAL_REVIEW_HOLD_SENSITIVE = 'on';
    kv.get = async (key) => (key === AUTO_APPROVE_KEY ? { minutes: 45, updatedAt: '2026-09-24T00:00:00.000Z' } : null);
    const res = mkRes();
    await handler({ method: 'GET' }, res, 'auto-approve');
    assert.equal(res.body.holdSensitive, true);
  });

  it('POST echoes holdSensitive true when SOCIAL_REVIEW_HOLD_SENSITIVE=on', async () => {
    process.env.SOCIAL_REVIEW_HOLD_SENSITIVE = 'on';
    const db = new Map();
    kv.get = async (key) => db.get(key) ?? null;
    kv.set = async (key, val) => { db.set(key, val); };
    const res = mkRes();
    await handler({ method: 'POST', body: { enabled: true, minutes: 60 } }, res, 'auto-approve');
    assert.deepEqual(res.body, { enabled: true, minutes: 60, source: 'board', holdSensitive: true });
  });

  it('POST enabling with no minutes given falls back to the default (120)', async () => {
    const db = new Map();
    kv.get = async (key) => db.get(key) ?? null;
    kv.set = async (key, val) => { db.set(key, val); };
    const res = mkRes();
    await handler({ method: 'POST', body: { enabled: true } }, res, 'auto-approve');
    assert.equal(res.body.minutes, 120);
  });

  it('POST with an out-of-range minutes value returns 400 and writes nothing', async () => {
    kv.get = async () => null;
    kv.set = throwKv;
    const res = mkRes();
    await handler({ method: 'POST', body: { enabled: true, minutes: 999999 } }, res, 'auto-approve');
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /minutes must be a whole number/);
  });

  it('POST with a non-boolean `enabled` returns 400', async () => {
    kv.get = async () => null;
    kv.set = throwKv;
    const res = mkRes();
    await handler({ method: 'POST', body: { enabled: 'yes', minutes: 30 } }, res, 'auto-approve');
    assert.equal(res.statusCode, 400);
  });

  it('rejects a method other than GET/POST with 405', async () => {
    kv.get = throwKv;
    kv.set = throwKv;
    const res = mkRes();
    await handler({ method: 'DELETE', body: {} }, res, 'auto-approve');
    assert.equal(res.statusCode, 405);
  });
});

describe('runTick — reads the board auto-approve switch before working any pack', () => {
  it('calls loadAutoApprove (reads AUTO_APPROVE_KEY) on every tick, even an empty one', async () => {
    const keysSeen = [];
    kv.get = async (key) => { keysSeen.push(key); return null; };
    kv.zrangebyscore = async () => [];
    await runTick();
    assert.equal(keysSeen.includes(AUTO_APPROVE_KEY), true);
  });

  it('a paused tick returns before ever reading the auto-approve switch', async () => {
    const keysSeen = [];
    kv.get = async (key) => { keysSeen.push(key); return key === 'social:autopilot:paused' ? true : null; };
    await runTick();
    assert.equal(keysSeen.includes(AUTO_APPROVE_KEY), false);
  });
});

describe('handler — POST retry', () => {
  it('returns 404 for an unknown pack id', async () => {
    kv.get = async () => null;
    const res = mkRes();
    await handler({ method: 'POST', body: { contentId: 'nope' } }, res, 'retry');
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error, 'No such pack');
  });

  it('returns 404 when contentId is missing from the body', async () => {
    kv.get = throwKv;
    const res = mkRes();
    await handler({ method: 'POST', body: {} }, res, 'retry');
    assert.equal(res.statusCode, 404);
  });

  it('clears attempts/error and resumes at the stage that FAILED, not a restart at queued', async () => {
    // Restarting at 'queued' would pay for a fresh LLM call and replace an already-reviewed
    // script with a different one — resuming at the failed stage is what avoids that.
    const pack = { contentId: 'c1', status: 'failed', attempts: { scripted: 3 }, error: { stage: 'scripted', message: 'boom' } };
    kv.get = async (key) => (key === PACK_KEY('c1') ? pack : null);
    const zaddCalls = [];
    const setCalls = [];
    kv.zadd = async (key, arg) => { zaddCalls.push({ key, arg }); };
    kv.set = async (key, val) => { setCalls.push({ key, val }); };

    const res = mkRes();
    await handler({ method: 'POST', body: { contentId: 'c1' } }, res, 'retry');

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { contentId: 'c1', status: 'scripted', manualRetries: 1 });
    assert.equal(zaddCalls.length, 1);
    assert.equal(zaddCalls[0].arg.member, 'c1');
    assert.equal(setCalls.length, 1);
    assert.deepEqual(setCalls[0].val.attempts, {});
    assert.equal(setCalls[0].val.error, null);
    assert.equal(setCalls[0].val.status, 'scripted');
    assert.equal(setCalls[0].val.manualRetries, 1);
  });

  it('resumes at queued when the failed pack has no recorded error stage', async () => {
    const pack = { contentId: 'c1', status: 'failed', attempts: { queued: 3 }, error: null };
    kv.get = async (key) => (key === PACK_KEY('c1') ? pack : null);
    kv.zadd = async () => {};
    kv.set = async () => {};
    const res = mkRes();
    await handler({ method: 'POST', body: { contentId: 'c1' } }, res, 'retry');
    assert.equal(res.body.status, 'queued');
  });

  it('returns 409 when the pack is not failed — only a failed pack can be retried', async () => {
    const pack = { contentId: 'c1', status: 'scripted', attempts: {} };
    kv.get = async (key) => (key === PACK_KEY('c1') ? pack : null);
    kv.zadd = throwKv;
    kv.set = throwKv;
    const res = mkRes();
    await handler({ method: 'POST', body: { contentId: 'c1' } }, res, 'retry');
    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /Only a failed pack can be retried/);
    assert.match(res.body.error, /scripted/);
  });

  it('returns 409 while a worker still holds a live lease on the pack', async () => {
    const pack = { contentId: 'c1', status: 'failed', attempts: {}, leaseUntil: Date.now() + 60_000 };
    kv.get = async (key) => (key === PACK_KEY('c1') ? pack : null);
    kv.zadd = throwKv;
    kv.set = throwKv;
    const res = mkRes();
    await handler({ method: 'POST', body: { contentId: 'c1' } }, res, 'retry');
    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /worker is holding this pack/);
  });

  it('allows a retry once an expired lease is in the past', async () => {
    const pack = { contentId: 'c1', status: 'failed', attempts: {}, leaseUntil: Date.now() - 1000, error: { stage: 'voiced' } };
    kv.get = async (key) => (key === PACK_KEY('c1') ? pack : null);
    kv.zadd = async () => {};
    kv.set = async () => {};
    const res = mkRes();
    await handler({ method: 'POST', body: { contentId: 'c1' } }, res, 'retry');
    assert.equal(res.statusCode, 200);
  });

  it('returns 429 once manual retries exceed the cap, before touching kv further', async () => {
    const pack = { contentId: 'c1', status: 'failed', attempts: {}, manualRetries: 3, error: { stage: 'scripted' } };
    kv.get = async (key) => (key === PACK_KEY('c1') ? pack : null);
    kv.zadd = throwKv;
    kv.set = throwKv;
    const res = mkRes();
    await handler({ method: 'POST', body: { contentId: 'c1' } }, res, 'retry');
    assert.equal(res.statusCode, 429);
    assert.match(res.body.error, /Manual retry limit/);
  });
});

describe('handler — POST review', () => {
  // A real signed-in reviewer: the handler resolves `who` from the session, via
  // getCurrentUser → kv.get('users'), never from the request body.
  const REVIEWER = { id: 'u-rev', name: 'Reviewer', email: 'reviewer@merlows.com', appRole: 'admin' };
  async function reviewerCookie() {
    return `vance_session=${await signSession('u-rev')}`;
  }
  /** kv.get that answers 'users' for getCurrentUser and the pack key from `db`, nothing else. */
  function kvGetFor(db) {
    return async (key) => (key === 'users' ? [REVIEWER] : (db.get(key) ?? null));
  }

  it('approves a pack: 200, and records decision/by/decidedAt in the decision key', async () => {
    const pack = { contentId: 'c1', status: 'rendered' };
    const db = new Map([[PACK_KEY('c1'), pack]]);
    kv.get = kvGetFor(db);
    kv.set = upstashSet(db);

    const res = mkRes();
    await handler(
      { method: 'POST', body: { contentId: 'c1', decision: 'approved' }, headers: { cookie: await reviewerCookie() } },
      res,
      'review',
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { contentId: 'c1', decision: 'approved', by: 'reviewer@merlows.com' });
    const saved = { review: db.get(DECISION_KEY('c1')) };
    assert.equal(saved.review.decision, 'approved');
    assert.equal(saved.review.by, 'reviewer@merlows.com');
    assert.equal(typeof saved.review.decidedAt, 'string');
    assert.equal(Number.isNaN(Date.parse(saved.review.decidedAt)), false);
  });

  it('rejects a pack: 200, and records decision/by/decidedAt in the decision key', async () => {
    const pack = { contentId: 'c1', status: 'rendered' };
    const db = new Map([[PACK_KEY('c1'), pack]]);
    kv.get = kvGetFor(db);
    kv.set = upstashSet(db);

    const res = mkRes();
    await handler(
      { method: 'POST', body: { contentId: 'c1', decision: 'rejected' }, headers: { cookie: await reviewerCookie() } },
      res,
      'review',
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { contentId: 'c1', decision: 'rejected', by: 'reviewer@merlows.com' });
    const saved = { review: db.get(DECISION_KEY('c1')) };
    assert.equal(saved.review.decision, 'rejected');
    assert.equal(saved.review.by, 'reviewer@merlows.com');
    assert.equal(typeof saved.review.decidedAt, 'string');
    assert.equal(Number.isNaN(Date.parse(saved.review.decidedAt)), false);
  });

  it('rejects an uppercase decision value with 400, touching kv not at all', async () => {
    kv.get = throwKv;
    kv.set = throwKv;
    const res = mkRes();
    await handler({ method: 'POST', body: { contentId: 'c1', decision: 'APPROVED' } }, res, 'review');
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, "decision must be 'approved' or 'rejected'");
  });

  it('rejects an empty-string decision with 400, touching kv not at all', async () => {
    kv.get = throwKv;
    kv.set = throwKv;
    const res = mkRes();
    await handler({ method: 'POST', body: { contentId: 'c1', decision: '' } }, res, 'review');
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, "decision must be 'approved' or 'rejected'");
  });

  it('rejects a missing decision with 400, touching kv not at all', async () => {
    kv.get = throwKv;
    kv.set = throwKv;
    const res = mkRes();
    await handler({ method: 'POST', body: { contentId: 'c1' } }, res, 'review');
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, "decision must be 'approved' or 'rejected'");
  });

  it('rejects a non-string decision with 400, touching kv not at all', async () => {
    kv.get = throwKv;
    kv.set = throwKv;
    const res = mkRes();
    await handler({ method: 'POST', body: { contentId: 'c1', decision: 123 } }, res, 'review');
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, "decision must be 'approved' or 'rejected'");
  });

  it('rejects a missing contentId with 400, touching kv not at all', async () => {
    kv.get = throwKv;
    kv.set = throwKv;
    const res = mkRes();
    await handler({ method: 'POST', body: { decision: 'approved' } }, res, 'review');
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'contentId is required');
  });

  it('rejects an empty-string contentId with 400, touching kv not at all', async () => {
    kv.get = throwKv;
    kv.set = throwKv;
    const res = mkRes();
    await handler({ method: 'POST', body: { contentId: '', decision: 'approved' } }, res, 'review');
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'contentId is required');
  });

  it('rejects a non-string contentId with 400, touching kv not at all', async () => {
    kv.get = throwKv;
    kv.set = throwKv;
    const res = mkRes();
    await handler({ method: 'POST', body: { contentId: 42, decision: 'approved' } }, res, 'review');
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'contentId is required');
  });

  it('an unknown contentId is a 409 from decide(), not a crash and not a 200', async () => {
    const db = new Map(); // no pack at all
    kv.get = kvGetFor(db);
    kv.set = throwKv; // decide() must return before ever writing
    const res = mkRes();
    await handler(
      { method: 'POST', body: { contentId: 'no-such-id', decision: 'approved' }, headers: { cookie: await reviewerCookie() } },
      res,
      'review',
    );
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, 'no such pack');
  });

  it('a second decision on an already-decided pack is 409, and the FIRST decision is preserved unchanged', async () => {
    const firstDecision = { decision: 'approved', by: 'alice@merlows.com', decidedAt: '2026-09-20T00:00:00.000Z' };
    const pack = { contentId: 'c1', status: 'rendered', review: firstDecision };
    const db = new Map([[PACK_KEY('c1'), pack]]);
    kv.get = kvGetFor(db);
    kv.set = throwKv; // decide() must return before ever writing — two taps must not flip it

    const res = mkRes();
    await handler(
      { method: 'POST', body: { contentId: 'c1', decision: 'rejected' }, headers: { cookie: await reviewerCookie() } },
      res,
      'review',
    );

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, 'already approved');
    assert.deepEqual(db.get(PACK_KEY('c1')).review, firstDecision);
  });

  it('a pack whose status has moved past rendered is 409 — the posts are already scheduled and cannot be recalled', async () => {
    const pack = { contentId: 'c1', status: 'slotted' };
    const db = new Map([[PACK_KEY('c1'), pack]]);
    kv.get = kvGetFor(db);
    kv.set = throwKv;

    const res = mkRes();
    await handler(
      { method: 'POST', body: { contentId: 'c1', decision: 'approved' }, headers: { cookie: await reviewerCookie() } },
      res,
      'review',
    );

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, 'too late — pack is slotted');
    assert.equal(db.get(PACK_KEY('c1')).review, undefined); // untouched
  });

  it('records the approver from the session, not from a body that tries to set `by`', async () => {
    const pack = { contentId: 'c1', status: 'rendered' };
    const db = new Map([[PACK_KEY('c1'), pack]]);
    kv.get = kvGetFor(db);
    kv.set = upstashSet(db);

    const res = mkRes();
    await handler(
      {
        method: 'POST',
        body: { contentId: 'c1', decision: 'approved', by: 'attacker@evil.com' },
        headers: { cookie: await reviewerCookie() },
      },
      res,
      'review',
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.by, 'reviewer@merlows.com');
    assert.equal(db.get(DECISION_KEY('c1')).by, 'reviewer@merlows.com');
  });

  // closeReviewMessage is called unconditionally by the route, but it no-ops internally
  // without a chatId/messageId — these pin BOTH sides of that from the caller's end, since
  // closeReviewMessage uses the default `fetch` param (no injection point from here).
  describe('— closes the Telegram message only when we actually know its id', () => {
    let savedFetch, savedToken;
    beforeEach(() => { savedFetch = global.fetch; savedToken = process.env.TELEGRAM_BOT_TOKEN; process.env.TELEGRAM_BOT_TOKEN = 'tok'; });
    afterEach(() => { global.fetch = savedFetch; if (savedToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = savedToken; });

    it('calls Telegram with the pack\'s own chatId/messageId when they are known', async () => {
      const pack = { contentId: 'c1', status: 'rendered', review: { chatId: '555', messageId: 77, sent: true } };
      const db = new Map([[PACK_KEY('c1'), pack]]);
      kv.get = kvGetFor(db);
      kv.set = upstashSet(db);
      const calls = [];
      global.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => ({ ok: true }) }; };

      const res = mkRes();
      await handler(
        { method: 'POST', body: { contentId: 'c1', decision: 'approved' }, headers: { cookie: await reviewerCookie() } },
        res, 'review',
      );

      assert.equal(res.statusCode, 200);
      const edit = calls.find((c) => c.url.includes('editMessageReplyMarkup'));
      assert.ok(edit, 'editMessageReplyMarkup should have been called');
      assert.equal(JSON.parse(edit.opts.body).chat_id, '555');
      assert.equal(JSON.parse(edit.opts.body).message_id, 77);
      assert.ok(calls.find((c) => c.url.includes('sendMessage')), 'sendMessage should have been called');
    });

    it('makes no Telegram call at all when the pack has no chatId/messageId', async () => {
      const pack = { contentId: 'c1', status: 'rendered' }; // no review block at all
      const db = new Map([[PACK_KEY('c1'), pack]]);
      kv.get = kvGetFor(db);
      kv.set = upstashSet(db);
      const calls = [];
      global.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => ({ ok: true }) }; };

      const res = mkRes();
      await handler(
        { method: 'POST', body: { contentId: 'c1', decision: 'approved' }, headers: { cookie: await reviewerCookie() } },
        res, 'review',
      );

      assert.equal(res.statusCode, 200);
      assert.equal(calls.length, 0);
    });
  });
});

describe('handler — unknown action', () => {
  it('returns 404 Not found', async () => {
    const res = mkRes();
    await handler({ method: 'GET' }, res, 'bogus');
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error, 'Not found');
  });
});

// ── Master switch ────────────────────────────────────────────────────────────
// SOCIAL_AUTOPILOT=off must stop production dead: no queue read, no spend. It is the
// control someone reaches for when something is going out wrong, so it has to work
// without a deploy.
describe('SOCIAL_AUTOPILOT kill switch', () => {
  const previous = process.env.SOCIAL_AUTOPILOT;
  afterEach(() => {
    if (previous === undefined) delete process.env.SOCIAL_AUTOPILOT;
    else process.env.SOCIAL_AUTOPILOT = previous;
  });

  it('runs normally when unset', () => {
    delete process.env.SOCIAL_AUTOPILOT;
    assert.equal(isPaused(), false);
  });

  it('is paused when set to off, whatever the case', () => {
    process.env.SOCIAL_AUTOPILOT = 'OFF';
    assert.equal(isPaused(), true);
    process.env.SOCIAL_AUTOPILOT = 'off';
    assert.equal(isPaused(), true);
  });

  it('a paused tick does nothing at all — not even a queue read', async () => {
    process.env.SOCIAL_AUTOPILOT = 'off';
    let queueRead = false;
    kv.zrangebyscore = async () => {
      queueRead = true;
      return ['should-not-be-read'];
    };
    kv.zrem = throwKv;
    kv.get = throwKv;

    const result = await runTick();
    assert.equal(result.paused, true);
    assert.equal(result.processed, 0);
    assert.equal(queueRead, false, 'a paused tick must not touch the queue');
  });
});

// ── The switch that actually works in seconds ───────────────────────────────
// Vercel env vars only change at deploy time, so SOCIAL_AUTOPILOT alone is no use when
// something is going out wrong right now. The KV flag `social:autopilot:paused` is checked
// on every tick instead.
describe('isPausedNow — the KV stop button', () => {
  let savedEnv;
  beforeEach(() => { savedEnv = process.env.SOCIAL_AUTOPILOT; delete process.env.SOCIAL_AUTOPILOT; });
  afterEach(() => {
    if (savedEnv === undefined) delete process.env.SOCIAL_AUTOPILOT; else process.env.SOCIAL_AUTOPILOT = savedEnv;
  });

  it('is true when the KV flag is set', async () => {
    kv.get = async (key) => (key === 'social:autopilot:paused' ? true : null);
    assert.equal(await isPausedNow(), true);
  });

  it('is false when the KV flag is absent', async () => {
    kv.get = async () => null;
    assert.equal(await isPausedNow(), false);
  });

  it('a KV blip (thrown error) must not silently stop production — treated as not paused', async () => {
    kv.get = async () => { throw new Error('ECONNRESET'); };
    assert.equal(await isPausedNow(), false);
  });

  it('the env kill switch short-circuits before the KV flag is even read', async () => {
    process.env.SOCIAL_AUTOPILOT = 'off';
    kv.get = throwKv;
    assert.equal(await isPausedNow(), true);
  });

  it('runTick stops before touching the queue when the KV flag alone is set', async () => {
    kv.get = async (key) => (key === 'social:autopilot:paused' ? true : null);
    kv.zrangebyscore = throwKv;
    kv.zrem = throwKv;

    const result = await runTick();
    assert.deepEqual(result, { paused: true, processed: 0, results: [] });
  });
});

// ── takeUpload, and the plumbing that carries it ─────────────────────────────
// A TikTok post may upload the video at schedule time when the one made at render time has
// gone stale. That upload has to reach `pack.uploads`, or the next attempt at the same slot
// transfers the whole video again — the cost uploading early exists to remove.
describe('takeUpload', () => {
  it('moves the upload onto the uploads map and off the post record', () => {
    const uploads = {};
    const post = takeUpload({
      format: 'tiktok', platform: 'tiktok', at: 'T', zernioPostId: 'zp1', status: 'scheduled',
      upload: { 'https://cdn.example/t.mp4': { url: 'https://media.zernio.com/t.mp4', expiresAt: 1 } },
    }, uploads);

    assert.equal(post.upload, undefined, 'pack.posts is the published history — an expiring URL has no place in it');
    assert.deepEqual(post, { format: 'tiktok', platform: 'tiktok', at: 'T', zernioPostId: 'zp1', status: 'scheduled' });
    assert.equal(uploads['https://cdn.example/t.mp4'].url, 'https://media.zernio.com/t.mp4');
  });

  it('leaves a post with no upload untouched, and the map unchanged', () => {
    const uploads = { existing: { url: 'https://media.zernio.com/keep.mp4', expiresAt: 1 } };
    const post = takeUpload({ format: 'reel', platform: 'instagram', at: 'T', status: 'scheduled' }, uploads);
    assert.deepEqual(post, { format: 'reel', platform: 'instagram', at: 'T', status: 'scheduled' });
    assert.deepEqual(Object.keys(uploads), ['existing']);
  });

  it('merges alongside what is already stored rather than replacing it', () => {
    const uploads = { a: { url: 'https://media.zernio.com/a.mp4', expiresAt: 1 } };
    takeUpload({ format: 'tiktok', upload: { b: { url: 'https://media.zernio.com/b.mp4', expiresAt: 2 } } }, uploads);
    assert.deepEqual(Object.keys(uploads).sort(), ['a', 'b']);
  });
});

// A structural guard, because this is the part that rots silently: an upload collected in the
// loop is lost unless the patch that saves `posts` also saves `uploads`. Every exit from the
// scheduling loops carries both or neither — a future edit that adds a `posts` patch without
// `uploads` throws away a transfer that has already been paid for.
describe('stageSchedule — every patch that saves posts also saves uploads', () => {
  it('has no return or throw carrying posts without uploads', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('./autopilot.js', import.meta.url), 'utf8');
    const lines = src.split('\n');

    // Scope to stageSchedule alone. Other stages touch `posts` without ever uploading —
    // `stageConfirmPosts` reads back what already published — and requiring `uploads` of
    // them would be noise that trains someone to silence this test.
    const start = lines.findIndex((l) => /^async function stageSchedule\b/.test(l));
    assert.ok(start >= 0, 'stageSchedule was renamed — this guard needs updating, not deleting');
    const after = lines.findIndex((l, i) => i > start && /^(async )?function \w/.test(l));
    const end = after === -1 ? lines.length : after;

    const offenders = lines
      .slice(start, end)
      .map((line, i) => ({ line: line.trim(), n: start + i + 1 }))
      .filter(({ line }) => /(patch:\s*\{[^}]*\bposts\b|Object\.assign\(err,\s*\{[^}]*\bposts\b|return\s*\{\s*posts\b)/.test(line))
      .filter(({ line }) => !/\buploads\b/.test(line));

    assert.deepEqual(
      offenders.map((o) => `${o.n}: ${o.line}`),
      [],
      'these save posts but drop any upload made in the same pass',
    );

    // The other half of the same plumbing: a result that never goes through `takeUpload`
    // keeps its `upload` key on the post record and never reaches the uploads map, so the
    // transfer is paid for again on the next attempt AND an expiring URL is written into the
    // published history.
    const unwrapped = lines
      .slice(start, end)
      .map((line, i) => ({ line: line.trim(), n: start + i + 1 }))
      .filter(({ line }) => /\bawait schedulePost\(/.test(line))
      .filter(({ line }) => !/\btakeUpload\(/.test(line));

    assert.deepEqual(
      unwrapped.map((o) => `${o.n}: ${o.line}`),
      [],
      'every schedulePost result must go through takeUpload',
    );
  });
});

// ── a spent ceiling is a WAIT, not a failure ─────────────────────────────────
// Post-now now counts against the day's ceiling. When the ceiling is gone the pack must keep
// its approval and come back later: failing it would throw away a story a human had just
// approved, for the sake of a limit whose whole purpose is to delay it.
describe('runTick — post-now against a spent daily ceiling', () => {
  const spentDay = () => {
    const day = {};
    for (const [format, n] of [['tiktok', 2], ['reel', 3], ['carousel', 2], ['story', 2]]) {
      for (let i = 0; i < n; i += 1) day[`${format}@now-${i}`] = 'someone-else';
    }
    return day;
  };

  it('stays, posts nothing, and keeps the pack at rendered', async (t) => {
    const savedGate = process.env.SOCIAL_REVIEW_GATE;
    process.env.SOCIAL_REVIEW_GATE = 'off';
    try {
      const mod = await import('./autopilot.js?post-now-ceiling-spent');
      const pack = {
        contentId: 'c1', status: 'rendered', attempts: {},
        social: { headline: 'H', hook: '', igCaption: 'Watch this', hashtags: [] },
        categoryId: 'breaking-news',
        renders: { videos: { reel: { url: 'https://cdn.example/reel.mp4' } }, stills: { story: 'https://cdn.example/story.jpg' } },
        review: { postNow: true },
      };
      const db = new Map([[PACK_KEY('c1'), pack]]);
      // Today's grid record, already at its ceiling for every format.
      for (const d of [new Date().toISOString().slice(0, 10), new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)]) {
        db.set(SLOTS_KEY(d), spentDay());
      }
      kv.get = async (key) => db.get(key) ?? null;
      kv.set = async (key, val) => { db.set(key, val); };
      kv.zrangebyscore = async () => ['c1'];
      kv.zrem = async () => 1;
      kv.zadd = async () => {};

      const savedFetch = globalThis.fetch;
      globalThis.fetch = async (url) => { throw new Error(`must not post when the ceiling is spent: ${url}`); };
      let result;
      try {
        result = await mod.runTick();
      } finally {
        globalThis.fetch = savedFetch;
      }

      assert.equal(result.results.length, 1);
      assert.match(String(result.results[0].waiting ?? ''), /ceiling is spent/);
      assert.equal(db.get(PACK_KEY('c1')).status, 'rendered', 'the pack must keep its place, not fail');
    } finally {
      if (savedGate === undefined) delete process.env.SOCIAL_REVIEW_GATE; else process.env.SOCIAL_REVIEW_GATE = savedGate;
    }
  });
});

// ── a deferred format must be handed to the GRID, not abandoned ──────────────
// The trap these tests exist for: `postNow` lives in the DECISION record, which `decide()`
// writes once with SET NX and never edits, and `stageSchedule` spreads that record over
// `pack.review` on every tick. So clearing `review.postNow` in a patch is undone immediately,
// and the pack re-enters the post-now branch for ever — never reaching `claimSlots`.
//
// Every pack below therefore carries NO `review.postNow` of its own and gets it from a stubbed
// decision key, which is the only shape the real approve flow produces. An earlier version of
// these tests put `postNow` straight on the pack record, so they passed against a fix that
// could not work in production.
describe('runTick — post-now formats pushed past the ceiling', () => {
  const dayAt = (fmt, n, who) => [`${fmt}@now-${n}`, who];

  // Without these `schedulePost` refuses before reaching Zernio ("no Zernio instagram account
  // configured"), which looks identical to "nothing was scheduled".
  let savedKey, savedIg, savedGate;
  beforeEach(() => {
    savedKey = process.env.ZERNIO_API_KEY;
    savedIg = process.env.ZERNIO_INSTAGRAM_ACCOUNT_ID;
    savedGate = process.env.SOCIAL_REVIEW_GATE;
    process.env.ZERNIO_API_KEY = 'test-zernio-key';
    process.env.ZERNIO_INSTAGRAM_ACCOUNT_ID = 'ig-account-1';
    process.env.SOCIAL_REVIEW_GATE = 'off';
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.ZERNIO_API_KEY; else process.env.ZERNIO_API_KEY = savedKey;
    if (savedIg === undefined) delete process.env.ZERNIO_INSTAGRAM_ACCOUNT_ID; else process.env.ZERNIO_INSTAGRAM_ACCOUNT_ID = savedIg;
    if (savedGate === undefined) delete process.env.SOCIAL_REVIEW_GATE; else process.env.SOCIAL_REVIEW_GATE = savedGate;
  });

  const basePack = () => ({
    contentId: 'c1', status: 'rendered', attempts: {},
    social: { headline: 'H', hook: '', igCaption: 'x', hashtags: [] },
    categoryId: 'breaking-news',
    renderedAt: new Date().toISOString(),
    renders: { videos: { reel: { url: 'https://cdn.example/reel.mp4' } }, stills: { story: 'https://cdn.example/story.jpg' } },
    // NO review.postNow here on purpose — it comes from the decision record, as in production.
  });

  // The decision record exactly as `decide(..., { postNow: true })` writes it.
  const approvedPostNow = { decision: 'approved', by: 'clifton', via: 'app', decidedAt: new Date().toISOString(), postNow: true };

  const wire = (db) => {
    kv.get = async (key) => db.get(key) ?? null;
    kv.set = async (key, val) => { db.set(key, val); };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.zadd = async () => {};
    kv.del = async (key) => { db.delete(key); };
  };

  const seedDay = (db, spent) => {
    for (const d of [gridDate(Date.now()), gridDate(Date.now() + 86_400_000)]) db.set(SLOTS_KEY(d), spent);
  };

  it('reaches the grid on the next tick when the whole ceiling is spent, instead of waiting for midnight', async () => {
    const mod = await import('./autopilot.js?post-now-defer-all-decision');
    const db = new Map([[PACK_KEY('c1'), basePack()], [DECISION_KEY('c1'), approvedPostNow]]);
    seedDay(db, Object.fromEntries([
      ...[0, 1, 2].map((n) => dayAt('reel', n, 'other')),
      ...[0, 1].map((n) => dayAt('story', n, 'other')),
    ]));
    wire(db);

    const savedFetch = globalThis.fetch;
    globalThis.fetch = async (url) => { throw new Error(`must not post: ${url}`); };
    let first;
    let second;
    try {
      first = await mod.runTick();
      second = await mod.runTick(); // the tick that the decision-record overwrite used to ruin
    } finally {
      globalThis.fetch = savedFetch;
    }

    assert.match(String(first.results[0].waiting ?? ''), /handing this story to the grid/);
    assert.equal(db.get(PACK_KEY('c1')).postNowHandedToGrid, true, 'the hand-off must be recorded somewhere withDecision cannot overwrite');
    // The second tick must be on the GRID path. Its every slot is also spent, so the grid's own
    // "no free slot" answer is the proof it got there — the post-now branch never says that.
    assert.match(
      String(second.results[0].waiting ?? ''),
      /no free slot/,
      'the second tick re-entered post-now, so the decision record overwrote the hand-off',
    );
  });

  it('posts what fits, then reaches the grid for the rest rather than losing it', async () => {
    const mod = await import('./autopilot.js?post-now-defer-some-decision');
    const db = new Map([[PACK_KEY('c1'), basePack()], [DECISION_KEY('c1'), approvedPostNow]]);
    // Story is full; reel has room. Reel posts now, story must go to the grid.
    seedDay(db, Object.fromEntries([0, 1].map((n) => dayAt('story', n, 'other'))));
    wire(db);

    const sent = [];
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const s = String(url);
      if (s.startsWith('https://zernio.com/api/v1/posts')) {
        sent.push(JSON.parse(init.body).platforms[0].platform);
        return { ok: true, json: async () => ({ id: `z${sent.length}`, status: 'scheduled', platforms: [{ platform: 'instagram', status: 'scheduled' }] }) };
      }
      throw new Error(`unexpected call: ${s}`);
    };
    let second;
    try {
      await mod.runTick();
      second = await mod.runTick();
    } finally {
      globalThis.fetch = savedFetch;
    }

    const saved = db.get(PACK_KEY('c1'));
    assert.equal(saved.postNowHandedToGrid, true);
    assert.equal((saved.posts ?? []).some((p) => p.format === 'reel'), true, 'what fitted must have posted and been recorded');
    // On the grid path the deferred story gets a real grid time, not `now`.
    const storyPost = (saved.posts ?? []).find((p) => p.format === 'story');
    assert.ok(
      storyPost || /no free slot/.test(String(second.results[0].waiting ?? '')),
      'the deferred format neither posted nor reached the grid — it was abandoned',
    );
    if (storyPost) {
      assert.equal(storyPost.at.endsWith('Z'), true);
    }
  });
});
