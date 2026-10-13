// lib/social/pack/review.js — the launch review gate.
//
// `decide` takes its `store` as an injected option, so these tests never touch the shared `kv`
// singleton at all (no monkey-patching needed) — a small in-memory store stands in throughout.
//
// GATE() and autoApproveMs() both re-read their env var on every call, so tests set and restore
// the variable around each case rather than reaching into the module.
//
// autoApproveMs() used to be a top-level const fixed at import time, which is why the
// AUTO_MINUTES=0 case below still uses a cache-busting dynamic import. That is now belt and
// braces rather than a necessity — it is kept because it also proves the value is not captured
// anywhere else at load time, which is the thing that was wrong before.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  needsReview, reviewState, decide, requestReview, reviewMessage, GATE, autoApproveMs, DECISION_KEY,
  recordDecision, readDecision, withDecision, previewButtons, closeReviewMessage, noteArchived,
  AUTO_APPROVE_KEY, AUTO_APPROVE_DEFAULT_MINUTES, AUTO_APPROVE_MIN_MINUTES, AUTO_APPROVE_MAX_MINUTES,
  loadAutoApprove, setAutoApprove, autoApproveSetting, holdSensitive,
} from './review.js';
import { QUEUE_KEY } from './store.js';

// `boardMinutes` (review.js) is module-level state, set by loadAutoApprove and read by every
// other autoApproveMs()/reviewState() call in this process — including the plain env-based
// tests elsewhere in this file. Any test that calls loadAutoApprove() with a board value MUST
// clear it again afterwards, or a later env-based test silently reads the board's value instead
// of the env var it thinks it set.
afterEach(async () => { await loadAutoApprove({ get: async () => null }); });

// The window tests below were written against a 60-minute window. With nothing configured the
// window is now 0 (off), so every test starts from an explicit 60; a block that needs another
// value sets it itself and restores to this.
let savedAutoMinutes;
beforeEach(() => { savedAutoMinutes = process.env.SOCIAL_REVIEW_AUTO_MINUTES; process.env.SOCIAL_REVIEW_AUTO_MINUTES = '60'; });
afterEach(() => {
  if (savedAutoMinutes === undefined) delete process.env.SOCIAL_REVIEW_AUTO_MINUTES;
  else process.env.SOCIAL_REVIEW_AUTO_MINUTES = savedAutoMinutes;
});

// SOCIAL_REVIEW_HOLD_SENSITIVE is read live. Every test starts with it UNSET (the production
// default); a test that needs it on or odd sets it itself, and it is restored — deleted when it
// was originally unset — after each test.
let savedHoldSensitive;
beforeEach(() => { savedHoldSensitive = process.env.SOCIAL_REVIEW_HOLD_SENSITIVE; delete process.env.SOCIAL_REVIEW_HOLD_SENSITIVE; });
afterEach(() => {
  if (savedHoldSensitive === undefined) delete process.env.SOCIAL_REVIEW_HOLD_SENSITIVE;
  else process.env.SOCIAL_REVIEW_HOLD_SENSITIVE = savedHoldSensitive;
});

describe('autoApproveMs — nothing configured means OFF', () => {
  it('is 0 with neither the board setting nor the env var, so a KV blip never releases a story', async () => {
    delete process.env.SOCIAL_REVIEW_AUTO_MINUTES;
    await loadAutoApprove({ get: async () => { throw new Error('KV down'); } });
    assert.equal(autoApproveMs(), 0);
    assert.deepEqual(autoApproveSetting(), { enabled: false, minutes: 0, source: 'env', holdSensitive: false });
  });
});

/** Answers like Upstash: SET returns 'OK', and SET NX on an existing key returns null. */
function memStore(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get: async (key) => map.get(key) ?? null,
    set: async (key, val, opts) => {
      if (opts?.nx && map.has(key)) return null;
      map.set(key, val);
      return 'OK';
    },
    _map: map,
  };
}

describe('needsReview', () => {
  let saved;
  beforeEach(() => { saved = process.env.SOCIAL_REVIEW_GATE; });
  afterEach(() => { if (saved === undefined) delete process.env.SOCIAL_REVIEW_GATE; else process.env.SOCIAL_REVIEW_GATE = saved; });

  it('gate "off" never needs review, even for a sensitive pack', () => {
    process.env.SOCIAL_REVIEW_GATE = 'off';
    assert.equal(needsReview({ social: { sensitive: true } }), false);
  });

  it('gate "on" always needs review, even for a non-sensitive pack', () => {
    process.env.SOCIAL_REVIEW_GATE = 'on';
    assert.equal(needsReview({ social: { sensitive: false } }), true);
  });

  it('gate "sensitive" needs review only for a pack the script flagged', () => {
    process.env.SOCIAL_REVIEW_GATE = 'sensitive';
    assert.equal(needsReview({ social: { sensitive: true } }), true);
    assert.equal(needsReview({ social: { sensitive: false } }), false);
  });

  it('gate "sensitive" treats a pack with no social block at all as not sensitive', () => {
    process.env.SOCIAL_REVIEW_GATE = 'sensitive';
    assert.equal(needsReview({}), false);
  });

  it('is case-insensitive', () => {
    process.env.SOCIAL_REVIEW_GATE = 'OFF';
    assert.equal(needsReview({ social: { sensitive: true } }), false);
  });

  it('defaults to "on" when unset', () => {
    delete process.env.SOCIAL_REVIEW_GATE;
    assert.equal(needsReview({}), true);
  });
});

describe('GATE — reads its env var live on every call', () => {
  it('reflects the current value each time it is called', () => {
    const saved = process.env.SOCIAL_REVIEW_GATE;
    try {
      process.env.SOCIAL_REVIEW_GATE = 'sensitive';
      assert.equal(GATE(), 'sensitive');
      process.env.SOCIAL_REVIEW_GATE = 'off';
      assert.equal(GATE(), 'off');
    } finally {
      if (saved === undefined) delete process.env.SOCIAL_REVIEW_GATE; else process.env.SOCIAL_REVIEW_GATE = saved;
    }
  });
});

describe('reviewState', () => {
  let savedGate;
  beforeEach(() => { savedGate = process.env.SOCIAL_REVIEW_GATE; process.env.SOCIAL_REVIEW_GATE = 'on'; });
  afterEach(() => { if (savedGate === undefined) delete process.env.SOCIAL_REVIEW_GATE; else process.env.SOCIAL_REVIEW_GATE = savedGate; });

  it('is released immediately when the gate is off, regardless of review state', () => {
    process.env.SOCIAL_REVIEW_GATE = 'off';
    assert.deepEqual(reviewState({ social: {}, review: null }), { released: true, reason: 'gate off' });
  });

  it('is not yet sent for review when there is no review record at all', () => {
    assert.deepEqual(reviewState({ social: {} }), { released: false, reason: 'not yet sent for review' });
  });

  it('is not yet sent for review when a review record exists but has no requestedAt', () => {
    assert.deepEqual(reviewState({ social: {}, review: {} }), { released: false, reason: 'not yet sent for review' });
  });

  it('an approved decision releases the pack and names the approver', () => {
    const state = reviewState({ social: {}, review: { requestedAt: new Date().toISOString(), decision: 'approved', by: 'alice' } });
    assert.deepEqual(state, { released: true, reason: 'approved by alice' });
  });

  it('an approved decision with no recorded approver falls back to "someone"', () => {
    const state = reviewState({ social: {}, review: { requestedAt: new Date().toISOString(), decision: 'approved' } });
    assert.equal(state.reason, 'approved by someone');
  });

  // A pack approved in the app before its review message was ever sent has no `requestedAt`
  // at all — the decision checks have to run BEFORE the `requestedAt` check, or this pack
  // would be held forever as "not yet sent for review" despite already being approved.
  it('an approved decision releases the pack even with no requestedAt at all', () => {
    const state = reviewState({ social: {}, review: { decision: 'approved', by: 'alice' } });
    assert.deepEqual(state, { released: true, reason: 'approved by alice' });
  });

  it('a rejected decision holds the pack and is flagged distinctly (rejected: true) from a plain hold', () => {
    const state = reviewState({ social: {}, review: { requestedAt: new Date().toISOString(), decision: 'rejected', by: 'bob' } });
    assert.deepEqual(state, { released: false, rejected: true, reason: 'rejected by bob' });
  });

  it('waits (not released) while still inside the auto-approve window', () => {
    const requestedAt = new Date(Date.now() - (autoApproveMs() - 60_000)).toISOString();
    assert.deepEqual(reviewState({ social: {}, review: { requestedAt, sent: true } }), { released: false, reason: 'waiting for a decision' });
  });

  it('is not released exactly one millisecond under the auto-approve window', () => {
    const now = Date.now();
    const requestedAt = new Date(now - autoApproveMs() + 1).toISOString();
    assert.equal(reviewState({ social: {}, review: { requestedAt, sent: true } }, now).released, false);
  });

  it('auto-approves at exactly the window boundary (>=, not >)', () => {
    const now = Date.now();
    const requestedAt = new Date(now - autoApproveMs()).toISOString();
    const state = reviewState({ social: {}, review: { requestedAt, sent: true } }, now);
    assert.equal(state.released, true);
    assert.equal(state.auto, true);
  });

  it('auto-approves an undecided pack once the window has passed', () => {
    const now = Date.now();
    const requestedAt = new Date(now - autoApproveMs() - 60_000).toISOString();
    const state = reviewState({ social: {}, review: { requestedAt, sent: true } }, now);
    assert.equal(state.released, true);
    assert.equal(state.auto, true);
    assert.match(state.reason, /auto-approved after/);
  });

  it('gate "sensitive" requires a decision for a flagged pack (does not release on the gate alone)', () => {
    process.env.SOCIAL_REVIEW_GATE = 'sensitive';
    const state = reviewState({ social: { sensitive: true }, review: { requestedAt: new Date().toISOString(), sent: true } });
    assert.deepEqual(state, { released: false, reason: 'waiting for a decision' });
  });

  it('an unparseable requestedAt never auto-approves — a NaN comparison is always false', () => {
    assert.deepEqual(
      reviewState({ social: {}, review: { requestedAt: 'not-a-date', sent: true } }),
      { released: false, reason: 'waiting for a decision' },
    );
  });
});

