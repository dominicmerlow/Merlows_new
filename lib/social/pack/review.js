// lib/social/pack/review.js
// The launch review gate: nothing is scheduled for a public account until a person has
// approved it, or until the auto-approve window has passed.
//
// This is the control that makes the rest of the pipeline safe to run unattended. The fact
// guard proves a clip matches its ARTICLE; it cannot prove the article is right, and whoever
// can write the article controls both sides. Neither Instagram nor TikTok lets the API delete
// a post, so the only place to catch a bad one is before it goes.
//
// The gate is deliberately time-boxed rather than blocking: a missed Telegram message must
// not silently stop a day's posting, so an undecided pack is released after the window. That
// is a trade — it means an unwatched account posts unreviewed after an hour — which is why
// `sensitive` packs can be held permanently and why the window is configurable.

import { kv } from '../../kv.js';

/** on = every pack, sensitive = only packs the script flagged, off = nothing is held. */
export const GATE = () => String(process.env.SOCIAL_REVIEW_GATE ?? 'on').toLowerCase();
/**
 * An undecided pack is released after this long. 0 disables auto-approval entirely.
 *
 * A function, like `GATE`, not a module-load constant. Two controls that read the same kind
 * of setting should not differ in when they read it: as a `const` this one was fixed at
 * import time, so it silently ignored any later change while its neighbour did not — and
 * nothing in the code said so.
 */
export const autoApproveMs = () => Number(process.env.SOCIAL_REVIEW_AUTO_MINUTES ?? 60) * 60_000;

/** Does this pack need a human before it can be scheduled? */
export function needsReview(pack) {
  const gate = GATE();
  if (gate === 'off') return false;
  if (gate === 'sensitive') return Boolean(pack?.social?.sensitive);
  return true;
}

/**
 * Is the pack cleared to be scheduled?
 *
 * Returns the reason as well as the verdict, because "a person approved this" and "nobody
 * looked and the clock ran out" are very different facts and both end up on the record.
 */
export function reviewState(pack, now = Date.now()) {
  // A recorded rejection outranks everything, including the gate being switched off later
  // or the pack ceasing to count as sensitive. Somebody said no to this story; no change of
  // configuration afterwards should turn that into a yes.
  if (pack?.review?.decision === 'rejected') {
    return { released: false, rejected: true, reason: `rejected by ${pack.review.by ?? 'someone'}` };
  }
  if (!needsReview(pack)) {
    // Distinguished, because "the gate is off" and "the gate is on but this story is not
    // flagged" are different facts, and this string is what the board and the logs show.
    return { released: true, reason: GATE() === 'off' ? 'gate off' : 'not flagged for review' };
  }
  const review = pack?.review;
  if (!review?.requestedAt) return { released: false, reason: 'not yet sent for review' };
  // An explicit decision is honoured even if the message never landed — someone clearly saw
  // it. Checked BEFORE `sent`, and before the gate, so a rejection is never lost.
  if (review.decision === 'rejected') return { released: false, rejected: true, reason: `rejected by ${review.by ?? 'someone'}` };
  if (review.decision === 'approved') return { released: true, reason: `approved by ${review.by ?? 'someone'}` };
  // The auto-approve clock only runs once a human has actually been told. Deciding on
  // `requestedAt` alone made "we tried to reach someone and failed" identical to "someone
  // was asked and hasn't replied" — so with Telegram misconfigured or briefly down, every
  // pack released itself to live accounts an hour later and nobody was ever told.
  if (review.sent !== true) {
    return { released: false, reason: `review request not delivered (${review.error ?? 'unknown'})` };
  }
  const window = autoApproveMs();
  const waited = now - Date.parse(review.requestedAt);
  if (window > 0 && Number.isFinite(waited) && waited >= window) {
    return { released: true, auto: true, reason: `auto-approved after ${Math.round(window / 60_000)} min` };
  }
  return { released: false, reason: 'waiting for a decision' };
}

