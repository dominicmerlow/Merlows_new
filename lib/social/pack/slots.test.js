// lib/social/pack/slots.js — the posting grid and which story fills each slot.
// Pure module: no kv, no network, no clock of its own — every test drives it directly with
// explicit `now`/`dateISO` values so nothing here depends on the wall clock. The BST cases in
// `slotInstant` are pinned against UTC instants independently derived from Europe/London's
// actual 2026 DST transition dates (confirmed via Intl against the real transition boundary,
// not by calling the function under test), not against the module's own output.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GRID, RAMP, POOL_MS, FORMAT_ASSET,
  capsFor, rankPacks, slotInstant, planDay,
} from './slots.js';

const FAR_FUTURE_NOW = Date.parse('2099-06-15T00:00:00.000Z');
const FAR_FUTURE_DATE = '2099-06-16'; // a day whose whole grid is still in the future

describe('FORMAT_ASSET', () => {
  it("reads each format's own render path", () => {
    const pack = {
      renders: {
        videos: { tiktok: { url: 't.mp4' }, reel: { url: 'r.mp4' } },
        stills: { cover: 'c.jpg', story: 's.jpg' },
      },
    };
    assert.equal(FORMAT_ASSET.tiktok(pack), 't.mp4');
    assert.equal(FORMAT_ASSET.reel(pack), 'r.mp4');
    assert.equal(FORMAT_ASSET.carousel(pack), 'c.jpg');
    assert.equal(FORMAT_ASSET.story(pack), 's.jpg');
  });

  it('is safely undefined for a pack with no renders at all, rather than throwing', () => {
    assert.equal(FORMAT_ASSET.tiktok({}), undefined);
    assert.equal(FORMAT_ASSET.tiktok(undefined), undefined);
  });
});

describe('RAMP — the launch ramp data itself', () => {
  it('week 1 caps TikTok at 2/day, not the full 6 — this is the flag-risk rung', () => {
    assert.equal(RAMP[0].week, 1);
    assert.equal(RAMP[0].tiktok, 2);
  });

  it('week 3 reaches the full TikTok grid (6/day)', () => {
    assert.equal(RAMP[RAMP.length - 1].tiktok, GRID.tiktok.perDay);
  });
});

describe('capsFor', () => {
  it('week 1 (0 weeks live) caps TikTok at 2/day', () => {
    assert.deepEqual(capsFor(0), { tiktok: 2, reel: 3, carousel: 2, story: 2 });
  });

  it('rounds a fractional week down to the current stage — 0.9 weeks is still week 1', () => {
    assert.deepEqual(capsFor(0.9), { tiktok: 2, reel: 3, carousel: 2, story: 2 });
  });

  it('week 2 (1 whole week live) doubles TikTok to 4', () => {
    assert.deepEqual(capsFor(1), { tiktok: 4, reel: 3, carousel: 2, story: 4 });
  });

  it('week 3 (2 whole weeks live) is the full grid', () => {
    assert.deepEqual(capsFor(2), { tiktok: 6, reel: 3, carousel: 2, story: 6 });
  });

  it('clamps to the full grid past the end of the ramp table, rather than throwing', () => {
    assert.deepEqual(capsFor(52), { tiktok: 6, reel: 3, carousel: 2, story: 6 });
  });

  it('clamps a negative weeksLive to week 1, the most cautious rung — never a negative index', () => {
    assert.deepEqual(capsFor(-3), { tiktok: 2, reel: 3, carousel: 2, story: 2 });
  });
});