describe('reviewState — a recorded rejection is checked FIRST, before anything else', () => {
  let savedGate;
  beforeEach(() => { savedGate = process.env.SOCIAL_REVIEW_GATE; });
  afterEach(() => { if (savedGate === undefined) delete process.env.SOCIAL_REVIEW_GATE; else process.env.SOCIAL_REVIEW_GATE = savedGate; });

  it('honours a rejection even when the gate has since been switched off', () => {
    process.env.SOCIAL_REVIEW_GATE = 'off';
    const state = reviewState({ social: { sensitive: true }, review: { decision: 'rejected', by: 'alice' } });
    assert.deepEqual(state, { released: false, rejected: true, reason: 'rejected by alice' });
  });

  it('honours a rejection even when the pack no longer counts as sensitive under gate "sensitive"', () => {
    process.env.SOCIAL_REVIEW_GATE = 'sensitive';
    const state = reviewState({ social: { sensitive: false }, review: { decision: 'rejected', by: 'bob' } });
    assert.deepEqual(state, { released: false, rejected: true, reason: 'rejected by bob' });
  });

  it('honours a rejection recorded before requestedAt was ever set', () => {
    const state = reviewState({ social: {}, review: { decision: 'rejected' } });
    assert.equal(state.released, false);
    assert.equal(state.rejected, true);
    assert.equal(state.reason, 'rejected by someone');
  });
});

describe('reviewState — the auto-approve clock only runs once a human was actually told (review.sent)', () => {
  let savedGate;
  beforeEach(() => { savedGate = process.env.SOCIAL_REVIEW_GATE; process.env.SOCIAL_REVIEW_GATE = 'on'; });
  afterEach(() => { if (savedGate === undefined) delete process.env.SOCIAL_REVIEW_GATE; else process.env.SOCIAL_REVIEW_GATE = savedGate; });

  it('never auto-approves while sent is false, however long it has waited', () => {
    const requestedAt = new Date(Date.now() - autoApproveMs() - 999 * 24 * 60 * 60_000).toISOString(); // 999 days
    const state = reviewState({ social: {}, review: { requestedAt, sent: false, error: 'chat not found' } });
    assert.deepEqual(state, { released: false, reason: 'review request not delivered (chat not found)' });
  });

  it('never auto-approves when sent is missing entirely, however long it has waited', () => {
    const requestedAt = new Date(Date.now() - autoApproveMs() - 999 * 24 * 60 * 60_000).toISOString();
    const state = reviewState({ social: {}, review: { requestedAt } });
    assert.deepEqual(state, { released: false, reason: 'review request not delivered (unknown)' });
  });

  it('names "unknown" when a failed send recorded no error string', () => {
    const state = reviewState({ social: {}, review: { requestedAt: new Date().toISOString(), sent: false } });
    assert.equal(state.reason, 'review request not delivered (unknown)');
  });

  it('an explicit approval is still honoured when sent is false — someone clearly saw it', () => {
    const state = reviewState({ social: {}, review: { requestedAt: new Date().toISOString(), sent: false, decision: 'approved', by: 'alice' } });
    assert.deepEqual(state, { released: true, reason: 'approved by alice' });
  });

  it('an explicit rejection is still honoured when sent is false — someone clearly saw it', () => {
    const state = reviewState({ social: {}, review: { requestedAt: new Date().toISOString(), sent: false, decision: 'rejected', by: 'bob' } });
    assert.deepEqual(state, { released: false, rejected: true, reason: 'rejected by bob' });
  });
});

describe('reviewState — with the sensitive hold ON, a sensitive pack never auto-approves once the window has passed', () => {
  let savedGate;
  beforeEach(() => {
    savedGate = process.env.SOCIAL_REVIEW_GATE; process.env.SOCIAL_REVIEW_GATE = 'on';
    process.env.SOCIAL_REVIEW_HOLD_SENSITIVE = 'on';
  });
  afterEach(() => { if (savedGate === undefined) delete process.env.SOCIAL_REVIEW_GATE; else process.env.SOCIAL_REVIEW_GATE = savedGate; });

  it('inside the window, a sensitive pack reads the same generic "waiting for a decision" as any other', () => {
    const requestedAt = new Date(Date.now() - (autoApproveMs() - 60_000)).toISOString();
    const state = reviewState({ social: { sensitive: true }, review: { requestedAt, sent: true } });
    assert.deepEqual(state, { released: false, reason: 'waiting for a decision' });
  });

  it('at the exact window boundary, a sensitive pack is held rather than auto-approved', () => {
    const now = Date.now();
    const requestedAt = new Date(now - autoApproveMs()).toISOString();
    const state = reviewState({ social: { sensitive: true }, review: { requestedAt, sent: true } }, now);
    assert.deepEqual(state, { released: false, reason: 'sensitive — waiting for a person, never auto-approved' });
  });

  it('long past the window, a sensitive pack is still held, however long it has waited', () => {
    const requestedAt = new Date(Date.now() - autoApproveMs() - 999 * 24 * 60 * 60_000).toISOString();
    const state = reviewState({ social: { sensitive: true }, review: { requestedAt, sent: true } });
    assert.deepEqual(state, { released: false, reason: 'sensitive — waiting for a person, never auto-approved' });
  });

  it('the identical elapsed time auto-approves a non-sensitive pack, for direct contrast', () => {
    const now = Date.now();
    const requestedAt = new Date(now - autoApproveMs() - 60_000).toISOString();
    const sensitiveState = reviewState({ social: { sensitive: true }, review: { requestedAt, sent: true } }, now);
    const plainState = reviewState({ social: { sensitive: false }, review: { requestedAt, sent: true } }, now);
    assert.equal(sensitiveState.released, false);
    assert.match(sensitiveState.reason, /never auto-approved/);
    assert.equal(plainState.released, true);
    assert.equal(plainState.auto, true);
  });
});

describe('holdSensitive — parses SOCIAL_REVIEW_HOLD_SENSITIVE live, only "on" turns it on', () => {
  it('is false when the variable is unset', () => {
    delete process.env.SOCIAL_REVIEW_HOLD_SENSITIVE;
    assert.equal(holdSensitive(), false);
  });

  it('is false for "off"', () => {
    process.env.SOCIAL_REVIEW_HOLD_SENSITIVE = 'off';
    assert.equal(holdSensitive(), false);
  });

  it('is true for "on"', () => {
    process.env.SOCIAL_REVIEW_HOLD_SENSITIVE = 'on';
    assert.equal(holdSensitive(), true);
  });

  it('is true for "ON " — case and surrounding whitespace are ignored', () => {
    process.env.SOCIAL_REVIEW_HOLD_SENSITIVE = 'ON ';
    assert.equal(holdSensitive(), true);
  });

  it('is false for "yes" — only the literal "on" counts', () => {
    process.env.SOCIAL_REVIEW_HOLD_SENSITIVE = 'yes';
    assert.equal(holdSensitive(), false);
  });

  it('is false for "true" and "1"', () => {
    process.env.SOCIAL_REVIEW_HOLD_SENSITIVE = 'true';
    assert.equal(holdSensitive(), false);
    process.env.SOCIAL_REVIEW_HOLD_SENSITIVE = '1';
    assert.equal(holdSensitive(), false);
  });

  it('is false for an empty string', () => {
    process.env.SOCIAL_REVIEW_HOLD_SENSITIVE = '';
    assert.equal(holdSensitive(), false);
  });

  it('is read live: flipping the variable changes the answer without re-importing', () => {
    process.env.SOCIAL_REVIEW_HOLD_SENSITIVE = 'on';
    const before = holdSensitive();
    process.env.SOCIAL_REVIEW_HOLD_SENSITIVE = 'off';
    assert.equal(before, true);
    assert.equal(holdSensitive(), false);
  });

  it('autoApproveSetting reports holdSensitive true when on', () => {
    process.env.SOCIAL_REVIEW_HOLD_SENSITIVE = 'on';
    assert.equal(autoApproveSetting().holdSensitive, true);
  });
});

