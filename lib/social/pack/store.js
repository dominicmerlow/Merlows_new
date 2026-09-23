// lib/social/pack/store.js
// The social autopilot's work record: one "pack" per published article, moved through the
// pipeline one stage per worker tick.
//
// Why a queue and a state machine rather than doing the work inline at publish time: each
// stage calls a different paid API, any of them can fail on its own, and a Vercel function
// has 300s. Storing progress means a retry resumes where it stopped instead of paying for
// the whole chain again — and a stuck story never blocks the day's other five.

import { kv, mgetBatched } from '../../kv.js';

/** Ordered pipeline. `done` and `failed` are terminal. */
export const STAGES = [
  'queued',     // article published, nothing done yet
  'scripted',   // social pack written by the LLM and fact-checked
  'voiced',     // British voice-over clips generated
  'imaged',     // 9:16 stills generated
  'rendering',  // cloud renders started; polled on later ticks
  'rendered',   // videos + carousel/story images finished and stored
  'slotted',    // scheduled into the posting grid (Phase 3)
  'done',
];

export const PACK_KEY = (contentId) => `social:pack:${contentId}`;
export const QUEUE_KEY = 'social:pack:queue';
export const INDEX_KEY = 'social:pack:index';

/** Stop retrying a stage after this many failures; the pack then needs a human. */
export const MAX_STAGE_ATTEMPTS = Number(process.env.SOCIAL_PACK_MAX_ATTEMPTS) || 3;
const INDEX_LIMIT = 500;

/**
 * The next stage, or `done` for anything that is not on the pipeline.
 *
 * The index guard is load-bearing: `STAGES.indexOf('dropped')` is -1, and `STAGES[-1 + 1]`
 * is `queued` — so without it a terminal pack that somehow reached `advance` would be sent
 * back to the START of the pipeline and pay for the whole chain again. The same hole applies
 * to `failed`.
 */
export const nextStage = (stage) => {
  const index = STAGES.indexOf(stage);
  return index < 0 ? 'done' : (STAGES[index + 1] ?? 'done');
};

export async function getPack(contentId) {
  return kv.get(PACK_KEY(contentId));
}

export async function savePack(pack) {
  const record = { ...pack, updatedAt: new Date().toISOString() };
  await kv.set(PACK_KEY(record.contentId), record);
  return record;
}

/**
 * Register a newly published article. Idempotent by design: publishing the same article
 * twice (a retry, a re-publish) must not queue a second set of posts, and posting cannot be
 * undone on Instagram or TikTok — so when in doubt this resolves toward "already done".
 */
export async function enqueuePack(article) {
  const existing = await getPack(article.contentId);
  if (existing) return { created: false, pack: existing };

  const pack = await savePack({
    contentId: article.contentId,
    wpPostId: article.wpPostId ?? null,
    url: article.url ?? null,
    title: article.title,
    categoryId: article.categoryId,
    source: article.source ?? null,
    heroImageUrl: article.heroImageUrl ?? null,
    status: 'queued',
    attempts: {},
    createdAt: new Date().toISOString(),
  });

  await kv.zadd(QUEUE_KEY, { score: Date.now(), member: pack.contentId });
  await kv.lpush(INDEX_KEY, pack.contentId);
  await kv.ltrim(INDEX_KEY, 0, INDEX_LIMIT - 1);
  return { created: true, pack };
}

/** Packs whose next attempt is due, oldest first. */
export async function dueContentIds(limit = 5, nowMs = Date.now()) {
  const ids = (await kv.zrangebyscore(QUEUE_KEY, 0, nowMs)) ?? [];
  return ids.slice(0, limit);
}

/**
 * Due packs within a score window, oldest first.
 *
 * The queue is scored by when a pack next becomes due, and a pack that has never been worked
 * still carries its enqueue time — so "old score" and "never started" coincide. Reading the
 * two ends separately is what stops a long backlog filling the whole read window: taking the
 * first N ids overall means that after a few days paused, every id in the window is stale and
 * today's story is never even looked at.
 */
export async function dueContentIdsInRange(minScore, maxScore, limit) {
  const ids = (await kv.zrangebyscore(QUEUE_KEY, minScore, maxScore)) ?? [];
  return ids.slice(0, limit);
}

/**
 * Take a pack off the queue for this tick. Removing BEFORE the work starts is what stops
 * two overlapping cron runs paying twice for the same LLM and voice calls.
 */
/**
 * How long a claimed pack stays invisible before it becomes due again. Long enough for the
 * slowest stage, short enough that a lost pack self-heals within the hour.
 */
export const LEASE_MS = Number(process.env.SOCIAL_PACK_LEASE_MS) || 15 * 60_000;

/**
 * Take a pack for this tick — as a LEASE, not a deletion.
 *
 * Deleting the queue entry did stop two ticks paying twice, but it also meant a tick killed
 * mid-stage (the 300s function limit, a deploy, an OOM) lost the pack for good: out of the
 * queue, never `failed`, invisible on the board, after the LLM and voice calls had been
 * paid for. Re-adding it with a future score keeps both properties: an overlapping tick
 * still cannot claim it, and a dead tick's pack comes back on its own.
 */
