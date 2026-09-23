// lib/social/pack/schedule.js — claims slots in today's grid and hands the resulting posts to
// Zernio.
//
// claimSlots/schedulePost/cachedCreatorInfo all take `store`/`fetchFn` as injected options, so
// none of these tests touch the shared `kv` singleton or the real Zernio API — ZERNIO_API_KEY is
// a real, live key in this environment (see zernio.test.js), so every network-capable call here
// is driven through an explicit fetchFn, never the default global fetch.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  SLOTS_KEY, FORMAT_PLATFORM, gridDate, weeksLive, cachedCreatorInfo, claimSlots, schedulePost,
} from './schedule.js';
import { requestIdFor } from '../platforms/zernio.js';

// Mirrors schedule.js's own private CREATOR_INFO_TTL_MS (not exported).
const CREATOR_INFO_TTL_MS = 24 * 60 * 60_000;
const throwFetch = async () => { throw new Error('fetch should not have been called'); };

let savedZernioKey;
beforeEach(() => { savedZernioKey = process.env.ZERNIO_API_KEY; process.env.ZERNIO_API_KEY = 'test-zernio-key'; });
afterEach(() => { if (savedZernioKey === undefined) delete process.env.ZERNIO_API_KEY; else process.env.ZERNIO_API_KEY = savedZernioKey; });

describe('FORMAT_PLATFORM', () => {
  it('routes tiktok to the tiktok account and every other format to instagram', () => {
    assert.deepEqual(FORMAT_PLATFORM, { tiktok: 'tiktok', reel: 'instagram', carousel: 'instagram', story: 'instagram' });
  });
});

describe('gridDate — the grid is keyed on its own timezone, not the server clock', () => {
  it("is already tomorrow's date in London during BST, for a late-evening UTC instant", () => {
    // 2026-06-14T23:30:00Z is 2026-06-15T00:30 local in Europe/London (BST, UTC+1).
    const now = Date.parse('2026-06-14T23:30:00.000Z');
    assert.equal(gridDate(now), '2026-06-15');
  });

  it('matches the raw UTC calendar date when given zone UTC explicitly', () => {
    const now = Date.parse('2026-06-14T23:30:00.000Z');
    assert.equal(gridDate(now, 'UTC'), '2026-06-14');
  });

  it('defaults to Europe/London', () => {
    const now = Date.parse('2026-06-14T23:30:00.000Z');
    assert.equal(gridDate(now), gridDate(now, 'Europe/London'));
  });

  it('during GMT (winter), a late-evening UTC instant is still the same London date', () => {
    const now = Date.parse('2026-01-14T23:30:00.000Z');
    assert.equal(gridDate(now), '2026-01-14');
  });
});

describe('weeksLive', () => {
  let saved;
  beforeEach(() => { saved = process.env.SOCIAL_LAUNCH_DATE; });
  afterEach(() => { if (saved === undefined) delete process.env.SOCIAL_LAUNCH_DATE; else process.env.SOCIAL_LAUNCH_DATE = saved; });

  it('is week 1 (0) when SOCIAL_LAUNCH_DATE is unset — the most cautious rung', () => {
    delete process.env.SOCIAL_LAUNCH_DATE;
    assert.equal(weeksLive(Date.now()), 0);
  });

  it('is week 1 (0) when SOCIAL_LAUNCH_DATE is not a parseable date', () => {
    process.env.SOCIAL_LAUNCH_DATE = 'not-a-date';
    assert.equal(weeksLive(Date.now()), 0);
  });

  it('is exactly 1 whole week live at the 7-day boundary', () => {
    process.env.SOCIAL_LAUNCH_DATE = '2026-01-01T00:00:00.000Z';
    assert.equal(weeksLive(Date.parse('2026-01-08T00:00:00.000Z')), 1);
  });

  it('is still week 0 one millisecond before the 7-day boundary', () => {
    process.env.SOCIAL_LAUNCH_DATE = '2026-01-01T00:00:00.000Z';
    assert.equal(weeksLive(Date.parse('2026-01-08T00:00:00.000Z') - 1), 0);
  });

  it('counts multiple whole weeks', () => {
    process.env.SOCIAL_LAUNCH_DATE = '2026-01-01T00:00:00.000Z';
    assert.equal(weeksLive(Date.parse('2026-01-22T00:00:00.000Z')), 3);
  });
});