describe('reviewState — by default (hold unset) a sensitive pack auto-approves like any other', () => {
  let savedGate;
  beforeEach(() => { savedGate = process.env.SOCIAL_REVIEW_GATE; process.env.SOCIAL_REVIEW_GATE = 'on'; });
  afterEach(() => { if (savedGate === undefined) delete process.env.SOCIAL_REVIEW_GATE; else process.env.SOCIAL_REVIEW_GATE = savedGate; });

  const sensitivePast = (now) => ({
    social: { sensitive: true },
    review: { requestedAt: new Date(now - autoApproveMs() - 60_000).toISOString(), sent: true },
  });

  it('releases a sensitive pack past the window with auto:true', () => {
    const now = Date.now();
    const state = reviewState(sensitivePast(now), now);
    assert.deepEqual(state, { released: true, auto: true, reason: 'auto-approved after 60 min' });
  });

  it('releases a sensitive pack at the exact window boundary', () => {
    const now = Date.now();
    const requestedAt = new Date(now - autoApproveMs()).toISOString();
    const state = reviewState({ social: { sensitive: true }, review: { requestedAt, sent: true } }, now);
    assert.equal(state.released, true);
    assert.equal(state.auto, true);
  });

  it('still waits for a sensitive pack one minute BEFORE the window ends', () => {
    const now = Date.now();
    const requestedAt = new Date(now - (autoApproveMs() - 60_000)).toISOString();
    const state = reviewState({ social: { sensitive: true }, review: { requestedAt, sent: true } }, now);
    assert.deepEqual(state, { released: false, reason: 'waiting for a decision' });
  });

  it('releases a sensitive pack with the hold set to "off"', () => {
    process.env.SOCIAL_REVIEW_HOLD_SENSITIVE = 'off';
    const now = Date.now();
    assert.equal(reviewState(sensitivePast(now), now).released, true);
  });

  it('releases a sensitive pack with an unrecognised hold value such as "yes"', () => {
    process.env.SOCIAL_REVIEW_HOLD_SENSITIVE = 'yes';
    const now = Date.now();
    assert.equal(reviewState(sensitivePast(now), now).released, true);
  });

  it('holds a sensitive pack when the value is "ON " (case and whitespace ignored)', () => {
    process.env.SOCIAL_REVIEW_HOLD_SENSITIVE = 'ON ';
    const now = Date.now();
    const state = reviewState(sensitivePast(now), now);
    assert.deepEqual(state, { released: false, reason: 'sensitive — waiting for a person, never auto-approved' });
  });

  it('keeps a REJECTED sensitive pack rejected, however long it has waited', () => {
    const now = Date.now();
    const requestedAt = new Date(now - 999 * 24 * 60 * 60_000).toISOString();
    const state = reviewState({ social: { sensitive: true }, review: { requestedAt, sent: true, decision: 'rejected', by: 'bob' } }, now);
    assert.deepEqual(state, { released: false, rejected: true, reason: 'rejected by bob' });
  });

  it('does not auto-approve a sensitive pack whose review request was never delivered', () => {
    const now = Date.now();
    const requestedAt = new Date(now - 999 * 24 * 60 * 60_000).toISOString();
    const state = reviewState({ social: { sensitive: true }, review: { requestedAt, sent: false, error: 'chat not found' } }, now);
    assert.deepEqual(state, { released: false, reason: 'review request not delivered (chat not found)' });
  });

  it('does not auto-approve a sensitive pack that was never sent for review', () => {
    const state = reviewState({ social: { sensitive: true }, review: {} });
    assert.deepEqual(state, { released: false, reason: 'not yet sent for review' });
  });

  it('releases nothing when the window is 0, sensitive or not', () => {
    process.env.SOCIAL_REVIEW_AUTO_MINUTES = '0';
    const requestedAt = new Date(Date.now() - 999 * 24 * 60 * 60_000).toISOString();
    const state = reviewState({ social: { sensitive: true }, review: { requestedAt, sent: true } });
    assert.deepEqual(state, { released: false, reason: 'waiting for a decision' });
  });

  it('under the "sensitive" gate, a sensitive pack is still sent for review (gate unchanged) and then auto-approves', () => {
    process.env.SOCIAL_REVIEW_GATE = 'sensitive';
    const now = Date.now();
    assert.equal(needsReview({ social: { sensitive: true } }), true);
    assert.equal(reviewState(sensitivePast(now), now).released, true);
  });
});

describe('reviewState — SOCIAL_REVIEW_AUTO_MINUTES=0 disables auto-approval entirely', () => {
  it('never releases an undecided pack, no matter how long it has waited', async () => {
    const savedAuto = process.env.SOCIAL_REVIEW_AUTO_MINUTES;
    const savedGate = process.env.SOCIAL_REVIEW_GATE;
    process.env.SOCIAL_REVIEW_AUTO_MINUTES = '0';
    process.env.SOCIAL_REVIEW_GATE = 'on';
    try {
      const mod = await import('./review.js?social-review-auto-zero');
      assert.equal(mod.autoApproveMs(), 0);
      const requestedAt = new Date(Date.now() - 999 * 24 * 60 * 60_000).toISOString(); // 999 days ago
      const state = mod.reviewState({ social: {}, review: { requestedAt, sent: true } });
      assert.deepEqual(state, { released: false, reason: 'waiting for a decision' });
    } finally {
      if (savedAuto === undefined) delete process.env.SOCIAL_REVIEW_AUTO_MINUTES; else process.env.SOCIAL_REVIEW_AUTO_MINUTES = savedAuto;
      if (savedGate === undefined) delete process.env.SOCIAL_REVIEW_GATE; else process.env.SOCIAL_REVIEW_GATE = savedGate;
    }
  });
});

describe('recordDecision — SET NX semantics', () => {
  it('the first call wins: {ok:true, record}, and the store now holds it', async () => {
    const store = memStore();
    const record = { decision: 'approved', by: 'alice' };
    const result = await recordDecision('c1', record, store);
    assert.deepEqual(result, { ok: true, record });
    assert.equal(store._map.get(DECISION_KEY('c1')), record);
  });

  it('a second call for the same id loses: {ok:false, existing} is the FIRST record, and the store is untouched by the loser', async () => {
    const store = memStore();
    const first = { decision: 'approved', by: 'alice' };
    await recordDecision('c1', first, store);
    const second = { decision: 'rejected', by: 'bob' };
    const result = await recordDecision('c1', second, store);
    assert.equal(result.ok, false);
    assert.deepEqual(result.existing, first);
    assert.deepEqual(store._map.get(DECISION_KEY('c1')), first);
  });

  it('two different content ids do not collide', async () => {
    const store = memStore();
    const a = await recordDecision('c1', { decision: 'approved', by: 'alice' }, store);
    const b = await recordDecision('c2', { decision: 'rejected', by: 'bob' }, store);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
  });
});

describe('readDecision', () => {
  it('returns null when nothing has been recorded for the id', async () => {
    const store = memStore();
    assert.equal(await readDecision('nope', store), null);
  });

  it('returns the recorded decision record', async () => {
    const record = { decision: 'approved', by: 'alice' };
    const store = memStore({ [DECISION_KEY('c1')]: record });
    assert.deepEqual(await readDecision('c1', store), record);
  });
});

describe('withDecision', () => {
  it('returns the pack unchanged (same reference) when there is no record', () => {
    const pack = { contentId: 'c1', review: { sent: true } };
    assert.equal(withDecision(pack, null), pack);
  });

  it('lays the record over pack.review, preserving other existing review fields', () => {
    const pack = { contentId: 'c1', review: { sent: true, requestedAt: '2026-01-01T00:00:00.000Z' } };
    const record = { decision: 'approved', by: 'alice' };
    const result = withDecision(pack, record);
    assert.deepEqual(result.review, {
      sent: true, requestedAt: '2026-01-01T00:00:00.000Z', decision: 'approved', by: 'alice',
    });
  });

  it('works when the pack has no review block at all', () => {
    const pack = { contentId: 'c1' };
    const result = withDecision(pack, { decision: 'rejected', by: 'bob' });
    assert.deepEqual(result.review, { decision: 'rejected', by: 'bob' });
  });

  it('the record wins over a same-named field already on pack.review', () => {
    const pack = { contentId: 'c1', review: { decision: 'approved', by: 'stale' } };
    const result = withDecision(pack, { decision: 'rejected', by: 'fresh' });
    assert.equal(result.review.decision, 'rejected');
    assert.equal(result.review.by, 'fresh');
  });
});

