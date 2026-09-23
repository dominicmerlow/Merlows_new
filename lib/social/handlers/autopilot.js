// lib/social/handlers/autopilot.js
// The social autopilot worker.
//
//   GET|POST /api/social/autopilot        → cron tick: advance packs one stage each
//   GET      /api/social/autopilot/packs  → board for the UI (signed-in admin/content)
//   POST     /api/social/autopilot/retry  → body { contentId } → re-queue a failed pack
//
// One stage per pack per tick, a few packs per tick. Each stage is a different paid API and
// the function has 300s, so the tick stays small and predictable; a story that needs five
// stages simply takes five ticks (50 minutes at the 10-minute cron — well inside the day).

import { kv } from '../../kv.js';
import { buildPack } from '../pack/build-pack.js';
import { voicePack, applyAudio } from '../pack/voice.js';
import { imagePack, applyImages } from '../pack/images.js';
import {
  startRender, pollRender, renderStill, stillsFor, checkRender, isRenderableAsset,
  VIDEO_CUTS, RENDER_MAX_MS,
} from '../pack/render.js';
import {
  claim, dueContentIdsInRange, advance, fail, hold, drop, listPacks, getPack, requeue,
  savePack, clearLease, QUEUE_KEY, LIST_MAX,
} from '../pack/store.js';
import { needsReview, reviewState, requestReview, decide } from '../pack/review.js';
import { getCurrentUser } from '../../auth.js';
import { claimSlots, schedulePost } from '../pack/schedule.js';
import { getPost } from '../platforms/zernio.js';

const PACKS_PER_TICK = Number(process.env.SOCIAL_PACKS_PER_TICK) || 3;
/** Leave room inside the 300s function for the stage that is already running. */
const TICK_BUDGET_MS = Number(process.env.SOCIAL_TICK_BUDGET_MS) || 240_000;
/** How long a pack waits when its stage has no runner yet. */
const HOLD_MS = Number(process.env.SOCIAL_PACK_HOLD_MS) || 6 * 60 * 60_000;
/** A person can only re-queue a failed pack so many times before the cap means nothing. */
const MAX_MANUAL_RETRIES = Number(process.env.SOCIAL_PACK_MAX_MANUAL_RETRIES) || 3;
/** Ceiling for the voice stage, further bounded by what the tick has left. */
const VOICE_BUDGET_MS = Number(process.env.SOCIAL_TTS_BUDGET_MS) || 150_000;
/** How long to wait before polling a detached render again. */
const POLL_DELAY_MS = Number(process.env.SOCIAL_RENDER_POLL_MS) || 60_000;
/** Ceiling for the render-start stage: 6-8 stills, each a round trip to the render service. */
const RENDER_STAGE_BUDGET_MS = Number(process.env.SOCIAL_RENDER_STAGE_BUDGET_MS) || 150_000;
/** How many times one cut may be started before the pack gives up on it. */
const MAX_CUT_ATTEMPTS = Number(process.env.SOCIAL_MAX_CUT_ATTEMPTS) || 2;
/**
 * Don't START work on a story older than this.
 *
 * `enqueuePack` runs on every publish whether or not the autopilot is paused — deliberately,
 * because the pack record is also the idempotency guard, and skipping it during a pause would
 * mean a story could never be queued afterwards. The consequence is a queue that keeps filling
 * while production is off, so switching back on would otherwise buy an LLM script, nine voice
 * clips and two images for every article published during the outage, however stale.
 *
 * A story that is already part-way through is FINISHED regardless of age: the money is spent,
 * and the cheapest thing to do with it is post it.
 */
// Floored at one hour: a negative value would make EVERY queued pack older than the limit and
// retire the entire queue on the next tick, with no route back.
const MAX_PACK_AGE_MS = Math.max(1, Number(process.env.SOCIAL_MAX_PACK_AGE_HOURS) || 24) * 60 * 60_000;
/**
 * How many stale packs one tick may clear. Dropping one costs a KV write and no API calls, so
 * a backlog drains in a few ticks instead of at the rate real work is done — which is what
 * stops yesterday's queue starving today's stories.
 */
const STALE_SCAN_MAX = Number(process.env.SOCIAL_STALE_SCAN_MAX) || 40;
/** How many times to try to reach a reviewer before giving up on the send. */
const REVIEW_SEND_ATTEMPTS = Number(process.env.SOCIAL_REVIEW_SEND_ATTEMPTS) || 3;
/** A rendered pack that never wins a slot is dropped rather than queued forever. */
const UNSLOTTED_MAX_MS = (Number(process.env.SOCIAL_UNSLOTTED_MAX_HOURS) || 72) * 60 * 60_000;
/** A scheduled post not confirmed this long after its slot is treated as never posted. */
const POST_CONFIRM_MAX_MS = (Number(process.env.SOCIAL_POST_CONFIRM_MAX_HOURS) || 6) * 60 * 60_000;

