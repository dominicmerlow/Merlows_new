// lib/social/pack/cost.js
// What each story cost to produce, stage by stage.
//
// The record is what was PAID, not what the finished story "should" cost: a retried stage,
// a fallback model and a re-rendered cut all add to it. That is the number worth watching —
// a story whose script needed three models is the one to look at.
//
// Two kinds of figure live here, and the record says which is which:
// - Actual: OpenRouter returns `usage.cost` (USD) on chat completions, so the script and the
//   image calls are charged at what OpenRouter billed.
// - Estimated: the speech endpoint returns audio, not a bill, and the render service reports
//   no CPU time. Those are priced from the rates below, which come from measurements
//   (render: the first live set, 2026-09-24) and published prices (Fish Audio). A stage
//   with any estimated charge in it is marked `estimated: true`.

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** Rates, read on each call so a changed env var takes effect without a redeploy of code. */
export const rates = () => ({
  /** Script fallback when OpenRouter omits `usage.cost`: USD per million tokens (Gemini 2.5 Flash). */
  scriptInputPerM: num(process.env.SOCIAL_COST_SCRIPT_IN_PER_M, 0.3),
  scriptOutputPerM: num(process.env.SOCIAL_COST_SCRIPT_OUT_PER_M, 2.5),
  /** Fish Audio S2.1 Pro: USD per million characters. `:free` models cost nothing. */
  ttsPerMChars: num(process.env.SOCIAL_COST_TTS_PER_M_CHARS, 15),
  /** Image fallback when OpenRouter omits `usage.cost`: USD per image. */
  imageUsd: num(process.env.SOCIAL_COST_IMAGE_USD, 0.03),
  /** One carousel slide or story card: $0.012 for seven, measured 2026-09-24. */
  stillUsd: num(process.env.SOCIAL_COST_STILL_USD, 0.0017),
  /**
   * A video render, per minute its sandbox is alive: ~$0.035 over ~9.5 min, measured
   * 2026-09-24. Wall time, not CPU time, because the sandbox bills until the next poll stops
   * it — so a slow poll costs money, and this is where that shows up.
   */
  videoUsdPerMin: num(process.env.SOCIAL_COST_VIDEO_USD_PER_MIN, 0.0037),
});

export const COST_STAGES = ['script', 'voice', 'images', 'render'];

const round = (usd) => Math.round(usd * 1e6) / 1e6;

/**
 * A charge: `{ usd, estimated }`. OpenRouter's own figure when it sent one, otherwise the
 * token estimate. A response with neither (no usage block at all) is charged nothing and
 * marked estimated, so a zero is never passed off as a measured one.
 */
export function openRouterCharge(data, { perImage = false } = {}) {
  const billed = Number(data?.usage?.cost);
  if (Number.isFinite(billed) && billed >= 0) return { usd: billed, estimated: false };
  const r = rates();
  if (perImage) return { usd: r.imageUsd, estimated: true };
  const input = num(data?.usage?.prompt_tokens, 0);
  const output = num(data?.usage?.completion_tokens, 0);
  return { usd: (input * r.scriptInputPerM + output * r.scriptOutputPerM) / 1e6, estimated: true };
}

/** One spoken clip. */
export function ttsCharge(model, text) {
  if (String(model ?? '').endsWith(':free')) return { usd: 0, estimated: true };
  return { usd: (String(text ?? '').length * rates().ttsPerMChars) / 1e6, estimated: true };
}

export const stillCharge = () => ({ usd: rates().stillUsd, estimated: true });

export const videoCharge = (aliveMs) => ({
  usd: (Math.max(0, num(aliveMs, 0)) / 60_000) * rates().videoUsdPerMin,
  estimated: true,
});

/** Sum charges. Estimated if any part is. */
export function sumCharges(charges) {
  let usd = 0;
  let estimated = false;
  for (const charge of charges) {
    if (!charge) continue;
    usd += num(charge.usd, 0);
    estimated ||= Boolean(charge.estimated);
  }
  return { usd, estimated };
}

/**
 * Add a charge to a pack's `cost` record. Pure: returns a new record.
 *
 * Shape: `{ script: { usd, estimated }, voice, images, render, totalUsd }`.
 */
export function addCost(cost, stage, charge) {
  if (!COST_STAGES.includes(stage)) throw new Error(`unknown cost stage: ${stage}`);
  const usd = num(charge?.usd, 0);
  const prev = cost?.[stage] ?? { usd: 0, estimated: false };
  const next = {
    ...(cost ?? {}),
    [stage]: { usd: round(num(prev.usd, 0) + usd), estimated: Boolean(prev.estimated || charge?.estimated) },
  };
  next.totalUsd = round(COST_STAGES.reduce((sum, s) => sum + num(next[s]?.usd, 0), 0));
  return next;
}

/**
 * Totals for the digest.
 *
 * `finished` are stories that completed production in the window; their average is the
 * "cost per production". `failed` is money spent on stories that will never go out.
 */
export function summariseCosts(finished, failed = []) {
  const byStage = Object.fromEntries(COST_STAGES.map((s) => [s, 0]));
  let total = 0;
  let counted = 0;
  for (const pack of finished) {
    if (!pack?.cost) continue;
    counted++;
    for (const stage of COST_STAGES) byStage[stage] += num(pack.cost[stage]?.usd, 0);
    total += num(pack.cost.totalUsd, 0);
  }
  const wasted = failed.reduce((sum, pack) => sum + num(pack?.cost?.totalUsd, 0), 0);
  return {
    stories: counted,
    // Stories finished before cost tracking shipped carry no record; saying how many stops
    // the average being read as covering them.
    untracked: finished.length - counted,
    totalUsd: round(total),
    averageUsd: counted ? round(total / counted) : 0,
    byStage: Object.fromEntries(COST_STAGES.map((s) => [s, round(byStage[s])])),
    failedUsd: round(wasted),
    failedStories: failed.filter((pack) => pack?.cost).length,
  };
}
