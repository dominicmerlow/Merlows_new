// lib/social/platforms/zernio.js
// Adapter for Zernio (formerly getlate.dev), which fronts Instagram and TikTok for us.
//
// Two things about this API shape the whole module:
//
//   1. A 207 is a 2xx. Zernio answers "accepted" while one platform inside the request has
//      already failed, so `res.ok` is not the answer — the per-platform status is. Treating
//      a 207 as success is how half a day's posts go missing without a single error.
//   2. Nothing here can be undone. Neither Instagram nor TikTok lets the API delete a post,
//      so a bad publish has to be removed by hand in the app. Everything below prefers
//      refusing to post over posting something it is unsure about.
//
// No media upload: Zernio fetches our public Blob URLs itself.

const ZERNIO_API = process.env.ZERNIO_API_URL || 'https://zernio.com/api/v1';
const REQUEST_TIMEOUT_MS = Number(process.env.ZERNIO_TIMEOUT_MS) || 30_000;

/** Platforms this brand posts to. A pack never reaches anything else. */
export const ZERNIO_PLATFORMS = ['instagram', 'tiktok'];

function authHeader() {
  const key = process.env.ZERNIO_API_KEY;
  if (!key) throw new Error('ZERNIO_API_KEY is not configured');
  return { Authorization: `Bearer ${key}` };
}

