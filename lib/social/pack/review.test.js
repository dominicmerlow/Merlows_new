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
  needsReview, reviewState, decide, requestReview, reviewMessage, GATE, autoApproveMs,
} from './review.js';

function memStore(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get: async (key) => map.get(key) ?? null,
    set: async (key, val) => { map.set(key, val); },
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

  it('records an approval on a rendered, undecided pack and persists it', async () => {
    const pack = { contentId: 'c1', status: 'rendered' };
    const store = memStore({ 'social:pack:c1': pack });
    const result = await decide('c1', 'approved', 'alice', { store });
    assert.equal(result.ok, true);
    assert.equal(result.pack.review.decision, 'approved');
    assert.equal(result.pack.review.by, 'alice');
    assert.equal(typeof result.pack.review.decidedAt, 'string');
    assert.equal(store._map.get('social:pack:c1').review.decision, 'approved'); // actually persisted
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
});
