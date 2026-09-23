// api/content/[...slug].js
// Catch-all handler that routes all /api/content/* requests.
// This is the sole Vercel serverless function for the content module.
// Handler logic lives in lib/content/handlers/ (outside api/) so Vercel
// does not count each handler as a separate function.

import indexHandler from '../../lib/content/handlers/index.js';
import itemHandler from '../../lib/content/handlers/item.js';
import aiReviseHandler from '../../lib/content/handlers/ai-revise.js';
import applyRevisionHandler from '../../lib/content/handlers/apply-revision.js';
import commentHandler from '../../lib/content/handlers/comment.js';
import abConfigHandler from '../../lib/content/handlers/ab-config.js';
import articlePromptsHandler from '../../lib/content/handlers/article-prompts.js';
import heroPromptsHandler from '../../lib/content/handlers/hero-prompts.js';
import masterPromptHandler from '../../lib/content/handlers/master-prompt.js';
import usageRecordHandler from '../../lib/content/handlers/usage-record.js';
import usageSummaryHandler from '../../lib/content/handlers/usage-summary.js';
import wordLimitsHandler from '../../lib/content/handlers/word-limits.js';
import llmProxyHandler from '../../lib/content/handlers/llm-proxy.js';
import ghDataHandler from '../../lib/content/handlers/gh-data.js';
import { LEVEL, enforce } from '../../lib/route-auth.js';

// Named (non-id) leaf routes under /api/content. Content ids look like
// `content_...` (and randomUUIDs), so they never collide with this set.
const NAMED = {
  'ab-config': abConfigHandler,
  'article-prompts': articlePromptsHandler,
  'hero-prompts': heroPromptsHandler,
  'master-prompt': masterPromptHandler,
  'usage-record': usageRecordHandler,
  'usage-summary': usageSummaryHandler,
  'word-limits': wordLimitsHandler,
  'llm-proxy': llmProxyHandler,
  'gh-data': ghDataHandler,
};

// Access policy per route (see lib/route-auth.js). Unlisted (method, route)
// pairs return null and fall back to DEFAULT_LEVEL (admin) in enforce().
const ADMIN_ACTIONS = new Set(['email-diagnostic', 'backfill-review-sync']);

export function contentPolicy(method, slug, query = {}) {
  const [first, second] = slug;
  if (!first) {
    // /api/content — list / slim / summary / review-tasks (GET), create (POST).
    // The ?action= diagnostics are admin-only (the handler re-checks).
    if (ADMIN_ACTIONS.has(query.action)) return LEVEL.ADMIN;
    return method === 'GET' || method === 'POST' ? LEVEL.SESSION : null;
  }
  // Named config routes: every one needs a session; their handlers keep their
  // own finer role checks (PUT → admin|content, gh-data path rules, …).
  if (NAMED[first] && !second) return LEVEL.SESSION;
  // /api/content/:id — any signed-in user. A PUT that moves the status to
  // approved/scheduled/published additionally needs admin|content; that is
  // checked in lib/content/handlers/item.js, which knows the current status.
  if (!second) return ['GET', 'PUT', 'DELETE'].includes(method) ? LEVEL.SESSION : null;
  if (['ai-revise', 'apply-revision', 'comment'].includes(second)) return LEVEL.CONTENT;
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
  const [first, second] = slug;

  if (!(await enforce(req, res, contentPolicy(req.method, slug, req.query)))) return;

  if (!first) return indexHandler(req, res);                 // /api/content  (incl. ?action=...)

  if (NAMED[first] && !second) return NAMED[first](req, res); // /api/content/<named>

  // Else `first` is a content id.
  req.query.id = first;
  if (!second) return itemHandler(req, res);                 // /api/content/<id>
  if (second === 'ai-revise') return aiReviseHandler(req, res);
  if (second === 'apply-revision') return applyRevisionHandler(req, res);
  if (second === 'comment') return commentHandler(req, res);

  return res.status(404).json({ error: 'Not found' });
}
