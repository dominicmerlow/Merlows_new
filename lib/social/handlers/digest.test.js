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
import { buildDigest, digestMessage } from './digest.js';

let saved;
beforeEach(() => {
  saved = { get: kv.get, lrange: kv.lrange, mget: kv.mget };
});
afterEach(() => {
  kv.get = saved.get; kv.lrange = saved.lrange; kv.mget = saved.mget;
});

/** Wires listPacks' two calls (lrange the index, mget the records) plus the slots-grid read. */
function stubPacks(packs, slots = {}) {
  const map = new Map(packs.map((p) => [PACK_KEY(p.contentId), p]));
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
});