async function zernioFetch(path, { method = 'GET', body, requestId, fetchFn = fetch } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetchFn(`${ZERNIO_API}${path}`, {
      method,
      signal: ctrl.signal,
      headers: {
        ...authHeader(),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        // Zernio deduplicates on this. It is derived from the slot, so a retry of the SAME
        // scheduled post is recognised as the same post, while a different slot is not —
        // which is the difference between a safe retry and a double publish.
        ...(requestId ? { 'x-request-id': requestId } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data?.error || data?.message || `HTTP ${res.status}`;
      throw Object.assign(new Error(`Zernio ${method} ${path}: ${message}`), { status: res.status, data });
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The id Zernio deduplicates on.
 *
 * Deterministic for one story in one format in one slot, and different for anything else, so
 * that re-sending after a timeout cannot create a second post while a genuinely new slot
 * always can.
 */
export const requestIdFor = ({ contentId, format, at }) => `merlows-${contentId}-${format}-${at}`;

/**
 * What TikTok will accept for this account today.
 *
 * `privacy_level` cannot be guessed: TikTok rejects a value the creator is not allowed to
 * use, and an unaudited app can only post privately. The caller caches this daily.
 */
export async function creatorInfo(accountId, { fetchFn = fetch } = {}) {
  const info = await zernioFetch(
    `/accounts/${encodeURIComponent(accountId)}/tiktok/creator-info?mediaType=video`,
    { fetchFn },
  );
  return {
    privacyLevels: info?.privacyLevels ?? info?.privacy_level_options ?? [],
    commentDisabled: Boolean(info?.commentDisabled ?? info?.comment_disabled),
    duetDisabled: Boolean(info?.duetDisabled ?? info?.duet_disabled),
    stitchDisabled: Boolean(info?.stitchDisabled ?? info?.stitch_disabled),
    maxDurationSec: Number(info?.maxVideoPostDuration_sec ?? info?.maxDurationSec ?? 0) || null,
  };
}

/**
 * TikTok post settings, refusing rather than guessing.
 *
 * If the account cannot post publicly, this throws. A private post is not a lesser version
 * of what was asked for — it is a video nobody sees, recorded as a success, against a daily
 * posting quota.
 */
export function tiktokSettings(info) {
  if (!info?.privacyLevels?.includes('PUBLIC_TO_EVERYONE')) {
    throw new Error(`TikTok account cannot post publicly (allowed: ${info?.privacyLevels?.join(', ') || 'none'})`);
  }
  return {
    privacyLevel: 'PUBLIC_TO_EVERYONE',
    disableComment: Boolean(info.commentDisabled),
    disableDuet: Boolean(info.duetDisabled),
    disableStitch: Boolean(info.stitchDisabled),
    // Both consent flags are required by TikTok for content posted through an API.
    brandContentToggle: false,
    brandOrganicToggle: false,
  };
}

/**
 * Read a create/get response honestly.
 *
 * Returns which platforms actually accepted, which failed and why. `ok` is true only when at
 * least one platform accepted and none failed — anything else needs a person to look.
 */
export function interpretPost(data) {
  const post = data?.post ?? data ?? {};
  const platforms = Array.isArray(post.platforms) ? post.platforms : [];
  const results = platforms.map((entry) => ({
    platform: entry.platform ?? entry.name ?? 'unknown',
    status: String(entry.status ?? '').toLowerCase(),
    postId: entry.platformPostId ?? entry.postId ?? null,
    url: entry.url ?? entry.permalink ?? null,
    error: entry.error ?? entry.message ?? null,
  }));
  const failed = results.filter((r) => ['failed', 'error', 'rejected'].includes(r.status));
  const accepted = results.filter((r) => !['failed', 'error', 'rejected'].includes(r.status));
  return {
    postId: post.id ?? post._id ?? data?.id ?? null,
    status: String(post.status ?? '').toLowerCase() || null,
    results,
    accepted,
    failed,
    ok: failed.length === 0 && accepted.length > 0,
  };
}

/**
 * Schedule one post.
 *
 * `scheduledFor` is an ISO instant; Zernio holds it and publishes at that moment, so a cron
 * tick that runs at 09:03 can still fill a 17:00 slot. `accounts` are Zernio account ids.
 */
export async function createPost({
  accountId,
  platform,
  // reel | carousel | story | tiktok. NOT the same thing as the platform, and the
  // difference is not cosmetic: on Instagram a Story disappears in 24 hours and a feed post
  // is permanent. Without it every Story slot posted as a permanent feed post, because the
  // request said only "instagram" and nothing downstream could infer the rest.
  format,
  caption,
  mediaUrls,
  scheduledFor,
  tiktok,
  requestId,
  fetchFn = fetch,
}) {
  if (!ZERNIO_PLATFORMS.includes(platform)) throw new Error(`Unsupported Zernio platform: ${platform}`);
  if (!Array.isArray(mediaUrls) || mediaUrls.length === 0) throw new Error('a post needs at least one media URL');
  // Every asset is a public HTTPS URL that Zernio fetches. A relative path or a data URI
  // would be accepted here and fail inside Zernio, long after we stopped watching.
  for (const url of mediaUrls) {
    if (!/^https:\/\//i.test(String(url))) throw new Error(`media URL must be https: ${String(url).slice(0, 60)}`);
  }

  // ⚠ VERIFY against the live Zernio schema before the first real post, the same way the
  // Composio tool slugs were: the FIELD NAME for the Instagram post type is taken from the
  // docs, not from a response we have seen. That the format must be sent is not in doubt;
  // what Zernio calls it is. A wrong name here means a Story posts as a permanent feed post.
  const instagramPostType = { reel: 'reel', story: 'story', carousel: 'carousel' }[format] ?? 'post';
  const body = {
    platforms: [{
      platform,
      accountId,
      ...(platform === 'instagram' ? { instagram: { postType: instagramPostType } } : {}),
      ...(platform === 'tiktok' && tiktok ? { tiktok } : {}),
    }],
    content: caption ?? '',
    // Reels and TikToks are video; covers, carousel slides and story cards are images.
    mediaItems: mediaUrls.map((url) => ({ type: ['tiktok', 'reel'].includes(format) ? 'video' : 'image', url })),
    scheduledFor,
    timezone: 'Europe/London',
  };

  const data = await zernioFetch('/posts', { method: 'POST', body, requestId, fetchFn });
  return interpretPost(data);
}

export async function getPost(postId, { fetchFn = fetch } = {}) {
  return interpretPost(await zernioFetch(`/posts/${encodeURIComponent(postId)}`, { fetchFn }));
}

export async function retryPost(postId, { requestId, fetchFn = fetch } = {}) {
  return interpretPost(
    await zernioFetch(`/posts/${encodeURIComponent(postId)}/retry`, { method: 'POST', requestId, fetchFn }),
  );
}
