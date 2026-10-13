// lib/social/pack/schedule.js
// Claims slots in today's grid and hands the resulting posts to Zernio.
//
// The grid is a shared, day-scoped record (`social:slots:<date>`) rather than something
// recomputed per pack, because two stories must never be given the same slot and a slot must
// never be filled twice. The record stores which story holds each slot, so a pack that is
// retried does not take a second slot for a format it already holds.

import { kv } from '../../kv.js';
import { planDay, slotInstant, capsFor, FORMAT_ASSET } from './slots.js';
import {
  createPost, creatorInfo, tiktokSettings, requestIdFor, rehostMedia, UPLOAD_TTL_MS, ZERNIO_PLATFORMS,
} from '../platforms/zernio.js';

export const SLOTS_KEY = (dateISO) => `social:slots:${dateISO}`;
const CREATOR_INFO_KEY = (accountId) => `social:tiktok:creator-info:${accountId}`;
const CREATOR_INFO_TTL_MS = 24 * 60 * 60_000;

/** Which Zernio account each format posts through. */
export const FORMAT_PLATFORM = { tiktok: 'tiktok', reel: 'instagram', carousel: 'instagram', story: 'instagram' };

/**
 * How much life an upload must have left before we reuse it rather than upload again.
 *
 * Zernio deletes an upload 7 days after it is made unless a post using it has published. The
 * question is never "is it still alive now" — it is "will it still be alive WHEN THIS POST
 * PUBLISHES", which for a slot hours away is a different question, and for a pack archived for
 * days is a very different one. The margin is the safety on top of that.
 */
export const UPLOAD_REFRESH_MARGIN_MS = Number(process.env.SOCIAL_UPLOAD_REFRESH_MARGIN_MS) || 24 * 60 * 60_000;

/**
 * The stored upload for this asset, or null when there is none we can still trust.
 *
 * `publishesAt` is the moment the post goes out. Omit it to ask the weaker question — is this
 * upload worth keeping right now — which is what the pre-upload step wants.
 */
/*
 * INVARIANT THIS DEPENDS ON: every URL in `pack.uploads` was validated when it was written.
 *
 * It is only ever written by `ensureTiktokUpload` and `schedulePost` below, from a
 * `rehostMedia` result, which has already been through `publicUrlTarget` (https-checked). No
 * HTTP route accepts an `uploads` field from a request body. So this function re-checks
 * staleness but NOT scheme or host — it is safe by construction, not by code. If you ever add
 * a path that merges anything into `pack.uploads`, validate there or add the check here;
 * `createPost`'s own https check is the last line, not the only one.
 */
export function uploadFor(pack, sourceUrl, { publishesAt, now = Date.now() } = {}) {
  const entry = pack?.uploads?.[sourceUrl];
  if (!entry?.url || !Number.isFinite(entry.expiresAt)) return null;
  const mustSurviveUntil = Number.isFinite(publishesAt) ? Math.max(publishesAt, now) : now;
  return entry.expiresAt - mustSurviveUntil > UPLOAD_REFRESH_MARGIN_MS ? entry : null;
}

/**
 * Upload the TikTok cut into Zernio's storage ahead of time, and return the new `uploads` map.
 *
 * Returns null when there is nothing to do — no TikTok render, or a stored upload with plenty
 * of life left — so the caller can tell "unchanged" from "changed" without comparing maps.
 *
 * Doing this at render time rather than at schedule time means a retry costs nothing (the
 * bytes are already up), the gap between a human approving and the post going out is one API
 * call, and a reviewer preview can point at the same URL the post will use. The cost is that
 * the upload can go stale before it is used — which is why `schedulePost` re-checks against
 * the slot's publish time and uploads again rather than trusting whatever is stored.
 *
 * CALLERS MUST TREAT A THROW AS NON-FATAL. This is an optimisation: if it fails, `schedulePost`
 * still uploads inline and the post still goes out. Failing the pack here would throw away a
 * finished, paid-for story because a pre-fetch did not fit in a tick.
 */
