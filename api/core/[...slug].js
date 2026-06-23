// api/core/[...slug].js
// Catch-all handler that routes all /api/core/* requests.
// This is the sole Vercel serverless function for the core module
// (publish / reviewers / schedule), consolidated to fit the Hobby 12-fn limit.
// Handler logic lives in lib/core/handlers/ (outside api/) so Vercel
// does not count each handler as a separate function.

import publishHandler from '../../lib/core/handlers/publish.js';
import reviewersHandler from '../../lib/core/handlers/reviewers.js';
import scheduleHandler from '../../lib/core/handlers/schedule.js';

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

  // Query strings like ?id= pass through untouched — handlers read req.query.
  if (first === 'publish')   return publishHandler(req, res);
  if (first === 'reviewers') return reviewersHandler(req, res);
  if (first === 'schedule')  return scheduleHandler(req, res);

  return res.status(404).json({ error: 'Not found' });
}
