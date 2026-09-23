// lib/route-auth.js
// Per-route access levels for the API catch-alls (api/{core,content,automation,
// review}/[...slug].js). Each catch-all maps (method, slug) to one of LEVEL.* in
// an explicit policy function; a route that maps to nothing gets DEFAULT_LEVEL
// (admin), so a newly added route is closed until someone opens it on purpose.
//
// "Internal" = the request carries `Authorization: Bearer $CRON_SECRET` — Vercel
// cron, or another function of this app calling its own /api (see
// internalAuthHeaders() in cron-auth.js). Internal callers pass every
// session-based level; they are not a user, so handlers that attribute work to a
// user must handle `auth.user === null`.
import { getCurrentUser, requireRole } from './auth.js';
import { verifyCronSecret, isInternalRequest } from './cron-auth.js';

export const LEVEL = Object.freeze({
  PUBLIC:  'public',   // no auth at all (login, signed-token review links, OAuth callback)
  SELF:    'self',     // handler authenticates itself (Telegram secret header, x-backfill-auth)
  CRON:    'cron',     // CRON_SECRET bearer only
  SESSION: 'session',  // any signed-in user, or internal
  CONTENT: 'content',  // admin | content, or internal
  ADMIN:   'admin',    // admin, or internal
});

export const DEFAULT_LEVEL = LEVEL.ADMIN;

const ROLES = {
  [LEVEL.CONTENT]: ['admin', 'content'],
  [LEVEL.ADMIN]:   ['admin'],
};

// Who is calling. Memoised per request object so the catch-all gate and the
// handler it dispatches to (approve voter id, item status gate, audit labels)
// share one session lookup. A WeakMap, not a req property: nothing the client
// sends can pre-populate it.
const cache = new WeakMap();

export async function resolveAuth(req) {
  if (cache.has(req)) return cache.get(req);
  const auth = isInternalRequest(req)
    ? { internal: true, user: null }
    : { internal: false, user: await getCurrentUser(req).catch(() => null) };
  cache.set(req, auth);
  return auth;
}

// → { ok: true } | { ok: false, status, error }
export async function authorize(req, level) {
  switch (level) {
    case LEVEL.PUBLIC:
    case LEVEL.SELF:
      return { ok: true };
    case LEVEL.CRON:
      return verifyCronSecret(req);
    case LEVEL.SESSION: {
      const auth = await resolveAuth(req);
      if (auth.internal || auth.user) return { ok: true };
      return { ok: false, status: 401, error: 'Not authenticated' };
    }
    case LEVEL.CONTENT:
    case LEVEL.ADMIN: {
      const auth = await resolveAuth(req);
      if (auth.internal) return { ok: true };
      return requireRole(auth.user, ...ROLES[level]);
    }
    default:
      // Unknown level string — a typo in a policy table must not open a route.
      return { ok: false, status: 403, error: 'Forbidden' };
  }
}

// Gate helper for the catch-alls. Returns true when the request may proceed;
// otherwise it has already sent the error response.
export async function enforce(req, res, level) {
  const gate = await authorize(req, level ?? DEFAULT_LEVEL);
  if (gate.ok) return true;
  res.status(gate.status).json({ error: gate.error });
  return false;
}

// Normalise the catch-all slug (see CLAUDE.md "Vercel Routing"): the key is
// req.query['...slug'] (three literal dots) or req.query.slug when arriving via
// a vercel.json rewrite; multi-segment values are a slash-joined string.
export function parseSlug(req) {
  const rawSlug = req.query?.['...slug'] || req.query?.slug || '';
  return Array.isArray(rawSlug)
    ? rawSlug
    : String(rawSlug).split('/').filter(Boolean);
}