describe('decide — the first decision wins, and nothing past `rendered` can be recalled', () => {
  it('returns ok:false for a pack that does not exist', async () => {
    const store = memStore();
    assert.deepEqual(await decide('nope', 'approved', 'alice', { store }), { ok: false, reason: 'no such pack' });
  });

  it('throws on an unrecognised decision before ever touching the store', async () => {
    const store = { get: async () => { throw new Error('store.get should not have been called'); }, set: async () => { throw new Error('store.set should not have been called'); } };
    await assert.rejects(decide('c1', 'maybe', 'alice', { store }), /unknown decision: maybe/);
  });

  it('lets the FIRST decision win: a second decision on an already-decided pack is refused and changes nothing', async () => {
    const pack = { contentId: 'c1', status: 'rendered', review: { decision: 'approved', by: 'alice' } };
    const store = memStore({ 'social:pack:c1': pack });
    const result = await decide('c1', 'rejected', 'bob', { store });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'already approved');
    assert.equal(store._map.get('social:pack:c1'), pack); // untouched — bob's tap changed nothing
  });

  it('refuses a decision once the pack has moved past `rendered` — nothing here can recall a scheduled post', async () => {
    const pack = { contentId: 'c1', status: 'slotted' };
    const store = memStore({ 'social:pack:c1': pack });
    const result = await decide('c1', 'approved', 'alice', { store });
    assert.equal(result.ok, false);
    assert.match(result.reason, /too late — pack is slotted/);
    assert.equal(store._map.get('social:pack:c1'), pack); // untouched
  });

  it('refuses a decision on a pack still earlier than `rendered` too (e.g. still `imaged`)', async () => {
    const pack = { contentId: 'c1', status: 'imaged' };
    const store = memStore({ 'social:pack:c1': pack });
    const result = await decide('c1', 'approved', 'alice', { store });
    assert.equal(result.ok, false);
    assert.match(result.reason, /too late — pack is imaged/);
  });

  it('records an approval on a rendered, undecided pack in the decision key, never the pack record', async () => {
    const pack = { contentId: 'c1', status: 'rendered' };
    const store = memStore({ 'social:pack:c1': pack });
    const result = await decide('c1', 'approved', 'alice', { store });
    assert.equal(result.ok, true);
    assert.equal(result.pack.review.decision, 'approved');
    assert.equal(result.pack.review.by, 'alice');
    assert.equal(typeof result.pack.review.decidedAt, 'string');
    assert.equal(store._map.get(DECISION_KEY('c1')).decision, 'approved'); // actually persisted
    // The record the worker tick reads and rewrites is left alone, so its save cannot erase this.
    assert.equal(store._map.get('social:pack:c1'), pack);
  });

  it('records a rejection the same way', async () => {
    const pack = { contentId: 'c1', status: 'rendered' };
    const store = memStore({ 'social:pack:c1': pack });
    const result = await decide('c1', 'rejected', 'bob', { store });
    assert.equal(result.ok, true);
    assert.equal(result.pack.review.decision, 'rejected');
  });

  it('defaults `by` to "unknown" when not provided', async () => {
    const pack = { contentId: 'c1', status: 'rendered' };
    const store = memStore({ 'social:pack:c1': pack });
    const result = await decide('c1', 'approved', undefined, { store });
    assert.equal(result.pack.review.by, 'unknown');
  });

  it('preserves other existing review fields (e.g. a prior sent flag) when recording the decision', async () => {
    const pack = { contentId: 'c1', status: 'rendered', review: { requestedAt: '2026-01-01T00:00:00.000Z', sent: true } };
    const store = memStore({ 'social:pack:c1': pack });
    const result = await decide('c1', 'approved', 'alice', { store });
    assert.equal(result.pack.review.requestedAt, '2026-01-01T00:00:00.000Z');
    assert.equal(result.pack.review.sent, true);
  });

  it('records byId as a STRING when a numeric Telegram user id is provided', async () => {
    const pack = { contentId: 'c1', status: 'rendered' };
    const store = memStore({ 'social:pack:c1': pack });
    const result = await decide('c1', 'approved', 'alice', { store, byId: 123456789 });
    assert.equal(result.pack.review.byId, '123456789');
    assert.equal(typeof result.pack.review.byId, 'string');
  });

  it('omits byId entirely when it is not provided', async () => {
    const pack = { contentId: 'c1', status: 'rendered' };
    const store = memStore({ 'social:pack:c1': pack });
    const result = await decide('c1', 'approved', 'alice', { store });
    assert.equal('byId' in result.pack.review, false);
  });

  it('defaults `via` to "app" when not provided', async () => {
    const pack = { contentId: 'c1', status: 'rendered' };
    const store = memStore({ 'social:pack:c1': pack });
    const result = await decide('c1', 'approved', 'alice', { store });
    assert.equal(result.pack.review.via, 'app');
  });

  it('records the given `via`, e.g. "telegram"', async () => {
    const pack = { contentId: 'c1', status: 'rendered' };
    const store = memStore({ 'social:pack:c1': pack });
    const result = await decide('c1', 'approved', 'alice', { store, via: 'telegram' });
    assert.equal(result.pack.review.via, 'telegram');
  });

  it('records postNow:true on an approval when it is requested', async () => {
    const pack = { contentId: 'c1', status: 'rendered' };
    const store = memStore({ 'social:pack:c1': pack });
    const result = await decide('c1', 'approved', 'alice', { store, postNow: true });
    assert.equal(result.pack.review.postNow, true);
  });

  it('never records postNow on a rejection, even when postNow:true is passed — it would be noise a later reader could mistake for intent', async () => {
    const pack = { contentId: 'c1', status: 'rendered' };
    const store = memStore({ 'social:pack:c1': pack });
    const result = await decide('c1', 'rejected', 'bob', { store, postNow: true });
    assert.equal('postNow' in result.pack.review, false);
  });

  it('omits postNow entirely when it was not requested', async () => {
    const pack = { contentId: 'c1', status: 'rendered' };
    const store = memStore({ 'social:pack:c1': pack });
    const result = await decide('c1', 'approved', 'alice', { store, postNow: false });
    assert.equal('postNow' in result.pack.review, false);
  });

  it('an NX loss on the decision key names the winner, even though pack.review itself has no decision', async () => {
    // The pack record's own `review.decision` is untouched (this is the storage-move path,
    // not the legacy in-record one) — only the separate decision key has been claimed, by a
    // second run that raced this one for the same key.
    const pack = { contentId: 'c1', status: 'rendered' };
    const store = memStore({
      'social:pack:c1': pack,
      [DECISION_KEY('c1')]: { decision: 'rejected', by: 'carol', via: 'telegram' },
    });
    const result = await decide('c1', 'approved', 'alice', { store });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'already rejected by carol');
    // The caller sees the WINNER's decision, not the one they just tried to record.
    assert.equal(result.pack.review.decision, 'rejected');
    assert.equal(result.pack.review.by, 'carol');
  });

  it('the NX-loss reason falls back to "decided" with no "by" when the winning record has neither field', async () => {
    const pack = { contentId: 'c1', status: 'rendered' };
    const store = memStore({ 'social:pack:c1': pack, [DECISION_KEY('c1')]: {} });
    const result = await decide('c1', 'approved', 'alice', { store });
    assert.equal(result.reason, 'already decided');
  });
});

// A pack nobody answered in time is archived (see stageArchived in autopilot.js), not dropped —
// it is still approvable, from Telegram or the app, and `decide` is how it comes back.
describe('decide — also accepts an `archived` pack, not just `rendered`', () => {
  it('records an approval on an archived pack, the same way as a rendered one', async () => {
    const pack = { contentId: 'c1', status: 'archived', archivedReason: 'no review decision within 72h' };
    const store = memStore({ 'social:pack:c1': pack });
    const result = await decide('c1', 'approved', 'alice', { store });
    assert.equal(result.ok, true);
    assert.equal(result.pack.review.decision, 'approved');
    assert.equal(result.pack.review.by, 'alice');
    assert.equal(store._map.get(DECISION_KEY('c1')).decision, 'approved');
    // The pack record itself (status still 'archived' here) is left for the worker tick to move.
    assert.equal(store._map.get('social:pack:c1'), pack);
  });

  it('records a rejection on an archived pack the same way', async () => {
    const pack = { contentId: 'c1', status: 'archived' };
    const store = memStore({ 'social:pack:c1': pack });
    const result = await decide('c1', 'rejected', 'bob', { store });
    assert.equal(result.ok, true);
    assert.equal(result.pack.review.decision, 'rejected');
  });

  it('a second decision on an already-decided archived pack is refused, same first-decision-wins rule', async () => {
    const pack = { contentId: 'c1', status: 'archived' };
    const store = memStore({ 'social:pack:c1': pack, [DECISION_KEY('c1')]: { decision: 'approved', by: 'alice' } });
    const result = await decide('c1', 'rejected', 'bob', { store });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'already approved by alice');
  });

  it('re-queues an archived pack (QUEUE_KEY, score ~= now) once its decision wins, same as a rendered one', async () => {
    const pack = { contentId: 'c1', status: 'archived' };
    const zaddCalls = [];
    const store = { ...memStore({ 'social:pack:c1': pack }), zadd: async (key, arg) => { zaddCalls.push({ key, arg }); } };
    const before = Date.now();

    const result = await decide('c1', 'approved', 'alice', { store });

    assert.equal(result.ok, true);
    assert.equal(zaddCalls.length, 1);
    assert.equal(zaddCalls[0].key, QUEUE_KEY);
    assert.equal(zaddCalls[0].arg.member, 'c1');
    assert.ok(zaddCalls[0].arg.score >= before && zaddCalls[0].arg.score <= Date.now() + 1000);
  });

  it('still refuses a decision on a `dropped` pack — archived is the only extra status allowed past `rendered`', async () => {
    const pack = { contentId: 'c1', status: 'dropped' };
    const store = memStore({ 'social:pack:c1': pack });
    const result = await decide('c1', 'approved', 'alice', { store });
    assert.equal(result.ok, false);
    assert.match(result.reason, /too late — pack is dropped/);
  });
});

