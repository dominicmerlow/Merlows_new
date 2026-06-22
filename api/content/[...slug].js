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
};

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
