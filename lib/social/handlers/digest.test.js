// lib/social/handlers/digest.js — the daily Telegram digest.
//
// Only buildDigest and digestMessage are covered: they're the pure/testable parts (buildDigest
// is "pure apart from the reads" per its own doc comment); the default handler's job is wiring
// buildDigest's output into a real fetch to api.telegram.org, which is out of scope here.
//
// digest.js imports the `kv` singleton straight from ../../kv.js and calls listPacks (which
// also uses that singleton directly) — same approach as store.test.js and autopilot.test.js:
// monkey-patch kv's methods per test, restore them in afterEach. A real Upstash call must
// never happen here: that store is shared with another company's production data.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { kv } from '../../kv.js';
import { PACK_KEY } from '../pack/store.js';
import { DECISION_KEY } from '../pack/review.js';
import digestHandler, { buildDigest, digestMessage, costLines } from './digest.js';
import { QUEUE_KEY } from '../pack/store.js';

// SOCIAL_REVIEW_HOLD_SENSITIVE is read live; every test starts with it UNSET (the production
// default) and is restored afterwards, deleting it when it was originally unset.
let savedHoldSensitive;
beforeEach(() => { savedHoldSensitive = process.env.SOCIAL_REVIEW_HOLD_SENSITIVE; delete process.env.SOCIAL_REVIEW_HOLD_SENSITIVE; });
afterEach(() => {
  if (savedHoldSensitive === undefined) delete process.env.SOCIAL_REVIEW_HOLD_SENSITIVE;
  else process.env.SOCIAL_REVIEW_HOLD_SENSITIVE = savedHoldSensitive;
});

let saved;
beforeEach(() => {
  saved = { get: kv.get, lrange: kv.lrange, mget: kv.mget };
});
afterEach(() => {
  kv.get = saved.get; kv.lrange = saved.lrange; kv.mget = saved.mget;
});

/**
 * Wires listPacks' two calls (lrange the index, mget the records) plus the slots-grid read.
 * `decisions` is keyed by contentId — buildDigest reads DECISION_KEY(contentId) through the
 * same mget as the pack records themselves, so both live in one map.
 */
function stubPacks(packs, slots = {}, decisions = {}) {
  const map = new Map(packs.map((p) => [PACK_KEY(p.contentId), p]));
  for (const [contentId, record] of Object.entries(decisions)) map.set(DECISION_KEY(contentId), record);
  kv.lrange = async () => packs.map((p) => p.contentId);
  kv.mget = async (...keys) => keys.map((k) => map.get(k) ?? null);
  kv.get = async () => slots;
}

