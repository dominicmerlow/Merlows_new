// lib/cron-auth.js
// Shared gate for endpoints driven by a scheduler (or by another function of this
// app) rather than a logged-in human.
//
// Vercel injects `Authorization: Bearer $CRON_SECRET` into its own cron requests
// whenever CRON_SECRET is set as a project env var. Any external pinger
// (cron-job.org, UptimeRobot, ...) must be configured to send the same header.
// Server-to-server calls between this app's own functions (automation run →
// /api/content, approve → /api/publish, ...) send the same credential via
// internalAuthHeaders().
//
// Deliberate: an unset CRON_SECRET returns 503, not 401. A 401 is what an
// unauthorised caller sees; a 503 says "this deployment is misconfigured".
// Keeping them distinct is the difference between "someone is probing us" and
// "we broke our own pipeline" when reading the logs weeks later. Never fall
// open — an unset secret must not leave the endpoint public.
import { timingSafeEqual } from 'crypto';

// Constant-time string comparison. Unequal lengths return false without a
// timing-sensitive byte compare (timingSafeEqual throws on unequal lengths).
export function safeEqual(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function bearerMatches(req, secret) {
  return safeEqual(req.headers?.authorization, `Bearer ${secret}`);
}

export function verifyCronSecret(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { ok: false, status: 503, error: 'CRON_SECRET is not configured on this deployment' };
  }
  if (!bearerMatches(req, secret)) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  return { ok: true };
}

// True iff CRON_SECRET is set and the request carries it as a bearer token —
// i.e. the caller is Vercel cron or another function of this deployment.
export function isInternalRequest(req) {
  const secret = process.env.CRON_SECRET;
  return !!secret && bearerMatches(req, secret);
}

// Headers for a server-to-server call to this app's own /api routes.
export function internalAuthHeaders() {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error('CRON_SECRET is not configured — internal API calls cannot authenticate');
  }
  return { Authorization: `Bearer ${secret}` };
}
