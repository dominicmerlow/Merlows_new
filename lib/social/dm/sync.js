// lib/social/dm/sync.js
// Step Z4 of ../../../../tasks/comment-to-dm-plan.md: give every Instagram reel and carousel the
// autopilot has scheduled or published its own "Comment VOICES" automation in Zernio.
//
// It runs as a sweeper on its own cron (/api/social/dm-sync) instead of inside the publish path,
// so that it can be switched off, retried and reasoned about on its own. Three facts shape it:
//
//   1. Creating an automation SWITCHES IT ON. Zernio ignores `isActive` on create (Z1 spike), so
//      nothing is created unless SOCIAL_DM=on. SOCIAL_DM=off stops NEW automations only; pausing
//      the ones that exist is the kill-all (Z6), not this switch.
//   2. Nothing on Zernio's side makes a retry safe. `x-request-id` is honoured only by
//      POST /posts, the list response carries no `postId`, and the 409 for a second automation
//      is documented only for `platformPostId`. So a create that timed out, or whose record was
//      lost, is found again by its NAME: every automation is named from its Zernio post id alone
//      (`nameFor`), which does not change when the post goes from scheduled to published.
//   3. A run can die anywhere, and runs can overlap. A short KV lease keeps two runs off the same
//      post, the record is read again once the lease is held, and the lasting record is written
//      only once Zernio has answered.
//
// Keys go through lib/kv.js, so KV_PREFIX applies: the Upstash database is shared with Vance.

import { kv, mgetBatched } from '../../kv.js';
import { listPacks, LIST_MAX } from '../pack/store.js';
import { createCommentAutomation, listCommentAutomations, getPost } from '../platforms/zernio.js';
import { buildAutomation, validateAutomation } from './automation.js';

/** Instagram formats that get an automation. Stories wait for story-reply support (v1.1). */
export const DM_FORMATS = new Set(['reel', 'carousel']);

export const RECORD_KEY = (zernioPostId) => `social:dm:auto:${zernioPostId}`;
const LEASE_KEY = (zernioPostId) => `${RECORD_KEY(zernioPostId)}:lease`;

/** The automation's identity in Zernio: fixed by the Zernio post id, whatever its scope. */
export const nameFor = (zernioPostId) => `merlows-dm ${zernioPostId}`;

/** Long enough for one post's calls (four at most, each bounded by the Zernio timeout). */
const LEASE_SECONDS = 300;
/** Kept so a finished post is never looked at again while it is still on the board. */
const RECORD_TTL_SECONDS = 180 * 24 * 60 * 60;
/** A post still being retried a week later is not coming back. */
const RETRY_TTL_SECONDS = 7 * 24 * 60 * 60;
/** A post that is live but still cannot be named by its Instagram media id after this is given up. */
export const WAIT_LIMIT_MS = 24 * 60 * 60 * 1000;
export const MAX_ATTEMPTS = 3;
/** Create attempts per run. Only a create counts: looking at a post that has to wait does not. */
const MAX_CREATES_PER_RUN = Math.max(1, Math.trunc(Number(process.env.SOCIAL_DM_MAX_PER_RUN)) || 5);
/**
 * Posts looked at per run, whatever the outcome. This bounds the work, not the time: with Zernio
 * slow enough to hit its 30 s timeout on every call, a run can still reach the function's 300 s
 * limit. Being killed loses nothing: records are saved per post, a lease expires by itself, and a
 * create whose answer was lost is found again by name on the next run.
 */
const MAX_EXAMINED_PER_RUN = MAX_CREATES_PER_RUN * 2;
/** Outcomes that spent a create attempt. */
const CREATE_OUTCOMES = new Set(['created', 'retrying', 'gaveUp']);
/** Records that still need work. Anything else is finished. */
const OPEN_STATES = new Set(['retry', 'waiting']);
/** New posts first, then retries, and posts waiting on Zernio last, so they cannot crowd out the rest. */
const WORK_ORDER = { none: 0, retry: 1, waiting: 2 };

/** On only when SOCIAL_DM says exactly "on". Anything else, including unset, is off. */
export const dmEnabled = (env = process.env) => String(env.SOCIAL_DM ?? '').trim().toLowerCase() === 'on';