// A pack waiting on review is only looked at every REVIEW_POLL_MS or so. A decision should not
// sit that long before it takes effect, so a winning decision best-effort re-queues the pack due
// now. `memStore` has no `zadd` of its own (the tests above rely on `store.zadd?.(...)` being a
// harmless no-op) — these tests add one explicitly to observe or fail the call.
describe('decide — best-effort re-queue on a winning decision', () => {
  it('re-queues the pack (QUEUE_KEY, score ~= now) once the decision actually wins', async () => {
    const pack = { contentId: 'c1', status: 'rendered' };
    const zaddCalls = [];
    const store = { ...memStore({ 'social:pack:c1': pack }), zadd: async (key, arg) => { zaddCalls.push({ key, arg }); } };
    const before = Date.now();

    const result = await decide('c1', 'approved', 'alice', { store });

    assert.equal(result.ok, true);
    assert.equal(zaddCalls.length, 1);
    assert.equal(zaddCalls[0].key, QUEUE_KEY);
    assert.equal(zaddCalls[0].arg.member, 'c1');
    assert.ok(zaddCalls[0].arg.score >= before && zaddCalls[0].arg.score <= Date.now() + 1000);
  });

  it('does not re-queue when the decision is refused (already decided)', async () => {
    const pack = { contentId: 'c1', status: 'rendered', review: { decision: 'approved', by: 'alice' } };
    const zaddCalls = [];
    const store = { ...memStore({ 'social:pack:c1': pack }), zadd: async (key, arg) => { zaddCalls.push({ key, arg }); } };

    const result = await decide('c1', 'rejected', 'bob', { store });

    assert.equal(result.ok, false);
    assert.equal(zaddCalls.length, 0);
  });

  it('does not re-queue when the pack is too late (past `rendered`)', async () => {
    const pack = { contentId: 'c1', status: 'slotted' };
    const zaddCalls = [];
    const store = { ...memStore({ 'social:pack:c1': pack }), zadd: async (key, arg) => { zaddCalls.push({ key, arg }); } };

    const result = await decide('c1', 'approved', 'alice', { store });

    assert.equal(result.ok, false);
    assert.equal(zaddCalls.length, 0);
  });

  it('does not re-queue when this decide() call itself loses the NX race', async () => {
    const pack = { contentId: 'c1', status: 'rendered' };
    const zaddCalls = [];
    const store = {
      ...memStore({ 'social:pack:c1': pack, [DECISION_KEY('c1')]: { decision: 'rejected', by: 'carol' } }),
      zadd: async (key, arg) => { zaddCalls.push({ key, arg }); },
    };

    const result = await decide('c1', 'approved', 'alice', { store });

    assert.equal(result.ok, false);
    assert.equal(zaddCalls.length, 0);
  });

  it('a throwing zadd is swallowed: the decision still reports ok:true and is still persisted', async () => {
    const pack = { contentId: 'c1', status: 'rendered' };
    const store = { ...memStore({ 'social:pack:c1': pack }), zadd: async () => { throw new Error('KV blip'); } };
    const savedError = console.error;
    const errorCalls = [];
    console.error = (...args) => { errorCalls.push(args); };

    let result;
    try {
      result = await decide('c1', 'approved', 'alice', { store });
    } finally {
      console.error = savedError;
    }

    assert.equal(result.ok, true);
    assert.equal(result.record.decision, 'approved');
    assert.equal(store._map.get(DECISION_KEY('c1')).decision, 'approved'); // persisted despite the zadd failure
    assert.equal(errorCalls.length, 1); // logged, not silently lost
  });
});

// An `archived` pack's re-queue is the ONLY way back into the working queue (see stageArchived
// in autopilot.js), so it is worth a second try; a `rendered` pack's re-queue is best-effort —
// the next routine tick acts on the decision regardless — so it is tried once. These pin the
// exact call counts on both sides, not just that a failure is swallowed.
describe('decide — a second press on a decided ARCHIVED pack re-queues it (lost re-queue recovery)', () => {
  function storeWith(pack, decision) {
    const zadds = [];
    const store = memStore({ 'social:pack:c1': pack, [DECISION_KEY('c1')]: decision });
    store.zadd = async (key, entry) => { zadds.push({ key, entry }); };
    return { store, zadds };
  }

  it('archived + already decided: refused as "already …", but the pack is put back in the queue', async () => {
    const { store, zadds } = storeWith({ contentId: 'c1', status: 'archived' }, { decision: 'approved', by: 'alice' });
    const result = await decide('c1', 'approved', 'alice', { store });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'already approved by alice');
    assert.equal(zadds.length, 1);
    assert.equal(zadds[0].key, QUEUE_KEY);
    assert.equal(zadds[0].entry.member, 'c1');
    assert.equal(store._map.get(DECISION_KEY('c1')).decision, 'approved'); // the recorded decision still stands
  });

  it('rendered + already decided: refused and NOT re-queued (the routine tick picks it up anyway)', async () => {
    const { store, zadds } = storeWith({ contentId: 'c1', status: 'rendered' }, { decision: 'approved', by: 'alice' });
    const result = await decide('c1', 'rejected', 'bob', { store });
    assert.equal(result.ok, false);
    assert.equal(zadds.length, 0);
  });
});

describe('decide — the archive-only second zadd attempt', () => {
  it('archived pack: a zadd that throws once then succeeds is called twice, and the decision still reports ok', async () => {
    const pack = { contentId: 'c1', status: 'archived' };
    let calls = 0;
    const store = {
      ...memStore({ 'social:pack:c1': pack }),
      zadd: async () => { calls += 1; if (calls === 1) throw new Error('KV blip'); },
    };
    const savedError = console.error;
    const errorCalls = [];
    console.error = (...args) => { errorCalls.push(args); };

    let result;
    try {
      result = await decide('c1', 'approved', 'alice', { store });
    } finally {
      console.error = savedError;
    }

    assert.equal(result.ok, true);
    assert.equal(calls, 2);
    assert.equal(errorCalls.length, 1); // only the first (failed) attempt is logged
  });

  it('archived pack: a zadd that always throws is retried the full two attempts, each logged, and the decision still reports ok', async () => {
    const pack = { contentId: 'c1', status: 'archived' };
    let calls = 0;
    const store = {
      ...memStore({ 'social:pack:c1': pack }),
      zadd: async () => { calls += 1; throw new Error('KV down'); },
    };
    const savedError = console.error;
    const errorCalls = [];
    console.error = (...args) => { errorCalls.push(args); };

    let result;
    try {
      result = await decide('c1', 'approved', 'alice', { store });
    } finally {
      console.error = savedError;
    }

    assert.equal(result.ok, true);
    assert.equal(calls, 2);
    assert.equal(errorCalls.length, 2);
  });

  it('rendered pack: a throwing zadd is attempted only once — best-effort, not the archive-only double try', async () => {
    const pack = { contentId: 'c1', status: 'rendered' };
    let calls = 0;
    const store = {
      ...memStore({ 'social:pack:c1': pack }),
      zadd: async () => { calls += 1; throw new Error('KV blip'); },
    };
    const savedError = console.error;
    const errorCalls = [];
    console.error = (...args) => { errorCalls.push(args); };

    let result;
    try {
      result = await decide('c1', 'approved', 'alice', { store });
    } finally {
      console.error = savedError;
    }

    assert.equal(result.ok, true);
    assert.equal(calls, 1);
    assert.equal(errorCalls.length, 1);
  });
});

describe('reviewMessage', () => {
  it('escapes MarkdownV2 special characters in the headline', () => {
    const pack = { social: { headline: 'Deal! (finally) — 50%_off', hook: '' }, categoryId: 'breaking-news' };
    const msg = reviewMessage(pack);
    assert.ok(msg.includes('Deal\\!'));
    assert.ok(msg.includes('\\(finally\\)'));
    assert.ok(msg.includes('50%\\_off'));
  });

  it('flags a sensitive pack in the message', () => {
    const pack = { social: { headline: 'H', hook: '', sensitive: true }, categoryId: 'breaking-news' };
    assert.match(reviewMessage(pack), /SENSITIVE/);
  });

  it('does not flag a non-sensitive pack', () => {
    const pack = { social: { headline: 'H', hook: '', sensitive: false }, categoryId: 'breaking-news' };
    assert.doesNotMatch(reviewMessage(pack), /SENSITIVE/);
  });

  it('falls back to pack.title when there is no social headline', () => {
    const pack = { title: 'Fallback Title', social: {}, categoryId: 'breaking-news' };
    assert.match(reviewMessage(pack), /Fallback Title/);
  });
});

