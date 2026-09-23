// lib/social/handlers/zernio-webhook.js
// Zernio's callbacks: a post published, a post failed, a TikTok URL resolved late, or an
// account disconnected.
//
// The HMAC is the only credential on this route. There is no session and no cron secret —
// anyone on the internet can reach it — so a verification that is merely approximate is the
// same as no verification at all. Two consequences shape this file:
//
//   1. The signature covers the EXACT bytes Zernio sent. `JSON.stringify(JSON.parse(raw))`
//      is not those bytes: it reorders nothing but it does drop insignificant whitespace and
//      normalises numbers (`1.50` becomes `1.5`), so a re-serialised body verifies only by
//      luck. The raw stream is read here and parsed only after the signature checks out.
//   2. `for await (const chunk of req)` returns an EMPTY buffer on Vercel's Node runtime and
//      does not throw. The platform drains the stream before the handler runs and replays it
//      through a PassThrough that rewires `on('data')`/`on('end')` but not `'readable'`,
//      which is what async iteration uses. An empty body would then be signed and compared
//      against itself. `readRawBody` uses the events, and an empty body is refused outright.

import { createHmac, timingSafeEqual } from 'crypto';
import { kv } from '../../kv.js';
import { getPack, savePack } from '../pack/store.js';

/** Events older than this are forgotten; Zernio retries well inside it. */
const SEEN_TTL_SECONDS = 24 * 60 * 60;
const SEEN_KEY = (eventId) => `social:zernio:event:${eventId}`;

/**
 * The exact bytes of the request body.
 *
 * `req.on('data')` — never `for await` — for the reason in the header comment. This is also
 * correct when the request arrives with no `content-type`, where the platform leaves the
 * original stream untouched and the same listeners work.
 */