describe('buildDigest', () => {
  it('splits a pack\'s posts into posted, failed and scheduled buckets', async () => {
    const now = Date.now();
    const pack = {
      contentId: 'a', title: 'Story A', status: 'done',
      updatedAt: new Date(now - 60 * 60_000).toISOString(),
      posts: [
        { format: 'tiktok', status: 'published', url: 'https://tiktok.com/@x/video/1' },
        { format: 'reel', status: 'failed', error: 'upload timeout' },
        { format: 'carousel', status: 'scheduled' },
      ],
    };
    stubPacks([pack]);

    const digest = await buildDigest({ now });

    assert.equal(digest.posted.length, 1);
    assert.equal(digest.posted[0].format, 'tiktok');
    assert.equal(digest.failedPosts.length, 1);
    assert.equal(digest.failedPosts[0].format, 'reel');
    assert.equal(digest.scheduled.length, 1);
    assert.equal(digest.scheduled[0].format, 'carousel');
  });

  it('counts dropped packs separately from post-level failures', async () => {
    const now = Date.now();
    const dropped = { contentId: 'b', status: 'dropped', posts: [], updatedAt: new Date(now - 60_000).toISOString() };
    stubPacks([dropped]);

    const digest = await buildDigest({ now });

    assert.equal(digest.dropped.length, 1);
    assert.equal(digest.failedPosts.length, 0);
    assert.equal(digest.posted.length, 0);
  });

  it('counts failed-to-produce packs separately from post-level failures', async () => {
    const now = Date.now();
    const failedPack = { contentId: 'c', status: 'failed', posts: [], updatedAt: new Date(now - 60_000).toISOString() };
    stubPacks([failedPack]);

    const digest = await buildDigest({ now });

    assert.equal(digest.failedPacks.length, 1);
    assert.equal(digest.failedPosts.length, 0);
    assert.equal(digest.dropped.length, 0);
  });

  it('excludes a pack whose last update is outside the 24-hour window', async () => {
    const now = Date.now();
    const old = {
      contentId: 'd', status: 'done', updatedAt: new Date(now - 25 * 60 * 60_000).toISOString(),
      posts: [{ format: 'tiktok', status: 'published', url: 'https://tiktok.com/@x/video/2' }],
    };
    stubPacks([old]);

    const digest = await buildDigest({ now });

    assert.equal(digest.posted.length, 0);
  });

  it('includes a pack exactly at the 24-hour boundary', async () => {
    const now = Date.now();
    const boundary = {
      contentId: 'e', status: 'done', updatedAt: new Date(now - 24 * 60 * 60_000).toISOString(),
      posts: [{ format: 'tiktok', status: 'published', url: 'https://tiktok.com/@x/video/3' }],
    };
    stubPacks([boundary]);

    const digest = await buildDigest({ now });

    assert.equal(digest.posted.length, 1);
  });

  it('excludes a pack with no parseable date at all', async () => {
    const now = Date.now();
    const noDate = {
      contentId: 'z', status: 'done',
      posts: [{ format: 'tiktok', status: 'published', url: 'https://tiktok.com/@x/video/4' }],
    };
    stubPacks([noDate]);

    const digest = await buildDigest({ now });

    assert.equal(digest.posted.length, 0);
  });

  it('counts awaitingReview only for rendered packs with a pending review', async () => {
    const now = Date.now();
    const pending = {
      contentId: 'f', status: 'rendered', posts: [],
      review: { requestedAt: new Date(now - 60_000).toISOString() },
      updatedAt: new Date(now - 60_000).toISOString(),
    };
    stubPacks([pending]);

    const digest = await buildDigest({ now });

    assert.equal(digest.awaitingReview.length, 1);
  });

  it('excludes a review once a decision has already been made', async () => {
    const now = Date.now();
    const decided = {
      contentId: 'g', status: 'rendered', posts: [],
      review: { requestedAt: new Date(now - 60_000).toISOString(), decision: 'approved' },
      updatedAt: new Date(now - 60_000).toISOString(),
    };
    stubPacks([decided]);

    const digest = await buildDigest({ now });

    assert.equal(digest.awaitingReview.length, 0);
  });

  it('excludes a pending review once the pack has moved past rendered', async () => {
    const now = Date.now();
    const slotted = {
      contentId: 'h', status: 'slotted', posts: [],
      review: { requestedAt: new Date(now - 60_000).toISOString() },
      updatedAt: new Date(now - 60_000).toISOString(),
    };
    stubPacks([slotted]);

    const digest = await buildDigest({ now });

    assert.equal(digest.awaitingReview.length, 0);
  });

  it('counts awaitingUrl for published posts with no url yet (TikTok resolves it later)', async () => {
    const now = Date.now();
    const pack = {
      contentId: 'i', status: 'done', updatedAt: new Date(now - 60_000).toISOString(),
      posts: [
        { format: 'tiktok', status: 'published' }, // no url field at all
        { format: 'reel', status: 'published', url: 'https://instagram.com/reel/1' },
      ],
    };
    stubPacks([pack]);

    const digest = await buildDigest({ now });

    assert.equal(digest.posted.length, 2);
    assert.equal(digest.awaitingUrl, 1);
  });

  it('reports slotsFilled from the day\'s slot grid', async () => {
    const now = Date.now();
    stubPacks([], { 'tiktok@09:00': 'x', 'reel@12:00': 'y' });

    const digest = await buildDigest({ now });

    assert.equal(digest.slotsFilled, 2);
  });

  it('excludes a review whose decision lives only in the decision key, not yet copied onto the pack record', async () => {
    // Before the merge fix, a pack approved (or auto-approved) since it was last saved would
    // still read as awaiting review right up until the worker tick next wrote the record.
    const now = Date.now();
    const pending = {
      contentId: 'k', status: 'rendered', posts: [],
      review: { requestedAt: new Date(now - 60_000).toISOString() }, // no decision on the record itself
      updatedAt: new Date(now - 60_000).toISOString(),
    };
    stubPacks([pending], {}, { k: { decision: 'approved', by: 'alice', via: 'app', decidedAt: new Date(now - 30_000).toISOString() } });

    const digest = await buildDigest({ now });

    assert.equal(digest.awaitingReview.length, 0);
  });

  it('still counts a review awaiting a decision when the decision key genuinely holds none', async () => {
    // Guards the merge itself: a missing/null decision-key read must not accidentally clear
    // the in-record fields buildDigest depends on.
    const now = Date.now();
    const pending = {
      contentId: 'm', status: 'rendered', posts: [],
      review: { requestedAt: new Date(now - 60_000).toISOString() },
      updatedAt: new Date(now - 60_000).toISOString(),
    };
    stubPacks([pending]); // no decisions map at all — mget answers null for DECISION_KEY('m')

    const digest = await buildDigest({ now });

    assert.equal(digest.awaitingReview.length, 1);
  });

  it('lists archived packs that have no decision yet', async () => {
    const now = Date.now();
    const archived = { contentId: 'p', status: 'archived', posts: [], updatedAt: new Date(now - 60_000).toISOString() };
    stubPacks([archived]);

    const digest = await buildDigest({ now });

    assert.equal(digest.archived.length, 1);
    assert.equal(digest.archived[0].contentId, 'p');
  });

  it('counts an archived pack even when it is older than the 24h digest window — archived stories are never time-boxed', async () => {
    const now = Date.now();
    const oldArchived = {
      contentId: 'q', status: 'archived', posts: [],
      updatedAt: new Date(now - 10 * 24 * 60 * 60_000).toISOString(), // 10 days old
    };
    stubPacks([oldArchived]);

    const digest = await buildDigest({ now });

    assert.equal(digest.archived.length, 1);
  });

  it('excludes an archived pack once a decision has been recorded for it', async () => {
    const now = Date.now();
    const decided = { contentId: 'r', status: 'archived', posts: [], updatedAt: new Date(now - 60_000).toISOString() };
    stubPacks([decided], {}, { r: { decision: 'approved', by: 'alice', via: 'app', decidedAt: new Date(now - 30_000).toISOString() } });

    const digest = await buildDigest({ now });

    assert.equal(digest.archived.length, 0);
  });

  it('does not count a rendered (not archived) pack as archived', async () => {
    const now = Date.now();
    const rendered = { contentId: 's', status: 'rendered', posts: [], updatedAt: new Date(now - 60_000).toISOString() };
    stubPacks([rendered]);

    const digest = await buildDigest({ now });

    assert.equal(digest.archived.length, 0);
  });

  // A decision on an archived pack re-queues it (decide() in review.js), and the next tick
  // restores or drops it within minutes. One still `archived` WITH a decision at digest time
  // means that re-queue was lost — nothing else ever looks at an archived pack again, so this
  // is the routine place a person hears about it.
  it('lists an archived pack that already has a decision recorded, separately from ones still awaiting one', async () => {
    const now = Date.now();
    const decidedArchived = { contentId: 'z', status: 'archived', posts: [], updatedAt: new Date(now - 60_000).toISOString() };
    stubPacks([decidedArchived], {}, {
      z: { decision: 'approved', by: 'alice', via: 'app', decidedAt: new Date(now - 30_000).toISOString() },
    });

    const digest = await buildDigest({ now });

    assert.equal(digest.archivedDecided.length, 1);
    assert.equal(digest.archivedDecided[0].contentId, 'z');
    // A decided pack is no longer "awaiting" one — the two lists are disjoint.
    assert.equal(digest.archived.length, 0);
  });

  it('excludes an archived pack from archivedDecided when no decision has been recorded', async () => {
    const now = Date.now();
    const undecided = { contentId: 'y', status: 'archived', posts: [], updatedAt: new Date(now - 60_000).toISOString() };
    stubPacks([undecided]);

    const digest = await buildDigest({ now });

    assert.equal(digest.archivedDecided.length, 0);
  });

  it('counts a decided-but-still-archived pack even outside the 24h digest window — same as archived itself', async () => {
    const now = Date.now();
    const old = {
      contentId: 'x', status: 'archived', posts: [],
      updatedAt: new Date(now - 10 * 24 * 60 * 60_000).toISOString(), // 10 days old
    };
    stubPacks([old], {}, {
      x: { decision: 'rejected', by: 'bob', via: 'telegram', decidedAt: new Date(now - 9 * 24 * 60 * 60_000).toISOString() },
    });

    const digest = await buildDigest({ now });

    assert.equal(digest.archivedDecided.length, 1);
  });

  it('reports holdSensitive false when SOCIAL_REVIEW_HOLD_SENSITIVE is unset', async () => {
    stubPacks([]);
    const digest = await buildDigest({ now: Date.now() });
    assert.equal(digest.holdSensitive, false);
  });

  it('reports holdSensitive true when SOCIAL_REVIEW_HOLD_SENSITIVE=on', async () => {
    process.env.SOCIAL_REVIEW_HOLD_SENSITIVE = 'on';
    stubPacks([]);
    const digest = await buildDigest({ now: Date.now() });
    assert.equal(digest.holdSensitive, true);
  });

  it('reports autoApproveMinutes from the current auto-approve window', async () => {
    const saved = process.env.SOCIAL_REVIEW_AUTO_MINUTES;
    process.env.SOCIAL_REVIEW_AUTO_MINUTES = '45';
    try {
      stubPacks([]);
      const digest = await buildDigest({ now: Date.now() });
      assert.equal(digest.autoApproveMinutes, 45);
    } finally {
      if (saved === undefined) delete process.env.SOCIAL_REVIEW_AUTO_MINUTES; else process.env.SOCIAL_REVIEW_AUTO_MINUTES = saved;
    }
  });
});