describe('rankPacks', () => {
  it('ranks a higher-weight category above a lower one at equal recency', () => {
    const now = Date.now();
    const renderedAt = new Date(now).toISOString();
    const packs = [
      { contentId: 'low', categoryId: 'op-eds', renderedAt }, // weight 0.5
      { contentId: 'high', categoryId: 'breaking-news', renderedAt }, // weight 1.0
    ];
    assert.deepEqual(rankPacks(packs, { now }).map((p) => p.contentId), ['high', 'low']);
  });

  it('ranks a fresher story above an older one in the same category', () => {
    const now = Date.now();
    const packs = [
      { contentId: 'old', categoryId: 'breaking-news', renderedAt: new Date(now - 20 * 60 * 60_000).toISOString() },
      { contentId: 'new', categoryId: 'breaking-news', renderedAt: new Date(now - 1 * 60 * 60_000).toISOString() },
    ];
    assert.deepEqual(rankPacks(packs, { now }).map((p) => p.contentId), ['new', 'old']);
  });

  it('drops a story older than the pool window entirely', () => {
    const now = Date.now();
    const packs = [
      { contentId: 'fresh', categoryId: 'breaking-news', renderedAt: new Date(now - 1000).toISOString() },
      { contentId: 'stale', categoryId: 'breaking-news', renderedAt: new Date(now - POOL_MS - 1000).toISOString() },
    ];
    assert.deepEqual(rankPacks(packs, { now }).map((p) => p.contentId), ['fresh']);
  });

  it('keeps a story exactly at the pool-window boundary (<=, not <)', () => {
    const now = Date.now();
    const packs = [{ contentId: 'boundary', categoryId: 'breaking-news', renderedAt: new Date(now - POOL_MS).toISOString() }];
    assert.deepEqual(rankPacks(packs, { now }).map((p) => p.contentId), ['boundary']);
  });

  it('falls back to createdAt when renderedAt is absent', () => {
    const now = Date.now();
    const packs = [{ contentId: 'c1', categoryId: 'breaking-news', createdAt: new Date(now - 1000).toISOString() }];
    assert.deepEqual(rankPacks(packs, { now }).map((p) => p.contentId), ['c1']);
  });

  it('treats an unknown category id as weight 0.5, the same as op-eds', () => {
    const now = Date.now();
    const renderedAt = new Date(now).toISOString();
    const known = { contentId: 'known', categoryId: 'op-eds', renderedAt };
    const unknown = { contentId: 'unknown', categoryId: 'some-future-category', renderedAt };
    const ranked = rankPacks([unknown, known], { now });
    // Equal score at equal age -> stable on ageMs tie-break, which is equal too; either order is
    // fine, but neither should have been dropped by the POOL_MS filter.
    assert.deepEqual(new Set(ranked.map((p) => p.contentId)), new Set(['known', 'unknown']));
  });

  it('treats an unparseable date as maximally old (age = POOL_MS, score floored at 0) rather than throwing', () => {
    const now = Date.now();
    const packs = [{ contentId: 'bad-date', categoryId: 'breaking-news', renderedAt: 'not-a-real-date' }];
    const ranked = rankPacks(packs, { now });
    assert.deepEqual(ranked.map((p) => p.contentId), ['bad-date']); // kept, right at the boundary
  });

  it('returns [] for an empty pool without throwing', () => {
    assert.deepEqual(rankPacks([], { now: Date.now() }), []);
  });
});

describe('slotInstant — pinned across the 2026 British Summer Time changeovers', () => {
  // Each expected UTC instant was independently confirmed (via Intl.DateTimeFormat against the
  // real Europe/London transition, not via slotInstant itself) to be exactly 08:00 local time
  // on the given date: 2026's clocks go forward at 01:00 UTC on 29 March and back at 01:00 UTC
  // on 25 October.
  const cases = [
    ['2026-03-28', '2026-03-28T08:00:00.000Z', 'GMT, the day before the spring changeover'],
    ['2026-03-29', '2026-03-29T07:00:00.000Z', 'the spring changeover day itself (clocks go forward)'],
    ['2026-03-30', '2026-03-30T07:00:00.000Z', 'BST, the day after clocks go forward'],
    ['2026-10-24', '2026-10-24T07:00:00.000Z', 'BST, the day before the autumn changeover'],
    ['2026-10-25', '2026-10-25T08:00:00.000Z', 'the autumn changeover day itself (clocks go back)'],
    ['2026-10-26', '2026-10-26T08:00:00.000Z', 'GMT, the day after clocks go back'],
  ];
  for (const [dateISO, expected, label] of cases) {
    it(`08:00 London time on ${dateISO} is ${expected} — ${label}`, () => {
      assert.equal(slotInstant(dateISO, '08:00'), expected);
    });
  }

  it('defaults to Europe/London when no zone is given', () => {
    assert.equal(slotInstant('2026-06-15', '12:00'), slotInstant('2026-06-15', '12:00', 'Europe/London'));
  });

  it('honours a different zone (UTC has no offset to correct for)', () => {
    assert.equal(slotInstant('2026-06-15', '12:00', 'UTC'), '2026-06-15T12:00:00.000Z');
  });
});