export async function ensureTiktokUpload(pack, { fetchFn = fetch, now = Date.now(), budgetMs } = {}) {
  const src = FORMAT_ASSET.tiktok(pack);
  if (!src) return null;
  // The caller says there is no time left this tick. Do nothing — this is an optimisation and
  // the next poll can do it. Starting anyway is how a tick gets killed, and a killed tick
  // loses the render costs this stage has just tallied.
  if (Number.isFinite(budgetMs) && budgetMs <= 0) return null;
  if (uploadFor(pack, src, { now })) return null;
  const uploaded = await rehostMedia(src, { fetchFn, budgetMs });
  return {
    ...(pack.uploads ?? {}),
    [src]: { url: uploaded.url, expiresAt: uploaded.expiresAt, bytes: uploaded.bytes, at: now },
  };
}

/** Today in the grid's own zone — the date the grid is keyed on, not the server's date. */
export function gridDate(now = Date.now(), zone = 'Europe/London') {
  const parts = new Date(now).toLocaleDateString('en-CA', { timeZone: zone }); // en-CA gives YYYY-MM-DD
  return parts;
}

/** Whole weeks since the account started posting, for the launch ramp. */
export function weeksLive(now = Date.now()) {
  const since = Date.parse(process.env.SOCIAL_LAUNCH_DATE ?? '');
  if (!Number.isFinite(since)) return 0; // unset means week 1, the most cautious rung
  return Math.floor((now - since) / (7 * 24 * 60 * 60_000));
}

/**
 * TikTok's per-account settings, cached for a day.
 *
 * Asking on every post would be a round trip per video for a value that changes rarely, but
 * caching it forever would keep posting against a permission the creator has since removed.
 */
export async function cachedCreatorInfo(accountId, { store = kv, now = Date.now(), fetchFn = fetch } = {}) {
  const key = CREATOR_INFO_KEY(accountId);
  const cached = await store.get(key).catch(() => null);
  if (cached?.at && now - cached.at < CREATOR_INFO_TTL_MS && cached.info) return cached.info;
  const info = await creatorInfo(accountId, { fetchFn });
  await store.set(key, { at: now, info }).catch(() => undefined);
  return info;
}

/**
 * Claim this pack's slots for the day.
 *
 * Returns the assignments actually won. The day record is read, extended and written back;
 * with one cron and one pack in flight at a time that is enough, and the pack's own lease
 * stops the same pack being scheduled twice. It is NOT safe against two concurrent workers
 * claiming the same free slot — if the tick ever runs in parallel this needs a real
 * compare-and-set.
 */
export async function claimSlots(pack, { store = kv, now = Date.now(), dateISO = gridDate(now) } = {}) {
  const key = SLOTS_KEY(dateISO);
  const taken = (await store.get(key)) ?? {};

  // What this pack has ACTUALLY posted, from its own record — not from the day grid.
  //
  // Reading it from the grid meant a slot counted as done the moment it was planned. If the
  // stage then failed part-way, the unposted formats were both claimed and unreachable, so
  // the pack could never finish them today — and tomorrow it claimed a fresh set and posted
  // the ones that HAD gone out a second time, at a new slot time, which `requestIdFor` sees
  // as a different post and Zernio therefore does not deduplicate.
  const posted = new Set((pack.posts ?? []).map((post) => post.format));

  // Slots this pack already holds in today's grid but has not posted: re-offer them. Same
  // format, same instant, so the request id is identical and a re-send is deduplicated.
  const unfinished = Object.entries(taken)
    .filter(([, contentId]) => contentId === pack.contentId)
    .map(([slot]) => ({ format: slot.split('@')[0], time: slot.split('@')[1] }))
    // A post-now booking is not a grid slot and can never be re-offered as one: its time
    // (`now-0`) has no place on the clock. Dropped explicitly rather than left to fall out of
    // the `Date.parse(at) > now` filter below as a NaN, which works by accident.
    .filter((slot) => !String(slot.time).startsWith('now'))
    .filter((slot) => !posted.has(slot.format))
    .map((slot) => ({ ...slot, at: slotInstant(dateISO, slot.time) }))
    .filter((slot) => Date.parse(slot.at) > now) // a slot whose moment has passed is lost
    .map((slot) => ({ ...slot, contentId: pack.contentId, url: FORMAT_ASSET[slot.format]?.(pack) }))
    .filter((slot) => slot.url);

  const fresh = planDay([pack], {
    dateISO,
    now,
    weeksLive: weeksLive(now),
    used: taken,
    ignorePool: true, // this pack is not competing for a slot, it is asking for one
  }).filter((slot) => !posted.has(slot.format) && !unfinished.some((u) => u.format === slot.format));

  const assignments = [...unfinished, ...fresh];
  if (!assignments.length) return { assignments: [], dateISO };

  const updated = { ...taken };
  for (const slot of assignments) updated[`${slot.format}@${slot.time}`] = pack.contentId;
  await store.set(key, updated);
  return { assignments, dateISO };
}

