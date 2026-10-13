// lib/automation/handlers/telegram.js
import { kv as defaultKv } from '../../kv.js';
import { safeEqual, internalAuthHeaders } from '../../cron-auth.js';

const TERMINAL_STATUSES = ['approved', 'rejected', 'published', 'timed_out', 'auto_published'];
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

async function answerCallbackQuery(callbackQueryId, text) {
  try {
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: false }),
    });
  } catch (err) {
    console.error('answerCallbackQuery failed:', err.message);
  }
}

/**
 * May this button press decide a social review?
 *
 * The press must come from the configured review chat, and — when `TELEGRAM_APPROVER_IDS`
 * (comma-separated Telegram user ids) is set — from one of those users. Fails closed: with no
 * `TELEGRAM_CHAT_ID` nothing is allowed, since there is then no chat the message could
 * legitimately have been sent to.
 */
export function isAllowedReviewer(callbackQuery) {
  const expectedChat = String(process.env.TELEGRAM_CHAT_ID ?? '').trim();
  const chat = callbackQuery?.message?.chat?.id;
  if (!expectedChat || chat == null || String(chat) !== expectedChat) return false;
  const approvers = String(process.env.TELEGRAM_APPROVER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (!approvers.length) return true;
  const user = callbackQuery?.from?.id;
  return user != null && approvers.includes(String(user));
}

export function createHandler(kvInstance = defaultKv) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Fail closed: with TELEGRAM_WEBHOOK_SECRET unset the old `!==` compare let a
    // request WITHOUT the header through (undefined === undefined) — anyone could
    // approve and publish a job. Unset → 503 (misconfigured), mismatch → 401.
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!expected) return res.status(503).json({ error: 'TELEGRAM_WEBHOOK_SECRET is not configured on this deployment' });
    if (!safeEqual(req.headers?.['x-telegram-bot-api-secret-token'], expected)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { callback_query } = req.body;
    if (!callback_query) return res.status(200).json({ ok: true }); // non-button update, ignore

    const [action, jobId] = (callback_query.data ?? '').split(':');

    // Social autopilot review buttons. They come through THIS endpoint because Telegram
    // allows one webhook URL per bot, so a second handler would simply never be called.
    if (jobId && ['sapprove', 'sreject'].includes(action)) {
      // The secret proves Telegram sent this; it says nothing about WHO pressed the button.
      // Without this check anyone who could see the message — a forwarded copy, a group the
      // bot was added to — could release what the brand publishes.
      if (!isAllowedReviewer(callback_query)) {
        console.warn(`[telegram] review press refused: chat ${callback_query.message?.chat?.id ?? '?'}, user ${callback_query.from?.id ?? '?'}`);
        await answerCallbackQuery(callback_query.id, 'Not authorised to review');
        return res.status(200).json({ ok: true });
      }
      const { decide, closeReviewMessage } = await import('../../social/pack/review.js');
      const who = callback_query.from?.username ?? callback_query.from?.first_name ?? 'telegram';
      const decision = action === 'sapprove' ? 'approved' : 'rejected';
      let outcome;
      try {
        outcome = await decide(jobId, decision, who, {
          store: kvInstance, byId: callback_query.from?.id ?? null, via: 'telegram',
        });
      } catch (err) {
        console.error('[telegram] social review decision failed:', err.message);
        await answerCallbackQuery(callback_query.id, 'Could not record that');
        return res.status(200).json({ ok: true });
      }
      await answerCallbackQuery(
        callback_query.id,
        outcome.ok
          ? (decision === 'approved' ? '✅ Approved — schedules on the next run' : '🚫 Rejected — not posting')
          : `No change: ${outcome.reason}`,
      );
      if (outcome.ok) {
        await closeReviewMessage({
          chatId: callback_query.message?.chat?.id,
          messageId: callback_query.message?.message_id,
          pack: outcome.pack,
          record: outcome.record,
        });
      }
      return res.status(200).json({ ok: true });
    }

    if (!jobId || !['approve', 'reject'].includes(action)) {
      await answerCallbackQuery(callback_query.id, 'Unknown action');
      return res.status(200).json({ ok: true });
    }

    const job = await kvInstance.get(`automation:job:${jobId}`);
    if (!job) {
      await answerCallbackQuery(callback_query.id, 'Job not found');
      return res.status(200).json({ ok: true });
    }
    if (TERMINAL_STATUSES.includes(job.status)) {
      await answerCallbackQuery(callback_query.id, `Already ${job.status}`);
      return res.status(200).json({ ok: true });
    }

    const now = new Date().toISOString();

    if (action === 'approve') {
      const updated = { ...job, status: 'approved', approvedAt: now, approvedBy: 'telegram', updatedAt: now };
      await kvInstance.set(`automation:job:${jobId}`, updated);

      const rule = await kvInstance.get(`automation:rule:${job.ruleId}`);
      // Sync content.status='approved' before publish — endpoint rejects drafts/in_review.
      const contentItem = await kvInstance.get(`content:${job.contentId}`);
      if (contentItem && contentItem.status !== 'published') {
        await kvInstance.set(`content:${job.contentId}`, {
          ...contentItem, status: 'approved', approvedAt: contentItem.approvedAt || now, updatedAt: now,
        });
      }
      let publishBlocked = null; // reasons from the publish guard (HTTP 422), if it refused
      if (rule?.publish?.wordpress) {
        try {
          const publishRes = await fetch(`${APP_URL}/api/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...internalAuthHeaders() },
            body: JSON.stringify({ contentId: job.contentId }),
          });
          if (publishRes.ok) {
            await kvInstance.set(`automation:job:${jobId}`, { ...updated, status: 'published' });
          } else {
            const errBody = await publishRes.json().catch(() => ({}));
            if (publishRes.status === 422 && Array.isArray(errBody.reasons)) publishBlocked = errBody.reasons.join('; ');
            console.error('Publish after Telegram approval failed: HTTP', publishRes.status, publishBlocked || '');
          }
        } catch (err) {
          console.error('Publish after Telegram approval failed:', err.message);
        }
      }
      await answerCallbackQuery(
        callback_query.id,
        publishBlocked ? `⚠️ Approved but NOT published (guard): ${publishBlocked}`.slice(0, 190) : '✅ Approved — publishing now'
      );
    } else {
      // "Request changes" no longer terminates the review — record the vote +
      // surface the request, but leave job.status open so other reviewers can still vote.
      const priorRejections = Array.isArray(job.rejections) ? job.rejections : [];
      await kvInstance.set(`automation:job:${jobId}`, {
        ...job,
        rejections: priorRejections.includes('telegram') ? priorRejections : [...priorRejections, 'telegram'],
        updatedAt: now,
      });
      await answerCallbackQuery(callback_query.id, '💬 Feedback noted — review still open');
    }

    return res.status(200).json({ ok: true });
  };
}

export default createHandler();
