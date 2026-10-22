// lib/social/pack/image-client.js
// Generate one image and put it somewhere the renderer can fetch it.
//
// `lib/social/media.js` already knows how to call the image models (chain, fallbacks,
// timeouts, budget) and returns a base64 `data:` URI. That is fine for the WordPress hero,
// which goes straight into the media library, but a data URI is useless to a renderer
// running in a sandbox — so this wraps that call and lands the bytes in Blob.

import { generateWithFallback, socialOpenRouterKey } from '../media.js';
import { isRenderableAsset } from './render.js';

/** Data URIs can be megabytes; this is the ceiling before a store is refused. */
const MAX_BYTES = Number(process.env.SOCIAL_IMAGE_MAX_BYTES) || 8 * 1024 * 1024;

/** `data:image/png;base64,...` → bytes + content type. Rejects anything else. */
export function decodeDataUri(uri) {
  const match = /^data:(image\/[a-z+.-]+);base64,([\s\S]+)$/i.exec(String(uri ?? ''));
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_BYTES) return null;
  return { buffer, contentType: match[1] };
}

/**
 * Generate an image and return a public URL for it.
 *
 * A model that returns a hosted URL rather than a data URI is passed through only if the
 * renderer would accept it, which in practice means never: the templates' schema allows the
 * brand site and our own Blob, and a model's own CDN is neither. Returning it anyway put an
 * off-host `src` into the pack, where zod refuses it at composition selection and takes down
 * both cuts and every still — the whole story's spend over one picture. Throwing here costs
 * that one slide, which keeps the hero instead.
 */
export async function generateWithFallbackPublic(prompt, { aspectRatio = '9:16', pathId, name, putFn, onCharge } = {}) {
  const { url } = await generateWithFallback(prompt, aspectRatio, undefined, { onCharge, apiKey: socialOpenRouterKey() });
  const decoded = decodeDataUri(url);
  if (!decoded) {
    if (isRenderableAsset(url)) return url;
    if (/^https?:\/\//i.test(url)) {
      throw new Error('image model returned a URL the renderer will not fetch (host not allowed)');
    }
    throw new Error('image model returned neither a usable data URI nor an HTTPS URL');
  }
  // Lazy import: npm install cannot complete on the Drive volume, so tests inject putFn.
  const put = putFn ?? (await import('@vercel/blob')).put;
  const extension = decoded.contentType.includes('png') ? 'png' : 'jpg';
  const blob = await put(`social/${pathId}/${name}.${extension}`, decoded.buffer, {
    access: 'public',
    contentType: decoded.contentType,
    addRandomSuffix: true, // unguessable, like the voice clips
  });
  return blob.url;
}
