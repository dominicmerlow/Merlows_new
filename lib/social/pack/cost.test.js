// lib/social/pack/cost.js — per-production cost tracking.
// Pure functions throughout (`rates()` reads env, everything else is deterministic), so no
// stubs are needed anywhere in this file.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  rates, COST_STAGES, openRouterCharge, ttsCharge, stillCharge, videoCharge, sumCharges,
  addCost, summariseCosts,
} from './cost.js';

const ENV_KEYS = [
  'SOCIAL_COST_SCRIPT_IN_PER_M', 'SOCIAL_COST_SCRIPT_OUT_PER_M', 'SOCIAL_COST_TTS_PER_M_CHARS',
  'SOCIAL_COST_IMAGE_USD', 'SOCIAL_COST_STILL_USD', 'SOCIAL_COST_VIDEO_USD_PER_MIN',
];

let saved;
beforeEach(() => { saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]])); });
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  }
});

describe('rates', () => {
  it('returns the documented defaults when nothing is overridden', () => {
    for (const k of ENV_KEYS) delete process.env[k];
    assert.deepEqual(rates(), {
      scriptInputPerM: 0.3,
      scriptOutputPerM: 2.5,
      ttsPerMChars: 15,
      imageUsd: 0.03,
      stillUsd: 0.0017,
      videoUsdPerMin: 0.0037,
    });
  });

  it('is overridden by env vars', () => {
    process.env.SOCIAL_COST_STILL_USD = '0.1';
    process.env.SOCIAL_COST_VIDEO_USD_PER_MIN = '2';
    assert.equal(rates().stillUsd, 0.1);
    assert.equal(rates().videoUsdPerMin, 2);
  });

  it('falls back to the default for a negative, non-numeric, or NaN override', () => {
    process.env.SOCIAL_COST_STILL_USD = '-5';
    assert.equal(rates().stillUsd, 0.0017);
    process.env.SOCIAL_COST_STILL_USD = 'not-a-number';
    assert.equal(rates().stillUsd, 0.0017);
  });

  it('re-reads the env on every call, so a change takes effect without a redeploy', () => {
    delete process.env.SOCIAL_COST_STILL_USD;
    assert.equal(rates().stillUsd, 0.0017);
    process.env.SOCIAL_COST_STILL_USD = '9';
    assert.equal(rates().stillUsd, 9);
  });

  it('accepts 0 as a valid override (free)', () => {
    process.env.SOCIAL_COST_IMAGE_USD = '0';
    assert.equal(rates().imageUsd, 0);
  });
});

describe('COST_STAGES', () => {
  it('is exactly the four production stages, in order', () => {
    assert.deepEqual(COST_STAGES, ['script', 'voice', 'images', 'render']);
  });
});

describe('openRouterCharge', () => {
  it('uses the billed usage.cost when present and finite, marked not estimated', () => {
    const charge = openRouterCharge({ usage: { cost: 0.0042 } });
    assert.deepEqual(charge, { usd: 0.0042, estimated: false });
  });

  it('accepts a billed cost of exactly 0 as measured, not estimated', () => {
    const charge = openRouterCharge({ usage: { cost: 0 } });
    assert.deepEqual(charge, { usd: 0, estimated: false });
  });

  it('rejects a negative usage.cost and falls through to the estimate', () => {
    const charge = openRouterCharge({ usage: { cost: -1, prompt_tokens: 1000, completion_tokens: 1000 } });
    assert.equal(charge.estimated, true);
    assert.ok(charge.usd > 0);
  });

  it('estimates from tokens when usage.cost is absent', () => {
    delete process.env.SOCIAL_COST_SCRIPT_IN_PER_M;
    delete process.env.SOCIAL_COST_SCRIPT_OUT_PER_M;
    const charge = openRouterCharge({ usage: { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 } });
    // 1M in * 0.3/M + 1M out * 2.5/M = 2.8
    assert.deepEqual(charge, { usd: 2.8, estimated: true });
  });

  it('estimates zero from tokens when there is no usage block at all, but still marks estimated', () => {
    const charge = openRouterCharge({});
    assert.deepEqual(charge, { usd: 0, estimated: true });
  });

  it('uses the flat per-image fallback when perImage is set and usage.cost is absent', () => {
    delete process.env.SOCIAL_COST_IMAGE_USD;
    const charge = openRouterCharge({ usage: { prompt_tokens: 500 } }, { perImage: true });
    assert.deepEqual(charge, { usd: 0.03, estimated: true });
  });

  it('prefers the real usage.cost over the perImage fallback when both are available', () => {
    const charge = openRouterCharge({ usage: { cost: 0.09 } }, { perImage: true });
    assert.deepEqual(charge, { usd: 0.09, estimated: false });
  });

  it('treats a non-finite usage.cost (NaN, Infinity, string) as absent', () => {
    assert.equal(openRouterCharge({ usage: { cost: NaN } }).estimated, true);
    assert.equal(openRouterCharge({ usage: { cost: Infinity } }).estimated, true);
    assert.equal(openRouterCharge({ usage: { cost: 'free' } }).estimated, true);
  });

  it('treats a null or undefined data argument the same as an empty object', () => {
    assert.deepEqual(openRouterCharge(null), { usd: 0, estimated: true });
    assert.deepEqual(openRouterCharge(undefined), { usd: 0, estimated: true });
  });
});