describe('cachedCreatorInfo', () => {
  it('returns the cached info without ever calling Zernio when the cache is fresh', async () => {
    const now = Date.now();
    const store = {
      get: async () => ({ at: now - 1000, info: { privacyLevels: ['PUBLIC_TO_EVERYONE'] } }),
      set: async () => { throw new Error('should not write on a cache hit'); },
    };
    const info = await cachedCreatorInfo('acct1', { store, now, fetchFn: throwFetch });
    assert.deepEqual(info, { privacyLevels: ['PUBLIC_TO_EVERYONE'] });
  });

  it('re-fetches once the cached entry is exactly at its TTL boundary (< comparison, not <=)', async () => {
    const now = Date.now();
    const store = { get: async () => ({ at: now - CREATOR_INFO_TTL_MS, info: { privacyLevels: ['SELF_ONLY'] } }), set: async () => {} };
    const fetchFn = async () => ({ ok: true, json: async () => ({ privacyLevels: ['PUBLIC_TO_EVERYONE'] }) });
    const info = await cachedCreatorInfo('acct1', { store, now, fetchFn });
    assert.deepEqual(info.privacyLevels, ['PUBLIC_TO_EVERYONE']); // proves the network path was taken, not the stale cache
  });

  it('is still cached one millisecond under the TTL', async () => {
    const now = Date.now();
    const store = { get: async () => ({ at: now - CREATOR_INFO_TTL_MS + 1, info: { privacyLevels: ['SELF_ONLY'] } }), set: async () => { throw new Error('should not write'); } };
    const info = await cachedCreatorInfo('acct1', { store, now, fetchFn: throwFetch });
    assert.deepEqual(info.privacyLevels, ['SELF_ONLY']);
  });

  it('fetches and caches when there is no cached entry at all', async () => {
    const now = Date.now();
    let setCall;
    const store = { get: async () => null, set: async (key, val) => { setCall = { key, val }; } };
    const fetchFn = async () => ({ ok: true, json: async () => ({ privacyLevels: ['PUBLIC_TO_EVERYONE'] }) });
    const info = await cachedCreatorInfo('acct1', { store, now, fetchFn });
    assert.deepEqual(info.privacyLevels, ['PUBLIC_TO_EVERYONE']);
    assert.equal(setCall.val.at, now);
    assert.deepEqual(setCall.val.info.privacyLevels, ['PUBLIC_TO_EVERYONE']);
  });

  it('a cache READ failure falls through to a live fetch rather than breaking the post', async () => {
    const now = Date.now();
    const store = { get: async () => { throw new Error('ECONNRESET'); }, set: async () => {} };
    const fetchFn = async () => ({ ok: true, json: async () => ({ privacyLevels: ['PUBLIC_TO_EVERYONE'] }) });
    const info = await cachedCreatorInfo('acct1', { store, now, fetchFn });
    assert.deepEqual(info.privacyLevels, ['PUBLIC_TO_EVERYONE']);
  });

  it('a cache WRITE failure does not throw — the resolved info is still returned', async () => {
    const now = Date.now();
    const store = { get: async () => null, set: async () => { throw new Error('write failed'); } };
    const fetchFn = async () => ({ ok: true, json: async () => ({ privacyLevels: ['PUBLIC_TO_EVERYONE'] }) });
    const info = await cachedCreatorInfo('acct1', { store, now, fetchFn });
    assert.deepEqual(info.privacyLevels, ['PUBLIC_TO_EVERYONE']);
  });
});

