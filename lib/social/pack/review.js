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
import { QUEUE_KEY } from './store.js';

/** on = every pack, sensitive = only packs the script flagged, off = nothing is held. */
export const GATE = () => String(process.env.SOCIAL_REVIEW_GATE ?? 'on').toLowerCase();
/**
 * An undecided pack is released after this long. 0 disables auto-approval entirely.
 *
 * A function, like `GATE`, not a module-load constant. Two controls that read the same kind
 * of setting should not differ in when they read it: as a `const` this one was fixed at
 * import time, so it silently ignored any later change while its neighbour did not — and
 * nothing in the code said so.
 *
 * The board's switch (below) overrides the env var once `loadAutoApprove` has read it.
 *
 * With neither set, it is OFF. It used to default to 60, which meant a KV blip on a deployment
 * without the env var released every undecided routine story to the live accounts after an
 * hour — the failure has to land on "a person decides", never on "post unreviewed".
 */
export const autoApproveMs = () =>
  Number(boardMinutes ?? process.env.SOCIAL_REVIEW_AUTO_MINUTES ?? 0) * 60_000;

/**
 * The auto-approve switch on the Autopilot board.
 *
 * KV rather than the env var for the same reason as the pause flag: Vercel reads env vars at
 * deploy time, so changing `SOCIAL_REVIEW_AUTO_MINUTES` does nothing until a redeploy. The
 * stored value is `{ minutes }`, where 0 means off. It covers sensitive packs too, unless
 * `holdSensitive()` is switched back on.
 */
export const AUTO_APPROVE_KEY = 'social:autopilot:auto-approve';
export const AUTO_APPROVE_DEFAULT_MINUTES = 120;
/** Bounds on the board's window: under 5 minutes is not a review, over a day is "off". */
export const AUTO_APPROVE_MIN_MINUTES = 5;
export const AUTO_APPROVE_MAX_MINUTES = 24 * 60;

/** The board's value as last read; null means "no board setting, use the env var". */
let boardMinutes = null;

const validMinutes = (value) => {
  const n = Number(value);
  if (n === 0) return 0;
  return Number.isInteger(n) && n >= AUTO_APPROVE_MIN_MINUTES && n <= AUTO_APPROVE_MAX_MINUTES ? n : null;
};

/** What is in force now, and where it came from. */
export function autoApproveSetting() {
  const minutes = Math.round(autoApproveMs() / 60_000);
  return {
    enabled: minutes > 0,
    minutes,
    source: boardMinutes === null ? 'env' : 'board',
    // So the board can say truthfully whether sensitive stories are covered by the timer.
    holdSensitive: holdSensitive(),
  };
}

/**
 * Read the board's setting into this instance. Called at the start of each tick and digest,
 * so every decision in them sees one value.
 *
 * A failed or malformed read falls back to the env var rather than keeping a value this
 * instance read earlier: production has the env var at 0, so a KV blip fails towards
 * "a person decides", never towards posting unreviewed.
 */
export async function loadAutoApprove(store = kv) {
  try {
    const stored = await store.get(AUTO_APPROVE_KEY);
    boardMinutes = stored == null ? null : validMinutes(stored.minutes);
  } catch {
    boardMinutes = null;
  }
  return autoApproveSetting();
}

/** Write the board's setting. `enabled: false` stores 0; turning on without minutes uses the default. */
export async function setAutoApprove({ enabled, minutes } = {}, store = kv) {
  if (typeof enabled !== 'boolean') throw Object.assign(new Error('enabled must be true or false'), { status: 400 });
  const value = enabled ? validMinutes(minutes ?? AUTO_APPROVE_DEFAULT_MINUTES) : 0;
  if (!value && enabled) {
    throw Object.assign(
      new Error(`minutes must be a whole number from ${AUTO_APPROVE_MIN_MINUTES} to ${AUTO_APPROVE_MAX_MINUTES}`),
      { status: 400 },
    );
  }
  await store.set(AUTO_APPROVE_KEY, { minutes: value, updatedAt: new Date().toISOString() });
  return loadAutoApprove(store);
}

