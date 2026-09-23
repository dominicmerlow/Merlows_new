import { kv } from '../../kv.js';
import { requireRole } from '../../auth.js';
import { resolveAuth } from '../../route-auth.js';
import { logEvent, snapshotBody } from '../../article-history.js';

// Note: 'rejected' is intentionally absent from in_review's allowed targets.
// Reviewers' "Request Changes" feedback is stored as comments on the article but
// does NOT terminate the review — the article stays in_review until enough
// approvals arrive. The legacy 'rejected' rows in KV are still readable; the
// 'rejected → draft / trash' transition stays available so admins can clear them.
const VALID_TRANSITIONS = {
  draft:      ['in_review', 'approved', 'draft', 'trash'],
  in_review:  ['approved', 'draft', 'trash'],
  rejected:   ['draft', 'trash'], // legacy items only — new items never reach this state
  approved:   ['scheduled', 'published', 'draft', 'trash'],
  scheduled:  ['published', 'approved', 'trash'],
  published:  ['trash'],
  trash:      ['draft'],  // restore
};

export function applyStatusTransition(current, next) {
  if (!VALID_TRANSITIONS[current]?.includes(next)) {
    throw new Error(`invalid status transition: ${current} -> ${next}`);
  }
  return next;
}

// Statuses that put (or queue) an article for the public site: the cron
// publishes anything 'scheduled'. Moving INTO one of these needs admin|content
// (or the internal bearer) even though the route itself is open to any session.
const PUBLISHING_STATUSES = new Set(['approved', 'scheduled', 'published']);

// Server-owned history: never taken from a browser, or an edit could wipe its own
// audit trail (auditLog: [], versions: []).
const SERVER_OWNED_FIELDS = ['id', 'createdAt', 'auditLog', 'versions'];
// Review, scheduling, WordPress and byline state. A basic 'user' must not set these:
// e.g. pre-filling approvals, back-dating scheduledAt so the 08:00 cron publishes, or
// changing the WordPress author.
const CONTENT_PLUS_FIELDS = [
  'approvals', 'rejections', 'rejectionComments', 'reviewers', 'reviewerIds', 'requireAllApprovals',
  'scheduledAt', 'approvedAt', 'publishedAt', 'sentForReviewAt', 'gcalEventId',
  'wpPostId', 'wpPostUrl', 'wpAuthorId', 'authorUsername', 'authorName',
  'automationRuleId', 'publishedChannels', 'socialSchedule',
  // Read by publish.js but rarely visible to the approver.
  'heroMediaId', 'wpCategorySlug', 'publishDate',
];
// A basic user may not edit these at all: approved/scheduled/published are cleared to
// publish, and an in_review automation article is published unattended when its
// review completes or times out (onTimeout: 'approve').
const USER_LOCKED_STATUSES = new Set(['in_review', 'approved', 'scheduled', 'published']);

// Strips what the caller may not set. Returns an error response body when a basic
// user tries to touch an article already cleared to publish (content could otherwise
// be swapped under an approved/scheduled status without any status change).
export function sanitizeUpdates(updates, item, auth) {
  if (auth.internal) return { updates };
  for (const k of SERVER_OWNED_FIELDS) delete updates[k];
  const privileged = ['admin', 'content'].includes(auth.user?.appRole);
  if (privileged) return { updates };
  if (USER_LOCKED_STATUSES.has(item.status)) {
    return { error: { status: 403, error: 'Requires role: admin or content to edit an article in review, approved, scheduled or published' } };
  }
  for (const k of CONTENT_PLUS_FIELDS) delete updates[k];
  return { updates };
}

export default async function handler(req, res) {
  const { id } = req.query;
  // Caller identity: a session user, or the internal CRON_SECRET bearer. The
  // catch-all already required one of the two; re-checked here so the handler
  // is never reachable without it.
  const auth = await resolveAuth(req);
  if (!auth.internal && !auth.user) return res.status(401).json({ error: 'Not authenticated' });

  const item = await kv.get(`content:${id}`);
  if (!item) return res.status(404).json({ error: 'Not found' });

  if (req.method === 'GET') {
    return res.json(item);
  }

  if (req.method === 'PUT') {
    const sanitized = sanitizeUpdates({ ...(req.body || {}) }, item, auth);
    if (sanitized.error) return res.status(sanitized.error.status).json({ error: sanitized.error.error });
    const updates = sanitized.updates;
    if (updates.status && updates.status !== item.status) {
      if (PUBLISHING_STATUSES.has(updates.status) && !auth.internal) {
        const guard = requireRole(auth.user, 'admin', 'content');
        if (!guard.ok) return res.status(guard.status).json({ error: guard.error });
      }
      try {
        applyStatusTransition(item.status, updates.status);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }
    const now = new Date().toISOString();
    // Capture per-status timestamps on first transition into that status
    const statusTimestamps = {};
    if (updates.status && updates.status !== item.status) {
      if (updates.status === 'in_review'  && !item.sentForReviewAt) statusTimestamps.sentForReviewAt = now;
      if (updates.status === 'approved'   && !item.approvedAt)      statusTimestamps.approvedAt      = now;
      if (updates.status === 'scheduled'  && !item.scheduledAt)     statusTimestamps.scheduledAt     = now;
      if (updates.status === 'published'  && !item.publishedAt)     statusTimestamps.publishedAt     = now;
    }

    // Audit log + body snapshots, attributed to the signed-in user. The only
    // session-less caller is the internal bearer (server-to-server), labelled
    // as such. Mutations happen on `item` so they survive the spread.
    const me = auth.user;
    const actor = me ? (me.name || me.email || me.id) : 'System (internal)';
    const bodyChanged = typeof updates.body === 'string' && updates.body !== item.body;
    if (bodyChanged) {
      snapshotBody(item, { actor, at: now, reason: 'edit' });
      logEvent(item, {
        type: 'edit', actor, at: now,
        detail: {
          wordsBefore: (item.body || '').split(/\s+/).filter(Boolean).length,
          wordsAfter: updates.body.split(/\s+/).filter(Boolean).length,
        },
      });
    }
    if (updates.status && updates.status !== item.status) {
      logEvent(item, { type: 'status', actor, at: now, detail: { from: item.status, to: updates.status } });
    }
    if (typeof updates.title === 'string' && updates.title !== item.title) {
      logEvent(item, { type: 'title', actor, at: now, detail: { from: item.title || '', to: updates.title } });
    }

    const updated = { ...item, ...updates, ...statusTimestamps, updatedAt: now };
    await kv.set(`content:${id}`, updated);
    return res.json(updated);
  }

  if (req.method === 'DELETE') {
    await kv.del(`content:${id}`);
    const ids = await kv.lrange('content:index', 0, -1);
    await kv.del('content:index');
    const remaining = ids.filter(i => i !== id);
    if (remaining.length) await kv.rpush('content:index', ...remaining);
    return res.status(204).end();
  }

  res.status(405).json({ error: 'Method not allowed' });
}