describe('planDay — the launch ramp must never leak past its week', () => {
  it('never exceeds the week-1 TikTok cap of 2, even with 6 different stories ready to post', () => {
    const renderedAt = new Date(FAR_FUTURE_NOW).toISOString();
    const packs = Array.from({ length: 6 }, (_, i) => ({
      contentId: `p${i}`,
      categoryId: 'breaking-news',
      renderedAt,
      renders: { videos: { tiktok: { url: `https://cdn.example/${i}.mp4` } } },
    }));
    const plan = planDay(packs, { dateISO: FAR_FUTURE_DATE, now: FAR_FUTURE_NOW, weeksLive: 0 });
    const tiktokSlots = plan.filter((s) => s.format === 'tiktok');
    assert.equal(tiktokSlots.length, 2); // GRID.tiktok.perDay is 6 — must not leak through
    assert.deepEqual(tiktokSlots.map((s) => s.time).sort(), ['08:00', '11:00']);
  });

  it('week 2 caps TikTok at 4, not the full 6', () => {
    const renderedAt = new Date(FAR_FUTURE_NOW).toISOString();
    const packs = Array.from({ length: 6 }, (_, i) => ({
      contentId: `p${i}`,
      categoryId: 'breaking-news',
      renderedAt,
      renders: { videos: { tiktok: { url: `https://cdn.example/${i}.mp4` } } },
    }));
    const plan = planDay(packs, { dateISO: FAR_FUTURE_DATE, now: FAR_FUTURE_NOW, weeksLive: 1 });
    assert.equal(plan.filter((s) => s.format === 'tiktok').length, 4);
  });
});

describe('planDay — a missing asset leaves the slot empty', () => {
  it('leaves every TikTok slot empty when the only candidate has no TikTok video', () => {
    const renderedAt = new Date(FAR_FUTURE_NOW).toISOString();
    const pack = {
      contentId: 'p1', categoryId: 'breaking-news', renderedAt,
      renders: { stills: { cover: 'https://cdn.example/cover.jpg' } }, // no tiktok video
    };
    const plan = planDay([pack], { dateISO: FAR_FUTURE_DATE, now: FAR_FUTURE_NOW, weeksLive: 2 });
    assert.equal(plan.some((s) => s.format === 'tiktok'), false);
    // The format it DOES have an asset for is still filled normally.
    assert.equal(plan.some((s) => s.format === 'carousel' && s.contentId === 'p1'), true);
  });

  it('fills the slot from a lower-ranked candidate that does have the asset, rather than leaving it empty when one exists', () => {
    const renderedAt = new Date(FAR_FUTURE_NOW).toISOString();
    const missingAsset = { contentId: 'no-asset', categoryId: 'breaking-news', renderedAt, renders: {} };
    const hasAsset = {
      contentId: 'has-asset', categoryId: 'op-eds', renderedAt, // lower weight, ranked second
      renders: { videos: { tiktok: { url: 'https://cdn.example/t.mp4' } } },
    };
    const plan = planDay([missingAsset, hasAsset], { dateISO: FAR_FUTURE_DATE, now: FAR_FUTURE_NOW, weeksLive: 2 });
    const tiktokSlots = plan.filter((s) => s.format === 'tiktok');
    assert.equal(tiktokSlots.length, 1);
    assert.equal(tiktokSlots[0].contentId, 'has-asset');
    assert.equal(tiktokSlots[0].url, 'https://cdn.example/t.mp4'); // its OWN asset, never substituted
  });

  it("never puts one story's asset under a different story's contentId", () => {
    const renderedAt = new Date(FAR_FUTURE_NOW).toISOString();
    const packA = { contentId: 'a', categoryId: 'breaking-news', renderedAt, renders: { stills: { cover: 'https://cdn.example/a-cover.jpg' } } };
    const packB = { contentId: 'b', categoryId: 'op-eds', renderedAt, renders: { stills: { cover: 'https://cdn.example/b-cover.jpg' } } };
    const plan = planDay([packA, packB], { dateISO: FAR_FUTURE_DATE, now: FAR_FUTURE_NOW, weeksLive: 3 });
    for (const slot of plan.filter((s) => s.format === 'carousel')) {
      const expectedUrl = slot.contentId === 'a' ? 'https://cdn.example/a-cover.jpg' : 'https://cdn.example/b-cover.jpg';
      assert.equal(slot.url, expectedUrl);
    }
  });
});

describe('planDay — a story never fills the same format twice in a day', () => {
  it('gives the single available story only one TikTok slot, even though week-2 caps allow 4', () => {
    const renderedAt = new Date(FAR_FUTURE_NOW).toISOString();
    const pack = {
      contentId: 'p1', categoryId: 'breaking-news', renderedAt,
      renders: { videos: { tiktok: { url: 'https://cdn.example/t.mp4' } } },
    };
    const plan = planDay([pack], { dateISO: FAR_FUTURE_DATE, now: FAR_FUTURE_NOW, weeksLive: 1 }); // tiktok cap 4
    assert.equal(plan.filter((s) => s.format === 'tiktok').length, 1);
  });
});

