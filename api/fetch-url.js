/**
 * Server-side URL fetcher — avoids all CORS issues that plague public proxies.
 * GET /api/fetch-url?url=https://...
 *
 * Runs on the Vercel Edge runtime so it does NOT count toward the Hobby
 * 12 serverless-function limit. Uses only Web-standard APIs (Request/Response,
 * fetch, URL) — no Node-only modules.
 */
export const config = { runtime: 'edge' };

function json(obj, status = 200, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) },
  });
}

export default async function handler(request) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const url = new URL(request.url).searchParams.get('url');
  if (!url) return json({ error: 'url parameter required' }, 400);

  // Basic URL validation
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
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return json({ error: `Remote server returned ${response.status} ${response.statusText}` }, response.status);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/xhtml')) {
      return json({ error: `Unsupported content type: ${contentType}` }, 415);
    }

    const html = await response.text();
    return json({ contents: html, status: response.status, url: parsed.href }, 200);
  } catch (err) {
    return json({ error: 'Fetch failed: ' + err.message }, 500);
  }
}