/** First post goes out a minute from now: a `scheduledFor` in the past can be refused. */
const POST_NOW_LEAD_MS = 60_000;
/**
 * Gap between the formats of a post-now story.
 *
 * Not zero. Four assets landing on the same second is the signature of an automated account,
 * which is the thing the whole slot grid exists to avoid — and it is what gets a new account
 * rate-limited or flagged. A few minutes apart still reads as someone posting a story.
 */
const POST_NOW_SPACING_MS = Number(process.env.SOCIAL_POST_NOW_SPACING_MS) || 4 * 60_000;

/**
 * Assignments for "post this now", going out beside the day grid rather than in it.
 *
 * It does not take today's 17:00 carousel slot — but it DOES count against the day's ceiling
 * for that format. It used to count against nothing, so approving a batch by hand bypassed
 * the launch ramp completely: 24 posts went out on 24 September and 23 on the 27th, against a
 * ceiling of 9. The ramp exists so a quiet account does not suddenly burst through an API,
 * and the normal human workflow was the thing walking straight past it.
 *
 * `remaining` is how many of each format the day still has. A format with none left is dropped
 * here; `claimImmediate` reports it as `deferred`, and the CALLER has to hand it to the grid by
 * clearing `review.postNow` — nothing in this function can do that, and a dropped format that
 * nobody re-routes is a format that never posts. Formats the pack has no asset for are skipped,
 * same as the grid path.
 */
export function immediateAssignments(pack, {
  now = Date.now(),
  formats = ['tiktok', 'reel', 'carousel', 'story'],
  remaining = null,
} = {}) {
  const assignments = [];
  for (const format of formats) {
    const url = FORMAT_ASSET[format]?.(pack);
    if (!url) continue;
    if (remaining && !(remaining[format] > 0)) continue; // the day's ceiling for this format is spent
    const at = new Date(now + POST_NOW_LEAD_MS + assignments.length * POST_NOW_SPACING_MS).toISOString();
    assignments.push({ format, time: 'now', at, contentId: pack.contentId, url });
  }
  return assignments;
}

/** Post-now bookings are recorded under this time, which belongs to no grid slot. */
const POST_NOW_SLOT = (n) => `now-${n}`;

/** How many of each format today's record has already spent, grid and post-now together. */
export function spentToday(taken = {}) {
  const spent = { tiktok: 0, reel: 0, carousel: 0, story: 0 };
  for (const key of Object.keys(taken)) {
    const format = key.split('@')[0];
    if (format in spent) spent[format] += 1;
  }
  return spent;
}

/**
 * Claim post-now assignments against the day's ceiling, and book what they use.
 *
 * The counterpart of `claimSlots` for the post-now path. It has to touch the same day record,
 * or the ceiling is unenforceable: nothing else in the system knows a manual batch happened.
 */