describe('planDay — slots already in the past are skipped', () => {
  it('produces an empty plan for a date whose whole grid is already in the past', () => {
    const now = Date.parse('2027-01-01T00:00:00.000Z');
    const pack = {
      contentId: 'p1', categoryId: 'breaking-news', renderedAt: new Date(now).toISOString(),
      renders: { videos: { tiktok: { url: 'x' }, reel: { url: 'x' } }, stills: { cover: 'x', story: 'x' } },
    };
    const plan = planDay([pack], { dateISO: '2026-01-01', now });
    assert.deepEqual(plan, []);
  });

  it('skips only the slots whose time has already passed, leaving later ones available', () => {
    const dateISO = '2026-06-15';
    const cutoff = Date.parse(slotInstant(dateISO, '09:00', 'Europe/London')) + 1000; // just after the 09:00 carousel slot
    const pack = {
      contentId: 'p1', categoryId: 'breaking-news', renderedAt: new Date(cutoff).toISOString(),
      renders: { stills: { cover: 'https://cdn.example/cover.jpg' } },
    };
    const plan = planDay([pack], { dateISO, now: cutoff, weeksLive: 3 });
    assert.deepEqual(plan.filter((s) => s.format === 'carousel').map((s) => s.time), ['17:00']);
  });
});

describe('planDay — the `used` map keeps an already-planned slot from being planned again', () => {
  it('skips a slot already recorded as used by another tick, even with a valid candidate available', () => {
    const renderedAt = new Date(FAR_FUTURE_NOW).toISOString();
    const pack = { contentId: 'p1', categoryId: 'breaking-news', renderedAt, renders: { stills: { cover: 'https://cdn.example/cover.jpg' } } };
    const used = { 'carousel@09:00': 'someone-else' };
    const plan = planDay([pack], { dateISO: FAR_FUTURE_DATE, now: FAR_FUTURE_NOW, weeksLive: 3, used });
    assert.deepEqual(plan.filter((s) => s.format === 'carousel').map((s) => s.time), ['17:00']);
  });
});

describe('planDay — ignorePool: a story asking for its OWN slot is not competing in the ranked pool', () => {
  it('without ignorePool (the default), a story older than the 24h pool window is dropped from the plan', () => {
    const staleRenderedAt = new Date(FAR_FUTURE_NOW - 30 * 60 * 60_000).toISOString(); // 30h old
    const pack = {
      contentId: 'p1', categoryId: 'breaking-news', renderedAt: staleRenderedAt,
      renders: { videos: { tiktok: { url: 'https://cdn.example/t.mp4' } } },
    };
    const plan = planDay([pack], { dateISO: FAR_FUTURE_DATE, now: FAR_FUTURE_NOW, weeksLive: 3 });
    assert.deepEqual(plan, []);
  });

  it('with ignorePool: true, the same story past the 24h pool window can still fill a slot', () => {
    const staleRenderedAt = new Date(FAR_FUTURE_NOW - 30 * 60 * 60_000).toISOString(); // 30h old
    const pack = {
      contentId: 'p1', categoryId: 'breaking-news', renderedAt: staleRenderedAt,
      renders: { videos: { tiktok: { url: 'https://cdn.example/t.mp4' } } },
    };
    const plan = planDay([pack], { dateISO: FAR_FUTURE_DATE, now: FAR_FUTURE_NOW, weeksLive: 3, ignorePool: true });
    assert.ok(plan.some((s) => s.format === 'tiktok' && s.contentId === 'p1'));
  });

  it('with ignorePool: true, a fresh story still fills slots exactly as before — the flag only stops the age filter, not everything else', () => {
    const renderedAt = new Date(FAR_FUTURE_NOW).toISOString();
    const pack = {
      contentId: 'p1', categoryId: 'breaking-news', renderedAt,
      renders: { videos: { tiktok: { url: 'https://cdn.example/t.mp4' } } },
    };
    const withPool = planDay([pack], { dateISO: FAR_FUTURE_DATE, now: FAR_FUTURE_NOW, weeksLive: 0 });
    const withoutPool = planDay([pack], { dateISO: FAR_FUTURE_DATE, now: FAR_FUTURE_NOW, weeksLive: 0, ignorePool: true });
    assert.deepEqual(withPool, withoutPool);
  });
});

