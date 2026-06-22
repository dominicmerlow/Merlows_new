// api/auth/[...slug].js
// Catch-all handler that routes all /api/auth/* requests.
// This is the sole Vercel serverless function for the auth module.
// Handler logic lives in lib/auth/handlers/ (outside api/) so Vercel
// does not count each handler as a separate function.

import loginHandler from '../../lib/auth/handlers/login.js';
import logoutHandler from '../../lib/auth/handlers/logout.js';
import meHandler from '../../lib/auth/handlers/me.js';
import changePasswordHandler from '../../lib/auth/handlers/change-password.js';

export default async function handler(req, res) {
  // In non-Next.js Vercel serverless, [...slug].js exposes matched segments as
  // req.query['...slug'] (three dots are part of the key name), not req.query.slug.
  // Single-segment paths arrive as a plain string ('login').
  // Split on '/' to normalise both string and array cases into an array.
  // When requests come via the vercel.json rewrite (:slug* capture), the
  // segments arrive as req.query.slug instead of req.query['...slug'].
  const rawSlug = req.query['...slug'] || req.query.slug || '';
  const slug = Array.isArray(rawSlug)
    ? rawSlug
    : String(rawSlug).split('/').filter(Boolean);

  if (slug[0] === 'login') return loginHandler(req, res);
  if (slug[0] === 'logout') return logoutHandler(req, res);
  if (slug[0] === 'me') return meHandler(req, res);
  if (slug[0] === 'change-password') return changePasswordHandler(req, res);

  return res.status(404).json({ error: 'Not found' });
}