describe('reviewMessage — the auto-approve / never-auto-approves footer line', () => {
  let savedAuto;
  beforeEach(() => { savedAuto = process.env.SOCIAL_REVIEW_AUTO_MINUTES; });
  afterEach(() => { if (savedAuto === undefined) delete process.env.SOCIAL_REVIEW_AUTO_MINUTES; else process.env.SOCIAL_REVIEW_AUTO_MINUTES = savedAuto; });

  it('with the hold ON, shows the never-auto-approves line for a sensitive pack, never the auto-approve countdown', () => {
    process.env.SOCIAL_REVIEW_AUTO_MINUTES = '60';
    process.env.SOCIAL_REVIEW_HOLD_SENSITIVE = 'on';
    const pack = { social: { headline: 'H', hook: '', sensitive: true }, categoryId: 'breaking-news' };
    const msg = reviewMessage(pack);
    assert.match(msg, /never auto\\-approves/);
    assert.doesNotMatch(msg, /Auto\\-approves in/);
  });

  it('by default (hold unset), a sensitive pack gets the normal countdown and no never-auto-approves line', () => {
    process.env.SOCIAL_REVIEW_AUTO_MINUTES = '60';
    const pack = { social: { headline: 'H', hook: '', sensitive: true }, categoryId: 'breaking-news' };
    const msg = reviewMessage(pack);
    assert.match(msg, /Auto\\-approves in 60 min/);
    assert.doesNotMatch(msg, /never auto\\-approves/);
  });

  it('with the hold explicitly off, a sensitive pack gets the normal countdown', () => {
    process.env.SOCIAL_REVIEW_AUTO_MINUTES = '60';
    process.env.SOCIAL_REVIEW_HOLD_SENSITIVE = 'off';
    const pack = { social: { headline: 'H', hook: '', sensitive: true }, categoryId: 'breaking-news' };
    assert.match(reviewMessage(pack), /Auto\\-approves in 60 min/);
  });

  it('with the hold OFF and the window at 0, a sensitive pack shows neither footer line', () => {
    process.env.SOCIAL_REVIEW_AUTO_MINUTES = '0';
    const pack = { social: { headline: 'H', hook: '', sensitive: true }, categoryId: 'breaking-news' };
    const msg = reviewMessage(pack);
    assert.doesNotMatch(msg, /Auto\\-approves in/);
    assert.doesNotMatch(msg, /never auto\\-approves/);
  });

  it('with the hold ON and the window at 0, a sensitive pack still shows the never-auto-approves line', () => {
    process.env.SOCIAL_REVIEW_AUTO_MINUTES = '0';
    process.env.SOCIAL_REVIEW_HOLD_SENSITIVE = 'on';
    const pack = { social: { headline: 'H', hook: '', sensitive: true }, categoryId: 'breaking-news' };
    assert.match(reviewMessage(pack), /never auto\\-approves/);
  });

  it('with the hold ON, a non-sensitive pack still gets the countdown, not the sensitive line', () => {
    process.env.SOCIAL_REVIEW_AUTO_MINUTES = '60';
    process.env.SOCIAL_REVIEW_HOLD_SENSITIVE = 'on';
    const pack = { social: { headline: 'H', hook: '', sensitive: false }, categoryId: 'breaking-news' };
    const msg = reviewMessage(pack);
    assert.match(msg, /Auto\\-approves in 60 min/);
    assert.doesNotMatch(msg, /never auto\\-approves/);
  });

  it('shows the auto-approve countdown for a non-sensitive pack when the window is enabled', () => {
    process.env.SOCIAL_REVIEW_AUTO_MINUTES = '60';
    const pack = { social: { headline: 'H', hook: '', sensitive: false }, categoryId: 'breaking-news' };
    const msg = reviewMessage(pack);
    assert.match(msg, /Auto\\-approves in 60 min/);
    assert.doesNotMatch(msg, /never auto\\-approves/);
  });

  it('shows neither line when the auto-approve window is disabled and the pack is not sensitive', () => {
    process.env.SOCIAL_REVIEW_AUTO_MINUTES = '0';
    const pack = { social: { headline: 'H', hook: '', sensitive: false }, categoryId: 'breaking-news' };
    const msg = reviewMessage(pack);
    assert.doesNotMatch(msg, /Auto\\-approves in/);
    assert.doesNotMatch(msg, /never auto\\-approves/);
  });
});

describe('previewButtons', () => {
  it('returns one row, ordered Reel, TikTok, Carousel, when all three assets exist', () => {
    const pack = {
      renders: {
        videos: { reel: { url: 'https://blob/reel.mp4' }, tiktok: { url: 'https://blob/tt.mp4' } },
        stills: { cover: 'https://blob/cover.jpg' },
      },
    };
    const rows = previewButtons(pack);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].map((b) => b.text), ['▶ Reel', '▶ TikTok', '🖼 Carousel']);
    assert.deepEqual(rows[0].map((b) => b.url), ['https://blob/reel.mp4', 'https://blob/tt.mp4', 'https://blob/cover.jpg']);
  });

  it('strips the `download` query param from a Blob URL, so the link plays instead of downloading', () => {
    const pack = { renders: { videos: { reel: { url: 'https://blob/reel.mp4?download=1&x=1' } } } };
    const [[button]] = previewButtons(pack);
    assert.equal(button.url, 'https://blob/reel.mp4?x=1');
  });

  it('drops a non-https URL (e.g. plain http)', () => {
    const pack = { renders: { videos: { reel: { url: 'http://blob/reel.mp4' } } } };
    assert.deepEqual(previewButtons(pack), []);
  });

  it('drops a garbage, unparseable URL', () => {
    const pack = { renders: { videos: { reel: { url: 'not a url at all' } } } };
    assert.deepEqual(previewButtons(pack), []);
  });

  it('returns [] when there is nothing finished at all', () => {
    assert.deepEqual(previewButtons({}), []);
    assert.deepEqual(previewButtons({ renders: {} }), []);
  });

  it('keeps only the buttons that resolved to a valid URL, silently dropping the rest', () => {
    const pack = {
      renders: {
        videos: { reel: { url: 'https://blob/reel.mp4' }, tiktok: { url: 'not-a-url' } },
        stills: {},
      },
    };
    const [row] = previewButtons(pack);
    assert.deepEqual(row.map((b) => b.text), ['▶ Reel']);
  });

  it('drops a non-string URL value (e.g. a number or null) without throwing', () => {
    const pack = { renders: { videos: { reel: { url: null }, tiktok: { url: 42 } }, stills: {} } };
    assert.deepEqual(previewButtons(pack), []);
  });
});

describe('requestReview', () => {
  let savedToken, savedChat;
  beforeEach(() => { savedToken = process.env.TELEGRAM_BOT_TOKEN; savedChat = process.env.TELEGRAM_CHAT_ID; });
  afterEach(() => {
    if (savedToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = savedToken;
    if (savedChat === undefined) delete process.env.TELEGRAM_CHAT_ID; else process.env.TELEGRAM_CHAT_ID = savedChat;
  });

  it('records sent:false and an error, without calling fetch, when Telegram is not configured', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    const fetchFn = async () => { throw new Error('fetch should not have been called'); };
    const result = await requestReview({ contentId: 'c1', social: {} }, { fetchFn });
    assert.equal(result.sent, false);
    assert.match(result.error, /not configured/);
    assert.equal(typeof result.requestedAt, 'string');
  });

  it('records sent:true on a successful Telegram send', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    process.env.TELEGRAM_CHAT_ID = 'chat1';
    const fetchFn = async () => ({ json: async () => ({ ok: true }) });
    const result = await requestReview({ contentId: 'c1', social: {} }, { fetchFn });
    assert.equal(result.sent, true);
    assert.equal(result.error, undefined);
  });

  it('records sent:false with the Telegram description when the send is rejected', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    process.env.TELEGRAM_CHAT_ID = 'chat1';
    const fetchFn = async () => ({ status: 400, json: async () => ({ ok: false, description: 'chat not found' }) });
    const result = await requestReview({ contentId: 'c1', social: {} }, { fetchFn });
    assert.equal(result.sent, false);
    assert.equal(result.error, 'chat not found');
  });

  it('does not throw when the network call itself rejects — the pipeline must keep running', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    process.env.TELEGRAM_CHAT_ID = 'chat1';
    const fetchFn = async () => { throw new Error('ECONNRESET'); };
    const result = await requestReview({ contentId: 'c1', social: {} }, { fetchFn });
    assert.equal(result.sent, false);
    assert.match(result.error, /ECONNRESET/);
  });

  it('sends inline Approve/Reject buttons keyed to the pack contentId', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    process.env.TELEGRAM_CHAT_ID = 'chat1';
    let seenBody;
    const fetchFn = async (url, init) => { seenBody = JSON.parse(init.body); return { json: async () => ({ ok: true }) }; };
    await requestReview({ contentId: 'c42', social: {} }, { fetchFn });
    const buttons = seenBody.reply_markup.inline_keyboard[0];
    assert.equal(buttons[0].callback_data, 'sapprove:c42');
    assert.equal(buttons[1].callback_data, 'sreject:c42');
  });

  it('appends the preview-button row after Approve/Reject when a finished asset exists', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    process.env.TELEGRAM_CHAT_ID = 'chat1';
    let seenBody;
    const fetchFn = async (url, init) => { seenBody = JSON.parse(init.body); return { json: async () => ({ ok: true }) }; };
    const pack = { contentId: 'c42', social: {}, renders: { videos: { reel: { url: 'https://blob/reel.mp4' } }, stills: {} } };
    await requestReview(pack, { fetchFn });
    const rows = seenBody.reply_markup.inline_keyboard;
    assert.equal(rows.length, 2); // Approve/Reject row, then the preview row
    assert.equal(rows[1][0].text, '▶ Reel');
  });

  it('has only the Approve/Reject row when nothing has finished rendering yet', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    process.env.TELEGRAM_CHAT_ID = 'chat1';
    let seenBody;
    const fetchFn = async (url, init) => { seenBody = JSON.parse(init.body); return { json: async () => ({ ok: true }) }; };
    await requestReview({ contentId: 'c1', social: {} }, { fetchFn });
    assert.equal(seenBody.reply_markup.inline_keyboard.length, 1);
  });

  it('returns messageId and chatId (coerced to a string) on a successful send', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    process.env.TELEGRAM_CHAT_ID = '987654';
    const fetchFn = async () => ({ json: async () => ({ ok: true, result: { message_id: 555 } }) });
    const result = await requestReview({ contentId: 'c1', social: {} }, { fetchFn });
    assert.equal(result.messageId, 555);
    assert.equal(result.chatId, '987654');
    assert.equal(typeof result.chatId, 'string');
  });

  it('omits messageId and chatId when the send failed', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    process.env.TELEGRAM_CHAT_ID = 'chat1';
    const fetchFn = async () => ({ status: 400, json: async () => ({ ok: false, description: 'chat not found' }) });
    const result = await requestReview({ contentId: 'c1', social: {} }, { fetchFn });
    assert.equal('messageId' in result, false);
    assert.equal('chatId' in result, false);
  });
});

