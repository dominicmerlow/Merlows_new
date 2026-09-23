// lib/content/handlers/gh-data.js
// GET|PUT /api/content/gh-data — the browser's GitHub data store (prompt library,
// archive, reports, custom categories), read and written server-side.
//
// Why this exists: index.html used to ship a GitHub token (disguised as a
// String.fromCharCode list) so the page could call the GitHub Contents API directly.
// index.html is public, and so is the repo, so the token was readable by anyone and
// was eventually revoked, which surfaced in the UI as "Sync failed — using cache".
// Routing through here keeps the token in GITHUB_TOKEN and requires a signed-in session.
//
// Any signed-in role may read, and may write the archive (reviews) and reports
// (comparisons), which every role saves from the Generator. Prompts and custom
// categories are writable by admin/content only, matching the UI.
//
//   GET  ?path=data/<cat>/<type>.json        → { content, sha }  (404 → { content: [], sha: null })
//   PUT  { path, content, sha?, message? }   → { sha }

import { getCurrentUser, requireRole } from '../../auth.js';

const GH_API = 'https://api.github.com';
const REPO = process.env.GH_DATA_REPO || 'dominicmerlow/Merlows_new';
const BRANCH = process.env.GH_DATA_BRANCH || 'ContentGenerator';
const UPSTREAM_TIMEOUT_MS = 20000;

// Only the files the page actually uses. Anything else in the repo stays out of reach.
// Built-in category ids are kebab-case; custom ones are `cat_<timestamp>` (index.html).
const PATH_RE = /^data\/(?:[a-z0-9]+(?:[-_][a-z0-9]+)*\/(?:reviews|prompts|comparisons)|config\/custom-categories)\.json$/;

export function isAllowedPath(path) {
  return typeof path === 'string' && PATH_RE.test(path);
}

// Prompts and custom categories are edited only by admin/content in the UI, so the
// server enforces the same. Reviews (archive) and comparisons (reports) are saved from
// the Generator, which every role can use.
const CONTENT_PLUS_PATH_RE = /(?:\/prompts|\/custom-categories)\.json$/;

export function needsContentRole(path) {
  return CONTENT_PLUS_PATH_RE.test(path);
}

// index.html interpolates each record's `id` into innerHTML/onclick unescaped, and every
// signed-in browser loads these files at boot. Restricting ids to a plain token keeps a
// written file from carrying markup into another user's session. Real ids are
// `p_<ts>`, `r_<ts>`, `cat_<ts>` or kebab-case category ids.
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

export function isValidContent(content) {
  return Array.isArray(content) && content.every(
    e => e && typeof e === 'object' && !Array.isArray(e) && typeof e.id === 'string' && SAFE_ID.test(e.id)
  );
}

function fail(res, status, message) {
  return res.status(status).json({ error: message });
}

function ghHeaders(token) {
  return {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'MerlowsBot/1.0; +https://merlows.com',
  };
}

// GitHub 401/403 means the SERVER token is bad. Passing it through would read in the
// browser as "you are signed out" (this route's own 401), so it becomes a 502.
function upstreamFailure(res, status, what, detail) {
  if (status === 401 || status === 403) {
    return fail(res, 502, `The server's GitHub token was rejected (HTTP ${status}). Check GITHUB_TOKEN.`);
  }
  return fail(res, status >= 500 ? 502 : status, detail || `GitHub ${what} failed: ${status}`);
}

export default async function handler(req, res, { fetchFn = fetch, getUser = getCurrentUser } = {}) {
  if (req.method !== 'GET' && req.method !== 'PUT') return fail(res, 405, 'Method not allowed');

  const me = await getUser(req);
  if (!me) return fail(res, 401, 'Your session has expired. Sign in again.');

  const token = process.env.GITHUB_TOKEN;
  if (!token) return fail(res, 503, 'GITHUB_TOKEN is not configured on this deployment');

  const path = req.method === 'GET' ? req.query?.path : req.body?.path;
  if (!isAllowedPath(path)) return fail(res, 400, 'path is not an allowed data file');

  res.setHeader('Cache-Control', 'no-store');
  const signal = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);

  try {
    if (req.method === 'GET') {
      const url = `${GH_API}/repos/${REPO}/contents/${path}?ref=${encodeURIComponent(BRANCH)}`;
      const upstream = await fetchFn(url, { headers: ghHeaders(token), signal });
      if (upstream.status === 404) return res.status(200).json({ content: [], sha: null });
      if (!upstream.ok) return upstreamFailure(res, upstream.status, `GET ${path}`);
      const data = await upstream.json();
      let content;
      try {
        content = JSON.parse(Buffer.from(data.content || '', 'base64').toString('utf8'));
      } catch {
        return fail(res, 502, `GitHub file ${path} is not valid JSON`);
      }
      return res.status(200).json({ content, sha: data.sha });
    }

    if (needsContentRole(path)) {
      const gate = requireRole(me, 'admin', 'content');
      if (!gate.ok) return fail(res, gate.status, gate.error);
    }
    const { content, sha, message } = req.body || {};
    if (content === undefined) return fail(res, 400, 'content is required');
    if (!isValidContent(content)) return fail(res, 400, 'content must be an array of records with plain ids');
    const body = {
      message: typeof message === 'string' && message.trim() ? message.slice(0, 200) : `Update ${path}`,
      content: Buffer.from(JSON.stringify(content, null, 2), 'utf8').toString('base64'),
      branch: BRANCH,
    };
    if (typeof sha === 'string' && sha) body.sha = sha;
    const upstream = await fetchFn(`${GH_API}/repos/${REPO}/contents/${path}`, {
      method: 'PUT',
      headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (!upstream.ok) {
      const err = await upstream.json().catch(() => ({}));
      return upstreamFailure(res, upstream.status, `PUT ${path}`, err.message);
    }
    const data = await upstream.json();
    return res.status(200).json({ sha: data.content?.sha ?? null });
  } catch (err) {
    const message = err?.name === 'TimeoutError' || err?.name === 'AbortError'
      ? `GitHub did not answer within ${UPSTREAM_TIMEOUT_MS / 1000}s`
      : `GitHub request failed: ${err?.message || 'unknown error'}`;
    return fail(res, 502, message);
  }
}