/** Zernio's ids (profiles, accounts, posts) are 24 hex characters. */
const ZERNIO_ID_RE = /^[0-9a-f]{24}$/i;

/**
 * The Zernio settings DM work runs on. It has its own key (ZERNIO_DM_API_KEY), separate from the
 * posting key, and refuses to fall back to the posting key: a missing setting is a 503, not a
 * silent change of credentials.
 */
export function dmConfig(env = process.env) {
  const wanted = {
    apiKey: 'ZERNIO_DM_API_KEY',
    profileId: 'ZERNIO_PROFILE_ID',
    accountId: 'ZERNIO_INSTAGRAM_ACCOUNT_ID',
  };
  const cfg = {};
  const missing = [];
  for (const [field, name] of Object.entries(wanted)) {
    // Trimmed: a pasted value with a trailing newline is the classic Vercel env mistake.
    const value = String(env[name] ?? '').trim();
    if (value) cfg[field] = value;
    else missing.push(name);
  }
  if (missing.length) {
    throw Object.assign(new Error(`comment-to-DM is on but not configured: ${missing.join(', ')}`), { status: 503 });
  }
  // Zernio ids are 24 hex characters. A handle ("@merlows.news") in either variable would reach
  // Zernio on every create, fail, and abandon each post after three attempts; stop the whole run
  // here instead, before anything is recorded. The value itself is not echoed: these variables
  // are stored as secrets.
  const notIds = [['ZERNIO_PROFILE_ID', cfg.profileId], ['ZERNIO_INSTAGRAM_ACCOUNT_ID', cfg.accountId]]
    .filter(([, value]) => !ZERNIO_ID_RE.test(value))
    .map(([name]) => name);
  if (notIds.length) {
    throw Object.assign(new Error(
      `comment-to-DM is on but ${notIds.join(' and ')} is not a 24-character Zernio id `
      + '(a handle like @name will not work; take the id from GET /v1/accounts)',
    ), { status: 503 });
  }
  return cfg;
}

/** Every Instagram reel or carousel on the board that should have an automation, once each. */
export function candidatesFrom(packs) {
  const out = [];
  const seen = new Set();
  for (const pack of Array.isArray(packs) ? packs : []) {
    if (!pack?.url) continue; // nothing to link to
    for (const post of Array.isArray(pack.posts) ? pack.posts : []) {
      if (!DM_FORMATS.has(post?.format)) continue;
      if ((post.platform ?? 'instagram') !== 'instagram') continue;
      if (!post.zernioPostId || seen.has(post.zernioPostId)) continue;
      if (String(post.status ?? '').toLowerCase() === 'failed') continue; // never went out
      seen.add(post.zernioPostId);
      out.push({ pack, post });
    }
  }
  return out;
}

const PUBLISHED = new Set(['published', 'posted']);
const STILL_SCHEDULED = new Set(['scheduled', 'pending', 'draft']);

/**
 * Which post the automation is attached to, or null when that cannot be said yet.
 *
 * Zernio's docs: `postId` binds an automation to a NOT-yet-published Zernio post ("arms itself
 * when that post publishes"); for a post already live, pass `platformPostId` alone. So a post is
 * named by Zernio's id only while it is certainly not live. Once the board says published, or its
 * slot time has passed (the board can lag: a missed webhook, an overnight publish), Zernio is
 * asked; a live post with no Instagram media id yet, a post mid-publish, or a lookup that fails
 * all give null, and the caller waits for the next run rather than guessing.
 */
export async function resolveScope(post, { apiKey, fetchFn = fetch, getPostFn = getPost, now = Date.now() } = {}) {
  const boardStatus = String(post.status ?? '').toLowerCase();
  const maybeLive = PUBLISHED.has(boardStatus) || Date.parse(post.at) <= now;
  if (!maybeLive) return { postId: String(post.zernioPostId) };

  let result;
  try {
    result = await getPostFn(post.zernioPostId, { fetchFn, apiKey });
  } catch {
    return null;
  }
  const instagram = (result?.results ?? []).find((r) => r.platform === 'instagram');
  const status = String(instagram?.status || result?.status || '').toLowerCase();
  if (PUBLISHED.has(status) || PUBLISHED.has(boardStatus)) {
    return instagram?.postId ? { platformPostId: String(instagram.postId) } : null;
  }
  if (STILL_SCHEDULED.has(status)) return { postId: String(post.zernioPostId) };
  return null; // publishing, failed or unknown: do not guess
}