describe('claimSlots', () => {
  const FAR_FUTURE_NOW = Date.parse('2099-06-15T00:00:00.000Z');
  const FAR_FUTURE_DATE = '2099-06-16';

  it('re-offers the same held slot on a repeated claim rather than granting a second one, as long as the pack has not posted it yet', async () => {
    // `posted` is read from `pack.posts`, not from the grid, so a pack that has not posted
    // anything gets its held slot re-offered every time it asks — same format, same instant,
    // so `requestIdFor` is identical and a re-send is deduplicated by Zernio.
    const pack = {
      contentId: 'p1', categoryId: 'breaking-news', renderedAt: new Date(FAR_FUTURE_NOW).toISOString(),
      renders: { videos: { tiktok: { url: 'https://cdn.example/t.mp4' } } },
    };
    let stored = {};
    const store = { get: async () => stored, set: async (key, val) => { stored = val; } };
    const first = await claimSlots(pack, { store, now: FAR_FUTURE_NOW, dateISO: FAR_FUTURE_DATE });
    const firstTiktok = first.assignments.find((s) => s.format === 'tiktok');
    assert.ok(firstTiktok);

    const second = await claimSlots(pack, { store, now: FAR_FUTURE_NOW, dateISO: FAR_FUTURE_DATE });
    const secondTiktok = second.assignments.filter((s) => s.format === 'tiktok');
    assert.equal(secondTiktok.length, 1); // still exactly one — never a second slot for the same format
    assert.equal(secondTiktok[0].time, firstTiktok.time); // the SAME slot re-offered, not a new one
  });

  it('re-offers a held slot the pack has not posted yet, and never re-offers one it has already posted', async () => {
    // The defect this fixes: a slot counted as used the moment it was planned, so a pack that
    // failed part-way through scheduling could never finish its remaining formats that day —
    // and the next day it claimed a FRESH set and posted the already-sent format again, at a
    // new slot time, which requestIdFor does not recognise as a duplicate.
    const pack = {
      contentId: 'p1', categoryId: 'breaking-news', renderedAt: new Date(FAR_FUTURE_NOW).toISOString(),
      renders: {
        videos: { tiktok: { url: 'https://cdn.example/t.mp4' } },
        stills: { story: 'https://cdn.example/s.jpg' },
      },
      // This pack already POSTED its tiktok slot on an earlier, partially-successful run.
      posts: [{ format: 'tiktok', platform: 'tiktok', at: '2099-06-16T08:00:00.000Z', zernioPostId: 'zp1', status: 'scheduled' }],
    };
    // The grid still shows this pack holding BOTH the tiktok slot it already posted and a
    // story slot it never got to.
    let stored = { 'tiktok@08:00': 'p1', 'story@10:00': 'p1' };
    const store = { get: async () => stored, set: async (key, val) => { stored = val; } };
    const { assignments } = await claimSlots(pack, { store, now: FAR_FUTURE_NOW, dateISO: FAR_FUTURE_DATE });

    assert.deepEqual(assignments.map((a) => `${a.format}@${a.time}`), ['story@10:00']);
    assert.equal(assignments.some((a) => a.format === 'tiktok'), false); // already posted — never re-offered
  });

  it('does not let a second story reuse a slot another story already holds', async () => {
    const packA = { contentId: 'pA', categoryId: 'breaking-news', renderedAt: new Date(FAR_FUTURE_NOW).toISOString(), renders: { videos: { tiktok: { url: 'a.mp4' } } } };
    const packB = { contentId: 'pB', categoryId: 'breaking-news', renderedAt: new Date(FAR_FUTURE_NOW).toISOString(), renders: { videos: { tiktok: { url: 'b.mp4' } } } };
    let stored = {};
    const store = { get: async () => stored, set: async (key, val) => { stored = val; } };
    const resA = await claimSlots(packA, { store, now: FAR_FUTURE_NOW, dateISO: FAR_FUTURE_DATE });
    const resB = await claimSlots(packB, { store, now: FAR_FUTURE_NOW, dateISO: FAR_FUTURE_DATE });
    const tA = resA.assignments.find((s) => s.format === 'tiktok');
    const tB = resB.assignments.find((s) => s.format === 'tiktok');
    assert.ok(tA);
    assert.ok(tB);
    assert.notEqual(tA.time, tB.time); // distinct slots, not a collision
  });

  it('persists the claim so the next read reflects it, keyed by format@time -> contentId', async () => {
    const pack = { contentId: 'p1', categoryId: 'breaking-news', renderedAt: new Date(FAR_FUTURE_NOW).toISOString(), renders: { stills: { cover: 'x' } } };
    const setCalls = [];
    const store = { get: async () => ({}), set: async (key, val) => { setCalls.push({ key, val }); } };
    const { assignments } = await claimSlots(pack, { store, now: FAR_FUTURE_NOW, dateISO: FAR_FUTURE_DATE });
    assert.equal(setCalls.length, 1);
    assert.equal(setCalls[0].key, SLOTS_KEY(FAR_FUTURE_DATE));
    assert.ok(assignments.length > 0);
    for (const slot of assignments) assert.equal(setCalls[0].val[`${slot.format}@${slot.time}`], 'p1');
  });

  it('does not write to the store at all when nothing can be claimed', async () => {
    const pack = { contentId: 'p1', categoryId: 'breaking-news', renderedAt: new Date(FAR_FUTURE_NOW).toISOString(), renders: {} }; // no assets whatsoever
    const store = { get: async () => ({}), set: async () => { throw new Error('store.set should not have been called'); } };
    const result = await claimSlots(pack, { store, now: FAR_FUTURE_NOW, dateISO: FAR_FUTURE_DATE });
    assert.deepEqual(result, { assignments: [], dateISO: FAR_FUTURE_DATE });
  });

  it('passes ignorePool through to planDay, so a story past the 24h recency window can still claim a slot', async () => {
    // The defect this fixes: a rendered pack that missed one day's grid was dropped by the
    // pool's recency filter and could never be scheduled again, sitting at `rendered` forever.
    // A pack asking for its OWN slot is not competing in the ranked pool at all.
    const stalePack = {
      contentId: 'p1', categoryId: 'breaking-news',
      renderedAt: new Date(FAR_FUTURE_NOW - 30 * 60 * 60_000).toISOString(), // 30h old — past the 24h pool window
      renders: { videos: { tiktok: { url: 'https://cdn.example/t.mp4' } } },
    };
    const store = { get: async () => ({}), set: async () => {} };
    const { assignments } = await claimSlots(stalePack, { store, now: FAR_FUTURE_NOW, dateISO: FAR_FUTURE_DATE });
    assert.ok(assignments.some((s) => s.format === 'tiktok')); // claimed despite being older than the pool window
  });

  it('defaults dateISO to gridDate(now) when not given explicitly', async () => {
    const now = Date.parse('2026-06-14T23:30:00.000Z'); // 2026-06-15 local London time
    const pack = { contentId: 'p1', categoryId: 'breaking-news', renderedAt: new Date(now).toISOString(), renders: {} };
    let seenKey;
    const store = { get: async (key) => { seenKey = key; return {}; }, set: async () => {} };
    await claimSlots(pack, { store, now });
    assert.equal(seenKey, SLOTS_KEY('2026-06-15'));
  });
});

