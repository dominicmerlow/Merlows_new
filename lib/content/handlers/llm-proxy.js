// lib/content/handlers/llm-proxy.js
// POST /api/content/llm-proxy — the browser's OpenRouter chat calls, made server-side.
//
// Why this exists: index.html used to ship a hardcoded OpenRouter key so the manual
// Generator, Compare and social post writer could call OpenRouter straight from the
// browser. index.html is a static file behind only a client-side login overlay, so
// anyone could read that key from the page source. Routing through here keeps the key
// in OPENROUTER_API_KEY and requires a signed-in session. A user who saved their own
// key in the API Key panel still calls OpenRouter directly with it (see llmFetch in
// index.html), so this route only ever spends the server's key.
//
// Any signed-in role may use it: the Generator is open to every role, and before this
// route the built-in key was available to anyone who could load the page.

import { getCurrentUser } from '../../auth.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
// Only these request fields are forwarded; anything else in the body is dropped.
const PASSTHROUGH_FIELDS = ['model', 'messages', 'stream', 'max_tokens', 'temperature', 'top_p'];
// Under the content catch-all's 300s maxDuration, so the function answers before Vercel kills it.
const UPSTREAM_TIMEOUT_MS = Number(process.env.LLM_PROXY_TIMEOUT_MS) || 280000;

export function buildUpstreamPayload(body) {
  if (!body || typeof body !== 'object') return null;
  if (typeof body.model !== 'string' || !body.model.trim()) return null;
  if (!Array.isArray(body.messages) || body.messages.length === 0) return null;
  const payload = {};
  for (const field of PASSTHROUGH_FIELDS) {
    if (body[field] !== undefined) payload[field] = body[field];
  }
  return payload;
}

// Errors use OpenRouter's own `{ error: { message } }` shape, so the browser code that
// already parses OpenRouter errors shows these messages unchanged.
function fail(res, status, message) {
  return res.status(status).json({ error: { message } });
}

export default async function handler(req, res, { fetchFn = fetch, getUser = getCurrentUser } = {}) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');

  const me = await getUser(req);
  if (!me) return fail(res, 401, 'Your session has expired. Sign in again to generate.');

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return fail(res, 503, 'OPENROUTER_API_KEY is not configured on this deployment');

  const payload = buildUpstreamPayload(req.body);
  if (!payload) return fail(res, 400, 'model and messages are required');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetchFn(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://merlows.vercel.app',
        'X-Title': 'Merlows Content Generator',
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });

    // A 401/403 from OpenRouter means the SERVER key was rejected. Passing it through
    // would read in the browser as "you are signed out" (this route's own 401), so it
    // becomes a 502 that names the real problem.
    if (upstream.status === 401 || upstream.status === 403) {
      return fail(res, 502, `The server's OpenRouter key was rejected (HTTP ${upstream.status}). Check OPENROUTER_API_KEY.`);
    }

    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    if (!upstream.body) return res.end();

    // Pass bytes through as they arrive, so a streamed (SSE) generation still
    // renders token by token in the Generator instead of all at once at the end.
    const reader = upstream.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    return res.end();
  } catch (err) {
    const message = err?.name === 'AbortError'
      ? `OpenRouter did not finish within ${Math.round(UPSTREAM_TIMEOUT_MS / 1000)}s`
      : `OpenRouter request failed: ${err?.message || 'unknown error'}`;
    if (!res.headersSent) return fail(res, 502, message);
    // Mid-stream failure: headers are gone, so just close; the client sees a truncated stream.
    console.error('[llm-proxy]', message);
    return res.end();
  } finally {
    clearTimeout(timer);
  }
}