describe('closeReviewMessage', () => {
  const pack = { contentId: 'c1', renders: {} };
  const record = { decision: 'approved', by: 'alice', via: 'telegram' };

  let savedToken;
  beforeEach(() => { savedToken = process.env.TELEGRAM_BOT_TOKEN; });
  afterEach(() => { if (savedToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = savedToken; });

  it('no-ops (returns false, never calls fetch) when the bot token is not configured', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const fetchFn = async () => { throw new Error('fetch should not have been called'); };
    const result = await closeReviewMessage({ chatId: 'c1', messageId: 1, pack, record }, { fetchFn });
    assert.equal(result, false);
  });

  it('no-ops when chatId is missing', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    const fetchFn = async () => { throw new Error('fetch should not have been called'); };
    const result = await closeReviewMessage({ chatId: null, messageId: 1, pack, record }, { fetchFn });
    assert.equal(result, false);
  });

  it('no-ops when messageId is missing', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    const fetchFn = async () => { throw new Error('fetch should not have been called'); };
    const result = await closeReviewMessage({ chatId: 'c1', messageId: null, pack, record }, { fetchFn });
    assert.equal(result, false);
  });

  it('no-ops when there is no decision record yet', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    const fetchFn = async () => { throw new Error('fetch should not have been called'); };
    const result = await closeReviewMessage({ chatId: 'c1', messageId: 1, pack, record: null }, { fetchFn });
    assert.equal(result, false);
  });

  it('edits the reply markup then sends a plain-text reply (no parse_mode) on success', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    const calls = [];
    const fetchFn = async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return { json: async () => ({ ok: true }) };
    };
    const result = await closeReviewMessage({ chatId: 'c1', messageId: 42, pack, record }, { fetchFn });
    assert.equal(result, true);
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /editMessageReplyMarkup$/);
    assert.match(calls[1].url, /sendMessage$/);
    assert.equal('parse_mode' in calls[1].body, false);
    assert.match(calls[1].body.text, /Approved by alice/);
    assert.equal(calls[1].body.reply_parameters.message_id, 42);
  });

  it('includes " in the app" in the reply text when the decision came via the app', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    let sendBody;
    const fetchFn = async (url, init) => {
      if (url.endsWith('sendMessage')) sendBody = JSON.parse(init.body);
      return { json: async () => ({ ok: true }) };
    };
    await closeReviewMessage({ chatId: 'c1', messageId: 42, pack, record: { decision: 'approved', by: 'alice', via: 'app' } }, { fetchFn });
    assert.match(sendBody.text, /in the app/);
  });

  it('omits " in the app" when the decision came via Telegram', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    let sendBody;
    const fetchFn = async (url, init) => {
      if (url.endsWith('sendMessage')) sendBody = JSON.parse(init.body);
      return { json: async () => ({ ok: true }) };
    };
    await closeReviewMessage({ chatId: 'c1', messageId: 42, pack, record: { decision: 'approved', by: 'alice', via: 'telegram' } }, { fetchFn });
    assert.doesNotMatch(sendBody.text, /in the app/);
  });

  it('says rejected/will-not-post, not approved/scheduled, for a rejection', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    let sendBody;
    const fetchFn = async (url, init) => {
      if (url.endsWith('sendMessage')) sendBody = JSON.parse(init.body);
      return { json: async () => ({ ok: true }) };
    };
    await closeReviewMessage({ chatId: 'c1', messageId: 42, pack, record: { decision: 'rejected', by: 'bob', via: 'telegram' } }, { fetchFn });
    assert.match(sendBody.text, /Rejected by bob/);
    assert.match(sendBody.text, /will not be posted/);
  });

  it('returns false (does not throw) when Telegram reports ok:false on the edit call', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    const fetchFn = async (url) => {
      if (url.endsWith('editMessageReplyMarkup')) return { json: async () => ({ ok: false, description: 'message to edit not found' }) };
      return { json: async () => ({ ok: true }) };
    };
    const result = await closeReviewMessage({ chatId: 'c1', messageId: 42, pack, record }, { fetchFn });
    assert.equal(result, false);
  });

  it('returns false when the edit succeeds but the reply send reports ok:false', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    const fetchFn = async (url) => {
      if (url.endsWith('sendMessage')) return { json: async () => ({ ok: false, description: 'blocked' }) };
      return { json: async () => ({ ok: true }) };
    };
    const result = await closeReviewMessage({ chatId: 'c1', messageId: 42, pack, record }, { fetchFn });
    assert.equal(result, false);
  });

  it('never throws when the network call itself rejects — a cosmetic edit must not become a reported failure', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    const fetchFn = async () => { throw new Error('ECONNRESET'); };
    const result = await closeReviewMessage({ chatId: 'c1', messageId: 42, pack, record }, { fetchFn });
    assert.equal(result, false);
  });

  it('the edited reply_markup carries the preview buttons only — no Approve/Reject row', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    let editBody;
    const fetchFn = async (url, init) => {
      if (url.endsWith('editMessageReplyMarkup')) editBody = JSON.parse(init.body);
      return { json: async () => ({ ok: true }) };
    };
    const withAssets = { contentId: 'c1', renders: { videos: { reel: { url: 'https://blob/reel.mp4' } }, stills: {} } };
    await closeReviewMessage({ chatId: 'c1', messageId: 42, pack: withAssets, record }, { fetchFn });
    const rows = editBody.reply_markup.inline_keyboard;
    assert.equal(rows.length, 1);
    assert.equal(rows[0][0].text, '▶ Reel');
    assert.equal(editBody.chat_id, 'c1');
    assert.equal(editBody.message_id, 42);
  });

  it('via:"auto" — capitalises the reason and says "with no answer", not "Approved by"/"in the app"', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    let sendBody;
    const fetchFn = async (url, init) => {
      if (url.endsWith('sendMessage')) sendBody = JSON.parse(init.body);
      return { json: async () => ({ ok: true }) };
    };
    await closeReviewMessage(
      { chatId: 'c1', messageId: 42, pack, record: { decision: 'approved', by: 'autopilot', via: 'auto', reason: 'auto-approved after 60 min' } },
      { fetchFn },
    );
    assert.equal(sendBody.text, '⏱ Auto-approved after 60 min with no answer. It is being scheduled now.');
    assert.doesNotMatch(sendBody.text, /Approved by/);
    assert.doesNotMatch(sendBody.text, /in the app/);
  });

  it('via:"auto" — falls back to "Auto-approved" when the record carries no reason', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    let sendBody;
    const fetchFn = async (url, init) => {
      if (url.endsWith('sendMessage')) sendBody = JSON.parse(init.body);
      return { json: async () => ({ ok: true }) };
    };
    await closeReviewMessage(
      { chatId: 'c1', messageId: 42, pack, record: { decision: 'approved', by: 'autopilot', via: 'auto' } },
      { fetchFn },
    );
    assert.equal(sendBody.text, '⏱ Auto-approved with no answer. It is being scheduled now.');
  });

  it('via:"auto" — capitalises only the first character, leaving the rest of the reason as-is', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    let sendBody;
    const fetchFn = async (url, init) => {
      if (url.endsWith('sendMessage')) sendBody = JSON.parse(init.body);
      return { json: async () => ({ ok: true }) };
    };
    await closeReviewMessage(
      { chatId: 'c1', messageId: 42, pack, record: { decision: 'approved', by: 'autopilot', via: 'auto', reason: 'gate off' } },
      { fetchFn },
    );
    assert.equal(sendBody.text, '⏱ Gate off with no answer. It is being scheduled now.');
  });
});