describe('buildDigest — cost', () => {
  const someCost = (totalUsd) => ({
    script: { usd: totalUsd * 0.4, estimated: false },
    voice: { usd: totalUsd * 0.2, estimated: true },
    images: { usd: totalUsd * 0.2, estimated: true },
    render: { usd: totalUsd * 0.2, estimated: true },
    totalUsd,
  });

  it('counts a pack whose renderedAt falls in the window as finished, summing its cost', async () => {
    const now = Date.now();
    const pack = {
      contentId: 'a', status: 'done', posts: [],
      updatedAt: new Date(now - 60_000).toISOString(),
      renderedAt: new Date(now - 30 * 60_000).toISOString(),
      cost: someCost(2),
    };
    stubPacks([pack]);

    const digest = await buildDigest({ now });

    assert.equal(digest.cost.stories, 1);
    assert.equal(digest.cost.totalUsd, 2);
    assert.equal(digest.cost.averageUsd, 2);
  });

  it('excludes a pack whose renderedAt is outside the 24h window', async () => {
    const now = Date.now();
    const pack = {
      contentId: 'a', status: 'done', posts: [],
      updatedAt: new Date(now - 60_000).toISOString(), // updatedAt keeps it in `recent`/listed
      renderedAt: new Date(now - 48 * 60 * 60_000).toISOString(), // but renderedAt is 2 days old
      cost: someCost(5),
    };
    stubPacks([pack]);

    const digest = await buildDigest({ now });

    assert.equal(digest.cost.stories, 0);
    assert.equal(digest.cost.totalUsd, 0);
  });

  it('reports spend on packs that failed or were dropped in the window as failedUsd, separate from the finished total', async () => {
    const now = Date.now();
    const failed = {
      contentId: 'f', status: 'failed', posts: [],
      updatedAt: new Date(now - 60_000).toISOString(),
      cost: someCost(0.5),
    };
    const dropped = {
      contentId: 'd', status: 'dropped', posts: [],
      updatedAt: new Date(now - 60_000).toISOString(),
      cost: someCost(0.25),
    };
    stubPacks([failed, dropped]);

    const digest = await buildDigest({ now });

    assert.equal(digest.cost.failedUsd, 0.75);
    assert.equal(digest.cost.failedStories, 2);
    assert.equal(digest.cost.totalUsd, 0); // nothing finished in the window
  });

  it('a story rendered then rejected in the window counts once, as wasted — never also as produced', async () => {
    const now = Date.now();
    const rejected = {
      contentId: 'r', status: 'dropped', posts: [],
      updatedAt: new Date(now - 60_000).toISOString(),
      renderedAt: new Date(now - 2 * 60 * 60_000).toISOString(), // rendered, then rejected at review
      cost: someCost(1),
    };
    const produced = {
      contentId: 'p', status: 'done', posts: [],
      updatedAt: new Date(now - 60_000).toISOString(),
      renderedAt: new Date(now - 60 * 60_000).toISOString(),
      cost: someCost(2),
    };
    stubPacks([rejected, produced]);

    const digest = await buildDigest({ now });

    assert.equal(digest.cost.stories, 1);
    assert.equal(digest.cost.totalUsd, 2);
    assert.equal(digest.cost.averageUsd, 2);
    assert.equal(digest.cost.failedUsd, 1);
  });

  it('a pack with no renderedAt is never counted as finished, even if it has a cost record', async () => {
    const now = Date.now();
    const pack = { contentId: 'a', status: 'scripted', posts: [], updatedAt: new Date(now - 60_000).toISOString(), cost: someCost(1) };
    stubPacks([pack]);

    const digest = await buildDigest({ now });

    assert.equal(digest.cost.stories, 0);
  });
});

