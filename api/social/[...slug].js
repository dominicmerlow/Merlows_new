// api/social/[...slug].js
// Catch-all handler that routes all /api/social/* requests.
// This is the sole Vercel serverless function for the social module.
// Handler logic lives in lib/social/handlers/ (outside api/) so Vercel
// does not count each handler as a separate function.

import generateHandler from '../../lib/social/handlers/generate.js';
import kitsIndexHandler from '../../lib/social/handlers/kits-index.js';
import kitsIdHandler from '../../lib/social/handlers/kits-id.js';
import deployHandler from '../../lib/social/handlers/deploy.js';
import postHandler from '../../lib/social/handlers/post.js';
import scheduleHandler from '../../lib/social/handlers/schedule.js';
import cronHandler from '../../lib/social/handlers/cron.js';
import imageHandler from '../../lib/social/handlers/image.js';
import connectionsHandler from '../../lib/social/handlers/connections.js';
import accountsHandler from '../../lib/social/handlers/accounts.js';
import autopilotHandler from '../../lib/social/handlers/autopilot.js';
import { verifyCronSecret } from '../../lib/cron-auth.js';
import { getCurrentUser, requireRole } from '../../lib/auth.js';

export default async function handler(req, res) {
  // In non-Next.js Vercel serverless, [...slug].js exposes matched segments as
  // req.query['...slug'] (three dots are part of the key name), not req.query.slug.
  // Single-segment paths arrive as a plain string ('generate').
  // Multi-segment paths arrive as a slash-joined string ('kits/kit_abc').
  // Split on '/' to normalise both cases into an array.
  const rawSlug = req.query['...slug'] || req.query.slug || '';
  const slug = Array.isArray(rawSlug)
    ? rawSlug
    : String(rawSlug).split('/').filter(Boolean);
  const [resource, id] = slug; // e.g. ['kits', 'kit_123'] or ['generate']

  try {
    // Scheduler-driven routes authenticate with CRON_SECRET, never a session.
    // Vercel cron sends GET with `Authorization: Bearer $CRON_SECRET` injected
    // automatically (the old POST-only cron branch made the daily 09:00 tick 404).
    //   GET|POST /social/cron               → queue drain
    //   GET|POST /social/connections/check  → daily platform health check + Telegram alert
    //   GET|POST /social/dm-sync            → comment-to-DM automations for new Instagram posts
    const isCronRoute =
      resource === 'cron' ||
      resource === 'digest' || // the daily "what went out" report
      resource === 'dm-sync' ||
      (resource === 'connections' && id === 'check') ||
      (resource === 'autopilot' && !id); // the worker tick; its sub-routes need a session
    if (isCronRoute) {
      if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }
      const gate = verifyCronSecret(req);
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
      if (resource === 'cron') return await cronHandler(req, res);
      if (resource === 'digest') {
        const { default: digestHandler } = await import('../../lib/social/handlers/digest.js');
        return await digestHandler(req, res);
      }
      if (resource === 'dm-sync') {
        const { default: dmSyncHandler } = await import('../../lib/social/handlers/dm-sync.js');
        return await dmSyncHandler(req, res);
      }
      if (resource === 'autopilot') return await autopilotHandler(req, res, null);
      return await connectionsHandler(req, res, id);
    }

    // POST /social/zernio-webhook — Zernio's publish/fail callbacks.
    //
    // No session and no cron secret: the HMAC over the raw body IS the credential, so this
    // branch must sit BEFORE the role guard and must never fall open. The handler reads the
    // request stream itself; nothing above this line touches `req.body`, which would parse
    // it (and throw its own 400 on attacker-controlled malformed JSON).
    if (resource === 'zernio-webhook') {
      const { default: zernioWebhookHandler } = await import('../../lib/social/handlers/zernio-webhook.js');
      return await zernioWebhookHandler(req, res);
    }

    // POST /social/image — hero image generation via OpenRouter. The Generator's hero
    // card (and the Replace-image modal) calls it, and the Generator is open to every
    // role, so any signed-in user may use it — same rule as /api/content/llm-proxy.
    if (req.method === 'POST' && resource === 'image') {
      if (!(await getCurrentUser(req))) return res.status(401).json({ error: 'Not authenticated' });
      return await imageHandler(req, res);
    }

    // Every other social route can post to, or reconfigure, the brand's public
    // accounts, so it needs a signed-in admin or content user — the same roles
    // the UI shows the Social tab to (applyRoleGating → isContentPlus).
    const guard = requireRole(await getCurrentUser(req), 'admin', 'content');
    if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

    // POST /social/generate
    if (req.method === 'POST' && resource === 'generate') {
      return await generateHandler(req, res);
    }

    // GET /social/kits
    if (req.method === 'GET' && resource === 'kits' && !id) {
      return await kitsIndexHandler(req, res);
    }

    // GET /social/kits/:id  |  PATCH /social/kits/:id
    if (resource === 'kits' && id) {
      return await kitsIdHandler(req, res, id);
    }

    // POST /social/deploy
    if (req.method === 'POST' && resource === 'deploy') {
      return await deployHandler(req, res);
    }

    // POST /social/post
    if (req.method === 'POST' && resource === 'post') {
      return await postHandler(req, res);
    }

    // GET /social/schedule
    if (req.method === 'GET' && resource === 'schedule') {
      return await scheduleHandler(req, res);
    }

    // GET /social/connections                 → per-platform env-var status
    // POST /social/connections/test           → live verification call
    if (resource === 'connections') {
      return await connectionsHandler(req, res, id);
    }

    // /social/autopilot/{packs,retry}          → the autopilot board + manual retry
    if (resource === 'autopilot') {
      return await autopilotHandler(req, res, id);
    }

    // /social/accounts*                        → multi-account management (Composio)
    if (resource === 'accounts') {
      return await accountsHandler(req, res, slug.slice(1).join('/'));
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('[social] unhandled error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
