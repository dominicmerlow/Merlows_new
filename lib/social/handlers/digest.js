// lib/social/handlers/digest.js
// The daily Telegram digest: what went out, what failed, what was held back.
//
// This is the only routine moment when a person is told what the autopilot did in their
// brand's name. It therefore reports what actually happened rather than what was attempted —
// a post is "posted" when a platform confirmed it, not when Zernio accepted the request.
//
// It also deliberately leads with the bad news. A digest that opens with a success count is
// read as "fine" and closed; the failures and the drops are the reason to send it at all.

import { kv, mgetBatched } from '../../kv.js';
import { listPacks, QUEUE_KEY } from '../pack/store.js';
import { SLOTS_KEY, gridDate } from '../pack/schedule.js';
import { DECISION_KEY, withDecision, autoApproveMs, loadAutoApprove, holdSensitive } from '../pack/review.js';
import { summariseCosts } from '../pack/cost.js';

const DIGEST_WINDOW_MS = 24 * 60 * 60_000;

/**
 * Summarise the last 24 hours.
 *
 * Pure apart from the reads, so the shape can be asserted without a Telegram account.
 */
export async function buildDigest({ now = Date.now(), store = kv, limit = 100 } = {}) {
  // The board's auto-approve switch, so the "waiting on your review" line states what is in force.
  await loadAutoApprove(store);
  const listed = await listPacks(limit);
  // Review decisions live in their own keys (DECISION_KEY in review.js) until the pack moves
  // on, so the record alone would list an approved-but-unslotted story as still awaiting you.
  const decisions = listed.length ? await mgetBatched(listed.map((pack) => DECISION_KEY(pack.contentId))) : [];
  const packs = listed.map((pack, i) => withDecision(pack, decisions[i] ?? null));
  const since = now - DIGEST_WINDOW_MS;
  const recent = packs.filter((pack) => {
    const at = Date.parse(pack.updatedAt ?? pack.createdAt ?? '');
    return Number.isFinite(at) && at >= since;
  });

  const posted = [];
  const failedPosts = [];
  const scheduled = [];
  for (const pack of recent) {
    for (const post of pack.posts ?? []) {
      const entry = { contentId: pack.contentId, title: pack.title ?? pack.social?.headline ?? 'Untitled', ...post };
      if (post.status === 'published') posted.push(entry);
      else if (post.status === 'failed') failedPosts.push(entry);
      else scheduled.push(entry);
    }
  }

  const dropped = recent.filter((pack) => pack.status === 'dropped');
  const failedPacks = recent.filter((pack) => pack.status === 'failed');
  const awaitingReview = recent.filter(
    (pack) => pack.status === 'rendered' && pack.review?.requestedAt && !pack.review?.decision,
  );
  // Every archived story on the board, not just the last 24h: an archived pack still awaits a
  // decision however long ago it was parked, and the digest is where a person hears about it.
  const archived = packs.filter((pack) => pack.status === 'archived' && !pack.review?.decision);
  // Decided but still archived: a decision re-queues the pack, and the next tick restores or
  // drops it within minutes. One still here at digest time means that re-queue was lost —
  // nothing else ever looks at an archived pack, so a person needs to hear about it.
  const archivedDecided = packs.filter((pack) => pack.status === 'archived' && pack.review?.decision);
  const slots = (await store.get(SLOTS_KEY(gridDate(now))).catch(() => null)) ?? {};
  // Cost per production: stories whose renders FINISHED in the window, so each is counted in
  // exactly one digest (`renderedAt` is set once). Spend on stories that failed or were
  // dropped in the window is reported beside it as money that bought nothing.
  // A story rendered and then rejected or failed is counted ONLY as wasted spend: it is in
  // `failedPacks`/`dropped` already, and counting it here too showed its cost twice.
  const finishedInWindow = packs.filter((pack) => {
    if (pack.status === 'failed' || pack.status === 'dropped') return false;
    const at = Date.parse(pack.renderedAt ?? '');
    return Number.isFinite(at) && at >= since;
  });
  const cost = summariseCosts(finishedInWindow, [...failedPacks, ...dropped]);

  return {
    date: gridDate(now),
    posted,
    failedPosts,
    scheduled,
    dropped,
    failedPacks,
    awaitingReview,
    archived,
    archivedDecided,
    autoApproveMinutes: Math.round(autoApproveMs() / 60_000),
    holdSensitive: holdSensitive(),
    slotsFilled: Object.keys(slots).length,
    cost,
    // A TikTok URL arrives minutes after publishing, via a separate event. Saying so stops
    // "no link" being read as "the post is missing".
    awaitingUrl: posted.filter((p) => !p.url).length,
  };
}