/** Fetch the article's own text back out of the content store. */
async function loadArticle(pack) {
  const item = await kv.get(`content:${pack.contentId}`);
  if (!item) throw new Error(`content record ${pack.contentId} is gone`);
  const body = String(item.body ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → their text
    .replace(/[#*_>`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Content records in this store reach megabytes. The prompt is capped again inside
    // buildUserPrompt; this keeps the oversized string out of memory in the first place.
    .slice(0, 24_000);
  return {
    contentId: pack.contentId,
    // Coerced to a number: this id ends up in prompts and records, and it is writable
    // through the content API.
    wpPostId: Number(item.wpPostId ?? pack.wpPostId) || null,
    title: item.title,
    category: item.category,
    categoryId: item.category,
    source: item.sourceDocName || pack.source || null,
    heroImageUrl: item.heroImageUrl || pack.heroImageUrl || null,
    url: item.wpPostUrl || pack.url || null,
    body,
  };
}

/** queued → scripted: write the pack and fact-check it. */
async function stageScript(pack) {
  const article = await loadArticle(pack);
  const { pack: social, model, repaired } = await buildPack(article);
  // A hero the renderer will not accept is worse than no hero: it fails the pack at
  // composition selection, losing both cuts and every still. The usual case is a rule's
  // configured `heroImageFallbackUrl`, used whenever the hero step was skipped under budget
  // pressure — an operator-set URL on any host at all.
  const hero = article.heroImageUrl && isRenderableAsset(article.heroImageUrl) ? article.heroImageUrl : null;
  if (article.heroImageUrl && !hero) {
    // The host, not the URL: an operator who sets a fallback image needs to know WHICH host
    // was refused, and the rest of the URL is not theirs to have in a log line.
    let host = 'unparseable';
    try { host = new URL(article.heroImageUrl).hostname; } catch { /* keep the placeholder */ }
    console.warn(`[autopilot] ${pack.contentId}: hero image host ${host} is not allowed, rendering without it`);
  }
  return {
    social: {
      ...social,
      images: hero ? [{ src: hero, aspect: 16 / 9, alt: article.title }] : [],
    },
    // `repaired` says the first draft failed the fact guard and the model corrected it —
    // the signal worth watching, both for cost and for how often the model invents.
    meta: { model, repaired, scriptedAt: new Date().toISOString() },
    url: article.url,
    title: article.title,
  };
}

/** scripted → voiced: one British voice per story, clips stored in Blob. */
async function stageVoice(pack, { startedAt: tickStartedAt } = {}) {
  // The stage gets its OWN clock, bounded by what the tick has left. Passing the tick's
  // clock meant a pack starting late "spent" its whole budget before making a single call,
  // then failed for no reason and counted an attempt against itself.
  const remaining = TICK_BUDGET_MS - (Date.now() - (tickStartedAt ?? Date.now()));
  const { audio, voiceId, voiceName } = await voicePack(pack.social, {
    budgetMs: Math.max(20_000, Math.min(VOICE_BUDGET_MS, remaining)),
    voiceId: pack.voiceId, // pin the presenter a previous, partial run settled on
    // The storage folder is keyed on the CONTENT id, which the server generates. The article's
    // WordPress id is writable through the content API, and a crafted value would have let one
    // story's clips be written into another story's folder.
    pathId: pack.contentId,
    // Clips already made survive a retry, so a failure on the last line does not re-pay for
    // the first eight.
    existing: pack.audio ?? {},
    startedAt: Date.now(),
  });
  return { audio, social: applyAudio(pack.social, audio), voiceId, voiceName };
}

/** voiced → imaged: a 9:16 still per key point, so the story is not one photo repeated. */
async function stageImages(pack, { startedAt: tickStartedAt } = {}) {
  // The stage gets its OWN clock, like the voice and render stages. Handing it the tick's
  // clock meant a pack reaching this stage late had already "spent" its budget before making
  // a single call — it then generated nothing and, with no hero to fall back on, failed.
  const remaining = TICK_BUDGET_MS - (Date.now() - (tickStartedAt ?? Date.now()));
  const result = await imagePack(pack.social, {
    pathId: pack.contentId,
    existing: pack.stills ?? {},
    startedAt: Date.now(),
    budgetMs: Math.max(20_000, remaining),
  });
  const patch = { stills: result.stored, social: applyImages(pack.social, result) };
  // Out of time part-way. Stay rather than advance: nothing sends a pack BACK to this stage,
  // so a slide skipped here would simply never get its image. Checked BEFORE the empty-image
  // test below, because "ran out of time" is not "could not make one".
  if (!result.complete) return { stay: true, patch, note: 'stills unfinished' };
  // The templates require at least one image, so a pack with none fails zod INSIDE the
  // render sandbox — after the script, the voice and a full render have been paid for.
  // Fail here instead, at the cheap end, where a retry costs one image call.
  if (!result.images.length) {
    throw new Error('no usable image: the article has no hero and every generated still failed');
  }
  return patch;
}

/**
 * imaged → rendering: start the cloud renders.
 *
 * Videos are DETACHED — a 45-second render takes minutes, far longer than a function should
 * be held open — so this returns handles and a later tick polls them. The stills are quick
 * and render synchronously here.
 */
async function stageStartRenders(pack, { startedAt: tickStartedAt } = {}) {
  const stills = { ...(pack.renders?.stills ?? {}) };
  const handles = { ...(pack.renders?.handles ?? {}) };
  const cutAttempts = { ...(pack.renders?.cutAttempts ?? {}) };
  // Everything already paid for, in the shape the pack stores it. It travels on the thrown
  // error too: a started handle that is not persisted is a sandbox nobody can ever poll, so
  // nothing stops it and it bills until its own timeout.
  const carry = () => ({ renders: { ...(pack.renders ?? {}), stills, handles, cutAttempts } });

  // This stage's own clock, bounded by what the tick has left. Six to eight stills, each a
  // round trip to the render service, do not reliably fit in what remains of 300s — and the
  // tick only checks its budget BETWEEN packs, so without this the function dies mid-stage.
  const began = Date.now();
  const remaining = TICK_BUDGET_MS - (began - (tickStartedAt ?? began));
  const budget = Math.max(20_000, Math.min(RENDER_STAGE_BUDGET_MS, remaining));

  try {
    for (const spec of stillsFor(pack.social)) {
      if (stills[spec.key]) continue; // already made on an earlier attempt
      if (Date.now() - began > budget) {
        return { stay: true, patch: carry(), note: 'stills unfinished' };
      }
      const { url } = await renderStill(pack.social, spec, { contentId: pack.contentId });
      stills[spec.key] = url;
    }

    const wanted = VIDEO_CUTS.filter((cut) => !handles[cut] && !pack.renders?.videos?.[cut]);
    // Check the whole set BEFORE starting anything. Starting the viable cut and then
    // throwing for the exhausted one left a live render nothing would ever poll: the pack
    // cannot reach `rendering`, so that sandbox bills to its timeout for a file nobody reads.
    const exhausted = wanted.filter((cut) => (cutAttempts[cut] ?? 0) >= MAX_CUT_ATTEMPTS);
    if (exhausted.length) {
      // A cut that has already been rendered twice is not going to work on the third go,
      // and each go costs a full video render.
      throw new Error(exhausted.map((cut) => `${cut} failed ${cutAttempts[cut]} time(s)`).join('; '));
    }

    for (const cut of wanted) {
      try {
        const handle = await startRender(pack.social, cut, { contentId: pack.contentId });
        cutAttempts[cut] = (cutAttempts[cut] ?? 0) + 1;
        handles[cut] = handle;
      } catch (err) {
        // Counted only when a render may actually exist. A request WE abandoned on a timeout
        // may well have started one, so that counts; a refusal from the service did not, and
        // counting it would exhaust the cut over an outage and leave no way back.
        if (err?.name === 'AbortError') cutAttempts[cut] = (cutAttempts[cut] ?? 0) + 1;
        throw err;
      }
    }
  } catch (err) {
    throw Object.assign(err, carry());
  }
  return carry();
}

/**
 * rendering → rendered: poll the detached renders.
 *
 * While any render is still running the pack STAYS at this stage and comes back on a later
 * tick — a render in progress is not a failure, and counting it as one would burn the
 * attempt budget while the video was being made perfectly well.
 */
async function stagePollRenders(pack) {
  const handles = { ...(pack.renders?.handles ?? {}) };
  const videos = { ...(pack.renders?.videos ?? {}) };
  const failed = [];
  let pending = 0;

  // Iterate the CUTS, not the handles. Iterating the handles meant a failed cut — whose
  // handle had just been deleted — simply vanished: the next tick found nothing to poll,
  // reported nothing pending, and advanced the pack to `rendered` with the video missing.
  for (const cut of VIDEO_CUTS) {
    if (videos[cut]) continue;
    const handle = handles[cut];
    if (!handle) {
      failed.push(cut); // never started, or dropped by an earlier tick
      continue;
    }

    // ASK FIRST, then apply the deadline. Checking the clock before polling threw away
    // renders that had already finished and uploaded — the answer was sitting there and was
    // never requested. A handle with no `startedAt` (an older record) is stamped on its
    // first poll rather than treated as already expired.
    const startedAt = handle.startedAt ?? Date.now();
    if (!handle.startedAt) handles[cut] = { ...handle, startedAt };
    const result = await pollRender(handle);

    if (!result.done) {
      // Still running, and out of time: a handle that never reaches a terminal stage would
      // otherwise be polled forever.
      if (Date.now() - startedAt > RENDER_MAX_MS) {
        result.done = true;
        result.error = `render did not finish within ${Math.round(RENDER_MAX_MS / 60_000)} minutes`;
      } else {
        pending++;
        continue;
      }
    }
    const qa = result.error ? { ok: false, problems: [result.error] } : checkRender(result);
    if (!qa.ok) {
      console.error(`[autopilot] ${pack.contentId} ${cut}: ${qa.problems.join('; ')}`);
      delete handles[cut]; // a dead handle will never finish
      failed.push(cut);
      continue;
    }
    videos[cut] = { url: result.url, size: result.size };
  }

  const renders = { ...(pack.renders ?? {}), handles, videos };
  if (pending) return { stay: true, patch: { renders }, note: `${pending} render(s) still running` };
  if (failed.length) {
    // Back to `imaged`, where the one place that starts renders will start the missing cut
    // again — bounded by `cutAttempts`, which that stage counts and enforces. Going back is
    // what stops a failed cut being silently dropped; a re-render is cheap next to it,
    // because the stills and the other cut are already stored and get skipped.
    return {
      stay: true,
      patch: { renders, status: 'imaged' },
      note: `re-rendering ${failed.join(', ')}`,
    };
  }
  return { renders, renderedAt: new Date().toISOString() };
}

/**
 * rendered → slotted: hold for review, then claim slots and schedule the posts.
 *
 * The review gate sits HERE, at the last moment before anything is handed to a public
 * account, because this is the last moment at which stopping it is free. Once Zernio has the
 * post neither platform will let the API take it back.
 */
async function stageSchedule(pack, { startedAt: tickStartedAt } = {}) {
  // Send, and KEEP sending until it lands. A send that failed used to be recorded once and
  // never retried, and the auto-approve clock ran from it regardless — so one Telegram blip
  // meant a story published with nobody ever having been asked.
  const attempts = pack.review?.attempts ?? 0;
  // `!decision` matters: a decision made in the app before the send attempts are spent would
  // otherwise be ignored for up to three ticks while we kept trying to notify someone about
  // a story they have already ruled on — and, if Telegram is ever configured, would send
  // Approve/Reject buttons for a story that was already rejected.
  if (needsReview(pack) && !pack.review?.decision && pack.review?.sent !== true && attempts < REVIEW_SEND_ATTEMPTS) {
    const review = await requestReview(pack);
    const merged = { ...(pack.review ?? {}), ...review, attempts: attempts + 1 };
    // `requestedAt` is the moment a human was actually told, so it only advances on success.
    if (review.sent !== true && pack.review?.requestedAt) merged.requestedAt = pack.review.requestedAt;
    return {
      stay: true,
      patch: { review: merged },
      note: review.sent ? 'sent for review' : `review send failed (${attempts + 1}/${REVIEW_SEND_ATTEMPTS})`,
    };
  }

  const state = reviewState(pack);
  if (state.rejected) {
    // A person said no. That is an answer, not a failure, and it must not be retried.
    // `stop`, not `stay`: the stay path saves and re-queues, which would put the pack we
    // just dropped straight back into the working set.
    await drop(pack, `review: ${state.reason}`);
    return { stop: true, note: state.reason };
  }
  if (!state.released) return { stay: true, patch: {}, note: state.reason };

  const accounts = {
    instagram: process.env.ZERNIO_INSTAGRAM_ACCOUNT_ID,
    tiktok: process.env.ZERNIO_TIKTOK_ACCOUNT_ID,
  };
  const { assignments, dateISO } = await claimSlots(pack);
  if (!assignments.length) {
    // Every slot this pack could fill is taken or past. Hold rather than fail: tomorrow's
    // grid is empty, and a story that missed today is not a broken story. Bounded, though —
    // without a deadline a pack that never wins a slot sits here forever, holding one of the
    // three work slots on every tick for the rest of time.
    const waitingSince = Date.parse(pack.renderedAt ?? pack.updatedAt ?? '') || Date.now();
    if (Date.now() - waitingSince > UNSLOTTED_MAX_MS) {
      await drop(pack, `never won a slot within ${Math.round(UNSLOTTED_MAX_MS / 3_600_000)}h`);
      return { stop: true, note: 'gave up waiting for a slot' };
    }
    return { stay: true, patch: {}, note: 'no free slot in today\'s grid' };
  }

  const posts = [...(pack.posts ?? [])];
  const budget = TICK_BUDGET_MS - (Date.now() - (tickStartedAt ?? Date.now()));
  const began = Date.now();
  try {
    for (const slot of assignments) {
      if (posts.some((p) => p.format === slot.format && p.at === slot.at)) continue;
      // Stop STARTING posts when the tick is nearly spent. Being killed mid-loop would
      // leave posts live and absent from the record, which is what turns into a duplicate.
      if (Date.now() - began > Math.max(20_000, budget - 40_000)) {
        return { stay: true, patch: { posts, slotDate: dateISO }, note: 'tick budget spent mid-schedule' };
      }
      // Re-read immediately before going public: a Reject tapped while this tick was
      // running is otherwise overwritten by the snapshot we claimed with.
      const fresh = await getPack(pack.contentId);
      if (fresh?.review?.decision === 'rejected') {
        await drop({ ...fresh, posts }, `review: rejected by ${fresh.review.by ?? 'someone'} while scheduling`);
        return { stop: true, note: 'rejected while scheduling' };
      }
      posts.push(await schedulePost(pack, slot, { accounts }));
    }
  } catch (err) {
    // Anything already scheduled is PUBLIC and cannot be recalled, so it must be recorded
    // before the error escapes — otherwise a retry schedules it a second time.
    throw Object.assign(err, { posts });
  }

  console.warn(`[autopilot] scheduled ${pack.contentId}: ${posts.map((p) => `${p.format}@${p.at}`).join(', ')}`);
  return { posts, slotDate: dateISO, review: { ...(pack.review ?? {}), released: state.reason } };
}

/**
 * slotted → done: confirm each scheduled post actually published.
 *
 * Zernio publishes at the slot time, which is usually hours after this stage ran, so the pack
 * waits here. The webhook updates posts as they land; this is the poll that catches the ones
 * whose webhook never arrived.
 */
async function stageConfirmPosts(pack) {
  const posts = [...(pack.posts ?? [])];
  if (!posts.length) throw new Error('pack is slotted but has no posts recorded');

  let pending = 0;
  const problems = [];
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    if (['published', 'failed'].includes(post.status)) {
      if (post.status === 'failed') problems.push(`${post.format}: ${post.error ?? 'failed'}`);
      continue;
    }
    if (Date.parse(post.at) > Date.now()) { pending++; continue; } // not due yet
    if (!post.zernioPostId) {
      // Zernio accepted the request without returning an id, so there is nothing to poll.
      posts[i] = { ...post, status: 'failed', error: 'no Zernio post id was returned' };
      problems.push(`${post.format}: no Zernio post id`);
      continue;
    }
    const live = await getPost(post.zernioPostId);
    // The per-platform state is the authority; the overall one is a summary and its wording
    // varies ('completed', 'partial', 'posted'), any of which would otherwise read as
    // "still scheduled" and keep the pack here forever.
    const publishedNow = live.status === 'published'
      || live.accepted.some((entry) => entry.status === 'published');
    let state = live.failed.length ? 'failed' : (publishedNow ? 'published' : 'scheduled');
    if (state === 'scheduled' && Date.now() - Date.parse(post.at) > POST_CONFIRM_MAX_MS) {
      // Long past its slot and still unconfirmed. Say so rather than polling for ever: an
      // unconfirmed post is something a person needs to look at in the app.
      state = 'failed';
      problems.push(`${post.format}: never confirmed ${Math.round(POST_CONFIRM_MAX_MS / 3_600_000)}h after its slot`);
    }
    posts[i] = {
      ...post,
      status: state,
      url: live.accepted[0]?.url ?? post.url ?? null,
      ...(state === 'failed'
        ? { error: live.failed.map((f) => f.error ?? f.status).join('; ') || 'never confirmed' }
        : {}),
    };
    if (state === 'failed' && live.failed.length) problems.push(`${post.format}: ${posts[i].error}`);
    else if (state !== 'published') pending++;
  }

  if (pending) return { stay: true, patch: { posts }, note: `${pending} post(s) not yet published` };
  if (problems.length) throw Object.assign(new Error(problems.join(' | ')), { posts });
  return { posts, postedAt: new Date().toISOString() };
}

/** The pipeline, end to end. */
const STAGE_RUNNERS = {
  queued: stageScript,
  scripted: stageVoice,
  voiced: stageImages,
  imaged: stageStartRenders,
  rendering: stagePollRenders,
  rendered: stageSchedule,
  slotted: stageConfirmPosts,
};

/**
 * Master switch. Set SOCIAL_AUTOPILOT=off in Vercel to stop all social production without a
 * deploy: nothing is generated, nothing is spent, and queued packs simply wait. Anything
 * that posts publicly in the brand's name needs a stop button that works in seconds.
 */
export const isPaused = () => String(process.env.SOCIAL_AUTOPILOT ?? '').toLowerCase() === 'off';

/**
 * The switch that actually works in seconds.
 *
 * Vercel injects env vars at DEPLOY time, so flipping `SOCIAL_AUTOPILOT` in the dashboard
 * does nothing until a redeploy — no use at all when something is going out wrong right now.
 * A KV flag takes effect on the next tick; the env var stays as the belt-and-braces version.
 */
export async function isPausedNow() {
  if (isPaused()) return true;
  try {
    return Boolean(await kv.get('social:autopilot:paused'));
  } catch {
    return false; // a KV blip must not silently stop production either
  }
}

/**
 * Has this story gone off before anyone started work on it?
 *
 * Measured from `requeuedAt` when a person has deliberately put the pack back, otherwise from
 * when it was enqueued. Reading `createdAt` alone made the board's Retry button a trapdoor:
 * a pack that failed at the script stage resumes at `queued`, so retrying it the next day —
 * exactly what the board is for — spent one of three manual retries and then had the pack
 * silently retired on the very next tick, with no route back from `dropped`.
 */
export function isStale(pack, now = Date.now()) {
  if (pack.status !== 'queued') return false; // already paid for: finish it
  const since = Date.parse(pack.requeuedAt ?? pack.createdAt ?? '');
  if (!Number.isFinite(since)) return false; // no timestamp is not evidence of age
  return now - since > MAX_PACK_AGE_MS;
}

export async function runTick({ startedAt = Date.now() } = {}) {
  if (await isPausedNow()) return { paused: true, processed: 0, results: [] };
  // Read the two ENDS of the queue, not the first N of it.
  //
  // The queue is scored by when a pack is next due, and a pack nobody has worked still
  // carries its enqueue time — so the stale ones are always a prefix. Taking the first 43
  // ids meant that once a backlog passed 43, every id in the window was stale and today's
  // story was never reached at all: not lost, but delayed a tick for every 40 packs behind
  // it. Two windows keep the drain and the work independent of each other.
  const now = Date.now();
  const cutoff = now - MAX_PACK_AGE_MS;
  const [aged, fresh] = await Promise.all([
    dueContentIdsInRange(0, cutoff, STALE_SCAN_MAX),
    dueContentIdsInRange(cutoff, now, PACKS_PER_TICK),
  ]);
  // The windows share a boundary score, so an id can appear in both.
  const ids = [...new Set([...aged, ...fresh])];
  const results = [];
  const counts = { dueSeen: ids.length, worked: 0, dropped: 0, requeued: 0, claimedByOther: 0 };
  let worked = 0;

  for (const contentId of ids) {
    if (Date.now() - startedAt > TICK_BUDGET_MS) {
      results.push({ contentId, skipped: 'tick budget spent' });
      continue;
    }
    const pack = await claim(contentId);
    if (!pack) {
      counts.claimedByOther++;
      continue; // another tick took it
    }

    if (isStale(pack)) {
      // Dropped, not failed: nothing went wrong, the story simply aged out while production
      // was off. Logged as well as recorded, because a cron tick's response body goes
      // nowhere — the month of silently-missing articles in this project's history was
      // exactly that: failures pushed onto a results object nobody ever reads.
      const reason = `older than ${Math.round(MAX_PACK_AGE_MS / 3_600_000)}h when work would have started`;
      console.warn(`[autopilot] dropped ${contentId} (${pack.title ?? 'untitled'}): ${reason}`);
      await drop(pack, reason);
      results.push({ contentId, dropped: 'stale' });
      counts.dropped++;
      continue;
    }

    if (worked >= PACKS_PER_TICK) {
      // Fresh, but this tick is full. Put it back at the front rather than holding a lease.
      await requeue(await savePack({ ...pack, ...clearLease }));
      counts.requeued++;
      continue;
    }
    worked++;

    // A terminal pack should never be in the queue — but a tick killed between `drop`'s save
    // and its `zrem` leaves one there, and `hold` would then re-park it every six hours
    // forever, burning a work slot each time.
    if (['done', 'failed', 'dropped'].includes(pack.status)) {
      await kv.zrem(QUEUE_KEY, contentId);
      results.push({ contentId, status: pack.status, removed: 'terminal pack left in the queue' });
      continue;
    }

    const runner = STAGE_RUNNERS[pack.status];
    if (!runner) {
      // Nothing can advance this pack yet (the later stages are not built). HOLD it — with a
      // long delay — rather than dropping it: `claim` has already taken it out of the working
      // set, so simply continuing would have evicted every pack permanently, and shipping the
      // later stages would not have brought any of them back.
      await hold(pack, HOLD_MS);
      results.push({ contentId, status: pack.status, held: 'no runner for this stage yet' });
      continue;
    }

    try {
      const patch = await runner(pack, { startedAt });
      // A stage may end the pack itself (a rejected review). It has already written the
      // record and taken it off the queue, so anything further here would undo that.
      if (patch?.stop) {
        results.push({ contentId, status: pack.status, stopped: patch.note ?? 'stopped' });
        continue;
      }
      // A stage may ask to STAY — a detached render still running is not progress and not a
      // failure. Saving and re-queueing keeps the pack moving without spending an attempt.
      if (patch?.stay) {
        const saved = await savePack({ ...pack, ...(patch.patch ?? {}), ...clearLease });
        await requeue(saved, POLL_DELAY_MS);
        results.push({ contentId, status: pack.status, waiting: patch.note ?? 'in progress' });
        continue;
      }
      const updated = await advance(pack, patch);
      results.push({ contentId, from: pack.status, to: updated.status });
    } catch (err) {
      // Keep whatever the stage paid for before it failed (voice clips, stills), so the
      // retry resumes instead of buying them again.
      const progress = {};
      if (err?.audio) progress.audio = { ...(pack.audio ?? {}), ...err.audio };
      if (err?.renders) progress.renders = err.renders;
      // Posts matter most of all: anything already handed to Zernio is scheduled against a
      // public account and cannot be recalled. Losing the record would mean a retry
      // scheduling it a second time.
      if (err?.posts) progress.posts = err.posts;
      const { terminal } = await fail({ ...pack, ...progress }, pack.status, err);
      results.push({ contentId, status: pack.status, error: err.message, terminal });
    }
  }

  counts.worked = worked;
  // `dueSeen` at its ceiling means the read window is saturated and there is more behind it
  // than this tick could see — the one number that makes a growing backlog visible.
  return { processed: results.length, counts, results };
}

export default async function handler(req, res, action) {
  if (!action) {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    const tick = await runTick();
    return res.status(200).json({ ranAt: new Date().toISOString(), ...tick });
  }

  if (action === 'packs' && req.method === 'GET') {
    // `listPacks` clamps too; belt and braces, because an uncapped limit here is what turns
    // a board refresh into a connection flood.
    const packs = await listPacks(Math.min(Number(req.query?.limit) || 50, LIST_MAX));
    return res.status(200).json({
      packs: packs.map((p) => ({
        contentId: p.contentId,
        title: p.title ?? p.social?.headline ?? null,
        categoryId: p.categoryId,
        status: p.status,
        hook: p.social?.hook ?? null,
        sensitive: p.social?.sensitive ?? false,
        voice: p.voiceName ?? null,
        error: p.error ?? null,
        updatedAt: p.updatedAt,
        // Enough for the board to show what is actually scheduled, without shipping the
        // whole record: a pack carries its script, its audio map and its render handles.
        review: p.review
          ? { requestedAt: p.review.requestedAt ?? null, decision: p.review.decision ?? null, by: p.review.by ?? null }
          : null,
        posts: (p.posts ?? []).map((post) => ({
          format: post.format,
          at: post.at,
          status: post.status,
          url: post.url ?? null,
          error: post.error ?? null,
        })),
      })),
    });
  }

  // POST /social/autopilot/pause  body { paused: true|false }
  // The stop button needs a writer, or "set the KV flag" means "ask a developer with a REPL".
  // NB: it must be written through lib/kv.js so it lands in this project's namespace —
  // scripts/*.mjs bypass KV_PREFIX and would write it where nothing reads it.
  if (action === 'pause') {
    if (req.method === 'GET') {
      return res.status(200).json({ paused: await isPausedNow(), byEnv: isPaused() });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const paused = Boolean(req.body?.paused);
    await kv.set('social:autopilot:paused', paused);
    console.warn(`[autopilot] production ${paused ? 'PAUSED' : 'resumed'}`);
    return res.status(200).json({ paused: await isPausedNow(), byEnv: isPaused() });
  }

  // POST /social/autopilot/review  body { contentId, decision: 'approved'|'rejected' }
  //
  // The review decision, from the app rather than from Telegram. This is the stronger of the
  // two paths and the one to prefer: it is behind a session and an admin/content role, where
  // the Telegram buttons authenticate only with a shared bot secret and have no allowlist of
  // who may press them — anyone in that chat can release what the brand publishes.
  if (action === 'review') {
    // 405 rather than falling through to the handler's 404: a GET here is a caller using the
    // wrong verb on a route that exists, and "not found" sends them looking for the wrong bug.
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { contentId, decision } = req.body || {};
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: "decision must be 'approved' or 'rejected'" });
    }
    // Shape-checked, not just non-empty: `PACK_KEY('queue')` collides with the queue's own
    // key and `PACK_KEY('index')` with the index, so an unconstrained id turns a GET into a
    // WRONGTYPE whose error message the catch-all returns verbatim — disclosing KV_PREFIX
    // and the internal key names. Content ids are UUIDs; this is the shape the rest of the
    // app already enforces.
    if (typeof contentId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(contentId)) {
      return res.status(400).json({ error: 'contentId is required' });
    }
    const who = (await getCurrentUser(req))?.email ?? 'signed-in user';
    const outcome = await decide(contentId, decision, who);
    // 409, not 500: "already approved" and "too late, it is scheduled" are both normal
    // answers, and the reason is what the operator needs to see.
    if (!outcome.ok) return res.status(409).json({ error: outcome.reason });
    return res.status(200).json({ contentId, decision, by: who });
  }

  if (action === 'retry' && req.method === 'POST') {
    const { contentId } = req.body || {};
    const pack = typeof contentId === 'string' && contentId ? await getPack(contentId) : null;
    if (!pack) return res.status(404).json({ error: 'No such pack' });
    // Only a FAILED pack may be retried, and only a few times. Clearing `attempts` resets the
    // spend cap, so without these two rules one signed-in user could re-run the LLM and voice
    // stages every ten minutes for as long as they liked.
    if (pack.status !== 'failed') {
      return res.status(409).json({ error: `Only a failed pack can be retried (this one is ${pack.status})` });
    }
    if (pack.leaseUntil && pack.leaseUntil > Date.now()) {
      return res.status(409).json({ error: 'A worker is holding this pack; try again shortly' });
    }
    const manualRetries = (pack.manualRetries ?? 0) + 1;
    if (manualRetries > MAX_MANUAL_RETRIES) {
      return res.status(429).json({ error: `Manual retry limit (${MAX_MANUAL_RETRIES}) reached for this pack` });
    }
    // Resume at the stage that failed rather than restarting: re-running the script stage
    // would pay for a fresh LLM call and replace the reviewed script with a different one.
    const resumeAt = pack.error?.stage ?? 'queued';
    // `leaseAttempts` is cleared with `attempts`: leaving it set meant a retried pack was
    // killed again on its very next claim, having spent one of the three manual retries.
    // `cutAttempts` too — it is cumulative over the pack's whole life, so a render service
    // that erred twice left the cut permanently exhausted and the retry throwing instantly.
    const cleared = await savePack({
      ...pack,
      attempts: {},
      ...clearLease,
      renders: pack.renders ? { ...pack.renders, cutAttempts: {} } : pack.renders,
      manualRetries,
      error: null,
      status: resumeAt,
      // Resets the staleness clock. A pack resumed at `queued` is judged from THIS moment,
      // not from when the article was published — otherwise retrying anything older than the
      // age limit just hands it straight to the stale gate on the next tick.
      requeuedAt: new Date().toISOString(),
    });
    await requeue(cleared);
    return res.status(200).json({ contentId: pack.contentId, status: cleared.status, manualRetries });
  }

  return res.status(404).json({ error: 'Not found' });
}
