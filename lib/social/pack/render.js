// lib/social/pack/render.js
// Client for the Merlows render service (the `merlows-studio` Vercel project).
//
// Rendering runs there, not here, because Remotion's Vercel path pushes the video bundle
// into the sandbox from the CALLING function's filesystem — so the caller has to be an app
// that builds a bundle at deploy time. This app deliberately has no build step.
//
// Renders are DETACHED: starting one returns a handle, and a later cron tick polls it. A
// 45-second video takes minutes; holding a function open for that would waste the budget and
// risk the 300s ceiling.

const REQUEST_TIMEOUT_MS = Number(process.env.SOCIAL_RENDER_TIMEOUT_MS) || 30_000;
/**
 * A still renders synchronously on the other side, and the FIRST one after a deploy may have
 * to create a sandbox and upload the bundle before it can draw anything. 30s was a timeout
 * on the happy path, which made the caller abandon renders it had already paid for.
 */
const STILL_TIMEOUT_MS = Number(process.env.SOCIAL_STILL_TIMEOUT_MS) || 120_000;

/** Which composition each cut uses. */
export const CUTS = {
  /** Instagram Reel: the full read. */
  reel: { composition: 'Newsflash', maxPoints: null },
  /** TikTok: capped at 3 points (~30-37s) — engagement falls away past 30s. */
  tiktok: { composition: 'Newsflash', maxPoints: 3 },
  /** Variants, used when a day has fewer fresh stories than slots. */
  threeThings: { composition: 'ThreeThings', maxPoints: 3 },
  explainer: { composition: 'Explainer', maxPoints: 3 },
  quote: { composition: 'QuoteVideo', maxPoints: 3 },
};

/** The two cuts every story produces. One list, so starting and polling cannot disagree. */
export const VIDEO_CUTS = ['reel', 'tiktok'];

/**
 * A detached render that has not finished in this long is never going to.
 *
 * It MUST sit above the worst-case poll latency, not just above the render time. Ticks are
 * ten minutes apart, so a render started seconds into one tick is not polled until the next
 * — and if this (or the service's own sandbox timeout) expires first, a video that rendered
 * perfectly is thrown away unpolled and re-rendered from scratch.
 *
 * It must also sit ABOVE the service's sandbox ceiling (~30 minutes: a 25-minute extension
 * on top of the platform default), so that a dead render is reported as `expired` by the
 * service — which is a fact — rather than guessed at from a clock here. This is the backstop
 * for a service that answers nothing at all.
 */
export const RENDER_MAX_MS = Number(process.env.SOCIAL_RENDER_MAX_MS) || 40 * 60_000;

/**
 * Will the render service accept this asset URL?
 *
 * The templates' schema refuses any host but the brand site and our own Blob, because inside
 * the sandbox those URLs are fetched by a browser. Checking it HERE as well is not
 * belt-and-braces: an asset the schema rejects fails the whole pack at composition selection,
 * losing both cuts and every still over one image. Dropped at this end, the story simply
 * renders without that one picture instead.
 *
 * DELIBERATELY HARDCODED, and it must mirror `ASSET_HOSTS` in
 * `merlows-studio/src/schema.ts`. It is tempting to read `BRAND_SITE_HOST` here, as the fact
 * guard does — but the studio's copy runs inside the render sandbox where that variable does
 * not exist, so an env override would only teach this side to pass assets the far side still
 * refuses. Change both files together, or not at all.
 */
export function isRenderableAsset(url) {
  try {
    const parsed = new URL(String(url));
    if (parsed.protocol !== 'https:') return false;
    return (
      parsed.hostname === 'merlows.com' ||
      parsed.hostname === 'www.merlows.com' ||
      parsed.hostname.endsWith('.public.blob.vercel-storage.com')
    );
  } catch {
    return false;
  }
}

const endpoint = () => {
  const base = process.env.RENDER_SERVICE_URL;
  if (!base) throw new Error('RENDER_SERVICE_URL is not configured');
  return `${base.replace(/\/$/, '')}/api/render`;
};

const authHeader = () => {
  const secret = process.env.RENDER_API_SECRET;
  if (!secret) throw new Error('RENDER_API_SECRET is not configured');
  return { Authorization: `Bearer ${secret}` };
};