describe('costLines', () => {
  it('returns [] when there is nothing to report at all', () => {
    assert.deepEqual(costLines(null), []);
    assert.deepEqual(costLines({ stories: 0, untracked: 0, failedUsd: 0 }), []);
  });

  it('reports story count, total, average and per-stage breakdown', () => {
    const cost = {
      stories: 2, untracked: 0, totalUsd: 4, averageUsd: 2,
      byStage: { script: 1, voice: 1, images: 1, render: 1 },
      failedUsd: 0, failedStories: 0,
    };
    const lines = costLines(cost).join('\n');
    assert.match(lines, /2 stories produced: \$4\\\.00 total, \*\$2\\\.00 each\*/);
    assert.match(lines, /script \$1\\\.00/);
    assert.match(lines, /voice \$1\\\.00/);
    assert.match(lines, /images \$1\\\.00/);
    assert.match(lines, /render \$1\\\.00/);
  });

  it('uses singular "story" for exactly one story', () => {
    const cost = { stories: 1, untracked: 0, totalUsd: 1, averageUsd: 1, byStage: { script: 1, voice: 0, images: 0, render: 0 }, failedUsd: 0, failedStories: 0 };
    const lines = costLines(cost).join('\n');
    assert.match(lines, /1 story produced/);
  });

  it('mentions untracked stories produced before cost tracking began', () => {
    const cost = { stories: 0, untracked: 3, totalUsd: 0, averageUsd: 0, byStage: {}, failedUsd: 0, failedStories: 0 };
    const lines = costLines(cost).join('\n');
    assert.match(lines, /3 produced before cost tracking began, not counted/);
  });

  it('reports wasted spend on failed/dropped stories, with correct singular/plural', () => {
    const one = { stories: 0, untracked: 0, totalUsd: 0, averageUsd: 0, byStage: {}, failedUsd: 0.5, failedStories: 1 };
    assert.match(costLines(one).join('\n'), /1 story that failed or were dropped/);
    const many = { stories: 0, untracked: 0, totalUsd: 0, averageUsd: 0, byStage: {}, failedUsd: 1, failedStories: 2 };
    assert.match(costLines(many).join('\n'), /2 stories that failed or were dropped/);
  });

  it('escapes the MarkdownV2 significant "." in the dollar amounts (a raw "$1.50" breaks parsing)', () => {
    const cost = { stories: 1, untracked: 0, totalUsd: 1.5, averageUsd: 1.5, byStage: { script: 1.5, voice: 0, images: 0, render: 0 }, failedUsd: 0, failedStories: 0 };
    const lines = costLines(cost).join('\n');
    assert.doesNotMatch(lines, /\$1\.50(?!\\)/); // no UNESCAPED "." after the dollar amount
    assert.match(lines, /\$1\\\.50/);
  });
});