/**
 * Should a story the script flagged as sensitive wait for a person however long it takes?
 *
 * OFF by default since 2026-10-01, on Clifton's instruction: the articles are checked before
 * they are published, so a sensitive story auto-approves on the same clock as any other. It
 * used to be held unconditionally. `SOCIAL_REVIEW_HOLD_SENSITIVE=on` (and a redeploy) brings
 * the hold back. A Reject still always wins, and the `sensitive` review gate is unaffected.
 */
export const holdSensitive = () =>
  String(process.env.SOCIAL_REVIEW_HOLD_SENSITIVE ?? 'off').trim().toLowerCase() === 'on';

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
  // An explicit decision is honoured even if the message never landed — someone clearly saw
  // it. Checked BEFORE `sent`, and before `requestedAt`: a story approved in the app before
  // its review message ever went out has no `requestedAt`, and the send is (rightly) skipped
  // once a decision exists — so checking `requestedAt` first held it forever.
  if (review?.decision === 'rejected') return { released: false, rejected: true, reason: `rejected by ${review.by ?? 'someone'}` };
  if (review?.decision === 'approved') return { released: true, reason: `approved by ${review.by ?? 'someone'}` };
  if (!review?.requestedAt) return { released: false, reason: 'not yet sent for review' };
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
    // With the hold switched on, a story the script flagged as sensitive never goes out on a
    // timer. Off (the default), it is released like any other — see `holdSensitive`.
    if (pack?.social?.sensitive && holdSensitive()) {
      return { released: false, reason: 'sensitive — waiting for a person, never auto-approved' };
    }
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
  if (social.sensitive && holdSensitive()) {
    lines.push(`_Sensitive: this one waits for a person and never auto\\-approves\\._`);
  } else if (autoApproveMs() > 0) {
    lines.push(`_Auto\\-approves in ${Math.round(autoApproveMs() / 60_000)} min if nobody replies\\._`);
  }
  return lines.join('\n');
}

/**
 * A finished asset URL fit for a Telegram URL button, or null.
 *
 * Telegram rejects the WHOLE message when any button URL is invalid, so anything that is not a
 * clean https URL is left out rather than risked. Blob hands back download URLs
 * (`?download=1`, served as an attachment); the query is dropped so the link plays in a browser.
 */
function previewUrl(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    url.searchParams.delete('download');
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Link buttons to the finished assets, so the reviewer watches the thing before approving it.
 * A gate that asks for approval of a video nobody has seen is a rubber stamp. Links rather
 * than uploads: a render can be 95 MB and Telegram fetches by URL only up to 20 MB.
 */
export function previewButtons(pack) {
  const row = [
    ['▶ Reel', pack?.renders?.videos?.reel?.url],
    ['▶ TikTok', pack?.renders?.videos?.tiktok?.url],
    ['🖼 Carousel', pack?.renders?.stills?.cover],
  ]
    .map(([text, raw]) => ({ text, url: previewUrl(raw) }))
    .filter((button) => button.url);
  return row.length ? [row] : [];
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
  let messageId = null;

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
            inline_keyboard: [
              [
                { text: '✅ Approve', callback_data: `sapprove:${pack.contentId}` },
                { text: '🚫 Reject', callback_data: `sreject:${pack.contentId}` },
              ],
              ...previewButtons(pack),
            ],
          },
        }),
      });
      const body = await res.json().catch(() => ({}));
      sent = Boolean(body?.ok);
      if (!sent) error = String(body?.description ?? `HTTP ${res.status}`).slice(0, 160);
      else messageId = body?.result?.message_id ?? null;
    } catch (err) {
      error = String(err?.message ?? err).slice(0, 160);
    }
  }

  if (!sent) console.error(`[review] could not send ${pack.contentId} for review: ${error}`);
  return {
    requestedAt: new Date(now).toISOString(),
    sent,
    // Kept so a decision made in the app can close the Telegram message too.
    ...(messageId ? { messageId, chatId: String(chatId) } : {}),
    ...(error ? { error } : {}),
  };
}

