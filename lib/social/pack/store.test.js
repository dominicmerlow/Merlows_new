// lib/social/pack/store.js — the social pack pipeline's work record.
// store.js imports { kv } straight from ../../kv.js (the shared singleton), the same way
// lib/social/handlers/social-router.test.js does — so each test monkey-patches the
// singleton's methods and every test restores them, so a real Upstash call never happens
// (that store is shared with another company's production data).
//
// Rewritten after the security/code review pass: `claim` is now a LEASE (re-adds the entry
// with a future score instead of deleting it, so a tick killed mid-stage self-heals rather
// than losing the pack after paying for the LLM/voice calls), `advance`/`fail` clear the
// lease and remove the queue entry on a terminal outcome, `hold` is new, and `listPacks`
// reads via a batched mget rather than one kv.get per id.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { kv } from '../../kv.js';
import {
  PACK_KEY, QUEUE_KEY, INDEX_KEY, MAX_STAGE_ATTEMPTS, LEASE_MS, LIST_MAX, clearLease,
  nextStage, enqueuePack, claim, advance, hold, fail, drop, archive, listPacks, savePack, getPack,
} from './store.js';

const throwKv = async () => { throw new Error('kv method should not have been called'); };
const near = (value, target, tolerance = 2000) => Math.abs(value - target) <= tolerance;

let saved;
beforeEach(() => {
  saved = {
    get: kv.get, set: kv.set, zadd: kv.zadd, zrem: kv.zrem,
    lpush: kv.lpush, ltrim: kv.ltrim, lrange: kv.lrange, mget: kv.mget,
  };
});
afterEach(() => {
  kv.get = saved.get; kv.set = saved.set; kv.zadd = saved.zadd; kv.zrem = saved.zrem;
  kv.lpush = saved.lpush; kv.ltrim = saved.ltrim; kv.lrange = saved.lrange; kv.mget = saved.mget;
});

describe('nextStage', () => {
  it('walks the pipeline in order', () => {
    assert.equal(nextStage('queued'), 'scripted');
    assert.equal(nextStage('scripted'), 'voiced');
  });

  it('ends at done from the last real stage', () => {
    assert.equal(nextStage('slotted'), 'done');
  });

  it('stays at done once already done', () => {
    assert.equal(nextStage('done'), 'done');
  });
});

describe('enqueuePack', () => {
  it('is idempotent: publishing the same article twice does not queue a second pack', async () => {
    const store = new Map();
    let zaddCalls = 0, lpushCalls = 0;
    kv.get = async (key) => store.get(key) ?? null;
    kv.set = async (key, val) => { store.set(key, val); };
    kv.zadd = async () => { zaddCalls += 1; };
    kv.lpush = async () => { lpushCalls += 1; };
    kv.ltrim = async () => {};

    const article = { contentId: 'art-1', wpPostId: 9, title: 'A story', categoryId: 'diplomatic-analysis' };
    const first = await enqueuePack(article);
    const second = await enqueuePack(article);

    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.pack.createdAt, first.pack.createdAt); // same record, not a new one
    // Only the first publish should ever touch the queue or the index.
    assert.equal(zaddCalls, 1);
    assert.equal(lpushCalls, 1);
  });
});