export async function claimImmediate(pack, { store = kv, now = Date.now(), dateISO = gridDate(now) } = {}) {
  const key = SLOTS_KEY(dateISO);
  const taken = (await store.get(key)) ?? {};
  const caps = capsFor(weeksLive(now));
  const spent = spentToday(taken);

  const remaining = {};
  for (const format of Object.keys(caps)) remaining[format] = caps[format] - spent[format];

  // `possible` is what the pack COULD post if the day were empty, counted WITHOUT regard to
  // what it has already posted. The caller needs it to tell "this pack has no finished asset",
  // which is a failure, from "today's ceiling is spent", which is not.
  const possible = immediateAssignments(pack, { now }).length;

  const posted = new Set((pack.posts ?? []).map((post) => post.format));
  // Formats this pack ALREADY BOOKED on an earlier pass. Without this, a post-now pass that
  // ended early — the tick running out mid-batch is a normal path, since TikTok goes first and
  // needs 75s — books every format again on the retry. One story then eats two of the day's
  // two TikTok slots, and if the ceiling has meanwhile filled, `remaining` reads 0 for a
  // format the pack itself is holding, so that format is dropped and never posts at all.
  const held = new Set(
    Object.entries(taken)
      .filter(([slot, contentId]) => contentId === pack.contentId && String(slot.split('@')[1]).startsWith('now'))
      .map(([slot]) => slot.split('@')[0]),
  );

  const candidates = immediateAssignments(pack, { now })
    .map((slot) => slot.format)
    .filter((format) => !posted.has(format));

  // A format the pack already holds is granted on its own booking, with no new key written and
  // no ceiling check: it was paid for on the earlier pass.
  const grant = candidates.filter((format) => held.has(format) || remaining[format] > 0);
  const deferred = candidates.filter((format) => !held.has(format) && !(remaining[format] > 0));

  const assignments = immediateAssignments(pack, { now, formats: grant });
  const toBook = assignments.filter((slot) => !held.has(slot.format));

  if (toBook.length) {
    // Booked under a time no grid slot uses, so `planDay` counts it against the format's cap
    // (it counts every `format@…` key) without ever mistaking it for a real 17:00 slot.
    const updated = { ...taken };
    for (const slot of toBook) {
      let n = 0;
      while (updated[`${slot.format}@${POST_NOW_SLOT(n)}`]) n += 1;
      updated[`${slot.format}@${POST_NOW_SLOT(n)}`] = pack.contentId;
    }
    await store.set(key, updated);
  }

  return { assignments, dateISO, remaining, possible, pending: candidates.length, deferred };
}

/**
 * Turn one assignment into a scheduled Zernio post.
 *
 * Each post carries a request id derived from the story, the format and the exact slot, so a
 * retry after a timeout is recognised by Zernio as the same post rather than becoming a
 * second one. Nothing here can be recalled once it publishes.
 */
/**
 * `budgetMs` is how much wall clock the CALLER still has for this post. It matters only for
 * TikTok, where the media is uploaded before the post is created: a fixed deadline can be
 * honoured to the millisecond and the function still be killed, because the caller's tick had
 * less left than the deadline allowed. Passing the real figure is what keeps a stall a stage
 * failure instead of a kill — and a killed tick is how a story gets posted twice. Omitted, the
 * upload falls back to its own env default.
 */
