// lib/social/pack/schedule.js
// Claims slots in today's grid and hands the resulting posts to Zernio.
//
// The grid is a shared, day-scoped record (`social:slots:<date>`) rather than something
// recomputed per pack, because two stories must never be given the same slot and a slot must
// never be filled twice. The record stores which story holds each slot, so a pack that is
// retried does not take a second slot for a format it already holds.

import { kv } from '../../kv.js';
import { planDay, slotInstant, FORMAT_ASSET } from './slots.js';
import { createPost, creatorInfo, tiktokSettings, requestIdFor, ZERNIO_PLATFORMS } from '../platforms/zernio.js';

export const SLOTS_KEY = (dateISO) => `social:slots:${dateISO}`;
const CREATOR_INFO_KEY = (accountId) => `social:tiktok:creator-info:${accountId}`;
const CREATOR_INFO_TTL_MS = 24 * 60 * 60_000;

/** Which Zernio account each format posts through. */
export const FORMAT_PLATFORM = { tiktok: 'tiktok', reel: 'instagram', carousel: 'instagram', story: 'instagram' };

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

/**
 * Turn one assignment into a scheduled Zernio post.
 *
 * Each post carries a request id derived from the story, the format and the exact slot, so a
 * retry after a timeout is recognised by Zernio as the same post rather than becoming a
 * second one. Nothing here can be recalled once it publishes.
 */
export async function schedulePost(pack, slot, { accounts, store = kv, fetchFn = fetch, now = Date.now() } = {}) {
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
    mediaUrls: media,
    scheduledFor: slot.at,
    tiktok,
    requestId: requestIdFor({ contentId: pack.contentId, format: slot.format, at: slot.at }),
    fetchFn,
  });

  // A 207 is a 2xx: Zernio answers "accepted" with a platform already failed inside it.
  if (!result.ok) {
    const why = result.failed.map((f) => `${f.platform}: ${f.error ?? f.status}`).join('; ');
    throw new Error(`Zernio accepted the request but ${slot.format} did not post — ${why || 'no platform accepted'}`);
  }

  return {
    format: slot.format,
    platform,
    at: slot.at,
    zernioPostId: result.postId,
    status: result.status ?? 'scheduled',
  };
}