export async function claim(contentId) {
  const removed = await kv.zrem(QUEUE_KEY, contentId);
  if (!removed) return null; // another tick already has it

  const pack = await getPack(contentId);
  if (!pack) {
    await kv.zrem(QUEUE_KEY, contentId); // the record is gone; hold no lease on nothing
    return null;
  }
  // Re-adding the queue entry made `zrem` stop being an exclusive check — a second tick's
  // `zrem` would also succeed and work the same pack, paying twice and overwriting the first
  // tick's script. So the LEASE on the record decides, not the queue entry.
  if (pack.leaseUntil && pack.leaseUntil > Date.now()) {
    await kv.zadd(QUEUE_KEY, { score: pack.leaseUntil, member: contentId }); // put the holder's entry back
    return null;
  }

  const leaseUntil = Date.now() + LEASE_MS;
  await kv.zadd(QUEUE_KEY, { score: leaseUntil, member: contentId });
  // `leaseAttempts` counts claims that produced NO OUTCOME AT ALL: a stage that kills the
  // function never reaches `fail`, so without this a pack that reliably crashes would re-run
  // every lease period forever, paying each time. Any outcome — advance, stay, caught
  // failure, hold — resets it (see `clearLease`), because as a lifetime counter it killed
  // every pack instead: the happy path spends four claims before rendering even starts, and
  // a render that polls for more than two minutes is normal, not a crash.
  const leaseAttempts = (pack.leaseAttempts ?? 0) + 1;
  if (leaseAttempts > MAX_STAGE_ATTEMPTS * 2) {
    await kv.zrem(QUEUE_KEY, contentId);
    await savePack({
      ...pack,
      status: 'failed',
      leaseUntil: null,
      error: { stage: pack.status, message: 'claimed repeatedly without ever completing', at: new Date().toISOString() },
    });
    return null;
  }
  return savePack({ ...pack, leaseUntil, leaseAttempts });
}

/**
 * Fields that end a claim. `leaseAttempts: 0` because the tick reached a conclusion about
 * this pack, which is the one thing the crash counter exists to detect the absence of.
 */
export const clearLease = { leaseUntil: null, leaseAttempts: 0 };

/** Put a pack back for its next stage, immediately by default. */
export async function requeue(pack, delayMs = 0) {
  await kv.zadd(QUEUE_KEY, { score: Date.now() + delayMs, member: pack.contentId });
  return pack;
}

export async function advance(pack, patch = {}) {
  const status = nextStage(pack.status);
  const updated = await savePack({ ...pack, ...patch, status, error: null, ...clearLease });
  // `requeue` re-scores the lease entry left by `claim`, so the pack is due again now.
  if (status !== 'done') await requeue(updated);
  else await kv.zrem(QUEUE_KEY, updated.contentId);
  return updated;
}

/**
 * Retire a pack that will never be worked, without calling it a failure.
 *
 * `failed` means something went wrong and a person should look; a story that aged out while
 * production was paused is neither. Keeping it distinct is what lets the board show "12
 * dropped as stale" instead of twelve alarms, and stops `/retry` offering to re-run work that
 * was deliberately abandoned.
 */
export async function drop(pack, reason) {
  const updated = await savePack({
    ...pack,
    ...clearLease,
    status: 'dropped',
    droppedAt: new Date().toISOString(),
    error: { stage: pack.status, message: String(reason).slice(0, 200), at: new Date().toISOString() },
  });
  await kv.zrem(QUEUE_KEY, updated.contentId);
  return updated;
}

/** Hold a pack out of the working set without losing it (e.g. a stage with no runner yet). */
export async function hold(pack, delayMs) {
  const updated = await savePack({ ...pack, ...clearLease, heldUntil: Date.now() + delayMs });
  await requeue(updated, delayMs);
  return updated;
}

/**
 * Record a failed stage. Retries back off (1min, 4min, 9min) so a provider blip recovers on
 * its own; past the cap the pack stops and waits for a person, rather than burning credit.
 */
export async function fail(pack, stage, err) {
  const attempts = { ...(pack.attempts ?? {}) };
  attempts[stage] = (attempts[stage] ?? 0) + 1;
  const terminal = attempts[stage] >= MAX_STAGE_ATTEMPTS;
  const updated = await savePack({
    ...pack,
    attempts,
    status: terminal ? 'failed' : pack.status,
    ...clearLease,
    // Truncated: provider error bodies carry request ids and internal identifiers, and this
    // string is stored and rendered on the board.
    error: {
      stage,
      message: String(err?.message ?? err).slice(0, 200),
      at: new Date().toISOString(),
    },
  });
  if (terminal) await kv.zrem(QUEUE_KEY, updated.contentId);
  else await requeue(updated, attempts[stage] ** 2 * 60_000);
  return { pack: updated, terminal };
}

/** Hard ceiling on a board load, whatever the caller asks for. */
export const LIST_MAX = 100;

/**
 * Board listing.
 *
 * `mgetBatched`, never `Promise.all(ids.map(kv.get))`: this Upstash client opens a
 * connection per in-flight request, and that pattern exhausted the function's file
 * descriptors here before — every outbound fetch then failed with "fetch failed" and
 * scheduled article generation stopped silently for weeks (see the note in lib/kv.js).
 * Pack records are small, so a batched MGET is the right tool.
 */
export async function listPacks(limit = 50) {
  const capped = Math.min(Math.max(1, Number(limit) || 50), LIST_MAX);
  const ids = (await kv.lrange(INDEX_KEY, 0, capped - 1)) ?? [];
  if (!ids.length) return [];
  const packs = await mgetBatched(ids.map(PACK_KEY));
  return packs.filter(Boolean);
}