async function call(url, init, fetchFn, timeoutMs = REQUEST_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { ...init, signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `render service HTTP ${res.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Start one render. Returns the handle to poll.
 *
 * `inputProps` is the social pack exactly as the templates expect it — the pack IS the
 * contract, so a story renders without any template edit.
 */
export async function startRender(pack, cut, { contentId, fetchFn = fetch } = {}) {
  const spec = CUTS[cut];
  if (!spec) throw new Error(`unknown cut: ${cut}`);
  const inputProps = spec.maxPoints ? { ...pack, maxPoints: spec.maxPoints } : { ...pack };

  const data = await call(
    endpoint(),
    {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      // The service owns the storage key and adds the random suffix; we name the story and
      // the cut. Handing it a full path let the caller write anywhere in the Blob store, and
      // the fixed name meant one leaked URL gave up every other asset for the same story.
      body: JSON.stringify({ composition: spec.composition, inputProps, storyId: contentId, name: cut }),
    },
    fetchFn,
  );
  if (!data?.sandboxId || !data?.cmdId) throw new Error('render service did not return a handle');
  // `blobPath` is the key the render will upload itself to. Kept because it is the only way
  // to tell a render that died from one whose sandbox simply expired after finishing.
  return {
    cut,
    sandboxId: data.sandboxId,
    cmdId: data.cmdId,
    blobPath: data.blobPath ?? null,
    startedAt: Date.now(),
  };
}

/**
 * Poll one render.
 *
 * Terminal stages are `done` (with the public URL), `error`, and `expired` — the last means
 * the sandbox is gone, so the file may never have uploaded. All three are treated as final;
 * only `done` produces a video.
 */
export async function pollRender(handle, { fetchFn = fetch } = {}) {
  const url = `${endpoint()}?sandboxId=${encodeURIComponent(handle.sandboxId)}&cmdId=${encodeURIComponent(handle.cmdId)}`;
  const progress = await call(url, { headers: authHeader() }, fetchFn);
  const stage = progress?.stage;
  if (stage === 'done') {
    return { done: true, url: progress.url, size: progress.size, contentType: progress.contentType };
  }
  if (stage === 'error') return { done: true, error: progress.message || 'render failed' };
  if (stage === 'expired') return { done: true, error: 'render sandbox expired before the video was uploaded' };
  return { done: false, stage, progress: progress?.overallProgress ?? 0 };
}

/**
 * The still images a story needs for Instagram: the carousel (cover, one slide per key
 * point, closing call to action) and the story card.
 *
 * Stills render in seconds, so they are synchronous — no handle, no polling.
 */
export function stillsFor(pack) {
  const slides = [{ key: 'cover', composition: 'CarouselCover', props: { kind: 'cover', slide: 0 } }];
  pack.points.forEach((_, index) => {
    slides.push({
      key: `slide-${index + 1}`,
      composition: 'CarouselPoint',
      props: { kind: 'point', slide: index },
    });
  });
  slides.push({ key: 'cta', composition: 'CarouselCta', props: { kind: 'cta', slide: 0 } });
  slides.push({ key: 'story', composition: 'StoryCard', props: { kind: 'cover', slide: 0 } });
  return slides;
}

export async function renderStill(pack, spec, { contentId, fetchFn = fetch } = {}) {
  const data = await call(
    endpoint(),
    {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'still',
        composition: spec.composition,
        inputProps: { ...pack, ...spec.props },
        storyId: contentId,
        name: spec.key,
      }),
    },
    fetchFn,
    STILL_TIMEOUT_MS,
  );
  if (!data?.url) throw new Error(`render service returned no URL for ${spec.key}`);
  return { key: spec.key, url: data.url, size: data.size };
}

/**
 * What a finished render must satisfy before it is allowed near a posting queue.
 *
 * Stated honestly: this checks what the render service reports — that a file exists, is a
 * video, and is a plausible size. It does NOT re-examine the frames. The seamless loop is
 * guaranteed structurally by the template (a static hook frame plus the crossfade tail) and
 * verified frame-by-frame by `merlows-studio/scripts/check_video.py`, which runs on real
 * renders during template work, not on every automated render.
 */
export const MIN_BYTES = Number(process.env.SOCIAL_RENDER_MIN_BYTES) || 300_000;
export const MAX_BYTES = Number(process.env.SOCIAL_RENDER_MAX_BYTES) || 95 * 1024 * 1024;

export function checkRender(result) {
  const problems = [];
  if (!result?.url || !/^https:\/\//i.test(result.url)) problems.push('no public URL');
  if (!result?.contentType || !/^video\//i.test(result.contentType)) {
    problems.push(`content type is ${result?.contentType ?? 'missing'}, not video`);
  }
  // A file far too small is a black or truncated render; far too large fails Instagram's
  // 300 MB Reel limit and wastes Blob storage.
  if (typeof result?.size !== 'number' || result.size < MIN_BYTES) {
    problems.push(`file is ${result?.size ?? 0} bytes, too small to be a finished video`);
  } else if (result.size > MAX_BYTES) {
    problems.push(`file is ${(result.size / 1024 / 1024).toFixed(1)} MB, over the limit`);
  }
  return { ok: problems.length === 0, problems };
}
