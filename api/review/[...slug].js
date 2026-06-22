// api/review/[...slug].js
// Catch-all handler that routes all /api/review/* requests.
// This is the sole Vercel serverless function for the review module.
// Handler logic lives in lib/review/handlers/ (outside api/) so Vercel
// does not count each handler as a separate function.

import tokenHandler from '../../lib/review/handlers/token.js';
import sendHandler from '../../lib/review/handlers/send.js';

export default async function handler(req, res) {
  // In non-Next.js Vercel serverless, [...slug].js exposes matched segments as
  // req.query['...slug'] (three dots are part of the key name), not req.query.slug.
  // Single-segment paths arrive as a plain string. Multi-segment paths arrive as
  // a slash-joined string. Split on '/' to normalise both cases into an array.
  // When requests come via the vercel.json rewrite (:slug* capture), the
  // segments arrive as req.query.slug instead of req.query['...slug'].
  const rawSlug = req.query['...slug'] || req.query.slug || '';
  const slug = Array.isArray(rawSlug)
    ? rawSlug
    : String(rawSlug).split('/').filter(Boolean);
  const [first] = slug;

  if (first === 'send') return sendHandler(req, res);

  // else first is a review token (public link /api/review/<token>)
  if (first) {
    req.query.token = first;
    return tokenHandler(req, res);
  }

  return res.status(404).json({ error: 'Not found' });
}