const escapeMd = (text) => String(text ?? '').replace(/[_*[\]()~`>#+=|{}.!-]/g, (ch) => `\\${ch}`);

/** What the reviewer sees. Enough to judge it without opening anything. */
export function reviewMessage(pack) {
  const social = pack.social ?? {};
  const cuts = Object.keys(pack.renders?.videos ?? {});
  const lines = [
    `*Merlows social — review*`,
    `*${escapeMd(social.headline ?? pack.title ?? 'Untitled')}*`,
    ``,
    `_Hook:_ ${escapeMd(social.hook ?? '')}`,
    ...(social.midHook ? [`_Mid:_ ${escapeMd(social.midHook)}`] : []),
    ``,
    ...(social.points ?? []).slice(0, 5).map((p, i) => `${i + 1}\\. ${escapeMd(p.caption)}`),
    ``,
    `_Category:_ ${escapeMd(pack.categoryId ?? '?')}${social.sensitive ? ' · *SENSITIVE*' : ''}`,
    `_Cuts:_ ${escapeMd(cuts.join(', ') || 'none')}`,
  ];
  if (autoApproveMs() > 0) {
    lines.push(`_Auto\\-approves in ${Math.round(autoApproveMs() / 60_000)} min if nobody replies\\._`);
  }
  return lines.join('\n');
}

/**
 * Send a pack for review and record that we did.
 *
 * The record is written even when Telegram fails, and `sent: false` is stored with it. The
 * alternative — treating a failed send as "not requested" — would re-send on every tick, and
 * a Telegram outage would either spam the channel or silently hold every pack forever.
 */
export async function requestReview(pack, { fetchFn = fetch, now = Date.now() } = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  let sent = false;
  let error = null;

  if (!token || !chatId) {
    error = 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not configured';
  } else {
    try {
      const res = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: reviewMessage(pack),
          parse_mode: 'MarkdownV2',
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Approve', callback_data: `sapprove:${pack.contentId}` },
              { text: '🚫 Reject', callback_data: `sreject:${pack.contentId}` },
            ]],
          },
        }),
      });
      const body = await res.json().catch(() => ({}));
      sent = Boolean(body?.ok);
      if (!sent) error = String(body?.description ?? `HTTP ${res.status}`).slice(0, 160);
    } catch (err) {
      error = String(err?.message ?? err).slice(0, 160);
    }
  }

  if (!sent) console.error(`[review] could not send ${pack.contentId} for review: ${error}`);
  return { requestedAt: new Date(now).toISOString(), sent, ...(error ? { error } : {}) };
}

/**
 * Record a decision from the Telegram buttons.
 *
 * First decision wins: the buttons stay on the message after it is answered, and two taps —
 * or two people — must not flip an already-scheduled pack.
 */
export async function decide(contentId, decision, by, { store = kv } = {}) {
  if (!['approved', 'rejected'].includes(decision)) throw new Error(`unknown decision: ${decision}`);
  const key = `social:pack:${contentId}`;
  const pack = await store.get(key);
  if (!pack) return { ok: false, reason: 'no such pack' };
  // Refuse while a worker holds the pack. Both this and the tick write the WHOLE record, so
  // whoever saves last wins: a decision landing inside a stage was silently erased, the
  // reviewer was told "Rejected — not posting", and the record went back to awaiting a
  // decision with no trace. In the worst ordering the erased write also rolled the status
  // back and dropped the `posts` array, after which the pack claimed a fresh slot and posted
  // a second time — to an account no API can delete from. `/retry` already refuses on this
  // same basis, and `clearLease` means the lease is only set while a tick is mid-stage.
  if (pack.leaseUntil && pack.leaseUntil > Date.now()) {
    return { ok: false, reason: 'a worker is holding this pack; try again in a moment', pack };
  }
  if (pack.review?.decision) return { ok: false, reason: `already ${pack.review.decision}`, pack };
  if (pack.status !== 'rendered') {
    // Past this point the posts are already scheduled with Zernio, and nothing here can
    // recall them. Say so plainly rather than recording a decision that changes nothing.
    return { ok: false, reason: `too late — pack is ${pack.status}`, pack };
  }
  if (pack.posts?.length) {
    // Still `rendered`, but some posts are ALREADY scheduled — a schedule that ran out of
    // tick budget or failed part-way leaves exactly this state. Accepting a rejection here
    // told the operator "it will not be posted" while the posts that already went to Zernio
    // published at their slot times anyway. The honest answer is that it is too late.
    return { ok: false, reason: `too late — ${pack.posts.length} post(s) already scheduled`, pack };
  }
  const updated = {
    ...pack,
    review: { ...(pack.review ?? {}), decision, by: by ?? 'unknown', decidedAt: new Date().toISOString() },
    updatedAt: new Date().toISOString(),
  };
  await store.set(key, updated);
  return { ok: true, pack: updated };
}
