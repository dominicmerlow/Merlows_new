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
// Media: Zernio fetches our public Blob URLs itself for Instagram. TikTok is the exception and
// needs `rehostMedia` first — see the comment on that function.

const ZERNIO_API = process.env.ZERNIO_API_URL || 'https://zernio.com/api/v1';
const REQUEST_TIMEOUT_MS = Number(process.env.ZERNIO_TIMEOUT_MS) || 30_000;

/** Platforms this brand posts to. A pack never reaches anything else. */
export const ZERNIO_PLATFORMS = ['instagram', 'tiktok'];

// `apiKey` lets a caller use a different key from the posting one: comment-to-DM work runs on
// its own key (ZERNIO_DM_API_KEY, see lib/social/dm/sync.js). Omitted, it is the posting key.
function authHeader(apiKey) {
  const key = apiKey ?? process.env.ZERNIO_API_KEY;
  if (!key) throw new Error('ZERNIO_API_KEY is not configured');
  return { Authorization: `Bearer ${key}` };
}

async function zernioFetch(path, { method = 'GET', body, requestId, fetchFn = fetch, apiKey } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetchFn(`${ZERNIO_API}${path}`, {
      method,
      signal: ctrl.signal,
      headers: {
        ...authHeader(apiKey),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        // Zernio deduplicates on this. It is derived from the slot, so a retry of the SAME
        // scheduled post is recognised as the same post, while a different slot is not —
        // which is the difference between a safe retry and a double publish.
        ...(requestId ? { 'x-request-id': requestId } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    // An unreadable body is NOT an empty one. A 2xx whose body stalls past the abort, drops
    // mid-transfer, or simply is not JSON used to become `{}` and be returned as success —
    // and on a POST that is the dangerous direction, because the request LANDED: Zernio holds
    // a post we then report as having no id. So a mutating call throws, carrying the status
    // so the caller knows it reached Zernio and must not blindly retry into a second post.
    //
    // A read stays tolerant: GET and DELETE legitimately answer with an empty body, and
    // failing those would break `deleteCommentAutomation`, which expects exactly that.
    const mutating = !['GET', 'HEAD', 'DELETE'].includes(String(method).toUpperCase());
    let data;
    try {
      data = await res.json();
    } catch (err) {
      if (res.ok && mutating) {
        throw Object.assign(
          new Error(`Zernio ${method} ${path}: answered HTTP ${res.status} but its body could not be read (${err?.message ?? 'unreadable'}) — the request may have been applied`),
          { status: res.status, reachedZernio: true },
        );
      }
      data = {};
    }
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
 * The privacy levels a creator-info response actually offers, as plain strings.
 *
 * Zernio does NOT pass TikTok's `privacy_level_options` (an array of enum strings) through.
 * It normalises the list into an array of OBJECTS — `{ value, label }`, where `value` is
 * TikTok's enum and `label` is display text for a picker. Reading that array as if it held
 * strings is what produced
 *
 *     TikTok account cannot post publicly (allowed: [object Object])
 *
 * in production, blocking every TikTok post for an account that can in fact post publicly.
 *
 * Anything that is neither a string nor an object carrying a string `value` is DROPPED
 * rather than coerced, so an unrecognised shape can never read as a grant of public posting.
 * Silence here would be worse than the original bug: it would post privately and call it a
 * success.
 */
export function privacyLevelValues(info) {
  return rawPrivacyLevels(info)
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      return typeof entry?.value === 'string' ? entry.value : null;
    })
    .filter(Boolean);
}

/** The privacy-level list exactly as Zernio sent it, before any normalising. */
function rawPrivacyLevels(info) {
  if (Array.isArray(info?.privacyLevels)) return info.privacyLevels;
  if (Array.isArray(info?.privacy_level_options)) return info.privacy_level_options;
  return [];
}

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
  // The interaction toggles live under `postingLimits.interactionSettings`, as
  // `allow_comment: { enabled, required, default }` — `enabled: false` means the creator
  // switched that interaction off in the TikTok app. The flat `commentDisabled` names read
  // here before appear nowhere in a real response, so every toggle silently came back
  // `false`, i.e. "nothing is disabled", whatever the creator had actually chosen. The flat
  // names are kept only as a fallback, after the documented shape.
  const toggles = info?.postingLimits?.interactionSettings ?? {};
  const allowed = (name, legacyDisabledFlag) => {
    const toggle = toggles[name];
    if (typeof toggle?.enabled === 'boolean') return toggle.enabled;
    if (typeof toggle === 'boolean') return toggle;
    return !legacyDisabledFlag;
  };

  return {
    privacyLevels: privacyLevelValues(info),
    allowComment: allowed('allow_comment', Boolean(info?.commentDisabled ?? info?.comment_disabled)),
    allowDuet: allowed('allow_duet', Boolean(info?.duetDisabled ?? info?.duet_disabled)),
    allowStitch: allowed('allow_stitch', Boolean(info?.stitchDisabled ?? info?.stitch_disabled)),
    maxDurationSec: Number(
      info?.postingLimits?.maxVideoDurationSec ?? info?.maxVideoPostDuration_sec ?? info?.maxDurationSec ?? 0,
    ) || null,
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
  // Normalised here as well as in `creatorInfo`, not only there. `cachedCreatorInfo`
  // (lib/social/pack/schedule.js) keeps the mapped record in KV for 24 hours, so after this
  // fix ships there are still cached records holding the RAW `{value,label}` objects written
  // by the broken build. Without this call the fix would appear not to work for a day.
  const levels = privacyLevelValues(info);
  if (!levels.includes('PUBLIC_TO_EVERYONE')) {
    // Report the raw list when nothing survived normalising, so a future shape change is
    // diagnosable from one log line instead of reading "[object Object]" or "none".
    const raw = rawPrivacyLevels(info);
    const offered = levels.join(', ')
      || (raw.length ? `unrecognised shape ${JSON.stringify(raw.slice(0, 3))}` : 'none');
    throw new Error(`TikTok account cannot post publicly (allowed: ${offered})`);
  }
  // The DOCUMENTED shape (docs.zernio.com/platforms/tiktok, "Publish"), in snake_case as the
  // docs write it. What was here before — `disableComment`, `brandContentToggle` and friends —
  // is not in Zernio's schema at all, and it was sent under a key Zernio also does not read
  // (see `createPost`), so TikTok has never received any of it.
  //
  // `allow_*` is the INVERSE of the old `disable*`. Getting that backwards would switch off
  // interactions the creator wants on, which is a silent, permanent property of every post.
  const info2 = {
    allowComment: info?.allowComment ?? !(info?.commentDisabled ?? info?.comment_disabled),
    allowDuet: info?.allowDuet ?? !(info?.duetDisabled ?? info?.duet_disabled),
    allowStitch: info?.allowStitch ?? !(info?.stitchDisabled ?? info?.stitch_disabled),
  };
  return {
    privacy_level: 'PUBLIC_TO_EVERYONE',
    allow_comment: Boolean(info2.allowComment),
    allow_duet: Boolean(info2.allowDuet),
    allow_stitch: Boolean(info2.allowStitch),
    // TikTok requires BOTH on every post — the docs call them a legal requirement, and they
    // are what separates a real post from one that lands in the creator's inbox as a draft.
    content_preview_confirmed: true,
    express_consent_given: true,
  };
}

/**
 * Read a create/get response honestly.
 *
 * Returns which platforms actually accepted, which failed and why. `ok` is true only when at
 * least one platform accepted and none failed — anything else needs a person to look.
 */
/**
 * Everything on a failed platform entry we do not already read, as a short JSON string.
 *
 * Only used when the entry reports a failure and none of the known error fields is set.
 * Returns null for a healthy entry, so a successful post never carries a spurious "error".
 */
function unknownFailureDetail(entry) {
  const status = String(entry?.status ?? '').toLowerCase();
  if (!['failed', 'error', 'rejected'].includes(status)) return null;
  const { platform, name, status: _s, platformPostId, postId, url, permalink, ...rest } = entry ?? {};
  const extra = JSON.stringify(rest);
  return extra && extra !== '{}' ? `no error field; entry was ${extra.slice(0, 300)}` : 'failed with no reason given';
}

export function interpretPost(data) {
  const post = data?.post ?? data ?? {};
  const platforms = Array.isArray(post.platforms) ? post.platforms : [];
  const results = platforms.map((entry) => ({
    platform: entry.platform ?? entry.name ?? 'unknown',
    status: String(entry.status ?? '').toLowerCase(),
    postId: entry.platformPostId ?? entry.postId ?? null,
    url: entry.url ?? entry.permalink ?? null,
    // The field names here came from documentation, not from an observed failure — and the
    // first real one reported only "failed", with nothing to act on. So when none of the
    // expected names carries a reason, fall back to the entry itself (minus the fields we
    // already understand). A truncated blob of JSON is ugly; a failure with no cause is
    // worse, because the next person has to reproduce a live post to learn anything.
    error: entry.error ?? entry.message ?? entry.errorMessage ?? entry.failureReason
      ?? entry.reason ?? entry.detail ?? unknownFailureDetail(entry),
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

// ── Media rehosting, for TikTok ──────────────────────────────────────────────

/**
 * How long a presigned upload survives before Zernio deletes it.
 *
 * Zernio puts an upload in TEMPORARY storage and copies it to permanent storage only when a
 * post referencing it publishes. So the deadline is not the upload's age when the post is
 * created, it is the upload's age when the post PUBLISHES — a slot more than a week out
 * cannot use one, and scheduling it anyway produces a post that fails at publish time with
 * its media already deleted.
 */
export const UPLOAD_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Presign rejects a generic type (`application/octet-stream`) with a 400, so the type has to
// be real. Extensions come from our own Blob keys, which the studio and the voice/image steps
// name themselves, so this list only has to cover what we produce.
const MIME_BY_EXTENSION = {
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/x-m4v',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
};

const ACCEPTED_MIME = new Set(Object.values(MIME_BY_EXTENSION));

// A rehost holds the whole file in memory twice over (the fetched body and the PUT body), so
// it is capped well below the function's memory rather than at Zernio's 5 GB. Every asset we
// make is a few tens of MB; anything near this is a bug upstream, and failing loudly here is
// better than an OOM that takes the tick's other work with it.
// Read per call, not once at import: an env var captured at module scope cannot be changed
// without a redeploy, which is no use on the day a render comes back unexpectedly large.
const maxRehostBytes = () => Number(process.env.SOCIAL_MAX_REHOST_BYTES) || 100 * 1024 * 1024;

// The hosts a presigned upload URL may point at. Zernio's storage is Cloudflare R2 today.
//
// This is not paranoia about Zernio: it is that `uploadUrl` is a URL from a response body that
// we then send the whole file to, with no credential, from our egress IP. Unconstrained, a bad
// or compromised presign response turns this function into a way to push 100 MB to any host and
// port, and hands out the finished cut before it is public. A named list costs nothing and
// fails loudly the day Zernio moves storage.
const UPLOAD_HOSTS = [/\.r2\.cloudflarestorage\.com$/i, /(^|\.)zernio\.com$/i];

// The whole rehost — both transfers — must fit inside this. A caller that knows how much of
// its tick is left should pass `budgetMs` instead: the number that matters is not "long enough
// for a big file", it is "short enough that the function is never killed mid-post".
const uploadTimeoutMs = () => Number(process.env.ZERNIO_UPLOAD_TIMEOUT_MS) || 90_000;

/**
 * Run one leg of a transfer under a deadline that covers the WHOLE leg.
 *
 * It takes a function rather than a URL because the dangerous part of a download is not the
 * call, it is the body. `fetch` resolves when the response HEADERS arrive; a deadline that
 * clears its timer at that point bounds time-to-headers and nothing else, leaving
 * `arrayBuffer()` to pull a whole video with no clock on it. An earlier version of this did
 * exactly that, and the two tests written to catch it could not, because their fake never
 * resolved the fetch at all — so both only ever exercised the headers window.
 *
 * Why it matters more than an ordinary timeout: `zernioFetch` has its own 30s abort, but the
 * media legs bypass it, and undici's defaults are INACTIVITY timeouts of 300s — the same as
 * the function's own ceiling — which a slow-but-progressing transfer never trips. Unbounded,
 * a stall is not a stage failure, it is the function being KILLED, which throws nothing. So
 * `stageSchedule` never records the posts it already sent to Zernio, the next tick re-plans
 * the story into a different slot, that slot produces a different `requestIdFor`, Zernio does
 * not recognise it as a duplicate — and the story posts twice to accounts no API can delete
 * from. Aborting the signal tears down the stalled stream instead of leaking it.
 */
async function withDeadline(what, ms, fn) {
  if (!(ms > 0)) throw new Error(`${what} had no time left in the budget`);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fn(ctrl.signal);
  } catch (err) {
    if (err?.name === 'AbortError' || ctrl.signal.aborted) throw new Error(`${what} timed out after ${ms}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Drop a response body we are not going to read, so the socket is not held until GC. */
const discardBody = (res) => Promise.resolve(res?.body?.cancel?.()).catch(() => {});

/**
 * Read a response body, refusing to exceed `cap` — before the allocation, not after it.
 *
 * Three ways a file gets past a check on the declared length alone, so all three are handled
 * here rather than trusted: the source can omit `content-length`, it can lie, and it can tell
 * the truth and still blow the cap, because `content-length` counts COMPRESSED bytes and
 * undici decompresses transparently. Reading chunk by chunk is the only place all three meet.
 *
 * Falls back to `arrayBuffer()` when the response exposes no stream, which is the shape most
 * test doubles have.
 */
async function readCapped(source, cap, src) {
  const declared = Number(source.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > cap) {
    await discardBody(source);
    throw new Error(`media to upload declares ${declared} bytes, over the ${cap} cap`);
  }

  const reader = source.body?.getReader?.();
  if (!reader) {
    const buffered = Buffer.from(await source.arrayBuffer());
    if (buffered.length > cap) throw new Error(`media to upload is ${buffered.length} bytes, over the ${cap} cap`);
    return buffered;
  }

  const chunks = [];
  let total = 0;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) {
      await reader.cancel().catch(() => {});
      throw new Error(`media to upload exceeded the ${cap} cap mid-transfer: ${src.slice(0, 80)}`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}

/**
 * Parse a URL Zernio handed us, and refuse it unless it is https on a host we expect.
 *
 * `new URL` rather than a string test: a string check passes things a URL parser does not, and
 * the parsed origin is what goes in the error so a refusal says which host was offered.
 */
function allowedUploadTarget(value, what) {
  let target;
  try {
    target = new URL(String(value));
  } catch {
    throw new Error(`Zernio presign returned an unparsable ${what}`);
  }
  if (target.protocol !== 'https:' || !UPLOAD_HOSTS.some((re) => re.test(target.hostname))) {
    throw new Error(`Zernio presign returned a ${what} we will not use: ${target.origin}`);
  }
  return target;
}

/**
 * Check the URL the post will carry — https, but deliberately NOT host-restricted.
 *
 * The asymmetry with `allowedUploadTarget` is the point. We send the whole file to
 * `uploadUrl`, so an unexpected host there is a file going somewhere it should not, and a
 * strict list is worth a hard failure. `publicUrl` is only handed back to Zernio to fetch:
 * an unexpected host is at worst a broken post by a party that is already posting on our
 * behalf. The two docs-derived host patterns have never been checked against a real presign
 * response, and today's two bugs were both docs-derived shapes that were wrong — so enforcing
 * them here would risk failing 100% of TikTok posts, AFTER the upload has been paid for, to
 * guard something close to nothing. Log loudly and carry on instead, so the first live post
 * tells us the real host rather than the pack dying to protect us from Zernio's own CDN.
 */
function publicUrlTarget(value) {
  let target;
  try {
    target = new URL(String(value));
  } catch {
    throw new Error('Zernio presign returned an unparsable public URL');
  }
  if (target.protocol !== 'https:') {
    throw new Error(`Zernio presign returned a non-https public URL: ${target.origin}`);
  }
  if (!UPLOAD_HOSTS.some((re) => re.test(target.hostname))) {
    console.warn(`[zernio] presign public URL is on an unrecognised host: ${target.origin} — posting it anyway; add it to UPLOAD_HOSTS if this is Zernio's storage domain`);
  }
  return target;
}

/**
 * Copy one of our own media files into Zernio's storage and return its `media.zernio.com` URL.
 *
 * TikTok will not accept an arbitrary URL. Its Content Posting API fetches media by
 * `PULL_FROM_URL`, and the domain serving it must be verified against the calling app, so
 * handing it our `*.public.blob.vercel-storage.com` URL fails every time with
 *
 *     code 40002: Please review our URL ownership verification rules
 *
 * We cannot verify that domain — it is not ours and the app is Zernio's. Uploading through
 * `POST /v1/media/presign` puts the file on `media.zernio.com`, which Zernio HAS verified, so
 * this is the only route a TikTok post can take. Instagram has no such rule and keeps using
 * the Blob URL directly: one fewer copy of every video, and nothing to expire.
 *
 * This function itself keeps nothing: every call uploads. The CACHING lives one level up, in
 * `schedule.js` — `ensureTiktokUpload` does this when the render finishes, `uploadFor` decides
 * whether what is stored can still be used, and `schedulePost` uploads again when it cannot.
 * The risk that makes it non-trivial is real and handled there: an upload dies 7 days after it
 * is MADE, so the test is whether it survives until the post PUBLISHES, not whether it is
 * alive now. A pack archived for days and then approved is the case that distinguishes them.
 */
export async function rehostMedia(sourceUrl, { fetchFn = fetch, apiKey, filename, budgetMs } = {}) {
  const src = String(sourceUrl);
  if (!/^https:\/\//i.test(src)) throw new Error(`media URL must be https: ${src.slice(0, 60)}`);

  const name = filename ?? decodeURIComponent(new URL(src).pathname.split('/').pop() || 'asset');
  const extension = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  const cap = maxRehostBytes();

  // ONE budget for the whole rehost, not one per leg. Two 90s legs is a 180s worst case, and
  // the caller's tick has far less than that left by the time it starts a post — so a per-leg
  // deadline can be honoured exactly and the function still be killed. `budgetMs` lets the
  // caller hand down what it actually has; the env default is the fallback for callers that
  // do not know.
  // "Not given" and "given, and there is none left" are DIFFERENT, and conflating them was
  // backwards in the worst possible way: a caller down to its last second passes a budget at
  // or below zero, `budgetMs > 0` rejects it, and the old code then substituted the full 90s
  // default — handing the longest deadline of all to the caller with no time at all, which is
  // how the function gets killed mid-upload. An explicit number is honoured as given, and
  // `withDeadline` refuses outright when it is not positive.
  const ms = budgetMs === undefined || budgetMs === null ? uploadTimeoutMs() : Math.floor(Number(budgetMs));
  const deadlineAt = Date.now() + ms;
  const timeLeft = () => deadlineAt - Date.now();

  const { bytes, contentType } = await withDeadline('reading media to upload', timeLeft(), async (signal) => {
    const source = await fetchFn(src, { signal });
    if (!source.ok) {
      await discardBody(source);
      throw new Error(`could not read media to upload (HTTP ${source.status}): ${src.slice(0, 80)}`);
    }

    // Our own Blob serves a correct Content-Type; the extension is the fallback for anything
    // that does not. Neither being usable is fatal, because presign would 400 on the guess.
    const served = String(source.headers?.get?.('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const type = ACCEPTED_MIME.has(served) ? served : MIME_BY_EXTENSION[extension];
    if (!type) {
      await discardBody(source);
      throw new Error(`cannot tell Zernio what kind of file this is (served "${served || 'nothing'}", name "${name}")`);
    }

    return { bytes: await readCapped(source, cap, src), contentType: type };
  });

  if (bytes.length === 0) throw new Error(`media to upload is empty: ${src.slice(0, 80)}`);

  const presigned = await zernioFetch('/media/presign', {
    method: 'POST',
    body: { filename: name, contentType, size: bytes.length },
    fetchFn,
    apiKey,
  });
  const uploadUrl = presigned?.uploadUrl;
  const publicUrl = presigned?.publicUrl;
  if (!uploadUrl || !publicUrl) throw new Error('Zernio presign returned no upload URL');

  const target = allowedUploadTarget(uploadUrl, 'upload URL');
  const publicTarget = publicUrlTarget(publicUrl);

  // Straight to storage, so NO Authorization header — the signature in the URL is the
  // credential, and storage answers with an empty 200 and an ETag, never JSON.
  //
  // `redirect: 'error'` because a redirect is followed with the METHOD AND BODY INTACT: a 302
  // from an allowed host would carry the whole file to a host that is not on the list, which
  // is exactly what the list is for.
  const put = await withDeadline('upload to Zernio storage', timeLeft(), (signal) => fetchFn(target.href, {
    method: 'PUT',
    redirect: 'error',
    signal,
    headers: { 'Content-Type': contentType },
    body: bytes,
  }));
  // Drained on BOTH paths. The failure path is the one that matters: it is the one that
  // repeats, and this project has already lost a month of production to socket exhaustion.
  await discardBody(put);
  if (!put.ok) throw new Error(`upload to Zernio storage failed (HTTP ${put.status})`);

  // The PARSED href, not the raw string. The WHATWG parser strips tabs and newlines anywhere
  // in the input, so a raw value that passed the check is not always the value that would
  // ship — returning `.href` keeps what was validated and what is used the same text.
  return { url: publicTarget.href, contentType, bytes: bytes.length, expiresAt: Date.now() + UPLOAD_TTL_MS };
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

  // Instagram infers most of the post type from the media, and takes only the Story as an
  // explicit flag (docs.zernio.com/platforms/instagram, "Platform fields"):
  //   single video  → Reel          single image → feed post
  //   many items    → carousel      contentType: 'story' → Story
  // So only `story` sends anything. An earlier version sent `instagram: { postType }`, a
  // field name taken from the docs index rather than a response we had seen; Zernio ignored
  // it silently, which posted a Story as a permanent feed post. Unknown keys are dropped
  // without complaint, so a wrong name here fails quietly — check a real response, not the
  // HTTP status, when changing this.
  const instagramSpecific = format === 'story' ? { platformSpecificData: { contentType: 'story' } } : null;
  const body = {
    platforms: [{
      platform,
      accountId,
      ...(platform === 'instagram' && instagramSpecific ? instagramSpecific : {}),
    }],
    // TOP LEVEL, not inside the platforms entry (docs.zernio.com/platforms/tiktok: "Send
    // tiktokSettings at the top level of the request body"). It was sent as
    // `platforms[0].tiktok` — a key Zernio does not read — so the privacy level and the two
    // consent flags never arrived, and TikTok put five videos in the creator's inbox as
    // DRAFTS instead of publishing them. Zernio reports a draft as `published` with a null
    // `platformPostUrl`, so every one of them was recorded here as a success.
    //
    // That is the THIRD unknown-key bug on this API in one day, after `instagram.postType`
    // and the privacy-level objects. The lesson is the same each time: this API drops keys it
    // does not recognise without complaining, so the HTTP status proves nothing. Check a real
    // GET of the created post — a TikTok video post that worked has `isDraft` absent and
    // eventually a `platformPostUrl`.
    ...(platform === 'tiktok' && tiktok ? { tiktokSettings: tiktok } : {}),
    content: caption ?? '',
    // Reels and TikToks are video; covers, carousel slides and story cards are images.
    mediaItems: mediaUrls.map((url) => ({ type: ['tiktok', 'reel'].includes(format) ? 'video' : 'image', url })),
    scheduledFor,
    timezone: 'Europe/London',
  };

  const data = await zernioFetch('/posts', { method: 'POST', body, requestId, fetchFn });
  return interpretPost(data);
}

export async function getPost(postId, { fetchFn = fetch, apiKey } = {}) {
  return interpretPost(await zernioFetch(`/posts/${encodeURIComponent(postId)}`, { fetchFn, apiKey }));
}

export async function retryPost(postId, { requestId, fetchFn = fetch } = {}) {
  return interpretPost(
    await zernioFetch(`/posts/${encodeURIComponent(postId)}/retry`, { method: 'POST', requestId, fetchFn }),
  );
}

// ── Comment-to-DM automations ────────────────────────────────────────────────
// Zernio's own Meta app watches the comments and sends the DM; we only configure it. Build
// and check the payload in lib/social/dm/automation.js first: this adapter sends whatever it
// is given, and an automation with no keywords DMs EVERY commenter.

const automationPath = (id) => `/comment-automations/${encodeURIComponent(id)}`;

const count = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

/**
 * Read an automation the same way whichever endpoint returned it.
 *
 * The list and create responses name the counters differently (`dmsSent` vs `totalSent`).
 * `delivered` is deliberately dropped: Instagram sends no delivery receipt, so any
 * delivered figure for it is invented. Judge a funnel on reads and clicks.
 */
export function interpretAutomation(raw) {
  const a = raw?.automation ?? raw ?? {};
  const s = a.stats ?? {};
  return {
    id: a.id ?? a._id ?? null,
    name: a.name ?? null,
    // Live unless Zernio says it is paused. Every automation is created active, so a missing
    // field must not read as "paused": the collision check skips paused automations.
    isActive: a.isActive !== false,
    trigger: a.trigger ?? null,
    platformPostId: a.platformPostId ?? null,
    postId: a.postId ?? null,
    keywords: Array.isArray(a.keywords) ? a.keywords : [],
    matchMode: a.matchMode ?? null,
    stats: {
      triggered: count(s.triggered ?? s.totalTriggered),
      sent: count(s.dmsSent ?? s.totalSent),
      failed: count(s.dmsFailed ?? s.totalFailed),
      read: count(s.read),
      linkClicks: count(s.linkClicks),
      uniqueContacts: count(s.uniqueContacts),
    },
  };
}

/**
 * Create a comment automation. A second active automation on the same post is a 409, which
 * arrives as an error with `status: 409` — the caller decides whether that means "already done".
 *
 * CALLING THIS IS GOING LIVE. Zernio creates every automation ACTIVE, whatever `isActive` the
 * payload carries (the Z1 spike sent `isActive: false` and got an active automation back): from
 * that moment, matching comments get real DMs. There is no inactive create. Pausing is a second
 * call, updateCommentAutomation(id, { isActive: false }), made after this one.
 */
export async function createCommentAutomation(payload, { requestId, fetchFn = fetch, apiKey } = {}) {
  const data = await zernioFetch('/comment-automations', { method: 'POST', body: payload, requestId, fetchFn, apiKey });
  return interpretAutomation(data);
}

/** Partial update, e.g. `{ isActive: false }` to pause one: the only way to switch one off short of deleting it. */
export async function updateCommentAutomation(id, patch, { fetchFn = fetch, apiKey } = {}) {
  if (!id) throw new Error('automation id is required');
  return interpretAutomation(await zernioFetch(automationPath(id), { method: 'PATCH', body: patch, fetchFn, apiKey }));
}

export async function deleteCommentAutomation(id, { fetchFn = fetch, apiKey } = {}) {
  if (!id) throw new Error('automation id is required');
  await zernioFetch(automationPath(id), { method: 'DELETE', fetchFn, apiKey });
  return { id, deleted: true };
}

/** Every automation on the profile. Omitting profileId lists across ALL profiles on the key. */
export async function listCommentAutomations({ profileId, fetchFn = fetch, apiKey } = {}) {
  const query = profileId ? `?profileId=${encodeURIComponent(profileId)}` : '';
  const data = await zernioFetch(`/comment-automations${query}`, { fetchFn, apiKey });
  return (Array.isArray(data?.automations) ? data.automations : []).map(interpretAutomation);
}

const LOG_STATUSES = ['pending', 'sent', 'failed', 'skipped', 'gated'];

/**
 * One page of the comments that triggered an automation. Entries are passed through as
 * Zernio sends them: their field names are not documented, so nothing downstream should
 * depend on them until the Z1 spike has recorded a real response.
 */
export async function getCommentAutomationLogs(id, { status, limit = 50, skip = 0, fetchFn = fetch, apiKey } = {}) {
  if (!id) throw new Error('automation id is required');
  if (status && !LOG_STATUSES.includes(status)) throw new Error(`unknown log status: ${status}`);
  const params = new URLSearchParams({
    limit: String(Math.min(200, Math.max(1, Math.trunc(Number(limit)) || 50))),
    skip: String(Math.max(0, Math.trunc(Number(skip)) || 0)),
  });
  if (status) params.set('status', status);
  const data = await zernioFetch(`${automationPath(id)}/logs?${params}`, { fetchFn, apiKey });
  const logs = data?.logs ?? data?.data ?? [];
  return {
    logs: Array.isArray(logs) ? logs : [],
    total: Number.isFinite(Number(data?.total ?? data?.pagination?.total)) ? Number(data?.total ?? data?.pagination?.total) : null,
    misses: data?.misses ?? null,
  };
}
