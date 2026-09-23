// lib/wp-media.js
// Shared WordPress media-library uploader. Accepts either an http(s) image URL
// or a base64 `data:` URI and sideloads the binary into WP's media library.
//
// Why this exists: AI hero-image generation (OpenRouter) returns the image as a
// multi-MB base64 `data:` URI. Storing that directly on the content record blows
// up KV (each record ~1–2.5 MB) and eventually trips the Upstash capacity quota,
// which then makes EVERY write — including approvals — fail. Uploading the image
// to WP at generation time and persisting only the returned hosted URL keeps
// content records small (~6 KB) and is where the image ends up at publish anyway.
//
// Returns { id, url } on success (url = WP media `source_url`), or null on any
// failure — callers treat a null as "no hero" and fall back to the category image.

function wpAuthHeader() {
  const credentials = Buffer.from(
    `${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`
  ).toString('base64');
  return `Basic ${credentials}`;
}

function wpSiteUrl() {
  return (process.env.WP_SITE_URL ?? '').trim().replace(/\/$/, '');
}

// Resolve an image source (http(s) URL or data: URI) to { buffer, contentType }.
async function loadImageBinary(imageSource) {
  if (typeof imageSource === 'string' && imageSource.startsWith('data:')) {
    // data:image/png;base64,AAAA...  — decode without a network round-trip.
    const match = imageSource.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
    if (!match) return null;
    const contentType = match[1] || 'image/jpeg';
    const isBase64 = !!match[2];
    const buffer = isBase64
      ? Buffer.from(match[3], 'base64')
      : Buffer.from(decodeURIComponent(match[3]), 'utf8');
    return { buffer, contentType };
  }
  const resp = await fetch(imageSource, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MerlowsBot/1.0; +https://merlows.com)',
      'Accept': 'image/*',
    },
    redirect: 'follow',
  });
  if (!resp.ok) {
    console.warn(`[wp-media] image fetch failed ${resp.status}: ${String(imageSource).slice(0, 80)}`);
    return null;
  }
  const contentType = resp.headers.get('content-type') || 'image/jpeg';
  if (!contentType.startsWith('image/')) {
    console.warn(`[wp-media] non-image content-type: ${contentType}`);
    return null;
  }
  return { buffer: Buffer.from(await resp.arrayBuffer()), contentType };
}

export async function uploadImageToWp(imageSource, postTitle, opts = {}) {
  try {
    if (!imageSource) return null;
    const siteUrl    = opts.siteUrl    ?? wpSiteUrl();
    const authHeader = opts.authHeader ?? wpAuthHeader();
    if (!siteUrl) return null;

    const loaded = await loadImageBinary(imageSource);
    if (!loaded) return null;
    const { buffer, contentType } = loaded;

    const ext  = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const slug = (postTitle || 'hero').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const filename = `${slug}-hero.${ext}`;

    const mediaResp = await fetch(`${siteUrl}/wp-json/wp/v2/media`, {
      method: 'POST',
      headers: {
        'Authorization':       authHeader,
        'Content-Type':        contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
      body: buffer,
    });
    if (!mediaResp.ok) {
      const err = await mediaResp.text();
      console.warn(`[wp-media] WP media upload failed ${mediaResp.status}: ${err.slice(0, 200)}`);
      return null;
    }
    const media = await mediaResp.json();
    if (!media.id) return null;
    return { id: media.id, url: media.source_url || null };
  } catch (err) {
    console.warn(`[wp-media] upload error: ${err.message}`);
    return null;
  }
}