const matchesScope = (automation, scope) =>
  Boolean(scope && ((scope.postId && automation.postId === scope.postId)
    || (scope.platformPostId && automation.platformPostId === scope.platformPostId)));

/** A live automation that already answers for this post: ours by name, or anyone's by scope. */
const liveFor = (automations, zernioPostId, scope) =>
  automations.find((a) => a.isActive && (a.name === nameFor(zernioPostId) || matchesScope(a, scope)));

const saveRecord = (store, zernioPostId, record, ex = RECORD_TTL_SECONDS) =>
  store.set(RECORD_KEY(zernioPostId), record, { ex });

const shortError = (err) => String(err?.message ?? err).slice(0, 300);

/**
 * Make sure every eligible post has exactly one live automation. Returns counts, never throws for
 * one post's failure; throws only when the whole run cannot start (switch on but not configured,
 * or Zernio unreachable for the initial list).
 */
export async function syncDmAutomations({
  env = process.env,
  store = kv,
  fetchFn = fetch,
  now = Date.now(),
  listPacksFn = listPacks,
  getPostFn = getPost,
  log = console,
} = {}) {
  if (!dmEnabled(env)) return { enabled: false };
  const cfg = dmConfig(env);

  const candidates = candidatesFrom(await listPacksFn(LIST_MAX));
  const summary = {
    enabled: true, candidates: candidates.length, pending: 0,
    created: 0, adopted: 0, rejected: 0, retrying: 0, gaveUp: 0, waiting: 0, busy: 0, raced: 0, deferred: 0,
  };
  if (candidates.length === 0) return summary;

  // Records are small, so one batched MGET, never one GET per post (see the fd-exhaustion
  // incident in CLAUDE.md, 2026-09-23).
  const records = await mgetBatched(candidates.map(({ post }) => RECORD_KEY(post.zernioPostId)), store);
  const todo = candidates
    .map((candidate, i) => ({ ...candidate, record: records[i] ?? null }))
    .filter(({ record }) => !record || OPEN_STATES.has(record.state))
    // Stable sort: within each group the board's own order (newest first) is kept.
    .sort((a, b) => WORK_ORDER[a.record?.state ?? 'none'] - WORK_ORDER[b.record?.state ?? 'none']);
  summary.pending = todo.length;
  if (todo.length === 0) return summary;

  // One read of what is live: the validator needs it to refuse a second automation on a post,
  // and a record lost after a successful create is recovered from it instead of re-created.
  const existing = await listCommentAutomations({ profileId: cfg.profileId, apiKey: cfg.apiKey, fetchFn });

  let creates = 0;
  let examined = 0;
  for (const item of todo) {
    if (creates >= MAX_CREATES_PER_RUN || examined >= MAX_EXAMINED_PER_RUN) {
      summary.deferred += 1;
      continue;
    }
    const id = item.post.zernioPostId;
    const lease = await store.set(LEASE_KEY(id), { at: now }, { nx: true, ex: LEASE_SECONDS });
    if (!lease) {
      summary.busy += 1; // another run is on it
      continue;
    }
    examined += 1;
    try {
      // Read the record again now that the lease is held: the snapshot above is from before any
      // lease, and an overlapping run may have finished this post since.
      const fresh = (await store.get(RECORD_KEY(id))) ?? null;
      if (fresh && !OPEN_STATES.has(fresh.state)) {
        summary.raced += 1;
        continue;
      }
      if (JSON.stringify(fresh) !== JSON.stringify(item.record)) {
        // Another run attempted it meanwhile, and that attempt may have reached Zernio: look again.
        existing.splice(0, existing.length,
          ...(await listCommentAutomations({ profileId: cfg.profileId, apiKey: cfg.apiKey, fetchFn })));
      }
      const outcome = await ensureOne({ ...item, record: fresh }, { cfg, existing, store, fetchFn, getPostFn, now, log });
      summary[outcome] += 1;
      if (CREATE_OUTCOMES.has(outcome)) creates += 1;
    } catch (err) {
      // Our own storage failing for one post must not strand the rest of the run. Nothing was
      // recorded, so the next run looks at this post again.
      summary.errors = (summary.errors ?? 0) + 1;
      log.error(`[dm-sync] ${item.pack.contentId} ${item.post.format} (${id}) errored: ${shortError(err)}`);
    } finally {
      await store.del(LEASE_KEY(id)).catch(() => undefined);
    }
  }
  return summary;
}