describe('claim — a lease, not a delete', () => {
  it('returns null when another tick already took the pack off the queue', async () => {
    kv.zrem = async () => 0; // nothing removed — someone else already claimed it
    kv.get = throwKv; // claim must not even look the pack up in that case
    const result = await claim('c1');
    assert.equal(result, null);
  });

  it('re-adds the entry with a future score and records leaseUntil on the record', async () => {
    const pack = { contentId: 'c1', status: 'queued' };
    const zaddCalls = [];
    kv.zrem = async () => 1;
    kv.zadd = async (key, arg) => { zaddCalls.push({ key, arg }); };
    kv.get = async (key) => (key === PACK_KEY('c1') ? pack : null);
    kv.set = async () => {};

    const before = Date.now();
    const result = await claim('c1');

    assert.equal(zaddCalls.length, 1);
    assert.equal(zaddCalls[0].key, QUEUE_KEY);
    assert.equal(zaddCalls[0].arg.member, 'c1');
    assert.equal(near(zaddCalls[0].arg.score, before + LEASE_MS), true); // still in the queue, future score
    assert.equal(near(result.leaseUntil, before + LEASE_MS), true);
  });

  it('drops the lease and returns null when the record is gone (removed between the zrem and the get)', async () => {
    let zremCalls = 0;
    kv.zrem = async () => { zremCalls += 1; return 1; };
    kv.zadd = async () => {};
    kv.get = async () => null; // record missing
    const result = await claim('c1');
    assert.equal(result, null);
    assert.equal(zremCalls, 2); // the initial removal, then dropping the phantom lease
  });

  it('a second claim landing in the same window returns null — the atomic zrem check still works', async () => {
    // A tiny in-memory sorted set: both calls race on the same `zrem`, exactly what protects
    // two overlapping cron ticks from paying twice for the same LLM/voice calls.
    const zset = new Map([['c1', 0]]);
    const records = new Map([['c1', { contentId: 'c1', status: 'queued' }]]);
    kv.zrem = async (key, member) => (zset.delete(member) ? 1 : 0);
    kv.zadd = async (key, { score, member }) => { zset.set(member, score); };
    kv.get = async (key) => (key === PACK_KEY('c1') ? records.get('c1') ?? null : null);
    kv.set = async (key, val) => { records.set('c1', val); };

    const results = await Promise.all([claim('c1'), claim('c1')]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(results.includes(null), true);
  });
});

describe('advance', () => {
  it('moves the pack to its next stage, merges the patch, clears the lease, and re-queues it', async () => {
    const setCalls = [];
    const zaddCalls = [];
    kv.set = async (key, val) => { setCalls.push({ key, val }); };
    kv.zadd = async (key, arg) => { zaddCalls.push({ key, arg }); };

    const pack = { contentId: 'c1', status: 'queued', attempts: {}, leaseUntil: Date.now() + 1000 };
    const updated = await advance(pack, { social: { hook: 'H' } });

    assert.equal(updated.status, 'scripted');
    assert.deepEqual(updated.social, { hook: 'H' });
    assert.equal(updated.error, null);
    assert.equal(updated.leaseUntil, null);
    assert.equal(typeof updated.updatedAt, 'string');
    assert.equal(setCalls.length, 1);
    assert.equal(setCalls[0].key, PACK_KEY('c1'));
    assert.equal(zaddCalls.length, 1);
    assert.equal(zaddCalls[0].key, QUEUE_KEY);
    assert.equal(zaddCalls[0].arg.member, 'c1');
  });

  it('removes the queue entry (rather than leaving a lease) once the pack reaches done', async () => {
    const zremCalls = [];
    kv.set = async () => {};
    kv.zadd = throwKv; // must not be re-queued
    kv.zrem = async (key, member) => { zremCalls.push({ key, member }); };

    const pack = { contentId: 'c1', status: 'slotted', attempts: {} };
    const updated = await advance(pack, {});

    assert.equal(updated.status, 'done');
    assert.equal(zremCalls.length, 1);
    assert.equal(zremCalls[0].key, QUEUE_KEY);
    assert.equal(zremCalls[0].member, 'c1');
  });
});

describe('leaseAttempts — the counter for claims that produce no outcome', () => {
  /** An in-memory stand-in, so a pack can be driven through many real claims. */
  const inMemory = () => {
    const store = new Map();
    const queue = new Map();
    kv.get = async (key) => store.get(key) ?? null;
    kv.set = async (key, val) => { store.set(key, val); };
    kv.zadd = async (_key, { score, member }) => { queue.set(member, score); };
    kv.zrem = async (_key, member) => (queue.delete(member) ? 1 : 0);
    return { store, queue };
  };

  it('is reset by any outcome, so a pack that keeps making progress is never killed by it', async () => {
    // As a LIFETIME counter this failed every pack on its third poll: four claims are spent
    // just reaching `rendering`, and a render that takes more than two minutes is the
    // normal case, not a crash.
    const { store, queue } = inMemory();
    store.set(PACK_KEY('c1'), { contentId: 'c1', status: 'queued', attempts: {} });
    queue.set('c1', Date.now());

    for (let i = 0; i < 4; i++) {
      const pack = await claim('c1');
      assert.ok(pack, `claim ${i} was refused`);
      await advance(pack, {});
    }
    assert.equal(store.get(PACK_KEY('c1')).status, 'rendering');

    // Far more polls than MAX_STAGE_ATTEMPTS * 2, each one a `stay`.
    for (let i = 0; i < 10; i++) {
      const pack = await claim('c1');
      assert.ok(pack, `poll ${i} was refused a claim`);
      assert.notEqual(pack.status, 'failed');
      await savePack({ ...pack, ...clearLease });
      queue.set('c1', Date.now());
    }

    const final = store.get(PACK_KEY('c1'));
    assert.equal(final.status, 'rendering');
    assert.ok(!final.error);
  });

  it('still fails a pack that is claimed repeatedly without ever reaching an outcome', async () => {
    // The case it exists for: a stage that kills the function never reaches `fail`, so
    // nothing else would ever stop the pack re-running — and paying — every lease period.
    const { store, queue } = inMemory();
    store.set(PACK_KEY('c1'), { contentId: 'c1', status: 'scripted', attempts: {} });
    queue.set('c1', Date.now());

    let claims = 0;
    for (let i = 0; i < MAX_STAGE_ATTEMPTS * 2 + 2; i++) {
      const pack = await claim('c1');
      if (!pack) break; // the counter tripped
      claims++;
      // No outcome recorded: the "function died mid-stage" case. The lease it left behind
      // expires on its own, which is what makes the pack due again.
      store.set(PACK_KEY('c1'), { ...store.get(PACK_KEY('c1')), leaseUntil: Date.now() - 1 });
      queue.set('c1', Date.now());
    }

    assert.equal(claims, MAX_STAGE_ATTEMPTS * 2);
    const final = store.get(PACK_KEY('c1'));
    assert.equal(final.status, 'failed');
    assert.match(final.error.message, /claimed repeatedly/);
  });
});

describe('hold', () => {
  it('saves heldUntil, clears the lease, and re-queues with the given delay — so the pack is recoverable', async () => {
    const setCalls = [];
    const zaddCalls = [];
    kv.set = async (key, val) => { setCalls.push(val); };
    kv.zadd = async (key, arg) => { zaddCalls.push({ key, arg }); };

    const pack = { contentId: 'c1', status: 'imaged', leaseUntil: Date.now() + 500 };
    const before = Date.now();
    const updated = await hold(pack, 5000);

    assert.equal(updated.leaseUntil, null);
    assert.equal(near(updated.heldUntil, before + 5000), true);
    assert.equal(setCalls.length, 1);
    // Still discoverable: re-queued with a finite future score, not dropped from the queue.
    assert.equal(zaddCalls.length, 1);
    assert.equal(zaddCalls[0].key, QUEUE_KEY);
    assert.equal(zaddCalls[0].arg.member, 'c1');
    assert.equal(near(zaddCalls[0].arg.score, before + 5000), true);
  });
});

describe('fail', () => {
  it('backs off, clears the lease, and stays non-terminal below the attempt cap', async () => {
    const zaddCalls = [];
    kv.set = async () => {};
    kv.zadd = async (key, arg) => { zaddCalls.push(arg); };

    const pack = { contentId: 'c1', status: 'scripted', attempts: {}, leaseUntil: Date.now() + 1000 };
    const { pack: updated, terminal } = await fail(pack, 'scripted', new Error('provider down'));

    assert.equal(terminal, false);
    assert.equal(updated.attempts.scripted, 1);
    assert.equal(updated.status, 'scripted'); // unchanged — not terminal yet
    assert.equal(updated.leaseUntil, null);
    assert.equal(updated.error.stage, 'scripted');
    assert.equal(updated.error.message, 'provider down');
    assert.equal(zaddCalls.length, 1);
    assert.equal(zaddCalls[0].score > Date.now(), true); // backed off into the future
  });

  it('truncates a long error message to 200 characters — provider bodies carry request ids', async () => {
    kv.set = async () => {};
    kv.zadd = async () => {};
    const pack = { contentId: 'c1', status: 'scripted', attempts: {} };
    const longMessage = 'upstream said: ' + 'x'.repeat(250) + ' request-id=abc123';
    const { pack: updated } = await fail(pack, 'scripted', new Error(longMessage));
    assert.equal(updated.error.message.length, 200);
    assert.equal(updated.error.message, longMessage.slice(0, 200));
  });

  it('goes terminal at MAX_STAGE_ATTEMPTS and removes the queue entry instead of leaving a lease', async () => {
    const zremCalls = [];
    kv.set = async () => {};
    kv.zadd = throwKv; // must not be called once terminal
    kv.zrem = async (key, member) => { zremCalls.push({ key, member }); };

    const pack = { contentId: 'c1', status: 'scripted', attempts: { scripted: MAX_STAGE_ATTEMPTS - 1 } };
    const { pack: updated, terminal } = await fail(pack, 'scripted', new Error('provider down'));

    assert.equal(terminal, true);
    assert.equal(updated.attempts.scripted, MAX_STAGE_ATTEMPTS);
    assert.equal(updated.status, 'failed');
    assert.equal(zremCalls.length, 1);
    assert.equal(zremCalls[0].member, 'c1');
  });
});

describe('drop — a terminal state that is deliberately not `failed`', () => {
  it('sets status to dropped (never failed), clears the lease, stamps droppedAt, and removes the queue entry', async () => {
    const setCalls = [];
    const zremCalls = [];
    kv.set = async (key, val) => { setCalls.push({ key, val }); };
    kv.zrem = async (key, member) => { zremCalls.push({ key, member }); };

    const pack = { contentId: 'c1', status: 'queued', leaseUntil: Date.now() + 1000, leaseAttempts: 2 };
    const before = Date.now();
    const updated = await drop(pack, 'older than 24h when work would have started');

    assert.equal(updated.status, 'dropped');
    assert.notEqual(updated.status, 'failed'); // /retry only offers a `failed` pack — this must never look like one
    assert.equal(updated.leaseUntil, null);
    assert.equal(updated.leaseAttempts, 0);
    assert.equal(typeof updated.droppedAt, 'string');
    assert.equal(near(Date.parse(updated.droppedAt), before), true);
    assert.equal(setCalls.length, 1);
    assert.equal(setCalls[0].key, PACK_KEY('c1'));
    assert.equal(zremCalls.length, 1);
    assert.equal(zremCalls[0].key, QUEUE_KEY);
    assert.equal(zremCalls[0].member, 'c1');
  });

  it('records the reason and the stage the pack was at when it was dropped', async () => {
    kv.set = async () => {};
    kv.zrem = async () => {};
    const pack = { contentId: 'c1', status: 'queued' };
    const updated = await drop(pack, 'older than 24h when work would have started');
    assert.equal(updated.error.stage, 'queued');
    assert.equal(updated.error.message, 'older than 24h when work would have started');
    assert.equal(typeof updated.error.at, 'string');
  });

  it('truncates a long reason to 200 characters, the same as fail() does for provider errors', async () => {
    kv.set = async () => {};
    kv.zrem = async () => {};
    const pack = { contentId: 'c1', status: 'queued' };
    const longReason = 'x'.repeat(250);
    const updated = await drop(pack, longReason);
    assert.equal(updated.error.message.length, 200);
    assert.equal(updated.error.message, longReason.slice(0, 200));
  });

  it('leaves the pack findable on the board (getPack still returns it) after being dropped', async () => {
    const store = new Map();
    kv.set = async (key, val) => { store.set(key, val); };
    kv.get = async (key) => store.get(key) ?? null;
    kv.zrem = async () => {};

    const pack = { contentId: 'c1', status: 'queued' };
    await drop(pack, 'stale');
    const found = await getPack('c1');

    assert.ok(found);
    assert.equal(found.status, 'dropped');
    assert.equal(found.error.message, 'stale');
  });
});

describe('archive — parked for a decision, not thrown away (unlike drop)', () => {
  it('sets status to archived, clears the lease, stamps archivedAt/archivedReason, and removes the queue entry', async () => {
    const setCalls = [];
    const zremCalls = [];
    kv.set = async (key, val) => { setCalls.push({ key, val }); };
    kv.zrem = async (key, member) => { zremCalls.push({ key, member }); };

    const pack = {
      contentId: 'c1', status: 'rendered', leaseUntil: Date.now() + 1000, leaseAttempts: 2,
      renders: { videos: { reel: { url: 'https://cdn.example/reel.mp4' } } },
    };
    const before = Date.now();
    const updated = await archive(pack, 'no review decision within 72h (waiting for a decision)');

    assert.equal(updated.status, 'archived');
    assert.notEqual(updated.status, 'dropped'); // a person may still act on it — it must not read as gone
    assert.equal(updated.leaseUntil, null);
    assert.equal(updated.leaseAttempts, 0);
    assert.equal(typeof updated.archivedAt, 'string');
    assert.equal(near(Date.parse(updated.archivedAt), before), true);
    assert.equal(updated.archivedReason, 'no review decision within 72h (waiting for a decision)');
    // Nothing else is touched — everything already paid for stays exactly as it was.
    assert.deepEqual(updated.renders, { videos: { reel: { url: 'https://cdn.example/reel.mp4' } } });
    assert.equal(setCalls.length, 1);
    assert.equal(setCalls[0].key, PACK_KEY('c1'));
    assert.equal(zremCalls.length, 1);
    assert.equal(zremCalls[0].key, QUEUE_KEY);
    assert.equal(zremCalls[0].member, 'c1');
  });

  it('truncates a long reason to 200 characters, the same as drop() and fail() do', async () => {
    kv.set = async () => {};
    kv.zrem = async () => {};
    const pack = { contentId: 'c1', status: 'rendered' };
    const longReason = 'x'.repeat(250);
    const updated = await archive(pack, longReason);
    assert.equal(updated.archivedReason.length, 200);
    assert.equal(updated.archivedReason, longReason.slice(0, 200));
  });

  it('leaves the pack findable on the board (getPack still returns it) after being archived', async () => {
    const store = new Map();
    kv.set = async (key, val) => { store.set(key, val); };
    kv.get = async (key) => store.get(key) ?? null;
    kv.zrem = async () => {};

    const pack = { contentId: 'c1', status: 'rendered' };
    await archive(pack, 'no review decision within 72h');
    const found = await getPack('c1');

    assert.ok(found);
    assert.equal(found.status, 'archived');
    assert.equal(found.archivedReason, 'no review decision within 72h');
  });
});

describe('listPacks', () => {
  it('reads records via a batched mget, never one kv.get per id', async () => {
    kv.lrange = async (key) => (key === INDEX_KEY ? ['c1', 'c2', 'c3'] : []);
    kv.get = throwKv; // the exact pattern that exhausted this function's sockets before
    kv.mget = async (...keys) => {
      const byKey = { [PACK_KEY('c1')]: { contentId: 'c1' }, [PACK_KEY('c2')]: { contentId: 'c2' } };
      return keys.map((k) => byKey[k] ?? null); // c3 is missing
    };
    const packs = await listPacks(50);
    assert.deepEqual(packs, [{ contentId: 'c1' }, { contentId: 'c2' }]); // missing record dropped
  });

  it('clamps the requested limit to LIST_MAX', async () => {
    let seenArgs;
    kv.lrange = async (key, start, stop) => { seenArgs = [key, start, stop]; return []; };
    await listPacks(9999);
    assert.deepEqual(seenArgs, [INDEX_KEY, 0, LIST_MAX - 1]);
  });

  it('returns [] without calling mget when the index is empty', async () => {
    kv.lrange = async () => [];
    kv.mget = throwKv;
    assert.deepEqual(await listPacks(50), []);
  });
});