describe('schedulePost', () => {
  const igBase = { contentId: 'c1', social: { igCaption: 'Big news', hashtags: [] } };
  const reelSlot = { format: 'reel', time: '12:30', at: '2026-06-15T12:30:00.000Z', url: 'https://cdn.example/reel.mp4' };

  it('throws when Zernio reports a per-platform failure, even though the HTTP call itself succeeded (a 207)', async () => {
    const fetchFn = async () => ({
      ok: true, status: 207,
      json: async () => ({ post: { platforms: [{ platform: 'instagram', status: 'failed', error: 'media fetch timed out' }] } }),
    });
    await assert.rejects(
      schedulePost(igBase, reelSlot, { accounts: { instagram: 'acct-ig' }, fetchFn }),
      /reel did not post — instagram: media fetch timed out/,
    );
  });

  it('builds the carousel media list in slide order (numeric), not raw key order', async () => {
    const pack = {
      contentId: 'c1', social: { igCaption: 'Look' },
      renders: {
        stills: {
          cover: 'https://cdn.example/cover.jpg',
          'slide-10': 'https://cdn.example/slide-10.jpg',
          'slide-2': 'https://cdn.example/slide-2.jpg',
          'slide-1': 'https://cdn.example/slide-1.jpg',
          cta: 'https://cdn.example/cta.jpg',
        },
      },
    };
    const slot = { format: 'carousel', time: '09:00', at: '2026-06-15T09:00:00.000Z' };
    let seenBody;
    const fetchFn = async (url, init) => {
      seenBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ post: { id: 'p1', platforms: [{ platform: 'instagram', status: 'posted' }] } }) };
    };
    await schedulePost(pack, slot, { accounts: { instagram: 'acct-ig' }, fetchFn });
    assert.deepEqual(seenBody.mediaItems.map((m) => m.url), [
      'https://cdn.example/cover.jpg',
      'https://cdn.example/slide-1.jpg',
      'https://cdn.example/slide-2.jpg',
      'https://cdn.example/slide-10.jpg', // numeric sort — must not land before slide-2 lexicographically
      'https://cdn.example/cta.jpg',
    ]);
  });

  it('sends the same deterministic request id that requestIdFor produces for this story/format/slot', async () => {
    let seenHeaders;
    const fetchFn = async (url, init) => {
      seenHeaders = init.headers;
      return { ok: true, json: async () => ({ post: { platforms: [{ platform: 'instagram', status: 'posted' }] } }) };
    };
    await schedulePost(igBase, reelSlot, { accounts: { instagram: 'acct-ig' }, fetchFn });
    assert.equal(seenHeaders['x-request-id'], requestIdFor({ contentId: 'c1', format: 'reel', at: reelSlot.at }));
  });

  it("throws when no Zernio account is configured for the slot's platform", async () => {
    await assert.rejects(
      schedulePost(igBase, reelSlot, { accounts: {}, fetchFn: throwFetch }),
      /no Zernio instagram account configured/,
    );
  });

  it('resolves and sends TikTok privacy settings via cachedCreatorInfo for a tiktok slot', async () => {
    const pack = { contentId: 'c1', social: { tiktokCaption: 'Watch this' } };
    const slot = { format: 'tiktok', time: '08:00', at: '2026-06-15T08:00:00.000Z', url: 'https://cdn.example/t.mp4' };
    const store = { get: async () => null, set: async () => {} };
    let seenBody;
    const fetchFn = async (url, init) => {
      if (String(url).includes('creator-info')) return { ok: true, json: async () => ({ privacyLevels: ['PUBLIC_TO_EVERYONE'] }) };
      seenBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ post: { platforms: [{ platform: 'tiktok', status: 'posted' }] } }) };
    };
    await schedulePost(pack, slot, { accounts: { tiktok: 'acct-tt' }, store, fetchFn });
    assert.equal(seenBody.platforms[0].tiktok.privacyLevel, 'PUBLIC_TO_EVERYONE');
  });

  it('throws (does not post) when the TikTok account cannot post publicly', async () => {
    const pack = { contentId: 'c1', social: { tiktokCaption: 'x' } };
    const slot = { format: 'tiktok', time: '08:00', at: '2026-06-15T08:00:00.000Z', url: 'https://cdn.example/t.mp4' };
    const store = { get: async () => null, set: async () => {} };
    const fetchFn = async (url) => {
      if (String(url).includes('creator-info')) return { ok: true, json: async () => ({ privacyLevels: ['SELF_ONLY'] }) };
      throw new Error('must not post when the account cannot go public');
    };
    await assert.rejects(
      schedulePost(pack, slot, { accounts: { tiktok: 'acct-tt' }, store, fetchFn }),
      /cannot post publicly/,
    );
  });

  it('never calls creator-info for a non-TikTok slot', async () => {
    const pack = { contentId: 'c1', social: { igCaption: 'x' } };
    const slot = { format: 'story', time: '10:00', at: '2026-06-15T10:00:00.000Z', url: 'https://cdn.example/s.jpg' };
    const fetchFn = async (url) => {
      if (String(url).includes('creator-info')) throw new Error('should not check creator-info for Instagram');
      return { ok: true, json: async () => ({ post: { platforms: [{ platform: 'instagram', status: 'posted' }] } }) };
    };
    await schedulePost(pack, slot, { accounts: { instagram: 'acct-ig' }, fetchFn });
  });

  it('composes the caption from the platform-specific field plus hashtags, re-adding the # that toPack stripped', async () => {
    // buildPack/toPack never produces a leading '#' on a hashtag — it strips it when it
    // normalises them — so the fixture here is bare tags, the shape the real pipeline
    // actually sends. A fixture that hand-fed '#news' already had the '#' on it and hid the
    // bug entirely: every caption shipped its hashtags as bare, run-together words.
    const pack = { contentId: 'c1', social: { igCaption: 'Big news', hashtags: ['news', 'uk'] } };
    const slot = { format: 'story', time: '10:00', at: '2026-06-15T10:00:00.000Z', url: 'https://cdn.example/s.jpg' };
    let seenBody;
    const fetchFn = async (url, init) => {
      seenBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ post: { platforms: [{ platform: 'instagram', status: 'posted' }] } }) };
    };
    await schedulePost(pack, slot, { accounts: { instagram: 'acct-ig' }, fetchFn });
    assert.equal(seenBody.content, 'Big news\n\n#news #uk');
  });

  it('re-adds the # even when a hashtag already has one, without doubling it', async () => {
    const pack = { contentId: 'c1', social: { igCaption: 'Big news', hashtags: ['news', '#uk'] } };
    const slot = { format: 'story', time: '10:00', at: '2026-06-15T10:00:00.000Z', url: 'https://cdn.example/s.jpg' };
    let seenBody;
    const fetchFn = async (url, init) => {
      seenBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ post: { platforms: [{ platform: 'instagram', status: 'posted' }] } }) };
    };
    await schedulePost(pack, slot, { accounts: { instagram: 'acct-ig' }, fetchFn });
    assert.equal(seenBody.content, 'Big news\n\n#news #uk');
  });

  it('uses the tiktokCaption field (not igCaption) for a tiktok slot', async () => {
    const pack = { contentId: 'c1', social: { igCaption: 'wrong one', tiktokCaption: 'right one', hashtags: [] } };
    const slot = { format: 'tiktok', time: '08:00', at: '2026-06-15T08:00:00.000Z', url: 'https://cdn.example/t.mp4' };
    const store = { get: async () => ({ at: Date.now(), info: { privacyLevels: ['PUBLIC_TO_EVERYONE'] } }), set: async () => {} };
    let seenBody;
    const fetchFn = async (url, init) => { seenBody = JSON.parse(init.body); return { ok: true, json: async () => ({ post: { platforms: [{ platform: 'tiktok', status: 'posted' }] } }) }; };
    await schedulePost(pack, slot, { accounts: { tiktok: 'acct-tt' }, store, fetchFn });
    assert.equal(seenBody.content, 'right one');
  });

  it('sends a single-item media list for a non-carousel format', async () => {
    let seenBody;
    const fetchFn = async (url, init) => { seenBody = JSON.parse(init.body); return { ok: true, json: async () => ({ post: { platforms: [{ platform: 'instagram', status: 'posted' }] } }) }; };
    await schedulePost(igBase, reelSlot, { accounts: { instagram: 'acct-ig' }, fetchFn });
    assert.deepEqual(seenBody.mediaItems.map((m) => m.url), ['https://cdn.example/reel.mp4']);
  });

  it('returns the scheduled-post summary, defaulting status to "scheduled" when Zernio reports none', async () => {
    const fetchFn = async () => ({ ok: true, json: async () => ({ post: { id: 'zp1', platforms: [{ platform: 'instagram', status: 'posted' }] } }) });
    const result = await schedulePost(igBase, reelSlot, { accounts: { instagram: 'acct-ig' }, fetchFn });
    assert.deepEqual(result, { format: 'reel', platform: 'instagram', at: reelSlot.at, zernioPostId: 'zp1', status: 'scheduled' });
  });

  it("passes through Zernio's own status string when it reports one", async () => {
    const fetchFn = async () => ({ ok: true, json: async () => ({ post: { id: 'zp1', status: 'processing', platforms: [{ platform: 'instagram', status: 'posted' }] } }) });
    const result = await schedulePost(igBase, reelSlot, { accounts: { instagram: 'acct-ig' }, fetchFn });
    assert.equal(result.status, 'processing');
  });
});