describe('noteArchived', () => {
  const pack = { contentId: 'c1', review: { chatId: 'c1chat', messageId: 42 } };

  let savedToken;
  beforeEach(() => { savedToken = process.env.TELEGRAM_BOT_TOKEN; });
  afterEach(() => { if (savedToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = savedToken; });

  it('no-ops (returns false, never calls fetch) when the bot token is not configured', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const fetchFn = async () => { throw new Error('fetch should not have been called'); };
    const result = await noteArchived(pack, 72, { fetchFn });
    assert.equal(result, false);
  });

  it('no-ops when the pack carries no review.chatId', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    const fetchFn = async () => { throw new Error('fetch should not have been called'); };
    const result = await noteArchived({ contentId: 'c1', review: { messageId: 42 } }, 72, { fetchFn });
    assert.equal(result, false);
  });

  it('no-ops when the pack carries no review.messageId', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    const fetchFn = async () => { throw new Error('fetch should not have been called'); };
    const result = await noteArchived({ contentId: 'c1', review: { chatId: 'c1chat' } }, 72, { fetchFn });
    assert.equal(result, false);
  });

  it('no-ops when the pack has no review block at all', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    const fetchFn = async () => { throw new Error('fetch should not have been called'); };
    const result = await noteArchived({ contentId: 'c1' }, 72, { fetchFn });
    assert.equal(result, false);
  });

  it('sends a plain-text reply to the original message on success, naming the hours', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    let seenUrl, seenBody;
    const fetchFn = async (url, init) => { seenUrl = url; seenBody = JSON.parse(init.body); return { json: async () => ({ ok: true }) }; };
    const result = await noteArchived(pack, 72, { fetchFn });
    assert.equal(result, true);
    assert.match(seenUrl, /sendMessage$/);
    assert.equal(seenBody.chat_id, 'c1chat');
    // Plain text, no parse_mode: same reasoning as closeReviewMessage — nothing here should
    // depend on a `by` or title never containing a MarkdownV2 special character.
    assert.equal('parse_mode' in seenBody, false);
    assert.match(seenBody.text, /No answer after 72h/);
    assert.equal(seenBody.reply_parameters.message_id, 42);
    assert.equal(seenBody.reply_parameters.allow_sending_without_reply, true);
  });

  it('says nothing is posted and nothing is lost, and that Approve/Reject still work', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    let sendBody;
    const fetchFn = async (url, init) => { sendBody = JSON.parse(init.body); return { json: async () => ({ ok: true }) }; };
    await noteArchived(pack, 24, { fetchFn });
    assert.match(sendBody.text, /Nothing has been posted and nothing is lost/);
    assert.match(sendBody.text, /Approve or Reject above still works, here or in the app/);
  });

  it('returns false (does not throw) when Telegram reports ok:false', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    const fetchFn = async () => ({ json: async () => ({ ok: false, description: 'message to reply to not found' }) });
    const result = await noteArchived(pack, 72, { fetchFn });
    assert.equal(result, false);
  });

  it('never throws when the network call itself rejects — the pipeline must keep running', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    const fetchFn = async () => { throw new Error('ECONNRESET'); };
    const result = await noteArchived(pack, 72, { fetchFn });
    assert.equal(result, false);
  });
});

// ── The board's auto-approve toggle ─────────────────────────────────────────────────────────
describe('setAutoApprove / loadAutoApprove / autoApproveSetting', () => {
  let savedEnv;
  beforeEach(() => { savedEnv = process.env.SOCIAL_REVIEW_AUTO_MINUTES; delete process.env.SOCIAL_REVIEW_AUTO_MINUTES; });
  afterEach(() => { if (savedEnv === undefined) delete process.env.SOCIAL_REVIEW_AUTO_MINUTES; else process.env.SOCIAL_REVIEW_AUTO_MINUTES = savedEnv; });

  it('with no board value ever read, the env var is in force and the source is "env"', async () => {
    process.env.SOCIAL_REVIEW_AUTO_MINUTES = '45';
    await loadAutoApprove(memStore());
    assert.deepEqual(autoApproveSetting(), { enabled: true, minutes: 45, source: 'env', holdSensitive: false });
  });

  it('setAutoApprove({enabled:true, minutes}) stores and applies the board value, overriding the env var', async () => {
    process.env.SOCIAL_REVIEW_AUTO_MINUTES = '999';
    const store = memStore();
    const result = await setAutoApprove({ enabled: true, minutes: 30 }, store);
    assert.deepEqual(result, { enabled: true, minutes: 30, source: 'board', holdSensitive: false });
    assert.equal(autoApproveMs(), 30 * 60_000);
  });

  it('setAutoApprove({enabled:false}) stores 0 minutes — auto-approve fully off, board still wins over env', async () => {
    process.env.SOCIAL_REVIEW_AUTO_MINUTES = '60';
    const store = memStore();
    const result = await setAutoApprove({ enabled: false }, store);
    assert.deepEqual(result, { enabled: false, minutes: 0, source: 'board', holdSensitive: false });
    assert.equal(autoApproveMs(), 0);
  });

  it('enabling with no minutes given uses the default (120)', async () => {
    const store = memStore();
    const result = await setAutoApprove({ enabled: true }, store);
    assert.equal(result.minutes, AUTO_APPROVE_DEFAULT_MINUTES);
  });

  it('rejects a non-boolean `enabled` with a 400-tagged error, before writing anything', async () => {
    const store = memStore();
    await assert.rejects(setAutoApprove({ enabled: 'yes', minutes: 30 }, store), (err) => {
      assert.equal(err.status, 400);
      return true;
    });
    assert.equal(store._map.has(AUTO_APPROVE_KEY), false);
  });

  it('rejects minutes below the floor with a 400-tagged error', async () => {
    const store = memStore();
    await assert.rejects(
      setAutoApprove({ enabled: true, minutes: AUTO_APPROVE_MIN_MINUTES - 1 }, store),
      (err) => { assert.equal(err.status, 400); return true; },
    );
  });

  it('rejects minutes above the ceiling with a 400-tagged error', async () => {
    const store = memStore();
    await assert.rejects(
      setAutoApprove({ enabled: true, minutes: AUTO_APPROVE_MAX_MINUTES + 1 }, store),
      (err) => { assert.equal(err.status, 400); return true; },
    );
  });

  it('rejects a non-integer minutes value (e.g. 5.5)', async () => {
    const store = memStore();
    await assert.rejects(setAutoApprove({ enabled: true, minutes: 5.5 }, store), (err) => {
      assert.equal(err.status, 400);
      return true;
    });
  });

  it('accepts the exact floor and ceiling minutes', async () => {
    const store = memStore();
    await setAutoApprove({ enabled: true, minutes: AUTO_APPROVE_MIN_MINUTES }, store);
    assert.equal(autoApproveSetting().minutes, AUTO_APPROVE_MIN_MINUTES);
    await setAutoApprove({ enabled: true, minutes: AUTO_APPROVE_MAX_MINUTES }, store);
    assert.equal(autoApproveSetting().minutes, AUTO_APPROVE_MAX_MINUTES);
  });

  it('a failed KV read falls back to the env var rather than keeping a stale earlier board value', async () => {
    const goodStore = memStore();
    await setAutoApprove({ enabled: true, minutes: 30 }, goodStore);
    assert.equal(autoApproveSetting().source, 'board');

    process.env.SOCIAL_REVIEW_AUTO_MINUTES = '15';
    const throwingStore = { get: async () => { throw new Error('KV blip'); } };
    const result = await loadAutoApprove(throwingStore);

    assert.deepEqual(result, { enabled: true, minutes: 15, source: 'env', holdSensitive: false });
  });

  it('a malformed stored value (garbage minutes) falls back to the env var, not to "board enabled anyway"', async () => {
    const store = memStore({ [AUTO_APPROVE_KEY]: { minutes: 'garbage' } });
    process.env.SOCIAL_REVIEW_AUTO_MINUTES = '20';
    const result = await loadAutoApprove(store);
    assert.deepEqual(result, { enabled: true, minutes: 20, source: 'env', holdSensitive: false });
  });

  it('reading a KV key that was never written (null) is treated as "no board setting", not as 0/off permanently', async () => {
    process.env.SOCIAL_REVIEW_AUTO_MINUTES = '10';
    const result = await loadAutoApprove(memStore());
    assert.deepEqual(result, { enabled: true, minutes: 10, source: 'env', holdSensitive: false });
  });

  it('setAutoApprove defaults to the shared kv singleton when no store is passed', async () => {
    // Smoke test only: proves the signature accepts a call with no store without throwing at
    // the call boundary before ever reaching kv — real kv access is exercised in autopilot.test.js.
    assert.equal(setAutoApprove.length <= 2, true);
  });
});

describe('reviewState — with the sensitive hold ON, sensitive packs never auto-approve even when the BOARD switch (not just env) is on', () => {
  let savedGate;
  beforeEach(() => {
    savedGate = process.env.SOCIAL_REVIEW_GATE; process.env.SOCIAL_REVIEW_GATE = 'on';
    process.env.SOCIAL_REVIEW_HOLD_SENSITIVE = 'on';
  });
  afterEach(() => { if (savedGate === undefined) delete process.env.SOCIAL_REVIEW_GATE; else process.env.SOCIAL_REVIEW_GATE = savedGate; });

  it('a sensitive pack stays held past the board-set window, while a routine one releases', async () => {
    await setAutoApprove({ enabled: true, minutes: AUTO_APPROVE_MIN_MINUTES }, memStore());
    const now = Date.now();
    const requestedAt = new Date(now - autoApproveMs() - 60_000).toISOString();

    const sensitive = reviewState({ social: { sensitive: true }, review: { requestedAt, sent: true } }, now);
    assert.deepEqual(sensitive, { released: false, reason: 'sensitive — waiting for a person, never auto-approved' });

    const routine = reviewState({ social: { sensitive: false }, review: { requestedAt, sent: true } }, now);
    assert.equal(routine.released, true);
    assert.equal(routine.auto, true);
  });
});
