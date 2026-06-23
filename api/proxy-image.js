/**
 * Server-side image proxy — fetches an external image and pipes it back,
 * avoiding CORS issues when the browser needs to embed images as data URLs.
 * GET /api/proxy-image?url=https://...
 *
 * Runs on the Vercel Edge runtime so it does NOT count toward the Hobby
 * 12 serverless-function limit. Uses only Web-standard APIs — the response
 * body is streamed back as an ArrayBuffer (no Node Buffer).
 */
export const config = { runtime: 'edge' };

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async function handler(request) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const url = new URL(request.url).searchParams.get('url');
  if (!url) return json({ error: 'url parameter required' }, 400);

  let parsed;
  try {
    parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return json({ error: 'Only http/https URLs are supported' }, 400);
    }
  } catch {
    return json({ error: 'Invalid URL' }, 400);
  }

  try {
    const response = await fetch(parsed.href, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MerlowsBot/1.0; +https://merlows.com)',
        'Accept': 'image/*,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return json({ error: `Remote server returned ${response.status} ${response.statusText}` }, response.status);
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return json({ error: `Not an image: ${contentType}` }, 415);
    }

    const body = await response.arrayBuffer();
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return json({ error: 'Fetch failed: ' + err.message }, 500);
  }
}
