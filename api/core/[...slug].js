// api/core/[...slug].js
// Catch-all handler that routes all /api/core/* requests.
// This is the sole Vercel serverless function for the core module
// (publish / reviewers / schedule), consolidated to fit the Hobby 12-fn limit.
// Handler logic lives in lib/core/handlers/ (outside api/) so Vercel
// does not count each handler as a separate function.

import publishHandler from '../../lib/core/handlers/publish.js';
import reviewersHandler from '../../lib/core/handlers/reviewers.js';
import scheduleHandler from '../../lib/core/handlers/schedule.js';
import { LEVEL, enforce } from '../../lib/route-auth.js';

// Access policy per route (see lib/route-auth.js). Unlisted (method, route)
// pairs return null and fall back to DEFAULT_LEVEL (admin) in enforce().
export function corePolicy(method, slug) {
  const [first] = slug;
  // Publishing and scheduling put an article on the public site (the cron
  // publishes anything 'scheduled'), so they need admin|content — or the
  // internal bearer (cron, automation approve/run, Telegram approval).
  if (first === 'publish')   return method === 'POST' ? LEVEL.CONTENT : null;
  if (first === 'schedule')  return method === 'POST' ? LEVEL.CONTENT : null;
  // Anyone signed in can read the reviewer list; changing it is admin-only.
  if (first === 'reviewers') return method === 'GET' ? LEVEL.SESSION : LEVEL.ADMIN;
  return null;
}

export default async function handler(req, res) {
  // In non-Next.js Vercel serverless, [...slug].js exposes matched segments as
  // req.query['...slug'] (three dots are part of the key name), not req.query.slug.
  // Single-segment paths arrive as a plain string; multi-segment paths arrive as
  // a slash-joined string. Split on '/' to normalise both cases into an array.
  // When requests come via the vercel.json rewrite (:slug* capture), the
  // segments arrive as req.query.slug instead of req.query['...slug'].
  const rawSlug = req.query['...slug'] || req.query.slug || '';
  const slug = Array.isArray(rawSlug)
    ? rawSlug
    : String(rawSlug).split('/').filter(Boolean);
  const [first] = slug;

  if (!(await enforce(req, res, corePolicy(req.method, slug)))) return;

  // Query strings like ?id= pass through untouched — handlers read req.query.
  if (first === 'publish')   return publishHandler(req, res);
  if (first === 'reviewers') return reviewersHandler(req, res);
  if (first === 'schedule')  return scheduleHandler(req, res);

  return res.status(404).json({ error: 'Not found' });
}
