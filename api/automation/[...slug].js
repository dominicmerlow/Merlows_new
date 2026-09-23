// api/automation/[...slug].js
// Catch-all handler that routes all /api/automation/* requests.
// This is the sole Vercel serverless function for the automation module.
// Handler logic lives in lib/automation/handlers/ (outside api/) so Vercel
// does not count each handler as a separate function.

import approveHandler from '../../lib/automation/handlers/approve.js';
import runHandler from '../../lib/automation/handlers/run.js';
import telegramHandler from '../../lib/automation/handlers/telegram.js';
import telegramTestHandler from '../../lib/automation/handlers/telegram-test.js';
import rulesIndexHandler from '../../lib/automation/handlers/rules-index.js';
import rulesIdHandler from '../../lib/automation/handlers/rules-id.js';
import jobsIndexHandler from '../../lib/automation/handlers/jobs-index.js';
import jobsIdHandler from '../../lib/automation/handlers/jobs-id.js';
import authHandler from '../../lib/automation/handlers/auth.js';
import logsHandler from '../../lib/automation/handlers/logs.js';
import sourcesListHandler from '../../lib/automation/handlers/sources-list.js';
import bibliographyHandler from '../../lib/automation/handlers/bibliography.js';
import backfillHeroesHandler from '../../lib/automation/handlers/backfill-heroes.js';
import backfillMissingHeroesHandler from '../../lib/automation/handlers/backfill-missing-heroes.js';
import { LEVEL, enforce } from '../../lib/route-auth.js';

// Access policy per route (see lib/route-auth.js). Unlisted (method, route)
// pairs return null and fall back to DEFAULT_LEVEL (admin) in enforce().
export function automationPolicy(method, slug, query = {}) {
  const [first, second, third] = slug;
  switch (first) {
    case 'approve':
      // Signed-token flavour (email links + the feedback form): the JWT is the
      // credential. The JSON flavour (no token) is an in-app or internal vote —
      // admin|content or internal; the handler derives the voter from the auth.
      if (method === 'GET') return LEVEL.PUBLIC;
      if (method === 'POST') return query.token ? LEVEL.PUBLIC : LEVEL.CONTENT;
      return null;
    case 'telegram':
      // Telegram webhook: authenticated by its secret header inside the handler.
      return method === 'POST' ? LEVEL.SELF : null;
    case 'backfill-heroes':
    case 'backfill-missing-heroes':
      return LEVEL.SELF; // x-backfill-auth, checked in the handler
    case 'run':
      // GET = Vercel cron tick. POST = "Run now" from the UI (or internal).
      if (method === 'GET') return LEVEL.CRON;
      if (method === 'POST') return LEVEL.CONTENT;
      return null;
    case 'telegram-test':
    case 'sources-list':
      return method === 'POST' ? LEVEL.CONTENT : null;
    case 'logs':
    case 'rules':
    case 'bibliography':
      return LEVEL.CONTENT;
    case 'jobs':
      return method === 'GET' ? LEVEL.SESSION : null;
    case 'auth':
      // OAuth redirect target: the provider's browser redirect carries no session
      // guarantee, so it stays public. Everything else (client-secret config,
      // status, connect, disconnect) is admin-only.
      if (method === 'GET' && (second === 'google' || second === 'dropbox') && third === 'callback') {
        return LEVEL.PUBLIC;
      }
      // Read-only connected/not-connected flags; the rule wizard (content+) shows them.
      if (method === 'GET' && second === 'status') return LEVEL.CONTENT;
      return LEVEL.ADMIN;
    default:
      return null;
  }
}

export default async function handler(req, res) {
  // In non-Next.js Vercel serverless, [...slug].js exposes matched segments as
  // req.query['...slug'] (three dots are part of the key name), not req.query.slug.
  // Single-segment paths arrive as a plain string ('telegram-test').
  // Multi-segment paths arrive as a slash-joined string ('rules/rule_abc').
  // Split on '/' to normalise both cases into an array.
  // When requests come via the vercel.json rewrite (:slug* capture), the
  // segments arrive as req.query.slug instead of req.query['...slug'].
  const rawSlug = req.query['...slug'] || req.query.slug || '';
  const slug = Array.isArray(rawSlug)
    ? rawSlug
    : String(rawSlug).split('/').filter(Boolean);
  const [first, second] = slug;

  if (!(await enforce(req, res, automationPolicy(req.method, slug, req.query)))) return;

  if (first === 'approve') return approveHandler(req, res);
  if (first === 'backfill-heroes') return backfillHeroesHandler(req, res);
  if (first === 'backfill-missing-heroes') return backfillMissingHeroesHandler(req, res);
  if (first === 'run') return runHandler(req, res);
  if (first === 'telegram-test') return telegramTestHandler(req, res);
  if (first === 'telegram') return telegramHandler(req, res);
  if (first === 'logs') return logsHandler(req, res);
  if (first === 'sources-list') return sourcesListHandler(req, res);

  // Cloud storage OAuth + config — slug[0]='auth', slug[1]=service, slug[2]=callback?
  if (first === 'auth') return authHandler(req, res, slug);

  if (first === 'rules' && !second) return rulesIndexHandler(req, res);
  if (first === 'rules' && second) {
    req.query.id = second;
    return rulesIdHandler(req, res);
  }

  if (first === 'jobs' && !second) return jobsIndexHandler(req, res);
  if (first === 'jobs' && second) {
    req.query.id = second;
    return jobsIdHandler(req, res);
  }

  if (first === 'bibliography') return bibliographyHandler(req, res, slug);

  return res.status(404).json({ error: 'Not found' });
}