/**
 * Close the review message once a decision exists: take the Approve/Reject buttons off (the
 * preview links stay) and reply with who decided. Without this the buttons stay live on a
 * story that was already ruled on, and the chat reads as if nobody answered.
 *
 * Never throws: the decision is already recorded, and a cosmetic edit must not turn that into
 * an error the caller reports as a failure.
 */
export async function closeReviewMessage({ chatId, messageId, pack, record }, { fetchFn = fetch } = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId || !messageId || !record) return false;
  // Telegram reports a refusal as `ok: false` in a 4xx body, not as a thrown error — so each
  // call is checked, or a rejected edit would pass silently.
  const api = async (method, payload) => {
    const res = await fetchFn(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!body?.ok) throw new Error(`${method}: ${body?.description ?? `HTTP ${res.status}`}`);
  };
  const where = record.via === 'app' ? ' in the app' : '';
  let text;
  if (record.via === 'auto') {
    // Sent by the tick itself, at the moment it schedules the posts.
    const reason = String(record.reason ?? 'auto-approved');
    text = `⏱ ${reason.charAt(0).toUpperCase()}${reason.slice(1)} with no answer. It is being scheduled now.`;
  } else if (record.decision === 'approved') {
    text = `✅ Approved by ${record.by}${where}. It is scheduled on the next autopilot run.`;
  } else {
    text = `🚫 Rejected by ${record.by}${where}. It will not be posted.`;
  }
  try {
    await api('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: previewButtons(pack) },
    });
    // Plain text, no parse_mode: `by` is a Telegram username or an email address, and either
    // can carry characters MarkdownV2 would reject the whole message over.
    await api('sendMessage', {
      chat_id: chatId,
      text,
      reply_parameters: { message_id: messageId, allow_sending_without_reply: true },
    });
    return true;
  } catch (err) {
    console.error(`[review] could not close the review message for ${pack?.contentId}: ${err?.message ?? err}`);
    return false;
  }
}

/**
 * Tell the reviewer a story was archived for want of an answer. The original message keeps
 * its Approve/Reject buttons: a press on an archived story still counts, and brings it back.
 * Never throws — the pack is already archived either way.
 */
export async function noteArchived(pack, hours, { fetchFn = fetch } = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = pack?.review?.chatId;
  const messageId = pack?.review?.messageId;
  if (!token || !chatId || !messageId) return false;
  try {
    const res = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `📦 No answer after ${hours}h, so this story is archived. Nothing has been posted and nothing is lost: Approve or Reject above still works, here or in the app.`,
        reply_parameters: { message_id: messageId, allow_sending_without_reply: true },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!body?.ok) throw new Error(body?.description ?? `HTTP ${res.status}`);
    return true;
  } catch (err) {
    console.error(`[review] could not note the archiving of ${pack?.contentId}: ${err?.message ?? err}`);
    return false;
  }
}

/**
 * Where a pack's review decision lives: its OWN key, written once, never the pack record.
 *
 * It used to be a field on the pack record, and both `decide` and the worker tick read the
 * whole record, changed it and wrote it back. Whoever saved last won, so a Reject tapped while
 * a tick held an older copy was erased by the tick's save; the pack then auto-approved an hour
 * later while Telegram still said "Rejected — not posting", onto accounts no API can delete
 * from. A lease check narrowed the window but could not close it: the read and the write were
 * still two separate steps.
 *
 * A separate key written with SET NX makes the first decision final in ONE atomic step, and
 * the tick records its own automatic approval the same way before it schedules anything — so
 * a person and the auto-approve clock race for the same key and exactly one of them wins.
 */
export const DECISION_KEY = (contentId) => `social:pack:${contentId}:decision`;
/** Long past any pack's life at `rendered` (it is dropped after 72h unslotted). */
const DECISION_TTL_S = 30 * 24 * 60 * 60;