describe('planDay — output shape and ordering', () => {
  it('sorts the whole day across formats by time, not grouped by format', () => {
    const renderedAt = new Date(FAR_FUTURE_NOW).toISOString();
    const pack = {
      contentId: 'p1', categoryId: 'breaking-news', renderedAt,
      renders: {
        videos: { tiktok: { url: 't.mp4' }, reel: { url: 'r.mp4' } },
        stills: { cover: 'c.jpg', story: 's.jpg' },
      },
    };
    const plan = planDay([pack], { dateISO: FAR_FUTURE_DATE, now: FAR_FUTURE_NOW, weeksLive: 0 });
    const times = plan.map((s) => Date.parse(s.at));
    const sorted = [...times].sort((a, b) => a - b);
    assert.deepEqual(times, sorted);
  });

  it('returns [] for an empty pack list without throwing', () => {
    assert.deepEqual(planDay([], { dateISO: FAR_FUTURE_DATE, now: FAR_FUTURE_NOW }), []);
  });

  it('each entry carries format, time, at, contentId and url', () => {
    const renderedAt = new Date(FAR_FUTURE_NOW).toISOString();
    const pack = { contentId: 'p1', categoryId: 'breaking-news', renderedAt, renders: { stills: { cover: 'https://cdn.example/c.jpg' } } };
    const plan = planDay([pack], { dateISO: FAR_FUTURE_DATE, now: FAR_FUTURE_NOW, weeksLive: 3 });
    assert.ok(plan.length > 0);
    for (const slot of plan) {
      assert.equal(typeof slot.format, 'string');
      assert.equal(typeof slot.time, 'string');
      assert.equal(typeof slot.at, 'string');
      assert.equal(slot.contentId, 'p1');
      assert.equal(typeof slot.url, 'string');
    }
  });
});

// ── the day's ceiling counts post-now bookings, not just grid slots ──────────
// A "post now" approval books its formats in the same day record under a time of `now-<n>`,
// which belongs to no grid time. Counting only `used[format@time]` could never see that, so a
// day could take a FULL grid on top of a manual batch — which is how 24 posts went out on 24
// September and 23 on the 27th, against a week-1 ceiling of 9.
describe('planDay — post-now bookings consume the format cap', () => {
  const packWith = (contentId) => ({
    contentId,
    categoryId: 'breaking-news',
    renderedAt: '2026-06-15T06:00:00.000Z',
    renders: {
      videos: { tiktok: { url: 'https://cdn.example/t.mp4' }, reel: { url: 'https://cdn.example/r.mp4' } },
      stills: { cover: 'https://cdn.example/c.jpg', story: 'https://cdn.example/s.jpg' },
    },
  });
  const dateISO = '2026-06-16';
  const now = Date.parse('2026-06-15T23:00:00.000Z'); // before every slot on the 16th

  it('gives no carousel slot when post-now already used both of the day\u2019s two', () => {
    const used = { 'carousel@now-0': 'other-1', 'carousel@now-1': 'other-2' };
    const plan = planDay([packWith('p1')], { dateISO, now, weeksLive: 0, used, ignorePool: true });
    assert.equal(plan.filter((s) => s.format === 'carousel').length, 0);
  });

  it('gives exactly the remainder when post-now used some of the cap', () => {
    // Week 1 cap for story is 2; one is already spent by a post-now booking.
    const used = { 'story@now-0': 'other-1' };
    const plan = planDay([packWith('p1')], { dateISO, now, weeksLive: 0, used, ignorePool: true });
    assert.equal(plan.filter((s) => s.format === 'story').length, 1);
  });

  it('is unchanged when the record holds no post-now bookings', () => {
    const plan = planDay([packWith('p1')], { dateISO, now, weeksLive: 0, used: {}, ignorePool: true });
    const caps = capsFor(0);
    // One of each format per story per day, so a single pack can take at most one per format.
    for (const format of ['tiktok', 'reel', 'carousel', 'story']) {
      assert.equal(plan.filter((s) => s.format === format).length, Math.min(1, caps[format]));
    }
  });

  it('still counts a real grid slot the same way it always did', () => {
    const used = { 'carousel@09:00': 'other-1', 'carousel@17:00': 'other-2' };
    const plan = planDay([packWith('p1')], { dateISO, now, weeksLive: 0, used, ignorePool: true });
    assert.equal(plan.filter((s) => s.format === 'carousel').length, 0);
  });
});