async function ensureOne({ pack, post, record }, { cfg, existing, store, fetchFn, getPostFn, now, log }) {
  const id = post.zernioPostId;
  const label = `${pack.contentId} ${post.format} (${id})`;
  const base = { contentId: pack.contentId ?? null, format: post.format, zernioPostId: id };

  const scope = await resolveScope(post, { apiKey: cfg.apiKey, fetchFn, getPostFn, now });

  // Already live for this post (an earlier create whose answer or record was lost, or one made
  // by hand on the same Instagram post): adopt it.
  const live = liveFor(existing, id, scope);
  if (live) {
    await saveRecord(store, id, { ...base, state: 'done', automationId: live.id, scope, adopted: true, at: now });
    return 'adopted';
  }

  // Live, or maybe live, but not yet nameable by its Instagram media id: try again next run.
  // Waiting costs no create attempt, but it has an end: a post Zernio never resolves (failed
  // without the webhook reaching us, deleted in Zernio, no media id ever) is given up after
  // WAIT_LIMIT_MS so it stops costing a lookup every five minutes.
  if (!scope) {
    const since = record?.state === 'waiting' && Number.isFinite(record.since) ? record.since : now;
    const kept = record?.attempts ? { attempts: record.attempts } : {};
    if (now - since >= WAIT_LIMIT_MS) {
      await saveRecord(store, id, { ...base, ...kept, state: 'gave-up', reason: 'never nameable by its Instagram media id', since, at: now });
      log.error(`[dm-sync] gave up on ${label}: live, but never nameable by its Instagram media id since ${new Date(since).toISOString()}`);
      return 'gaveUp';
    }
    await saveRecord(store, id, { ...base, ...kept, state: 'waiting', since, at: now }, RETRY_TTL_SECONDS);
    return 'waiting';
  }

  // Build and check. What fails here fails every time, so it is recorded once and not retried.
  let problems;
  let payload;
  try {
    payload = {
      ...buildAutomation({
        profileId: cfg.profileId,
        accountId: cfg.accountId,
        ...scope,
        headline: pack.title,
        articleUrl: pack.url,
      }),
      name: nameFor(id),
    };
    problems = validateAutomation(payload, { existing });
  } catch (err) {
    problems = [shortError(err)];
  }
  if (problems.length > 0) {
    await saveRecord(store, id, { ...base, state: 'rejected', problems: problems.slice(0, 10), at: now });
    log.error(`[dm-sync] refused to create an automation for ${label}: ${problems.join('; ')}`);
    return 'rejected';
  }

  try {
    const created = await createCommentAutomation(payload, { apiKey: cfg.apiKey, requestId: `merlows-dm-${id}`, fetchFn });
    existing.push(created);
    await saveRecord(store, id, { ...base, state: 'done', automationId: created.id, scope, at: now });
    return 'created';
  } catch (err) {
    if (err?.status === 409) {
      // Zernio already has a live automation for this post that the first list did not show.
      const again = await listCommentAutomations({ profileId: cfg.profileId, apiKey: cfg.apiKey, fetchFn }).catch(() => []);
      const found = liveFor(again, id, scope);
      if (found) {
        await saveRecord(store, id, { ...base, state: 'done', automationId: found.id, scope, adopted: true, at: now });
        return 'adopted';
      }
    }
    const attempts = (record?.attempts ?? 0) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await saveRecord(store, id, { ...base, state: 'gave-up', attempts, error: shortError(err), at: now });
      log.error(`[dm-sync] gave up on ${label} after ${attempts} attempts: ${shortError(err)}`);
      return 'gaveUp';
    }
    await saveRecord(store, id, { ...base, state: 'retry', attempts, error: shortError(err), at: now }, RETRY_TTL_SECONDS);
    log.warn(`[dm-sync] ${label} failed (attempt ${attempts} of ${MAX_ATTEMPTS}), will retry: ${shortError(err)}`);
    return 'retrying';
  }
}
