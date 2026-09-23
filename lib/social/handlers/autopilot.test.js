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
import { signSession } from '../../auth.js';
import handler, { runTick, isPaused, isPausedNow, isStale } from './autopilot.js';

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

let saved;
beforeEach(() => {
  saved = {
    get: kv.get, set: kv.set, zadd: kv.zadd, zrem: kv.zrem,
    zrangebyscore: kv.zrangebyscore, lrange: kv.lrange, mget: kv.mget,
  };
});
afterEach(() => {
  kv.get = saved.get; kv.set = saved.set; kv.zadd = saved.zadd; kv.zrem = saved.zrem;
  kv.zrangebyscore = saved.zrangebyscore; kv.lrange = saved.lrange; kv.mget = saved.mget;
});

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
      polls++;
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

    assert.equal(polls, 2); // both handles were actually asked, despite being past the deadline
    assert.deepEqual(result.results, [{ contentId: 'c1', from: 'rendering', to: 'rendered' }]);
    const finalSave = setCalls[setCalls.length - 1];
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
  it('aborts scheduling and drops the pack when a Reject lands mid-tick, before anything is posted', async (t) => {
    // Frozen well before the day's grid closes, so claimSlots is guaranteed a future slot
    // regardless of the time of day this suite actually runs.
    t.mock.timers.enable({ apis: ['Date'] });
    const now = Date.parse('2026-06-15T05:00:00.000Z'); // 06:00 local (BST) — every slot today is still ahead
    t.mock.timers.setTime(now);

    const approvedPack = {
      contentId: 'c1', status: 'rendered', attempts: {},
      social: { headline: 'H', hook: '', tiktokCaption: 'Watch', hashtags: [] },
      categoryId: 'breaking-news',
      renderedAt: new Date(now).toISOString(),
      renders: { videos: { tiktok: { url: 'https://cdn.example/t.mp4' } } },
      // Already sent and approved, so the review-send branch is skipped and reviewState
      // releases it straight into claiming a slot.
      review: { sent: true, decision: 'approved', by: 'alice', requestedAt: new Date(now - 60_000).toISOString() },
    };
    const db = new Map([[PACK_KEY('c1'), approvedPack]]);
    let packReads = 0;
    kv.get = async (key) => {
      if (key === PACK_KEY('c1')) {
        packReads++;
        // claim()'s read (the 1st) sees the pack this tick was handed. stageSchedule's "fresh"
        // re-read right before posting (the 2nd) sees a rejection that landed on the record
        // while this tick was already in flight — the scenario the re-read exists to catch.
        if (packReads === 1) return db.get(key);
        return { ...db.get(key), review: { ...db.get(key).review, decision: 'rejected', by: 'bob' } };
      }
      return db.get(key) ?? null; // the slots-grid key, read/written by claimSlots
    };
    kv.set = async (key, val) => { db.set(key, val); };
    kv.zrangebyscore = async () => ['c1'];
    kv.zrem = async () => 1;
    kv.zadd = async () => {};

    const savedFetch = globalThis.fetch;
    globalThis.fetch = async (url) => { throw new Error(`must not reach Zernio — the mid-tick rejection must abort scheduling first (${url})`); };

    let result;
    try {
      result = await runTick();
    } finally {
      globalThis.fetch = savedFetch;
    }

    assert.deepEqual(result.results, [{ contentId: 'c1', status: 'rendered', stopped: 'rejected while scheduling' }]);
    const final = db.get(PACK_KEY('c1'));
    assert.equal(final.status, 'dropped');
    assert.match(final.error.message, /rejected by bob while scheduling/);
    assert.deepEqual(final.posts, []); // nothing was ever handed to Zernio
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
          renders: { handles: { reel: { sandboxId: 'sb' } } },
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
        hook: 'A hook', sensitive: true, voice: null, error: null, updatedAt: '2026-09-23T00:00:00.000Z',
        review: null, posts: [],
      },
      {
        contentId: 'c2', title: 'Plain title', categoryId: 'breaking-news', status: 'failed',
        hook: null, sensitive: false, voice: null, error: { stage: 'scripted', message: 'boom' },
        updatedAt: '2026-09-23T01:00:00.000Z',
        // Projected, not passed through: `extra` and `zernioPostId` are gone, and neither
        // `audio` nor `renders` appears at all.
        review: { requestedAt: '2026-09-23T00:30:00.000Z', decision: 'approved', by: 'cliff' },
        posts: [{ format: 'reel', at: '2026-09-23T17:00:00.000Z', status: 'published', url: 'https://x/1', error: null }],
      },
    ]);
    // Stated separately because a deepEqual on a projection is easy to "fix" by pasting the
    // actual value in: these two must never reach the browser.
    assert.equal('audio' in res.body.packs[1], false);
    assert.equal('renders' in res.body.packs[1], false);
  });

  it('passes a numeric limit through to the underlying lrange call', async () => {
    let seenArgs;
    kv.lrange = async (key, start, stop) => { seenArgs = [key, start, stop]; return []; };
    kv.get = async () => null;
    const res = mkRes();
    await handler({ method: 'GET', query: { limit: '1' } }, res, 'packs');
    assert.deepEqual(seenArgs, [INDEX_KEY, 0, 0]);
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

  it('approves a pack: 200, and persists review.decision/by/decidedAt', async () => {
    const pack = { contentId: 'c1', status: 'rendered' };
    const db = new Map([[PACK_KEY('c1'), pack]]);
    kv.get = kvGetFor(db);
    kv.set = async (key, val) => { db.set(key, val); };

    const res = mkRes();
    await handler(
      { method: 'POST', body: { contentId: 'c1', decision: 'approved' }, headers: { cookie: await reviewerCookie() } },
      res,
      'review',
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { contentId: 'c1', decision: 'approved', by: 'reviewer@merlows.com' });
    const saved = db.get(PACK_KEY('c1'));
    assert.equal(saved.review.decision, 'approved');
    assert.equal(saved.review.by, 'reviewer@merlows.com');
    assert.equal(typeof saved.review.decidedAt, 'string');
    assert.equal(Number.isNaN(Date.parse(saved.review.decidedAt)), false);
  });

  it('rejects a pack: 200, and persists review.decision/by/decidedAt', async () => {
    const pack = { contentId: 'c1', status: 'rendered' };
    const db = new Map([[PACK_KEY('c1'), pack]]);
    kv.get = kvGetFor(db);
    kv.set = async (key, val) => { db.set(key, val); };

    const res = mkRes();
    await handler(
      { method: 'POST', body: { contentId: 'c1', decision: 'rejected' }, headers: { cookie: await reviewerCookie() } },
      res,
      'review',
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { contentId: 'c1', decision: 'rejected', by: 'reviewer@merlows.com' });
    const saved = db.get(PACK_KEY('c1'));
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
    kv.set = async (key, val) => { db.set(key, val); };

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
    assert.equal(db.get(PACK_KEY('c1')).review.by, 'reviewer@merlows.com');
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