export function readRawBody(req, { timeoutMs = 5_000, maxBytes = 1_000_000 } = {}) {
  return new Promise((resolve, reject) => {
    // An already-ended stream emits nothing: 'end' has fired and never fires again. Without
    // this the promise simply never settles, and because the route is unauthenticated that
    // is 300 seconds of billed compute per anonymous request, repeatable in a loop.
    if (req.readableEnded) return reject(new Error('request stream already consumed'));
    const timer = setTimeout(() => reject(new Error('timed out reading body')), timeoutMs);
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buf.length;
      if (size > maxBytes) {
        clearTimeout(timer);
        reject(new Error('body too large'));
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => { clearTimeout(timer); resolve(Buffer.concat(chunks)); });
    req.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

/**
 * A URL we are willing to store and later render as a link.
 *
 * The outbound side already refuses anything but https; the inbound side did not, so a
 * `javascript:` URL from the webhook was stored and emitted into an `href` on the board —
 * executing in the session of whichever admin clicked it.
 */
export const safeUrl = (value) => {
  try {
    return new URL(String(value)).protocol === 'https:' ? String(value) : null;
  } catch {
    return null;
  }
};

/**
 * Constant-time signature check over the raw body.
 *
 * Accepts a bare hex digest or a `sha256=` prefixed one, because senders differ and a
 * mismatch here fails closed in a way that is very hard to diagnose from the outside.
 */
export function verifySignature(raw, header, secret) {
  if (!secret) return { ok: false, reason: 'ZERNIO_WEBHOOK_SECRET is not configured' };
  if (!raw?.length) return { ok: false, reason: 'empty body' };
  const provided = String(header ?? '').trim().replace(/^sha256=/i, '');
  if (!/^[0-9a-f]+$/i.test(provided)) return { ok: false, reason: 'missing or malformed signature' };

  const expected = createHmac('sha256', secret).update(raw).digest();
  let given;
  try {
    given = Buffer.from(provided, 'hex');
  } catch {
    return { ok: false, reason: 'malformed signature' };
  }
  // timingSafeEqual throws on a length mismatch, which would itself be an oracle.
  if (given.length !== expected.length) return { ok: false, reason: 'signature length mismatch' };
  return timingSafeEqual(given, expected) ? { ok: true } : { ok: false, reason: 'signature mismatch' };
}

/**
 * Apply one event to the pack it belongs to. Unknown events are acknowledged and ignored.
 *
 * Reads and writes through the shared `kv` singleton by way of `getPack`/`savePack`, which
 * is what tests patch. It deliberately takes no injectable store: it had one, it was never
 * threaded through to either of those calls, and an option that silently does nothing is
 * worse than no option — a test could pass against a store the code never touched.
 */
export async function applyEvent(event) {
  const type = String(event?.type ?? event?.event ?? '');
  const zernioPostId = event?.data?.postId ?? event?.postId ?? null;
  const contentId = event?.data?.metadata?.contentId ?? event?.data?.contentId ?? null;

  if (type === 'account.disconnected') {
    const account = event?.data?.accountId ?? 'unknown';
    // Nothing to patch on a pack: this stops EVERY future post, so it is an alert, not a
    // record update. The daily health check also covers it; this is the fast path.
    console.error(`[zernio] account ${account} disconnected — posting will fail until it is reconnected`);
    return { handled: true, type };
  }

  // Find the pack by content id when given, otherwise by the post id we recorded.
  const pack = contentId ? await getPack(contentId) : await findPackByPostId(zernioPostId);
  if (!pack) return { handled: false, type, reason: 'no matching pack' };

  const posts = [...(pack.posts ?? [])];
  // `zernioPostId &&` matters: without it a null id matches the first post recorded with a
  // null id, letting an event with no post id patch an unrelated post.
  const index = posts.findIndex((p) => zernioPostId && p.zernioPostId === zernioPostId);
  if (index < 0) return { handled: false, type, reason: 'no matching post on the pack' };

  if (type === 'post.platform.published') {
    posts[index] = {
      ...posts[index],
      status: 'published',
      url: safeUrl(event?.data?.url) ?? posts[index].url ?? null,
      publishedAt: new Date().toISOString(),
    };
  } else if (type === 'post.platform.failed') {
    posts[index] = {
      ...posts[index],
      status: 'failed',
      error: String(event?.data?.error ?? 'failed').slice(0, 200),
    };
    console.error(`[zernio] ${pack.contentId} ${posts[index].format} failed: ${posts[index].error}`);
  } else if (type === 'post.tiktok.url_resolved') {
    // TikTok hands back the watchable URL minutes after publishing, so it arrives separately.
    posts[index] = { ...posts[index], url: safeUrl(event?.data?.url) ?? posts[index].url ?? null };
  } else {
    return { handled: false, type, reason: 'unhandled event type' };
  }

  await savePack({ ...pack, posts });
  return { handled: true, type, contentId: pack.contentId };
}

/** Last resort when an event carries no content id: scan the recent board. */
async function findPackByPostId(zernioPostId) {
  if (!zernioPostId) return null;
  const { listPacks } = await import('../pack/store.js');
  const packs = await listPacks(100).catch(() => []);
  return packs.find((pack) => (pack.posts ?? []).some((p) => p.zernioPostId === zernioPostId)) ?? null;
}

/**
 * The route.
 *
 * Always answers 2xx once the signature is valid, including for events it does not handle:
 * Zernio retries on a non-2xx, and retrying an event we will never understand is noise that
 * buries the ones we do.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let raw;
  try {
    raw = await readRawBody(req);
  } catch {
    return res.status(400).json({ error: 'Could not read body' });
  }

  const check = verifySignature(raw, req.headers?.['x-zernio-signature'], process.env.ZERNIO_WEBHOOK_SECRET);
  if (!check.ok) {
    // 503 when we are misconfigured, 401 when the caller is wrong — never fall open.
    const unconfigured = check.reason.includes('not configured');
    console.warn(`[zernio] webhook rejected: ${check.reason}`);
    return res.status(unconfigured ? 503 : 401).json({ error: unconfigured ? check.reason : 'Unauthorized' });
  }

  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Body is not JSON' });
  }

  // Deduplicate: Zernio retries, and applying "published" twice is harmless but applying a
  // failure twice would overwrite a later success.
  const eventId = req.headers?.['x-zernio-event-id'] ?? event?.id ?? null;
  if (eventId) {
    const key = SEEN_KEY(String(eventId).slice(0, 120));
    const seen = await kv.get(key).catch(() => null);
    if (seen) return res.status(200).json({ ok: true, duplicate: true });
    await kv.set(key, { at: Date.now() }, { ex: SEEN_TTL_SECONDS }).catch(() => undefined);
  }

  try {
    const outcome = await applyEvent(event);
    return res.status(200).json({ ok: true, ...outcome });
  } catch (err) {
    // Still 2xx: the signature was good and the event is recorded as seen, so a retry would
    // be deduplicated anyway. Log it and move on rather than inviting a retry storm.
    console.error('[zernio] webhook handler failed:', err.message);
    return res.status(200).json({ ok: false, error: 'handler error' });
  }
}