describe('ttsCharge', () => {
  it('charges nothing for a :free model, regardless of text length', () => {
    assert.deepEqual(ttsCharge('some/model:free', 'x'.repeat(10_000)), { usd: 0, estimated: true });
  });

  it('charges by character count at the configured rate for a paid model', () => {
    delete process.env.SOCIAL_COST_TTS_PER_M_CHARS;
    const charge = ttsCharge('fish-audio/s2.1-pro', 'x'.repeat(1_000_000));
    assert.deepEqual(charge, { usd: 15, estimated: true });
  });

  it('charges 0 for empty text on a paid model', () => {
    assert.deepEqual(ttsCharge('paid-model', ''), { usd: 0, estimated: true });
  });

  it('treats a null or undefined text as empty', () => {
    assert.equal(ttsCharge('paid-model', null).usd, 0);
    assert.equal(ttsCharge('paid-model', undefined).usd, 0);
  });

  it('treats a null or undefined model as not free (charged)', () => {
    delete process.env.SOCIAL_COST_TTS_PER_M_CHARS;
    const charge = ttsCharge(null, 'x'.repeat(1_000_000));
    assert.equal(charge.usd, 15);
  });
});

describe('stillCharge', () => {
  it('returns the configured flat still rate, always estimated', () => {
    delete process.env.SOCIAL_COST_STILL_USD;
    assert.deepEqual(stillCharge(), { usd: 0.0017, estimated: true });
  });
});

describe('videoCharge', () => {
  it('scales linearly with wall time alive', () => {
    delete process.env.SOCIAL_COST_VIDEO_USD_PER_MIN;
    const oneMinute = videoCharge(60_000);
    assert.equal(Math.round(oneMinute.usd * 1e6) / 1e6, 0.0037);
    assert.equal(oneMinute.estimated, true);
  });

  it('is 0 for 0ms alive', () => {
    assert.equal(videoCharge(0).usd, 0);
  });

  it('floors negative alive-time at 0 rather than charging a negative amount', () => {
    assert.equal(videoCharge(-5000).usd, 0);
  });

  it('treats a non-finite aliveMs as 0', () => {
    assert.equal(videoCharge(NaN).usd, 0);
    assert.equal(videoCharge(undefined).usd, 0);
  });
});

describe('sumCharges', () => {
  it('sums usd and is estimated if any part is estimated', () => {
    const sum = sumCharges([{ usd: 1, estimated: false }, { usd: 2, estimated: true }]);
    assert.deepEqual(sum, { usd: 3, estimated: true });
  });

  it('is not estimated when every part is measured', () => {
    const sum = sumCharges([{ usd: 1, estimated: false }, { usd: 2, estimated: false }]);
    assert.deepEqual(sum, { usd: 3, estimated: false });
  });

  it('returns a zero, non-estimated sum for an empty list', () => {
    assert.deepEqual(sumCharges([]), { usd: 0, estimated: false });
  });

  it('skips null/undefined entries in the list without throwing', () => {
    const sum = sumCharges([null, { usd: 5, estimated: true }, undefined]);
    assert.deepEqual(sum, { usd: 5, estimated: true });
  });

  it('treats a charge with a non-numeric usd as contributing 0', () => {
    const sum = sumCharges([{ usd: 'oops', estimated: false }, { usd: 2, estimated: false }]);
    assert.equal(sum.usd, 2);
  });
});

