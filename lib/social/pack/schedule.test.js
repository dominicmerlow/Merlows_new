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
  ensureTiktokUpload, claimImmediate, spentToday, UPLOAD_REFRESH_MARGIN_MS,
} from './schedule.js';
import { requestIdFor, UPLOAD_TTL_MS } from '../platforms/zernio.js';

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

  // By this point POST /posts has answered 2xx, so Zernio already holds a post. The caller
  // decides whether to retry by reading `err.reachedZernio`; without the flag it has to match
  // the message text, which breaks silently the first time anyone rewords it — and the cost of
  // getting it wrong is a second post that no platform API can delete.
  it('flags a per-platform failure as having reached Zernio, and carries the post id', async () => {
    const fetchFn = async () => ({
      ok: true, status: 207,
      json: async () => ({ post: { id: 'zp-207', platforms: [{ platform: 'instagram', status: 'failed', error: 'nope' }] } }),
    });
    await assert.rejects(
      schedulePost(igBase, reelSlot, { accounts: { instagram: 'acct-ig' }, fetchFn }),
      (err) => {
        assert.equal(err.reachedZernio, true, 'a retry off this error would create a second post');
        assert.equal(err.zernioPostId, 'zp-207');
        return true;
      },
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

  // A TikTok slot is four round trips, not one: creator-info, reading our own file, Zernio's
  // presign, then the PUT to storage, before the post is created at all. `seen` records each
  // so a test can assert on any of them; `privacyLevels` and `sourceType` are the knobs the
  // failure cases need.
  const tiktokFetch = (seen, { privacyLevels = ['PUBLIC_TO_EVERYONE'], sourceType = 'video/mp4' } = {}) =>
    async (url, init) => {
      const href = String(url);
      if (href.includes('creator-info')) return { ok: true, json: async () => ({ privacyLevels }) };
      if (href.includes('/media/presign')) {
        seen.presign = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({
            uploadUrl: 'https://bucket.r2.cloudflarestorage.com/temp/1_abc_t.mp4?X-Amz-Signature=sig',
            publicUrl: 'https://media.zernio.com/temp/1_abc_t.mp4',
          }),
        };
      }
      if (href.includes('r2.cloudflarestorage.com')) {
        seen.put = { method: init.method, contentType: init.headers['Content-Type'], bytes: init.body?.length };
        return { ok: true, status: 200, json: async () => ({}) };
      }
      if (href.includes('/posts')) {
        seen.post = JSON.parse(init.body);
        return { ok: true, json: async () => ({ post: { platforms: [{ platform: 'tiktok', status: 'posted' }] } }) };
      }
      // Anything else is us reading our own rendered file back out of Blob storage.
      seen.read = href;
      return {
        ok: true,
        headers: { get: () => sourceType },
        arrayBuffer: async () => new Uint8Array([0, 1, 2, 3]).buffer,
      };
    };

  it('resolves and sends TikTok privacy settings via cachedCreatorInfo for a tiktok slot', async () => {
    const pack = { contentId: 'c1', social: { tiktokCaption: 'Watch this' } };
    const slot = { format: 'tiktok', time: '08:00', at: '2026-06-15T08:00:00.000Z', url: 'https://cdn.example/t.mp4' };
    const store = { get: async () => null, set: async () => {} };
    const seen = {};
    await schedulePost(pack, slot, { accounts: { tiktok: 'acct-tt' }, store, fetchFn: tiktokFetch(seen) });

    // TOP LEVEL, not inside the platforms entry. Sent as `platforms[0].tiktok` — a key Zernio
    // does not read — the privacy level and the two consent flags never reached TikTok, and
    // five videos went to the creator's inbox as drafts that Zernio reported as published.
    assert.equal(seen.post.platforms[0].tiktok, undefined, 'settings under a key Zernio ignores');
    assert.equal(seen.post.tiktokSettings.privacy_level, 'PUBLIC_TO_EVERYONE');
    assert.equal(seen.post.tiktokSettings.content_preview_confirmed, true);
    assert.equal(seen.post.tiktokSettings.express_consent_given, true);
  });

  // TikTok rejects any media URL whose domain is not verified against the calling app, so a
  // post carrying our Blob URL fails with error 40002 however public that URL is. The video
  // must be uploaded into Zernio's own storage and posted from media.zernio.com.
  it('uploads the TikTok video to Zernio storage and posts the media.zernio.com URL, not our Blob URL', async () => {
    const pack = { contentId: 'c1', social: { tiktokCaption: 'Watch this' } };
    const slot = { format: 'tiktok', time: '08:00', at: '2026-06-15T08:00:00.000Z', url: 'https://cdn.example/t.mp4' };
    const store = { get: async () => null, set: async () => {} };
    const seen = {};
    await schedulePost(pack, slot, { accounts: { tiktok: 'acct-tt' }, store, fetchFn: tiktokFetch(seen) });

    assert.equal(seen.read, 'https://cdn.example/t.mp4');
    assert.deepEqual(seen.presign, { filename: 't.mp4', contentType: 'video/mp4', size: 4 });
    assert.deepEqual(seen.put, { method: 'PUT', contentType: 'video/mp4', bytes: 4 });
    assert.deepEqual(seen.post.mediaItems.map((m) => m.url), ['https://media.zernio.com/temp/1_abc_t.mp4']);
  });

  // Zernio deletes an upload after 7 days unless a post using it has published by then, so a
  // slot beyond that window would publish with its media already gone. Better to fail now,
  // while the pack can still be re-slotted, than in a Zernio worker days from now.
  it('refuses a TikTok slot further out than the 7-day upload window rather than scheduling a post that will lose its media', async () => {
    const now = Date.parse('2026-06-15T08:00:00.000Z');
    const pack = { contentId: 'c1', social: { tiktokCaption: 'x' } };
    const slot = { format: 'tiktok', time: '08:00', at: '2026-06-25T08:00:00.000Z', url: 'https://cdn.example/t.mp4' };
    const store = { get: async () => null, set: async () => {} };
    const seen = {};
    await assert.rejects(
      schedulePost(pack, slot, { accounts: { tiktok: 'acct-tt' }, store, now, fetchFn: tiktokFetch(seen) }),
      /more than 7 days out/,
    );
    assert.equal(seen.presign, undefined, 'must not pay for an upload it already knows will expire');
    assert.equal(seen.post, undefined, 'must not create the post at all');
  });

  // The caller's floor for starting a TikTok post and the reserve taken off here must not
  // cancel each other out. They once did: a 45s caller floor against a 45s reserve left 5s for
  // the whole transfer — a guaranteed timeout at exactly the point the floor existed to
  // prevent. The upload must keep a usable share of whatever it is given.
  it('leaves the upload a workable share of the budget at the caller\'s minimum for starting a TikTok post', async () => {
    const CALLER_FLOOR_MS = 45_000;
    let seenBudget;
    const fetchFn = async (url, init) => {
      const href = String(url);
      if (href.includes('creator-info')) return { ok: true, json: async () => ({ privacyLevels: ['PUBLIC_TO_EVERYONE'] }) };
      if (href.includes('/media/presign')) return { ok: true, json: async () => ({ uploadUrl: 'https://b.r2.cloudflarestorage.com/t', publicUrl: 'https://media.zernio.com/t.mp4' }) };
      if (href.includes('r2.cloudflarestorage.com')) return { ok: true, status: 200 };
      if (href.includes('/posts')) return { ok: true, json: async () => ({ post: { platforms: [{ platform: 'tiktok', status: 'posted' }] } }) };
      // The source read: record how long rehostMedia was actually given.
      seenBudget = init?.signal ? 'bounded' : 'unbounded';
      return { ok: true, headers: { get: () => 'video/mp4' }, arrayBuffer: async () => new Uint8Array([1]).buffer };
    };
    const pack = { contentId: 'c1', social: { tiktokCaption: 'x' } };
    const slot = { format: 'tiktok', time: '08:00', at: '2026-06-15T08:00:00.000Z', url: 'https://cdn.example/t.mp4' };
    const store = { get: async () => null, set: async () => {} };
    await schedulePost(pack, slot, {
      accounts: { tiktok: 'acct-tt' }, store, fetchFn, budgetMs: CALLER_FLOOR_MS,
    });
    assert.equal(seenBudget, 'bounded', 'the upload must run under a deadline derived from the caller budget');
  });

  // ── reusing the upload made at render time ────────────────────────────────
  // The upload happens when the render finishes, so a retry is free and Approve → published
  // is one API call. The risk it introduces is staleness: Zernio deletes an upload 7 days
  // after it is MADE, and an archived pack can be approved long after that. So the question
  // at schedule time is never "is this upload alive now" but "will it be alive when this post
  // publishes".
  it('reuses a stored upload instead of uploading the same video again', async () => {
    const now = Date.parse('2026-06-15T08:00:00.000Z');
    const pack = {
      contentId: 'c1',
      social: { tiktokCaption: 'x' },
      uploads: {
        'https://cdn.example/t.mp4': { url: 'https://media.zernio.com/stored.mp4', expiresAt: now + 6 * 24 * 60 * 60_000 },
      },
    };
    const slot = { format: 'tiktok', time: '08:00', at: '2026-06-15T10:00:00.000Z', url: 'https://cdn.example/t.mp4' };
    const store = { get: async () => null, set: async () => {} };
    const seen = {};
    await schedulePost(pack, slot, { accounts: { tiktok: 'acct-tt' }, store, now, fetchFn: tiktokFetch(seen) });

    assert.equal(seen.presign, undefined, 'a stored upload with life left must not be paid for twice');
    assert.equal(seen.read, undefined, 'the video must not even be read again');
    assert.deepEqual(seen.post.mediaItems.map((m) => m.url), ['https://media.zernio.com/stored.mp4']);
  });

  it('uploads again when the stored upload would die before the post publishes', async () => {
    const now = Date.parse('2026-06-15T08:00:00.000Z');
    // Alive now, and alive at the slot — but only just. Inside the refresh margin, so it is
    // replaced rather than gambled on.
    const pack = {
      contentId: 'c1',
      social: { tiktokCaption: 'x' },
      uploads: {
        'https://cdn.example/t.mp4': { url: 'https://media.zernio.com/stale.mp4', expiresAt: now + 3 * 60 * 60_000 },
      },
    };
    const slot = { format: 'tiktok', time: '08:00', at: '2026-06-15T10:00:00.000Z', url: 'https://cdn.example/t.mp4' };
    const store = { get: async () => null, set: async () => {} };
    const seen = {};
    await schedulePost(pack, slot, { accounts: { tiktok: 'acct-tt' }, store, now, fetchFn: tiktokFetch(seen) });

    assert.ok(seen.presign, 'a nearly-expired upload must be replaced, not reused');
    assert.deepEqual(seen.post.mediaItems.map((m) => m.url), ['https://media.zernio.com/temp/1_abc_t.mp4']);
  });

  // THE CASE THAT DISTINGUISHES THE TWO RULES. An upload can be comfortably alive right now
  // and still be dead by the time the post publishes. Measuring freshness from `now` would
  // reuse this one; measuring it from the publish time replaces it. Without this case a
  // now-only check passes the whole suite, because every other case here is already expired
  // on both readings.
  it('measures freshness against the PUBLISH time, not now: replaces an upload that is alive today but dead by the slot', async () => {
    const now = Date.parse('2026-06-15T08:00:00.000Z');
    const pack = {
      contentId: 'c1',
      social: { tiktokCaption: 'x' },
      uploads: {
        // Alive for another 30h — well past the 24h margin measured from now...
        'https://cdn.example/t.mp4': { url: 'https://media.zernio.com/dies-first.mp4', expiresAt: now + UPLOAD_REFRESH_MARGIN_MS + 6 * 60 * 60_000 },
      },
    };
    // ...but the post publishes in 20h, leaving only 10h of life after it — inside the margin.
    const slot = { format: 'tiktok', time: '04:00', at: new Date(now + 20 * 60 * 60_000).toISOString(), url: 'https://cdn.example/t.mp4' };
    const store = { get: async () => null, set: async () => {} };
    const seen = {};
    await schedulePost(pack, slot, { accounts: { tiktok: 'acct-tt' }, store, now, fetchFn: tiktokFetch(seen) });

    assert.ok(seen.presign, 'freshness was measured from now, so an upload that dies before publishing was reused');
    assert.ok(
      !JSON.stringify(seen.post.mediaItems).includes('dies-first'),
      'the post carries a URL that will be deleted before it publishes',
    );
  });

  // A fresh upload made here must reach the CALLER, or the pack keeps its stale entry and
  // every retry of this slot pays for the whole transfer again — the exact cost that uploading
  // early exists to remove.
  it('hands back any upload it made, so the caller can store it', async () => {
    const now = Date.parse('2026-06-15T08:00:00.000Z');
    const pack = { contentId: 'c1', social: { tiktokCaption: 'x' } };
    const slot = { format: 'tiktok', time: '08:00', at: '2026-06-15T10:00:00.000Z', url: 'https://cdn.example/t.mp4' };
    const store = { get: async () => null, set: async () => {} };
    const seen = {};
    const post = await schedulePost(pack, slot, { accounts: { tiktok: 'acct-tt' }, store, now, fetchFn: tiktokFetch(seen) });

    assert.ok(post.upload, 'the upload was made and then thrown away');
    assert.equal(post.upload['https://cdn.example/t.mp4'].url, 'https://media.zernio.com/temp/1_abc_t.mp4');
    assert.ok(post.upload['https://cdn.example/t.mp4'].expiresAt > now);
  });

  it('hands back nothing when a stored upload was reused, so the caller writes no needless change', async () => {
    const now = Date.parse('2026-06-15T08:00:00.000Z');
    const pack = {
      contentId: 'c1',
      social: { tiktokCaption: 'x' },
      uploads: { 'https://cdn.example/t.mp4': { url: 'https://media.zernio.com/have.mp4', expiresAt: now + 6 * 24 * 60 * 60_000 } },
    };
    const slot = { format: 'tiktok', time: '08:00', at: '2026-06-15T10:00:00.000Z', url: 'https://cdn.example/t.mp4' };
    const store = { get: async () => null, set: async () => {} };
    const post = await schedulePost(pack, slot, { accounts: { tiktok: 'acct-tt' }, store, now, fetchFn: tiktokFetch({}) });
    assert.equal(post.upload, undefined);
  });

  it('never hands back an upload for an Instagram post', async () => {
    const fetchFn = async () => ({ ok: true, json: async () => ({ post: { platforms: [{ platform: 'instagram', status: 'posted' }] } }) });
    const post = await schedulePost(igBase, reelSlot, { accounts: { instagram: 'acct-ig' }, fetchFn });
    assert.equal(post.upload, undefined);
  });

  // The case the whole re-check exists for.
  it('uploads again for a pack archived for days and then approved, rather than posting a dead URL', async () => {
    const uploadedAt = Date.parse('2026-06-15T08:00:00.000Z');
    const approvedAt = uploadedAt + 9 * 24 * 60 * 60_000; // nine days later — the upload is gone
    const pack = {
      contentId: 'c1',
      social: { tiktokCaption: 'x' },
      uploads: {
        'https://cdn.example/t.mp4': { url: 'https://media.zernio.com/long-gone.mp4', expiresAt: uploadedAt + 7 * 24 * 60 * 60_000 },
      },
    };
    const slot = { format: 'tiktok', time: '08:00', at: new Date(approvedAt + 60_000).toISOString(), url: 'https://cdn.example/t.mp4' };
    const store = { get: async () => null, set: async () => {} };
    const seen = {};
    await schedulePost(pack, slot, { accounts: { tiktok: 'acct-tt' }, store, now: approvedAt, fetchFn: tiktokFetch(seen) });

    assert.ok(seen.presign, 'the pack posted a URL Zernio had already deleted');
    assert.ok(!JSON.stringify(seen.post.mediaItems).includes('long-gone'), 'the dead URL reached the post');
  });

  it('posts a TikTok slot inside the 7-day window', async () => {
    const now = Date.parse('2026-06-15T08:00:00.000Z');
    const pack = { contentId: 'c1', social: { tiktokCaption: 'x' } };
    const slot = { format: 'tiktok', time: '08:00', at: '2026-06-20T08:00:00.000Z', url: 'https://cdn.example/t.mp4' };
    const store = { get: async () => null, set: async () => {} };
    const seen = {};
    await schedulePost(pack, slot, { accounts: { tiktok: 'acct-tt' }, store, now, fetchFn: tiktokFetch(seen) });
    assert.ok(seen.post, 'a slot inside the window must still post');
  });

  // The guard is a strict ">", not ">=", so a slot exactly on the boundary is inside the window
  // and one millisecond past it is not. Both sides need their own test — the existing 5-day/
  // 10-day cases above only prove "comfortably inside" and "comfortably outside".
  it('posts a TikTok slot exactly at the 7-day boundary — the guard is ">", so equal-to-the-limit is still allowed', async () => {
    const now = Date.parse('2026-06-15T08:00:00.000Z');
    const pack = { contentId: 'c1', social: { tiktokCaption: 'x' } };
    const slot = { format: 'tiktok', time: '08:00', at: new Date(now + UPLOAD_TTL_MS).toISOString(), url: 'https://cdn.example/t.mp4' };
    const store = { get: async () => null, set: async () => {} };
    const seen = {};
    await schedulePost(pack, slot, { accounts: { tiktok: 'acct-tt' }, store, now, fetchFn: tiktokFetch(seen) });
    assert.ok(seen.post, 'a slot exactly at the boundary must still post');
  });

  it('refuses a TikTok slot one millisecond past the 7-day boundary', async () => {
    const now = Date.parse('2026-06-15T08:00:00.000Z');
    const pack = { contentId: 'c1', social: { tiktokCaption: 'x' } };
    const slot = { format: 'tiktok', time: '08:00', at: new Date(now + UPLOAD_TTL_MS + 1).toISOString(), url: 'https://cdn.example/t.mp4' };
    const store = { get: async () => null, set: async () => {} };
    const seen = {};
    await assert.rejects(
      schedulePost(pack, slot, { accounts: { tiktok: 'acct-tt' }, store, now, fetchFn: tiktokFetch(seen) }),
      /more than 7 days out/,
    );
    assert.equal(seen.post, undefined);
  });

  // `Date.parse` gives NaN for an unparsable or missing `at`, and every comparison against NaN
  // is false — so a guard written as `Number.isFinite(x) && x > LIMIT` WAVES A BROKEN VALUE
  // THROUGH: it uploads the video and sends the bad `scheduledFor` on to Zernio. That is the
  // same silent-bypass shape as the two bugs this function exists to stop, so an unusable time
  // must refuse outright rather than fall out of the check.
  it('refuses a malformed slot.at instead of letting it bypass the 7-day guard', async () => {
    const pack = { contentId: 'c1', social: { tiktokCaption: 'x' } };
    const slot = { format: 'tiktok', time: '08:00', at: 'not-a-real-date', url: 'https://cdn.example/t.mp4' };
    const store = { get: async () => null, set: async () => {} };
    const seen = {};
    await assert.rejects(
      schedulePost(pack, slot, { accounts: { tiktok: 'acct-tt' }, store, fetchFn: tiktokFetch(seen) }),
      /no usable time: not-a-real-date/,
    );
    assert.equal(seen.presign, undefined, 'must not pay for an upload it cannot schedule');
    assert.equal(seen.post, undefined);
  });

  it('refuses a missing slot.at the same way', async () => {
    const pack = { contentId: 'c1', social: { tiktokCaption: 'x' } };
    const slot = { format: 'tiktok', time: '08:00', url: 'https://cdn.example/t.mp4' }; // no `at` at all
    const store = { get: async () => null, set: async () => {} };
    const seen = {};
    await assert.rejects(
      schedulePost(pack, slot, { accounts: { tiktok: 'acct-tt' }, store, fetchFn: tiktokFetch(seen) }),
      /no usable time: undefined/,
    );
    assert.equal(seen.post, undefined);
  });

  it('never reaches /posts when the TikTok rehost itself fails', async () => {
    const pack = { contentId: 'c1', social: { tiktokCaption: 'x' } };
    const slot = { format: 'tiktok', time: '08:00', at: '2026-06-15T08:00:00.000Z', url: 'https://cdn.example/gone.mp4' };
    const store = { get: async () => null, set: async () => {} };
    const fetchFn = async (url) => {
      const href = String(url);
      if (href.includes('creator-info')) return { ok: true, json: async () => ({ privacyLevels: ['PUBLIC_TO_EVERYONE'] }) };
      if (href.includes('/posts')) throw new Error('must not create the post when the media upload failed');
      return { ok: false, status: 404 }; // reading our own rendered file back out of Blob fails
    };
    await assert.rejects(
      schedulePost(pack, slot, { accounts: { tiktok: 'acct-tt' }, store, fetchFn }),
      /HTTP 404/,
    );
  });

  // The upload to Zernio storage happens BEFORE the post is created, so a post that Zernio then
  // partially rejects (a 207) has already paid for the upload — that cost cannot be undone by
  // the failure that follows it.
  it('still uploads the video to Zernio storage even though the post itself then partially fails (a 207)', async () => {
    const pack = { contentId: 'c1', social: { tiktokCaption: 'x' } };
    const slot = { format: 'tiktok', time: '08:00', at: '2026-06-15T08:00:00.000Z', url: 'https://cdn.example/t.mp4' };
    const store = { get: async () => null, set: async () => {} };
    const seen = {};
    const fetchFn = async (url, init) => {
      const href = String(url);
      if (href.includes('creator-info')) return { ok: true, json: async () => ({ privacyLevels: ['PUBLIC_TO_EVERYONE'] }) };
      if (href.includes('/media/presign')) {
        seen.presign = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({ uploadUrl: 'https://bucket.r2.cloudflarestorage.com/temp/x.mp4?sig=1', publicUrl: 'https://media.zernio.com/temp/x.mp4' }),
        };
      }
      if (href.includes('r2.cloudflarestorage.com')) { seen.put = true; return { ok: true, status: 200, json: async () => ({}) }; }
      if (href.includes('/posts')) {
        return { ok: true, status: 207, json: async () => ({ post: { platforms: [{ platform: 'tiktok', status: 'failed', error: 'duplicate' }] } }) };
      }
      return { ok: true, headers: { get: () => 'video/mp4' }, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
    };
    await assert.rejects(
      schedulePost(pack, slot, { accounts: { tiktok: 'acct-tt' }, store, fetchFn }),
      /tiktok did not post — tiktok: duplicate/,
    );
    assert.ok(seen.presign, 'the upload had already happened before Zernio reported the post failed');
    assert.ok(seen.put, 'the PUT to Zernio storage completed — the later 207 does not undo it');
  });

  it('never uploads for an Instagram slot — Zernio fetches our Blob URL directly', async () => {
    let presigned = false;
    const fetchFn = async (url, init) => {
      if (String(url).includes('/media/presign')) { presigned = true; }
      return { ok: true, json: async () => ({ post: { platforms: [{ platform: 'instagram', status: 'posted' }] } }) };
    };
    const seenBody = [];
    await schedulePost(igBase, reelSlot, {
      accounts: { instagram: 'acct-ig' },
      fetchFn: async (url, init) => { seenBody.push(JSON.parse(init.body ?? '{}')); return fetchFn(url, init); },
    });
    assert.equal(presigned, false);
    assert.deepEqual(seenBody.at(-1).mediaItems.map((m) => m.url), ['https://cdn.example/reel.mp4']);
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
    const seen = {};
    await schedulePost(pack, slot, { accounts: { tiktok: 'acct-tt' }, store, fetchFn: tiktokFetch(seen) });
    assert.equal(seen.post.content, 'right one');
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

// ── ensureTiktokUpload — the pre-upload done when the render finishes ─────────
describe('ensureTiktokUpload', () => {
  const PRESIGNED = {
    uploadUrl: 'https://b.r2.cloudflarestorage.com/temp/x.mp4?X-Amz-Signature=s',
    publicUrl: 'https://media.zernio.com/temp/x.mp4',
  };
  const uploadFetch = (seen) => async (url, init) => {
    const href = String(url);
    if (href.includes('/media/presign')) { seen.presign = JSON.parse(init.body); return { ok: true, json: async () => PRESIGNED }; }
    if (href.includes('r2.cloudflarestorage.com')) { seen.put = true; return { ok: true, status: 200 }; }
    seen.read = href;
    return { ok: true, headers: { get: () => 'video/mp4' }, arrayBuffer: async () => new Uint8Array([1, 2]).buffer };
  };
  const packWithVideo = (extra = {}) => ({
    contentId: 'c1',
    renders: { videos: { tiktok: { url: 'https://cdn.example/t.mp4' } } },
    ...extra,
  });

  it('uploads the TikTok cut and returns the new uploads map keyed by the source URL', async () => {
    const seen = {};
    const uploads = await ensureTiktokUpload(packWithVideo(), { fetchFn: uploadFetch(seen) });
    assert.ok(seen.put, 'the video was never uploaded');
    assert.equal(uploads['https://cdn.example/t.mp4'].url, PRESIGNED.publicUrl);
    assert.ok(uploads['https://cdn.example/t.mp4'].expiresAt > Date.now());
  });

  // "No budget given" and "given, and there is none left" are opposite instructions. Treating
  // a non-positive number as "not given" handed the FULL default deadline to the caller with
  // no time at all — the one moment it must not start — and a tick killed mid-upload loses the
  // render costs this stage has just tallied.
  it('does nothing when the caller says there is no tick left, instead of starting on a default deadline', async () => {
    for (const budgetMs of [0, -8000]) {
      // eslint-disable-next-line no-await-in-loop
      const result = await ensureTiktokUpload(packWithVideo(), { budgetMs, fetchFn: throwFetch });
      assert.equal(result, null, `budgetMs ${budgetMs} must not start an upload`);
    }
  });

  it('still uses its own default when no budget is given at all', async () => {
    const seen = {};
    const uploads = await ensureTiktokUpload(packWithVideo(), { fetchFn: uploadFetch(seen) });
    assert.ok(seen.put, 'omitting the budget must not be read as "no time left"');
    assert.ok(uploads);
  });

  it('returns null when there is no TikTok render, so nothing is fetched', async () => {
    const result = await ensureTiktokUpload({ contentId: 'c1', renders: { videos: {} } }, { fetchFn: throwFetch });
    assert.equal(result, null);
  });

  it('returns null when a stored upload still has plenty of life, so a re-tick costs nothing', async () => {
    const now = Date.now();
    const pack = packWithVideo({
      uploads: { 'https://cdn.example/t.mp4': { url: 'https://media.zernio.com/have.mp4', expiresAt: now + 6 * 24 * 60 * 60_000 } },
    });
    assert.equal(await ensureTiktokUpload(pack, { now, fetchFn: throwFetch }), null);
  });

  it('uploads again when the stored upload is inside the refresh margin', async () => {
    const now = Date.now();
    const seen = {};
    const pack = packWithVideo({
      uploads: { 'https://cdn.example/t.mp4': { url: 'https://media.zernio.com/old.mp4', expiresAt: now + UPLOAD_REFRESH_MARGIN_MS - 60_000 } },
    });
    const uploads = await ensureTiktokUpload(pack, { now, fetchFn: uploadFetch(seen) });
    assert.ok(seen.put);
    assert.equal(uploads['https://cdn.example/t.mp4'].url, PRESIGNED.publicUrl);
  });

  it('keeps other entries in the uploads map rather than replacing it wholesale', async () => {
    const now = Date.now();
    const seen = {};
    const pack = packWithVideo({ uploads: { 'https://cdn.example/other.mp4': { url: 'https://media.zernio.com/other.mp4', expiresAt: now + 60_000 } } });
    const uploads = await ensureTiktokUpload(pack, { now, fetchFn: uploadFetch(seen) });
    assert.equal(uploads['https://cdn.example/other.mp4'].url, 'https://media.zernio.com/other.mp4');
    assert.equal(uploads['https://cdn.example/t.mp4'].url, PRESIGNED.publicUrl);
  });

  // The caller catches this. It must THROW rather than resolve to null on failure, or a
  // caller could not tell "nothing to do" from "it did not work".
  it('throws when the upload fails, so the caller can log it and carry on', async () => {
    const failing = async (url) => (String(url).includes('/media/presign')
      ? { ok: false, status: 500, json: async () => ({ error: 'nope' }) }
      : { ok: true, headers: { get: () => 'video/mp4' }, arrayBuffer: async () => new Uint8Array([1]).buffer });
    await assert.rejects(ensureTiktokUpload(packWithVideo(), { fetchFn: failing }), /nope|500/);
  });
});

// ── post-now now answers to the day's ceiling ────────────────────────────────
// It still goes out beside the grid rather than in it, but it no longer counts against
// nothing. Before this, approving by hand bypassed the launch ramp completely.
describe('claimImmediate', () => {
  const fullPack = {
    contentId: 'c1',
    renders: {
      videos: { tiktok: { url: 'https://cdn.example/t.mp4' }, reel: { url: 'https://cdn.example/r.mp4' } },
      stills: { cover: 'https://cdn.example/c.jpg', story: 'https://cdn.example/s.jpg' },
    },
  };
  const now = Date.parse('2026-06-15T12:00:00.000Z');
  const storeOver = (initial) => {
    let state = initial;
    return { get: async () => state, set: async (_k, v) => { state = v; }, read: () => state };
  };

  it('grants every format on an empty day, within the week-1 ceiling', async () => {
    const store = storeOver({});
    const { assignments, possible } = await claimImmediate(fullPack, { store, now });
    assert.equal(possible, 4);
    assert.deepEqual(assignments.map((a) => a.format).sort(), ['carousel', 'reel', 'story', 'tiktok']);
  });

  it('books what it granted into the day record, so the grid sees it', async () => {
    const store = storeOver({});
    await claimImmediate(fullPack, { store, now });
    const keys = Object.keys(store.read()).sort();
    assert.deepEqual(keys, ['carousel@now-0', 'reel@now-0', 'story@now-0', 'tiktok@now-0']);
    for (const k of keys) assert.equal(store.read()[k], 'c1');
  });

  it('drops a format whose ceiling the day has already spent', async () => {
    // Week 1 allows 2 carousels; both are gone.
    const store = storeOver({ 'carousel@09:00': 'other-1', 'carousel@17:00': 'other-2' });
    const { assignments } = await claimImmediate(fullPack, { store, now });
    assert.equal(assignments.some((a) => a.format === 'carousel'), false);
    assert.equal(assignments.some((a) => a.format === 'reel'), true, 'other formats must still go');
  });

  // The distinction that stops a good story being thrown away.
  it('reports possible>0 with no assignments when the whole day is spent, rather than looking assetless', async () => {
    const spent = {};
    for (const [format, n] of [['tiktok', 2], ['reel', 3], ['carousel', 2], ['story', 2]]) {
      for (let i = 0; i < n; i += 1) spent[`${format}@now-${i}`] = 'other';
    }
    const store = storeOver(spent);
    const { assignments, possible } = await claimImmediate(fullPack, { store, now });
    assert.equal(assignments.length, 0);
    assert.equal(possible, 4, 'a spent ceiling must not read as "this pack has no assets"');
  });

  it('reports possible 0 for a pack with no finished asset', async () => {
    const store = storeOver({});
    const { assignments, possible } = await claimImmediate({ contentId: 'c2', renders: {} }, { store, now });
    assert.equal(possible, 0);
    assert.equal(assignments.length, 0);
  });

  it('numbers a second post-now booking of the same format rather than overwriting the first', async () => {
    const store = storeOver({});
    await claimImmediate({ ...fullPack, contentId: 'c1' }, { store, now });
    await claimImmediate({ ...fullPack, contentId: 'c2' }, { store, now });
    assert.equal(store.read()['reel@now-0'], 'c1');
    assert.equal(store.read()['reel@now-1'], 'c2');
  });
});

describe('spentToday', () => {
  it('counts grid slots and post-now bookings together, ignoring anything else', () => {
    assert.deepEqual(
      spentToday({ 'reel@12:30': 'a', 'reel@now-0': 'b', 'story@10:00': 'c', 'nonsense': 'd' }),
      { tiktok: 0, reel: 2, carousel: 0, story: 1 },
    );
  });

  it('is all zeroes for an empty day', () => {
    assert.deepEqual(spentToday({}), { tiktok: 0, reel: 0, carousel: 0, story: 0 });
  });
});

describe('claimSlots ignores post-now bookings', () => {
  it('never re-offers a post-now booking as a grid slot', async () => {
    // Its time (`now-0`) has no place on the clock, so offering it would produce a post with
    // an unusable scheduledFor.
    const pack = {
      contentId: 'p1',
      categoryId: 'breaking-news',
      renderedAt: '2026-06-15T06:00:00.000Z',
      renders: { videos: { reel: { url: 'https://cdn.example/r.mp4' } } },
    };
    let state = { 'reel@now-0': 'p1' };
    const store = { get: async () => state, set: async (_k, v) => { state = v; } };
    const { assignments } = await claimSlots(pack, {
      store, now: Date.parse('2026-06-15T23:00:00.000Z'), dateISO: '2026-06-16',
    });
    assert.equal(assignments.some((a) => String(a.time).startsWith('now')), false);
  });
});

// ── a retry must not re-book what the pack already holds ─────────────────────
// A post-now pass ending early is a NORMAL path: TikTok goes first and needs 75s of tick, so
// the budget guard stops the batch part-way. If the retry books every format again, one story
// eats two of the day's two TikTok slots — and once the ceiling has filled, `remaining` reads
// 0 for a format the pack itself is holding, so that format is dropped and never posts.
describe('claimImmediate — retries', () => {
  const fullPack = {
    contentId: 'c1',
    renders: {
      videos: { tiktok: { url: 'https://cdn.example/t.mp4' }, reel: { url: 'https://cdn.example/r.mp4' } },
      stills: { cover: 'https://cdn.example/c.jpg', story: 'https://cdn.example/s.jpg' },
    },
  };
  const now = Date.parse('2026-06-15T12:00:00.000Z');
  const storeOver = (initial) => {
    let state = initial;
    return { get: async () => state, set: async (_k, v) => { state = v; }, read: () => state };
  };

  it('books nothing a second time when the pack already holds the format', async () => {
    const store = storeOver({});
    await claimImmediate(fullPack, { store, now });
    const afterFirst = { ...store.read() };
    await claimImmediate(fullPack, { store, now });
    assert.deepEqual(store.read(), afterFirst, 'the retry double-spent the pack\u2019s own ceiling');
  });

  it('still offers a held format on the retry, even once the day is otherwise full', async () => {
    // The pack holds tiktok from pass one; the rest of the tiktok ceiling then fills up.
    const store = storeOver({ 'tiktok@now-0': 'c1', 'tiktok@now-1': 'someone-else' });
    const { assignments, deferred } = await claimImmediate(fullPack, { store, now });
    assert.equal(assignments.some((a) => a.format === 'tiktok'), true, 'a format the pack paid for must not be dropped');
    assert.equal(deferred.includes('tiktok'), false);
  });

  it('does not re-offer or re-book a format the pack has already posted', async () => {
    const posted = { ...fullPack, posts: [{ format: 'tiktok', at: 'T', status: 'published' }] };
    const store = storeOver({});
    const { assignments } = await claimImmediate(posted, { store, now });
    assert.equal(assignments.some((a) => a.format === 'tiktok'), false);
    assert.equal(store.read()['tiktok@now-0'], undefined, 'booked a slot for something already posted');
  });

  it('reports which formats the ceiling pushed out, so the caller can re-route them', async () => {
    // Week 1 allows 2 carousels and 2 tiktoks; both are gone for each.
    const store = storeOver({
      'carousel@09:00': 'x', 'carousel@17:00': 'y', 'tiktok@now-0': 'x', 'tiktok@now-1': 'y',
    });
    const { assignments, deferred, pending } = await claimImmediate(fullPack, { store, now });
    assert.deepEqual(deferred.sort(), ['carousel', 'tiktok']);
    assert.deepEqual(assignments.map((a) => a.format).sort(), ['reel', 'story']);
    assert.equal(pending, 4);
  });
});