export async function readDecision(contentId, store = kv) {
  return (await store.get(DECISION_KEY(contentId))) ?? null;
}

/**
 * Record a decision if none exists yet. Returns `{ ok: true, record }` for the winner, or
 * `{ ok: false, existing }` with whatever got there first.
 */
export async function recordDecision(contentId, record, store = kv) {
  const won = await store.set(DECISION_KEY(contentId), record, { nx: true, ex: DECISION_TTL_S });
  if (won) return { ok: true, record };
  return { ok: false, existing: await readDecision(contentId, store) };
}

/**
 * The pack as the review gate should see it: the recorded decision laid over `pack.review`.
 * A pack decided before the decision key existed keeps its old in-record decision.
 */
export function withDecision(pack, record) {
  if (!record) return pack;
  return { ...pack, review: { ...(pack.review ?? {}), ...record } };
}

const describeDecision = (record) => `${record?.decision ?? 'decided'}${record?.by ? ` by ${record.by}` : ''}`;

/**
 * Record a person's decision, from the Telegram buttons or the app.
 *
 * First decision wins: the buttons stay on the message after it is answered, and two taps —
 * or two people, or a tap racing the auto-approve clock — must not flip a pack.
 */
export async function decide(contentId, decision, by, { store = kv, postNow = false, byId = null, via = 'app' } = {}) {
  if (!['approved', 'rejected'].includes(decision)) throw new Error(`unknown decision: ${decision}`);
  const pack = await store.get(`social:pack:${contentId}`);
  if (!pack) return { ok: false, reason: 'no such pack' };
  // Decided before the decision key existed.
  if (pack.review?.decision) return { ok: false, reason: `already ${pack.review.decision}`, pack };
  // `archived` too: a story nobody answered in time is parked, not thrown away, and deciding on
  // it is how it comes back (approved) or goes for good (rejected). See stageArchived.
  if (pack.status !== 'rendered' && pack.status !== 'archived') {
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
  const record = {
    decision,
    by: by ?? 'unknown',
    // The stable identity behind `by`. A Telegram display name is neither unique nor fixed.
    ...(byId != null ? { byId: String(byId) } : {}),
    via,
    decidedAt: new Date().toISOString(),
    // Only ever meaningful on an approval; recording it on a rejection would be noise that
    // a later reader could mistake for intent.
    ...(decision === 'approved' && postNow ? { postNow: true } : {}),
  };
  const outcome = await recordDecision(contentId, record, store);
  if (!outcome.ok) {
    // An archived pack with a decision already recorded is one whose re-queue was lost —
    // otherwise the tick would have restored or dropped it by now, and nothing else ever looks
    // at an archived pack. A second press re-queues it; the recorded decision still stands.
    if (pack.status === 'archived') {
      try {
        await store.zadd?.(QUEUE_KEY, { score: Date.now(), member: contentId });
      } catch (err) {
        console.error(`[review] could not re-queue archived ${contentId}: ${err?.message ?? err}`);
      }
    }
    return { ok: false, reason: `already ${describeDecision(outcome.existing)}`, pack: withDecision(pack, outcome.existing) };
  }
  // Make the pack due now. A pack waiting on review is only looked at every twenty minutes or
  // so, and a decision should not sit that long before it takes effect. For a `rendered` pack
  // this is best effort — the next routine look acts on the decision regardless. For an
  // `archived` one it is the ONLY way back into the queue, so it is tried twice, and a failure
  // is shouted about (the digest also lists decided-but-still-archived stories).
  for (let attempt = 1; attempt <= (pack.status === 'archived' ? 2 : 1); attempt++) {
    try {
      await store.zadd?.(QUEUE_KEY, { score: Date.now(), member: contentId });
      break;
    } catch (err) {
      console.error(`[review] could not re-queue ${contentId} after a decision (attempt ${attempt}, ${pack.status}): ${err?.message ?? err}`);
    }
  }
  return { ok: true, pack: withDecision(pack, record), record };
}