describe('addCost', () => {
  it('throws on an unknown stage', () => {
    assert.throws(() => addCost(null, 'nonsense', { usd: 1 }), /unknown cost stage: nonsense/);
  });

  it('starts a fresh record from null cost, filling only the touched stage', () => {
    const cost = addCost(null, 'script', { usd: 1.5, estimated: false });
    assert.deepEqual(cost, {
      script: { usd: 1.5, estimated: false },
      totalUsd: 1.5,
    });
    assert.equal(cost.voice, undefined);
  });

  it('accumulates onto an existing stage rather than replacing it', () => {
    let cost = addCost(null, 'render', { usd: 1, estimated: true });
    cost = addCost(cost, 'render', { usd: 2, estimated: true });
    assert.equal(cost.render.usd, 3);
  });

  it('recomputes totalUsd across every stage after each call', () => {
    let cost = addCost(null, 'script', { usd: 1 });
    cost = addCost(cost, 'voice', { usd: 2 });
    cost = addCost(cost, 'images', { usd: 3 });
    cost = addCost(cost, 'render', { usd: 4 });
    assert.equal(cost.totalUsd, 10);
  });

  it('a stage becomes estimated once any charge to it was estimated, and stays estimated', () => {
    let cost = addCost(null, 'script', { usd: 1, estimated: false });
    assert.equal(cost.script.estimated, false);
    cost = addCost(cost, 'script', { usd: 1, estimated: true });
    assert.equal(cost.script.estimated, true);
    // A later measured charge does not un-mark it — the record says "some part of this was
    // estimated", not "the latest part was".
    cost = addCost(cost, 'script', { usd: 1, estimated: false });
    assert.equal(cost.script.estimated, true);
  });

  it('adding 0 to a stage is a no-op on the amount but still marks estimated if the charge says so', () => {
    const cost = addCost(null, 'voice', { usd: 0, estimated: true });
    assert.deepEqual(cost.voice, { usd: 0, estimated: true });
  });

  it('is pure: does not mutate the cost object passed in', () => {
    const original = addCost(null, 'script', { usd: 1, estimated: false });
    const originalCopy = JSON.parse(JSON.stringify(original));
    addCost(original, 'script', { usd: 5, estimated: true });
    assert.deepEqual(original, originalCopy);
  });

  it('rounds to 6 decimal places to avoid float drift across many small additions', () => {
    let cost = null;
    for (let i = 0; i < 10; i++) cost = addCost(cost, 'render', { usd: 0.1, estimated: true });
    assert.equal(cost.render.usd, 1);
    assert.equal(cost.totalUsd, 1);
  });

  it('treats a missing or non-numeric charge.usd as 0 without throwing', () => {
    const cost = addCost(null, 'script', {});
    assert.equal(cost.script.usd, 0);
  });
});

describe('summariseCosts', () => {
  const withCost = (totalUsd, byStage = {}) => ({
    cost: {
      script: { usd: byStage.script ?? 0 },
      voice: { usd: byStage.voice ?? 0 },
      images: { usd: byStage.images ?? 0 },
      render: { usd: byStage.render ?? 0 },
      totalUsd,
    },
  });

  it('sums totals and per-stage costs across finished packs, with a correct average', () => {
    const finished = [
      withCost(1, { script: 0.4, voice: 0.6 }),
      withCost(3, { script: 1, voice: 1, images: 1 }),
    ];
    const summary = summariseCosts(finished);
    assert.equal(summary.stories, 2);
    assert.equal(summary.totalUsd, 4);
    assert.equal(summary.averageUsd, 2);
    assert.deepEqual(summary.byStage, { script: 1.4, voice: 1.6, images: 1, render: 0 });
    assert.equal(summary.untracked, 0);
    assert.equal(summary.failedUsd, 0);
    assert.equal(summary.failedStories, 0);
  });

  it('counts a finished pack with no cost record as untracked, not zero-cost', () => {
    const finished = [withCost(2), { cost: null }, {}];
    const summary = summariseCosts(finished);
    assert.equal(summary.stories, 1);
    assert.equal(summary.untracked, 2);
    assert.equal(summary.totalUsd, 2);
    assert.equal(summary.averageUsd, 2);
  });

  it('averageUsd is 0, not NaN, when there are no tracked finished stories', () => {
    const summary = summariseCosts([{}, { cost: null }]);
    assert.equal(summary.averageUsd, 0);
    assert.equal(summary.stories, 0);
  });

  it('handles an empty finished array', () => {
    const summary = summariseCosts([]);
    assert.equal(summary.stories, 0);
    assert.equal(summary.untracked, 0);
    assert.equal(summary.totalUsd, 0);
    assert.equal(summary.averageUsd, 0);
  });

  it('sums wasted spend on failed packs separately from the finished total', () => {
    const finished = [withCost(2)];
    const failed = [withCost(0.5), withCost(0.25)];
    const summary = summariseCosts(finished, failed);
    assert.equal(summary.failedUsd, 0.75);
    assert.equal(summary.failedStories, 2);
    // failed spend must not leak into the finished total/average
    assert.equal(summary.totalUsd, 2);
    assert.equal(summary.averageUsd, 2);
  });

  it('a failed pack with no cost record contributes 0 to failedUsd and is not counted in failedStories', () => {
    const summary = summariseCosts([], [{}, { cost: null }]);
    assert.equal(summary.failedUsd, 0);
    assert.equal(summary.failedStories, 0);
  });

  it('defaults `failed` to an empty array when omitted', () => {
    const summary = summariseCosts([withCost(1)]);
    assert.equal(summary.failedUsd, 0);
    assert.equal(summary.failedStories, 0);
  });
});