export async function schedulePost(pack, slot, {
  accounts, store = kv, fetchFn = fetch, now = Date.now(), budgetMs,
} = {}) {
  const platform = FORMAT_PLATFORM[slot.format];
  const accountId = accounts?.[platform];
  if (!accountId) throw new Error(`no Zernio ${platform} account configured for ${slot.format}`);
  if (!ZERNIO_PLATFORMS.includes(platform)) throw new Error(`unsupported platform ${platform}`);

  const social = pack.social ?? {};
  const caption = platform === 'tiktok' ? social.tiktokCaption : social.igCaption;
  const media = slot.format === 'carousel'
    ? [pack.renders?.stills?.cover, ...Object.entries(pack.renders?.stills ?? {})
        .filter(([key]) => key.startsWith('slide-'))
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
        .map(([, url]) => url), pack.renders?.stills?.cta].filter(Boolean)
    : [slot.url];

  const tiktok = platform === 'tiktok'
    ? tiktokSettings(await cachedCreatorInfo(accountId, { store, now, fetchFn }))
    : undefined;

  // TikTok fetches media by URL and refuses any domain not verified against the calling app,
  // so our Blob URL is rejected (error 40002) however public it is. The video has to be
  // uploaded into Zernio's own storage first. Instagram has no such rule and keeps the Blob
  // URL, which saves copying every reel and carousel for nothing.
  //
  // A Zernio upload is deleted after 7 days unless a post referencing it has published by
  // then, so a slot beyond that window would publish with its media already gone. Refusing
  // here keeps the failure at schedule time, where the pack can be re-slotted, instead of
  // days later in a Zernio worker we never see.
  // Any upload made during THIS call, keyed by source URL, for the caller to persist onto the
  // pack. Empty when a stored upload was reused, which is the normal case.
  const refreshed = {};
  const postMedia = platform === 'tiktok'
    ? await (async () => {
      // An unparsable `slot.at` must REFUSE, not skip the check: `Date.parse` gives NaN, every
      // comparison against it is false, and a `Number.isFinite` guard here would wave the post
      // through — uploading the video and sending the broken `scheduledFor` on to Zernio. That
      // is the same shape as the two bugs this function exists to stop.
      const publishesAt = Date.parse(slot.at);
      if (!Number.isFinite(publishesAt)) throw new Error(`TikTok slot has no usable time: ${String(slot.at)}`);
      if (publishesAt - now > UPLOAD_TTL_MS) {
        throw new Error(
          `TikTok slot ${slot.at} is more than 7 days out; a Zernio upload would expire before it publishes`,
        );
      }
      // Reuse the upload made at render time when it will still be alive at PUBLISH time, not
      // merely now. A pack archived for days and then approved is the case this exists for:
      // its stored upload is long dead, and posting its URL would publish a video that is not
      // there — a failure inside Zernio, hours later, that nobody here would see.
      //
      // Whatever the caller has left, minus ONE round trip for the createPost that still has
      // to happen after the bytes are up. The presign is NOT reserved for separately: it
      // happens inside `rehostMedia`, under the same deadline, so subtracting for it here
      // would take it off twice.
      //
      // The reserve has to stay well under the caller's own minimum for starting a TikTok
      // post, or the two cancel out: at a 45s caller floor an earlier 45s reserve here left
      // 5s for the whole transfer, which is a guaranteed timeout at exactly the moment the
      // floor was meant to protect. 30s is one `zernioFetch` timeout, which is the real cost
      // of the call being reserved for.
      const uploadBudget = Number.isFinite(budgetMs) && budgetMs > 0
        ? Math.max(15_000, budgetMs - 30_000)
        : undefined;

      // Sequential, not `Promise.all`: each item is buffered whole, so uploading several at
      // once multiplies the peak memory for no gain when — as today — there is only ever one.
      const urls = [];
      for (const url of media) {
        const stored = uploadFor(pack, url, { publishesAt, now });
        if (stored) {
          urls.push(stored.url);
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        const uploaded = await rehostMedia(url, { fetchFn, budgetMs: uploadBudget });
        // Hand it back so the CALLER can store it. Without that, a createPost failure after a
        // successful upload leaves the pack holding the same stale entry, and every retry of
        // this slot pays for the whole transfer again — the exact cost the pre-upload exists
        // to remove.
        refreshed[url] = { url: uploaded.url, expiresAt: uploaded.expiresAt, bytes: uploaded.bytes, at: now };
        urls.push(uploaded.url);
      }
      return urls;
    })()
    : media;

  // `toPack` strips the leading '#' when it normalises hashtags, so it has to go back on
  // here. Without it every caption shipped the tags as bare words — a line of run-together
  // proper nouns at the end of the post, with no hashtags at all.
  const tags = (social.hashtags ?? [])
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`));

  const result = await createPost({
    accountId,
    platform,
    format: slot.format,
    caption: [caption, tags.join(' ')].filter(Boolean).join('\n\n').trim(),
    mediaUrls: postMedia,
    scheduledFor: slot.at,
    tiktok,
    requestId: requestIdFor({ contentId: pack.contentId, format: slot.format, at: slot.at }),
    fetchFn,
  });

  // A 207 is a 2xx: Zernio answers "accepted" with a platform already failed inside it.
  //
  // The flags matter as much as the message. By the time we are here, `POST /posts` has
  // answered 2xx, so ZERNIO ALREADY HOLDS A POST — the caller must treat this as "may have
  // reached Zernio" and not simply retry into a second one. `mayHaveReachedZernio` in the
  // autopilot reads `err.reachedZernio`; without the flag it falls back to matching this
  // message's text, which breaks silently the first time anyone rewords it. If this wording
  // ever changes, the flag is what keeps it correct.
  if (!result.ok) {
    const why = result.failed.map((f) => `${f.platform}: ${f.error ?? f.status}`).join('; ');
    throw Object.assign(
      new Error(`Zernio accepted the request but ${slot.format} did not post — ${why || 'no platform accepted'}`),
      { reachedZernio: true, zernioPostId: result.postId ?? null },
    );
  }

  return {
    format: slot.format,
    platform,
    at: slot.at,
    zernioPostId: result.postId,
    status: result.status ?? 'scheduled',
    // Present only when this call uploaded something. The caller lifts it onto the pack and
    // must NOT store it on the post record itself — `pack.posts` is the published history.
    ...(Object.keys(refreshed).length ? { upload: refreshed } : {}),
  };
}