describe('digestMessage — production cost block', () => {
  const base = { failedPosts: [], failedPacks: [], dropped: [], posted: [], scheduled: [], awaitingReview: [], awaitingUrl: 0 };

  it('appends the cost block at the end of the message', () => {
    const digest = {
      ...base,
      date: '2026-09-24',
      cost: {
        stories: 1, untracked: 0, totalUsd: 1, averageUsd: 1,
        byStage: { script: 1, voice: 0, images: 0, render: 0 },
        failedUsd: 0, failedStories: 0,
      },
    };
    const message = digestMessage(digest);
    assert.match(message, /Production cost/);
  });

  it('omits the cost block entirely when there is nothing to report', () => {
    const digest = { ...base, date: '2026-09-24', cost: { stories: 0, untracked: 0, totalUsd: 0, averageUsd: 0, byStage: {}, failedUsd: 0, failedStories: 0 } };
    const message = digestMessage(digest);
    assert.doesNotMatch(message, /Production cost/);
  });
});

describe('digestMessage', () => {
  const base = { failedPosts: [], failedPacks: [], dropped: [], posted: [], scheduled: [], awaitingReview: [], awaitingUrl: 0 };

  it('lists post-level failures before the posted section', () => {
    const digest = {
      ...base,
      date: '2026-09-23',
      posted: [{ format: 'tiktok', title: 'Good story', url: 'https://tiktok.com/@x/1' }],
      failedPosts: [{ format: 'reel', title: 'Bad story', error: 'upload timeout' }],
    };

    const message = digestMessage(digest);

    const failedIndex = message.indexOf('🔴');
    const successIndex = message.indexOf('✅');
    assert.ok(failedIndex >= 0, 'failure marker must be present');
    assert.ok(successIndex >= 0, 'success marker must be present');
    assert.ok(failedIndex < successIndex, 'failures must appear before successes');
  });

  it('lists failed-to-produce stories before the posted section too', () => {
    const digest = {
      ...base,
      date: '2026-09-23',
      posted: [{ format: 'tiktok', title: 'Good story', url: 'https://tiktok.com/@x/1' }],
      failedPacks: [{ contentId: 'c', title: 'Bad story', error: { message: 'LLM timeout' } }],
    };

    const message = digestMessage(digest);

    const failedIndex = message.indexOf('🔴');
    const successIndex = message.indexOf('✅');
    assert.ok(failedIndex >= 0 && successIndex >= 0);
    assert.ok(failedIndex < successIndex);
  });

  it('escapes MarkdownV2 special characters in the headline', () => {
    const digest = { ...base, date: '2026-09-23 (v1_test)' };

    const message = digestMessage(digest);

    // The raw, unescaped headline text must never appear — an unescaped special character
    // makes Telegram reject the whole message silently.
    assert.equal(message.includes('2026-09-23 (v1_test)'), false);
    assert.ok(message.includes('2026\\-09\\-23 \\(v1\\_test\\)'));
  });

  it('escapes MarkdownV2 special characters in post and pack titles too, not just the headline', () => {
    const digest = {
      ...base,
      date: '2026-09-23',
      posted: [{ format: 'tiktok', title: 'Deal (finalised!) - big.news', url: 'https://tiktok.com/@x/1' }],
      failedPacks: [{ contentId: 'c', title: 'Talks [stalled]', error: { message: 'LLM timeout' } }],
    };

    const message = digestMessage(digest);

    assert.equal(message.includes('Deal (finalised!) - big.news'), false);
    assert.ok(message.includes('Deal \\(finalised\\!\\) \\- big\\.news'));
    assert.equal(message.includes('Talks [stalled]'), false);
    assert.ok(message.includes('Talks \\[stalled\\]'));
  });

  it('awaiting-review wording, hold ON: routine auto-approve after N minutes, with no mention of sensitive stories when none are awaiting', () => {
    const digest = {
      ...base, date: '2026-09-23', autoApproveMinutes: 60, holdSensitive: true,
      awaitingReview: [{ contentId: 'a', social: { sensitive: false } }],
    };

    const message = digestMessage(digest);

    assert.ok(message.includes('they auto\\-approve after 60 min'));
    assert.equal(message.includes('sensitive never do'), false);
  });

  it('awaiting-review wording, hold OFF: sensitive packs awaiting are not singled out — they auto-approve too', () => {
    const digest = {
      ...base, date: '2026-09-23', autoApproveMinutes: 60, holdSensitive: false,
      awaitingReview: [
        { contentId: 'a', social: { sensitive: false } },
        { contentId: 'b', social: { sensitive: true } },
      ],
    };

    const message = digestMessage(digest);

    assert.ok(message.includes('2 waiting on your review'));
    assert.ok(message.includes('they auto\\-approve after 60 min'));
    assert.equal(message.includes('sensitive never do'), false);
    assert.equal(message.includes('routine stories'), false);
  });

  it('awaiting-review wording, holdSensitive missing entirely: treated as off', () => {
    const digest = {
      ...base, date: '2026-09-23', autoApproveMinutes: 60,
      awaitingReview: [{ contentId: 'b', social: { sensitive: true } }],
    };

    const message = digestMessage(digest);

    assert.ok(message.includes('they auto\\-approve after 60 min'));
    assert.equal(message.includes('sensitive never do'), false);
  });

  it('awaiting-review wording, hold ON but timer 0: still "nothing goes out until you decide"', () => {
    const digest = {
      ...base, date: '2026-09-23', autoApproveMinutes: 0, holdSensitive: true,
      awaitingReview: [{ contentId: 'b', social: { sensitive: true } }],
    };

    const message = digestMessage(digest);

    assert.ok(message.includes('nothing goes out until you decide'));
    assert.equal(message.includes('sensitive never do'), false);
  });

  it('awaiting-review wording, hold OFF and timer 0: "nothing goes out until you decide"', () => {
    const digest = {
      ...base, date: '2026-09-23', autoApproveMinutes: 0, holdSensitive: false,
      awaitingReview: [{ contentId: 'b', social: { sensitive: true } }],
    };

    assert.ok(digestMessage(digest).includes('nothing goes out until you decide'));
  });

  it('awaiting-review wording, hold ON: names the sensitive count when some awaiting packs are flagged sensitive', () => {
    const digest = {
      ...base, date: '2026-09-23', autoApproveMinutes: 60, holdSensitive: true,
      awaitingReview: [
        { contentId: 'a', social: { sensitive: false } },
        { contentId: 'b', social: { sensitive: true } },
        { contentId: 'c', social: { sensitive: true } },
      ],
    };

    const message = digestMessage(digest);

    assert.ok(message.includes('routine stories auto\\-approve after 60 min; 2 sensitive never do'));
  });

  it('awaiting-review wording: "nothing goes out until you decide" when the auto-approve timer is 0', () => {
    const digest = {
      ...base, date: '2026-09-23', autoApproveMinutes: 0,
      awaitingReview: [{ contentId: 'a', social: {} }],
    };

    const message = digestMessage(digest);

    assert.ok(message.includes('nothing goes out until you decide'));
    assert.equal(message.includes('auto\\-approve'), false);
  });

  it('omits the awaiting-review line entirely when nothing is awaiting review', () => {
    const digest = { ...base, date: '2026-09-23', autoApproveMinutes: 60, awaitingReview: [] };

    const message = digestMessage(digest);

    assert.equal(message.includes('waiting on your review'), false);
  });

  it('shows the archived line, with the count, when there are archived packs awaiting a decision', () => {
    const digest = { ...base, date: '2026-09-23', archived: [{ contentId: 'a' }, { contentId: 'b' }] };

    const message = digestMessage(digest);

    assert.match(message, /📦 2 archived without a decision — still approvable from Telegram or the app/);
  });

  it('omits the archived line entirely when nothing is archived', () => {
    const digest = { ...base, date: '2026-09-23', archived: [] };

    const message = digestMessage(digest);

    assert.equal(message.includes('archived without a decision'), false);
  });

  it('omits the archived line when the digest carries no archived field at all', () => {
    const digest = { ...base, date: '2026-09-23' };

    const message = digestMessage(digest);

    assert.equal(message.includes('archived without a decision'), false);
  });

  // A decision that never took effect is inserted at the TOP (right after the title), not
  // appended with the other problem sections — it is a decision sitting unactioned, which is
  // more urgent than anything below it.
  it('puts the archivedDecided line right after the title line, with a blank line between', () => {
    const digest = { ...base, date: '2026-09-23', archivedDecided: [{ contentId: 'a' }] };

    const message = digestMessage(digest);
    const lines = message.split('\n');

    assert.equal(lines[0], '*Merlows social — 2026\\-09\\-23*');
    assert.equal(lines[1], '');
    assert.match(lines[2], /^🟠 \*1 archived story has a decision that was never acted on\* — re\\-queued now; the next autopilot run acts on it$/);
  });

  it('keeps the archivedDecided line right after the title even when other problem sections are also present', () => {
    const digest = {
      ...base,
      date: '2026-09-23',
      failedPosts: [{ format: 'reel', title: 'Bad story', error: 'upload timeout' }],
      failedPacks: [{ contentId: 'c', title: 'Broken story', error: { message: 'LLM timeout' } }],
      archivedDecided: [{ contentId: 'a' }],
    };

    const message = digestMessage(digest);
    const lines = message.split('\n');

    assert.equal(lines[0], '*Merlows social — 2026\\-09\\-23*');
    assert.equal(lines[1], '');
    assert.match(lines[2], /^🟠/);
  });

  it('pluralises the archivedDecided line for more than one', () => {
    const digest = { ...base, date: '2026-09-23', archivedDecided: [{ contentId: 'a' }, { contentId: 'b' }] };

    const message = digestMessage(digest);

    assert.match(message, /🟠 \*2 archived stories have a decision that was never acted on\* — re\\-queued now/);
  });

  it('omits the archivedDecided line entirely when there are none', () => {
    const digest = { ...base, date: '2026-09-23', archivedDecided: [] };

    const message = digestMessage(digest);

    assert.equal(message.includes('never acted on'), false);
  });

  it('omits the archivedDecided line when the digest carries no archivedDecided field at all', () => {
    const digest = { ...base, date: '2026-09-23' };

    const message = digestMessage(digest);

    assert.equal(message.includes('never acted on'), false);
  });
});