const esc = (text) => String(text ?? '').replace(/[_*[\]()~`>#+=|{}.!-]/g, (ch) => `\\${ch}`);

const usd = (n) => esc(`$${Number(n ?? 0).toFixed(2)}`);

/** The cost block: per production first, because that is the number to watch day to day. */
export function costLines(cost) {
  if (!cost || (!cost.stories && !cost.untracked && !cost.failedUsd)) return [];
  const lines = ['', '💷 *Production cost*'];
  if (cost.stories) {
    const s = cost.byStage;
    lines.push(
      `${cost.stories} stor${cost.stories === 1 ? 'y' : 'ies'} produced: ${usd(cost.totalUsd)} total, *${usd(cost.averageUsd)} each*`,
      `· script ${usd(s.script)} · voice ${usd(s.voice)} · images ${usd(s.images)} · render ${usd(s.render)}`,
    );
  }
  if (cost.untracked) {
    lines.push(`_${cost.untracked} produced before cost tracking began, not counted_`);
  }
  if (cost.failedUsd) {
    lines.push(`${usd(cost.failedUsd)} spent on ${cost.failedStories} stor${cost.failedStories === 1 ? 'y' : 'ies'} that failed or were dropped`);
  }
  lines.push("_Voice and render are estimates from measured rates; script and images are OpenRouter's billed amounts\\._");
  return lines;
}

/** The message. Problems first, then what went out, then what is still queued. */
export function digestMessage(digest) {
  const lines = [`*Merlows social — ${esc(digest.date)}*`];

  if (digest.failedPosts.length) {
    lines.push('', `🔴 *${digest.failedPosts.length} post\\(s\\) failed*`);
    for (const post of digest.failedPosts.slice(0, 6)) {
      lines.push(`· ${esc(post.format)} — ${esc(post.title)}: ${esc(String(post.error ?? '').slice(0, 90))}`);
    }
  }
  if (digest.failedPacks.length) {
    lines.push('', `🔴 *${digest.failedPacks.length} story\\(s\\) failed to produce*`);
    for (const pack of digest.failedPacks.slice(0, 6)) {
      lines.push(`· ${esc(pack.title ?? pack.contentId)}: ${esc(String(pack.error?.message ?? '').slice(0, 90))}`);
    }
  }
  if (digest.dropped.length) {
    lines.push('', `⚪ ${digest.dropped.length} dropped \\(aged out or rejected\\)`);
  }

  lines.push('', `✅ *${digest.posted.length} posted*`);
  for (const post of digest.posted.slice(0, 10)) {
    lines.push(post.url ? `· [${esc(post.format)}](${post.url}) — ${esc(post.title)}` : `· ${esc(post.format)} — ${esc(post.title)} \\(link pending\\)`);
  }
  if (digest.awaitingUrl) {
    lines.push(`_${digest.awaitingUrl} TikTok link\\(s\\) still resolving — they arrive a few minutes after posting\\._`);
  }

  if (digest.scheduled.length) lines.push('', `🕒 ${digest.scheduled.length} scheduled and not yet due`);
  if (digest.awaitingReview.length) {
    // Say what will actually happen to them. "They auto-approve" was false for sensitive
    // stories, for undelivered review requests, and whenever the timer is switched off.
    const auto = digest.autoApproveMinutes ?? 0;
    // Sensitive stories are only an exception while the hold is switched on (review.js).
    const held = digest.holdSensitive
      ? digest.awaitingReview.filter((pack) => pack.social?.sensitive).length
      : 0;
    let fate = 'nothing goes out until you decide';
    if (auto > 0) {
      fate = held
        ? `routine stories auto\\-approve after ${auto} min; ${held} sensitive never do`
        : `they auto\\-approve after ${auto} min`;
    }
    lines.push('', `⏳ *${digest.awaitingReview.length} waiting on your review* — ${fate}`);
  }
  if (digest.archivedDecided?.length) {
    // Problems first: this is a decision that has not taken effect.
    lines.splice(1, 0, '', `🟠 *${digest.archivedDecided.length} archived stor${digest.archivedDecided.length === 1 ? 'y has' : 'ies have'} a decision that was never acted on* — re\\-queued now; the next autopilot run acts on it`);
  }
  if (digest.archived?.length) {
    lines.push('', `📦 ${digest.archived.length} archived without a decision — still approvable from Telegram or the app`);
  }
  if (!digest.posted.length && !digest.scheduled.length && !digest.failedPosts.length) {
    lines.push('', '_Nothing went out today\\._');
  }
  lines.push(...costLines(digest.cost));
  return lines.join('\n');
}

/** Send it. Returns what was sent so the cron response says something useful. */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const digest = await buildDigest();
  // A decided-but-still-archived pack lost its re-queue, and nothing else ever looks at an
  // archived pack. Put it back; the next autopilot tick restores or drops it per the decision.
  for (const pack of digest.archivedDecided ?? []) {
    try {
      await kv.zadd(QUEUE_KEY, { score: Date.now(), member: pack.contentId });
    } catch (err) {
      console.error(`[digest] could not re-queue archived ${pack.contentId}: ${err?.message ?? err}`);
    }
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return res.status(503).json({ error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not configured', digest });
  }

  let sent = false;
  let error = null;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: digestMessage(digest),
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
      }),
    });
    const body = await response.json().catch(() => ({}));
    sent = Boolean(body?.ok);
    if (!sent) error = String(body?.description ?? `HTTP ${response.status}`).slice(0, 200);
  } catch (err) {
    error = String(err?.message ?? err).slice(0, 200);
  }

  // A digest that fails to send is exactly the situation nobody finds out about, so it is
  // logged loudly as well as returned.
  if (!sent) console.error(`[digest] could not send: ${error}`);
  return res.status(200).json({ sent, ...(error ? { error } : {}), digest });
}