// The digest cron is the backstop for a decided-but-still-archived pack: nothing else ever looks
// at an archived pack, so a decision whose re-queue was lost would otherwise never take effect.
describe('digest handler — re-queues archived packs that have a decision', () => {
  let savedZadd, savedToken, savedChat;
  beforeEach(() => {
    savedZadd = kv.zadd;
    savedToken = process.env.TELEGRAM_BOT_TOKEN;
    savedChat = process.env.TELEGRAM_CHAT_ID;
    // Unconfigured Telegram: the handler answers 503 after the re-queue, with no network call.
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });
  afterEach(() => {
    kv.zadd = savedZadd;
    if (savedToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = savedToken;
    if (savedChat === undefined) delete process.env.TELEGRAM_CHAT_ID; else process.env.TELEGRAM_CHAT_ID = savedChat;
  });

  function mkRes() {
    const r = { statusCode: null, body: null };
    r.status = (c) => { r.statusCode = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    return r;
  }

  it('puts a decided archived pack back in the queue, and leaves an undecided one alone', async () => {
    const old = new Date(Date.now() - 5 * 24 * 60 * 60_000).toISOString();
    stubPacks(
      [
        { contentId: 'decided', status: 'archived', updatedAt: old },
        { contentId: 'waiting', status: 'archived', updatedAt: old },
      ],
      {},
      { decided: { decision: 'approved', by: 'alice' } },
    );
    const zadds = [];
    kv.zadd = async (key, entry) => { zadds.push({ key, entry }); };

    const res = mkRes();
    await digestHandler({ method: 'GET' }, res);

    assert.equal(res.statusCode, 503); // Telegram unconfigured — the re-queue still happened first
    assert.deepEqual(zadds.map((z) => [z.key, z.entry.member]), [[QUEUE_KEY, 'decided']]);
  });

  it('a failing re-queue is logged, not thrown — the digest still goes out', async () => {
    stubPacks([{ contentId: 'decided', status: 'archived' }], {}, { decided: { decision: 'rejected', by: 'bob' } });
    kv.zadd = async () => { throw new Error('kv down'); };

    const res = mkRes();
    await digestHandler({ method: 'GET' }, res);
    assert.equal(res.statusCode, 503);
  });
});
