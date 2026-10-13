// lib/social/platforms/zernio.js — the Zernio adapter.
//
// Every network-capable call here is driven through an injected `fetchFn`. This file NEVER
// relies on the default `fetch = fetch` global, because ZERNIO_API_KEY is a real, live key in
// this environment — an accidental real call would post to the brand's actual Instagram/TikTok
// accounts, and neither platform lets the API delete a post.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ZERNIO_PLATFORMS, requestIdFor, creatorInfo, tiktokSettings, privacyLevelValues, interpretPost,
  createPost, getPost, retryPost, rehostMedia, UPLOAD_TTL_MS,
  interpretAutomation, createCommentAutomation, updateCommentAutomation, deleteCommentAutomation,
  listCommentAutomations, getCommentAutomationLogs,
} from './zernio.js';

const throwFetch = async () => { throw new Error('fetch should not have been called'); };

// The privacy-level list as Zernio ACTUALLY returns it for the Merlows TikTok account
// (@merlows.news, 6ab29cb58d284ffb212e1733) — an array of OBJECTS, not of strings.
//
// Provenance matters here, because the bug this guards came from a fixture invented from
// Zernio's documentation. This one is not invented, and it is not from the docs. Two
// independent observations of the LIVE endpoint fix the shape:
//
//   1. Production logged `TikTok account cannot post publicly (allowed: [object Object])`.
//      That text is `Array.prototype.join` over the live list; only objects stringify so.
//   2. `lib/social/handlers/connections.js:184` reads the same live endpoint with
//      `(info.privacyLevels || []).map(p => p.value)` and reported the account healthy on
//      2026-09-22 — CLAUDE.md "Social Autopilot Phase 0", and
//      tasks/social-media-automation-plan.md:297 records `privacyLevels =
//      [PUBLIC_TO_EVERYONE]`. Had the list held plain strings, `p.value` would have been
//      `undefined` for every entry and that live check would have FAILED instead.
//
// Only `value` is load-bearing; `label` is carried because the Phase 0-era fixtures in
// connections.test.js record it, and nothing here reads it.
//
// It could not be widened by calling the API from this session: ZERNIO_API_KEY is a
// Sensitive Vercel variable and cannot be read back by design, so the remaining creator-info
// fields (commentDisabled / duetDisabled / stitchDisabled / the max-duration field name) are
// still unverified and are deliberately NOT asserted below.
const LIVE_PRIVACY_LEVELS = [{ value: 'PUBLIC_TO_EVERYONE', label: 'Everyone' }];

let savedKey;
beforeEach(() => { savedKey = process.env.ZERNIO_API_KEY; process.env.ZERNIO_API_KEY = 'test-zernio-key'; });
afterEach(() => { if (savedKey === undefined) delete process.env.ZERNIO_API_KEY; else process.env.ZERNIO_API_KEY = savedKey; });

describe('requestIdFor — the key Zernio deduplicates on', () => {
  it('is stable for the same story, format and slot', () => {
    const args = { contentId: 'c1', format: 'tiktok', at: '2026-06-15T08:00:00.000Z' };
    assert.equal(requestIdFor(args), requestIdFor({ ...args }));
  });

  it('changes when the story changes', () => {
    const a = requestIdFor({ contentId: 'c1', format: 'tiktok', at: 't' });
    const b = requestIdFor({ contentId: 'c2', format: 'tiktok', at: 't' });
    assert.notEqual(a, b);
  });

  it('changes when the format changes', () => {
    const a = requestIdFor({ contentId: 'c1', format: 'tiktok', at: 't' });
    const b = requestIdFor({ contentId: 'c1', format: 'reel', at: 't' });
    assert.notEqual(a, b);
  });

  it('changes when the slot changes', () => {
    const a = requestIdFor({ contentId: 'c1', format: 'tiktok', at: '2026-06-15T08:00:00.000Z' });
    const b = requestIdFor({ contentId: 'c1', format: 'tiktok', at: '2026-06-15T11:00:00.000Z' });
    assert.notEqual(a, b);
  });

  it('has the documented shape', () => {
    assert.equal(requestIdFor({ contentId: 'c1', format: 'reel', at: 'T' }), 'merlows-c1-reel-T');
  });
});

describe('tiktokSettings — refuses rather than guessing', () => {
  it('throws when the account cannot post publicly, instead of silently posting privately', () => {
    const info = { privacyLevels: ['MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'] };
    assert.throws(() => tiktokSettings(info), /cannot post publicly/);
  });

  it('throws when privacyLevels is empty, and names "none" in the message', () => {
    assert.throws(() => tiktokSettings({ privacyLevels: [] }), /allowed: none/);
  });

  it('throws when info itself is missing entirely', () => {
    assert.throws(() => tiktokSettings(undefined), /cannot post publicly/);
  });

  // The DOCUMENTED shape (docs.zernio.com/platforms/tiktok, Publish). The previous shape —
  // privacyLevel / disableComment / brandContentToggle — appears nowhere in Zernio's schema,
  // and was sent under a key Zernio does not read either, so none of it ever reached TikTok.
  it('returns the documented settings, with allow_* the INVERSE of the disabled toggles', () => {
    const info = { privacyLevels: ['PUBLIC_TO_EVERYONE'], allowComment: false, allowDuet: true, allowStitch: false };
    assert.deepEqual(tiktokSettings(info), {
      privacy_level: 'PUBLIC_TO_EVERYONE',
      allow_comment: false,
      allow_duet: true,
      allow_stitch: false,
      content_preview_confirmed: true,
      express_consent_given: true,
    });
  });

  it('reads the legacy disabled flags too, inverted, so a cached record still works', () => {
    const settings = tiktokSettings({ privacyLevels: ['PUBLIC_TO_EVERYONE'], commentDisabled: true, duetDisabled: false });
    assert.equal(settings.allow_comment, false, 'a disabled interaction must not come back allowed');
    assert.equal(settings.allow_duet, true);
  });

  // Without these TikTok does not publish: it files the video in the creator's inbox as a
  // draft, which Zernio then reports as "published" with a null URL. Five went that way.
  it('always sends both consent flags, which are what make it a post rather than a draft', () => {
    const settings = tiktokSettings({ privacyLevels: ['PUBLIC_TO_EVERYONE'] });
    assert.equal(settings.content_preview_confirmed, true);
    assert.equal(settings.express_consent_given, true);
  });
});

describe('privacy levels arrive as objects, not strings (the live Zernio shape)', () => {
  it('reads the enum out of Zernio\'s {value,label} objects', () => {
    assert.deepEqual(privacyLevelValues({ privacyLevels: LIVE_PRIVACY_LEVELS }), ['PUBLIC_TO_EVERYONE']);
  });

  it('creatorInfo hands on plain strings, so a caller can never join objects into "[object Object]"', async () => {
    const fetchFn = async () => ({ ok: true, json: async () => ({ privacyLevels: LIVE_PRIVACY_LEVELS }) });
    const info = await creatorInfo('6ab29cb58d284ffb212e1733', { fetchFn });
    assert.deepEqual(info.privacyLevels, ['PUBLIC_TO_EVERYONE']);
  });

  it('lets the real account post, instead of the production failure it actually produced', () => {
    // The exact regression: with the old parser this threw
    // "TikTok account cannot post publicly (allowed: [object Object])" and every TikTok
    // slot failed at the `rendered` stage.
    const settings = tiktokSettings({ privacyLevels: LIVE_PRIVACY_LEVELS });
    assert.equal(settings.privacy_level, 'PUBLIC_TO_EVERYONE');
  });

  it('works from a day-old cached record still holding the raw objects', () => {
    // `cachedCreatorInfo` (lib/social/pack/schedule.js) keeps the mapped record in KV for 24
    // hours. Records written by the broken build hold the raw objects, so normalising only
    // inside `creatorInfo` would leave TikTok posting blocked for a day after the deploy.
    const cached = { privacyLevels: LIVE_PRIVACY_LEVELS, commentDisabled: false };
    assert.equal(tiktokSettings(cached).privacy_level, 'PUBLIC_TO_EVERYONE');
  });

  it('STILL refuses an account that is only offered SELF_ONLY in that same object shape', () => {
    // The check must not have been loosened to make the shape fix work: a private post is a
    // video nobody sees, recorded as a success, against a daily quota.
    const info = { privacyLevels: [{ value: 'SELF_ONLY', label: 'Only me' }] };
    assert.throws(() => tiktokSettings(info), /cannot post publicly \(allowed: SELF_ONLY\)/);
  });

  it('drops an entry carrying no string value rather than counting it as a grant', () => {
    assert.deepEqual(privacyLevelValues({ privacyLevels: [{ label: 'Everyone' }, { value: 7 }, null] }), []);
    assert.throws(() => tiktokSettings({ privacyLevels: [{ label: 'PUBLIC_TO_EVERYONE' }] }), /cannot post publicly/);
  });

  it('names the raw shape in the error, so the next shape change is not another "[object Object]"', () => {
    let message = '';
    try { tiktokSettings({ privacyLevels: [{ level: 'PUBLIC_TO_EVERYONE' }] }); } catch (err) { message = err.message; }
    assert.doesNotMatch(message, /\[object Object\]/);
    assert.match(message, /unrecognised shape .*"level":"PUBLIC_TO_EVERYONE"/);
  });

  it('still reads the bare-string shape, so a snake_case creator-info response keeps working', () => {
    assert.deepEqual(privacyLevelValues({ privacy_level_options: ['SELF_ONLY'] }), ['SELF_ONLY']);
  });
});

describe('interpretPost — a 207 is a 2xx', () => {
  it('is NOT ok when the HTTP-level response is "success" but one platform inside it failed', () => {
    const data = {
      post: {
        id: 'p1', status: 'partial',
        platforms: [
          { platform: 'instagram', status: 'posted', platformPostId: 'ig1' },
          { platform: 'tiktok', status: 'failed', error: 'privacy_level not allowed' },
        ],
      },
    };
    const result = interpretPost(data);
    assert.equal(result.ok, false);
    assert.equal(result.accepted.length, 1);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0].platform, 'tiktok');
    assert.equal(result.failed[0].error, 'privacy_level not allowed');
  });

  it('is ok when every platform accepted', () => {
    const data = { post: { id: 'p1', platforms: [{ platform: 'instagram', status: 'posted' }, { platform: 'tiktok', status: 'processing' }] } };
    const result = interpretPost(data);
    assert.equal(result.ok, true);
    assert.equal(result.failed.length, 0);
    assert.equal(result.accepted.length, 2);
  });

  it('is not ok when every platform failed', () => {
    const data = { post: { platforms: [{ platform: 'instagram', status: 'error', error: 'boom' }] } };
    assert.equal(interpretPost(data).ok, false);
  });

  it('is not ok when there are no platforms at all — nothing accepted still fails the "ok" test', () => {
    const result = interpretPost({ post: { id: 'p1', platforms: [] } });
    assert.equal(result.ok, false);
    assert.deepEqual(result.accepted, []);
    assert.deepEqual(result.failed, []);
  });

  it('treats "rejected" and any case of failure status as failed', () => {
    const data = {
      post: {
        platforms: [
          { platform: 'tiktok', status: 'REJECTED', error: 'x' },
          { platform: 'instagram', status: 'Posted' },
        ],
      },
    };
    const result = interpretPost(data);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0].platform, 'tiktok');
    assert.equal(result.accepted.length, 1);
  });

  it('reads a bare post object with no {post} wrapper', () => {
    const data = { id: 'bare1', platforms: [{ platform: 'instagram', status: 'posted' }] };
    const result = interpretPost(data);
    assert.equal(result.postId, 'bare1');
    assert.equal(result.ok, true);
  });

  it('falls back through post.id, post._id and data.id for postId, in that order', () => {
    assert.equal(interpretPost({ post: { id: 'a' }, id: 'top' }).postId, 'a');
    assert.equal(interpretPost({ post: { _id: 'mongo-id' } }).postId, 'mongo-id');
    assert.equal(interpretPost({ post: {}, id: 'top-level' }).postId, 'top-level');
  });

  it('falls back to legacy field name aliases (name/postId/permalink/message)', () => {
    const data = {
      post: {
        platforms: [{ name: 'tiktok', status: 'failed', postId: 'legacy-id', permalink: 'https://x', message: 'legacy error' }],
      },
    };
    const result = interpretPost(data);
    assert.equal(result.results[0].platform, 'tiktok');
    assert.equal(result.results[0].postId, 'legacy-id');
    assert.equal(result.results[0].url, 'https://x');
    assert.equal(result.results[0].error, 'legacy error');
  });

  it('is not ok with no data at all — an empty/undefined response', () => {
    const result = interpretPost(undefined);
    assert.equal(result.ok, false);
    assert.equal(result.postId, null);
    assert.equal(result.status, null);
    assert.deepEqual(result.results, []);
  });

  it('lowercases post.status, and reports null rather than an empty string when absent', () => {
    assert.equal(interpretPost({ post: { status: 'PARTIAL', platforms: [] } }).status, 'partial');
    assert.equal(interpretPost({ post: { platforms: [] } }).status, null);
  });
});

describe('interpretPost — malformed platform entries', () => {
  // entry.platform is read directly, with no `entry?.platform` guard, so one null/undefined
  // element inside Zernio's `platforms` array crashes the whole read instead of surfacing a
  // diagnosable per-platform failure for the others. Documents current behaviour — see report.
  it('BUG: throws on a null entry inside platforms, instead of reporting it as an unreadable platform', () => {
    assert.throws(() => interpretPost({ post: { id: 'p1', platforms: [null] } }), TypeError);
  });

  it('surfaces the raw entry when a failed platform carries none of the known error field names', () => {
    const data = { post: { platforms: [{ platform: 'tiktok', status: 'failed', someWeirdField: 'oops' }] } };
    const result = interpretPost(data);
    assert.equal(result.failed[0].error, 'no error field; entry was {"someWeirdField":"oops"}');
  });

  it('reports "failed with no reason given" when a failed platform carries nothing extra at all', () => {
    const data = { post: { platforms: [{ platform: 'instagram', status: 'error' }] } };
    const result = interpretPost(data);
    assert.equal(result.failed[0].error, 'failed with no reason given');
  });

  it('never invents an error for a platform that did not fail, even with unexpected extra fields', () => {
    const data = { post: { platforms: [{ platform: 'instagram', status: 'posted', someExtra: 'x' }] } };
    const result = interpretPost(data);
    assert.equal(result.results[0].error, null);
  });
});

describe('creatorInfo', () => {
  // The DOCUMENTED creator-info shape: the interaction toggles live under
  // `postingLimits.interactionSettings` as `{ enabled, required, default }`, where
  // `enabled: false` means the creator switched that interaction off in the TikTok app. The
  // flat `commentDisabled` names this used to read appear NOWHERE in a real response, so
  // every toggle came back "nothing is disabled" regardless of what the creator had chosen.
  it('maps the documented creator-info response, reading the interaction toggles', async () => {
    const fetchFn = async () => ({
      ok: true,
      json: async () => ({
        creator: { nickname: 'merlows.news', canPostMore: true },
        privacyLevels: [{ value: 'PUBLIC_TO_EVERYONE', label: 'Public To Everyone' }],
        postingLimits: {
          maxVideoDurationSec: 600,
          interactionSettings: {
            allow_comment: { enabled: true, required: true, default: false },
            allow_duet: { enabled: false, required: true, default: false },
            allow_stitch: { enabled: false, required: true, default: false },
          },
        },
      }),
    });
    const info = await creatorInfo('acct1', { fetchFn });
    assert.deepEqual(info, {
      privacyLevels: ['PUBLIC_TO_EVERYONE'],
      allowComment: true,
      allowDuet: false,
      allowStitch: false,
      maxDurationSec: 600,
    });
  });

  it('falls back to the flat disabled flags when no interactionSettings are present', async () => {
    const fetchFn = async () => ({
      ok: true,
      json: async () => ({
        privacy_level_options: ['SELF_ONLY'], comment_disabled: true, duet_disabled: true, stitch_disabled: false, maxDurationSec: 30,
      }),
    });
    const info = await creatorInfo('acct1', { fetchFn });
    assert.deepEqual(info, {
      privacyLevels: ['SELF_ONLY'], allowComment: false, allowDuet: false, allowStitch: true, maxDurationSec: 30,
    });
  });

  it('defaults maxDurationSec to null (not 0 or NaN) when absent', async () => {
    const fetchFn = async () => ({ ok: true, json: async () => ({ privacyLevels: [] }) });
    const info = await creatorInfo('acct1', { fetchFn });
    assert.equal(info.maxDurationSec, null);
  });

  it('propagates the upstream error message when the HTTP response is not ok', async () => {
    const fetchFn = async () => ({ ok: false, status: 422, json: async () => ({ error: 'invalid account' }) });
    await assert.rejects(creatorInfo('acct1', { fetchFn }), /invalid account/);
  });
});

describe('createPost', () => {
  const base = { accountId: 'acct1', platform: 'instagram', caption: 'hello', scheduledFor: '2026-06-15T08:00:00.000Z' };

  it('rejects a non-https media URL without ever calling fetch', async () => {
    await assert.rejects(
      createPost({ ...base, mediaUrls: ['http://insecure.example/a.jpg'], fetchFn: throwFetch }),
      /media URL must be https/,
    );
  });

  it('rejects a relative path pretending to be a media URL', async () => {
    await assert.rejects(createPost({ ...base, mediaUrls: ['/uploads/a.jpg'], fetchFn: throwFetch }), /media URL must be https/);
  });

  it('rejects a data: URI', async () => {
    await assert.rejects(createPost({ ...base, mediaUrls: ['data:image/png;base64,AAAA'], fetchFn: throwFetch }), /media URL must be https/);
  });

  it('rejects when mediaUrls is empty', async () => {
    await assert.rejects(createPost({ ...base, mediaUrls: [], fetchFn: throwFetch }), /at least one media URL/);
  });

  it('rejects when mediaUrls is missing entirely', async () => {
    await assert.rejects(createPost({ ...base, fetchFn: throwFetch }), /at least one media URL/);
  });

  it('rejects an unsupported platform before ever calling fetch', async () => {
    await assert.rejects(
      createPost({ ...base, platform: 'twitter', mediaUrls: ['https://cdn.example/a.jpg'], fetchFn: throwFetch }),
      /Unsupported Zernio platform/,
    );
  });

  it('rejects the whole batch when even one of several URLs is not https', async () => {
    await assert.rejects(
      createPost({ ...base, mediaUrls: ['https://cdn.example/a.jpg', 'http://cdn.example/b.jpg'], fetchFn: throwFetch }),
      /media URL must be https/,
    );
  });

  it('throws when ZERNIO_API_KEY is not configured, without ever calling fetch', async () => {
    delete process.env.ZERNIO_API_KEY;
    await assert.rejects(
      createPost({ ...base, mediaUrls: ['https://cdn.example/a.jpg'], fetchFn: throwFetch }),
      /ZERNIO_API_KEY is not configured/,
    );
  });

  it('sends the expected request shape and returns an interpreted result on success', async () => {
    let seenUrl, seenInit;
    const fetchFn = async (url, init) => {
      seenUrl = url; seenInit = init;
      return { ok: true, json: async () => ({ post: { id: 'p1', platforms: [{ platform: 'instagram', status: 'posted' }] } }) };
    };
    const result = await createPost({ ...base, format: 'carousel', mediaUrls: ['https://cdn.example/a.jpg'], requestId: 'req-1', fetchFn });
    assert.equal(result.ok, true);
    assert.equal(result.postId, 'p1');
    assert.equal(seenUrl, 'https://zernio.com/api/v1/posts');
    assert.equal(seenInit.method, 'POST');
    assert.equal(seenInit.headers['x-request-id'], 'req-1');
    assert.equal(seenInit.headers['Content-Type'], 'application/json');
    assert.equal(seenInit.headers.Authorization, 'Bearer test-zernio-key');
    const body = JSON.parse(seenInit.body);
    // A carousel is inferred from having several media items, so it carries no extra field.
    assert.deepEqual(body.platforms, [{ platform: 'instagram', accountId: 'acct1' }]);
    assert.equal(body.mediaItems[0].url, 'https://cdn.example/a.jpg');
    assert.equal(body.scheduledFor, base.scheduledFor);
  });

  // Instagram reads the post type off the media — single video is a Reel, single image a feed
  // post, several items a carousel — and takes only the Story as an explicit flag. These
  // assertions are the shape in docs.zernio.com/platforms/instagram, NOT a shape we invented:
  // the first version of this suite asserted `instagram: { postType }`, a field Zernio ignores,
  // so the tests stayed green while every Story went out as a permanent feed post.
  describe('format — only a Story is declared; everything else is inferred from the media', () => {
    const captureBody = (bodyRef, platform = 'instagram') => async (url, init) => {
      bodyRef.body = JSON.parse(init.body);
      return { ok: true, json: async () => ({ post: { platforms: [{ platform, status: 'posted' }] } }) };
    };

    it('declares contentType "story" for a story, so it expires instead of living in the feed', async () => {
      const seen = {};
      await createPost({ ...base, format: 'story', mediaUrls: ['https://cdn.example/a.jpg'], fetchFn: captureBody(seen) });
      assert.deepEqual(seen.body.platforms[0].platformSpecificData, { contentType: 'story' });
    });

    it('sends no platformSpecificData for reel, carousel, no format, or an unknown format', async () => {
      for (const format of ['reel', 'carousel', undefined, 'not-a-real-format']) {
        const seen = {};
        // eslint-disable-next-line no-await-in-loop
        await createPost({ ...base, format, mediaUrls: ['https://cdn.example/a.jpg'], fetchFn: captureBody(seen) });
        assert.equal(
          seen.body.platforms[0].platformSpecificData, undefined,
          `format "${format}" must not declare a content type — Instagram infers it from the media`,
        );
      }
    });

    it('never sends platformSpecificData on a tiktok platform post', async () => {
      const seen = {};
      await createPost({
        ...base, platform: 'tiktok', format: 'tiktok',
        mediaUrls: ['https://cdn.example/a.mp4'], fetchFn: captureBody(seen, 'tiktok'),
      });
      assert.equal(seen.body.platforms[0].platformSpecificData, undefined);
      assert.equal(seen.body.platforms[0].instagram, undefined);
    });

    it('types every media item "video" for tiktok and reel', async () => {
      for (const format of ['tiktok', 'reel']) {
        let seenBody;
        const fetchFn = async (url, init) => {
          seenBody = JSON.parse(init.body);
          return { ok: true, json: async () => ({ post: { platforms: [{ platform: format === 'tiktok' ? 'tiktok' : 'instagram', status: 'posted' }] } }) };
        };
        // eslint-disable-next-line no-await-in-loop
        await createPost({
          ...base, platform: format === 'tiktok' ? 'tiktok' : 'instagram', format,
          mediaUrls: ['https://cdn.example/a.mp4', 'https://cdn.example/b.mp4'], fetchFn,
        });
        assert.deepEqual(seenBody.mediaItems.map((m) => m.type), ['video', 'video'], `format "${format}" must type its media as video`);
      }
    });

    it('types every media item "image" for carousel and story', async () => {
      for (const format of ['carousel', 'story']) {
        let seenBody;
        const fetchFn = async (url, init) => {
          seenBody = JSON.parse(init.body);
          return { ok: true, json: async () => ({ post: { platforms: [{ platform: 'instagram', status: 'posted' }] } }) };
        };
        // eslint-disable-next-line no-await-in-loop
        await createPost({ ...base, format, mediaUrls: ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'], fetchFn });
        assert.deepEqual(seenBody.mediaItems.map((m) => m.type), ['image', 'image'], `format "${format}" must type its media as image`);
      }
    });

    it('does not declare a Story when platform is tiktok, even though format is "story" — the condition gates on platform, not format alone', async () => {
      const seen = {};
      await createPost({
        ...base, platform: 'tiktok', format: 'story',
        mediaUrls: ['https://cdn.example/a.mp4'], fetchFn: captureBody(seen, 'tiktok'),
      });
      assert.equal(seen.body.platforms[0].platformSpecificData, undefined);
    });

    // Media typing has no idea what a URL actually points to — it types every item purely from
    // `format`, so a carousel slide that happens to be a video (Instagram carousels DO allow
    // video slides) is still declared "image", and a reel asset that happens to be a still image
    // is still declared "video". Neither is caught locally; Zernio would have to reject it, or
    // silently accept a mistyped asset. Documents current behaviour — see report.
    it('types a carousel item "image" even when the URL is obviously a video file, because type comes from format alone', async () => {
      let seenBody;
      const fetchFn = async (url, init) => {
        seenBody = JSON.parse(init.body);
        return { ok: true, json: async () => ({ post: { platforms: [{ platform: 'instagram', status: 'posted' }] } }) };
      };
      await createPost({ ...base, format: 'carousel', mediaUrls: ['https://cdn.example/clip.mp4', 'https://cdn.example/photo.jpg'], fetchFn });
      assert.deepEqual(seenBody.mediaItems.map((m) => m.type), ['image', 'image']);
    });

    it('types a reel item "video" even when the URL is obviously an image file, because type comes from format alone', async () => {
      let seenBody;
      const fetchFn = async (url, init) => {
        seenBody = JSON.parse(init.body);
        return { ok: true, json: async () => ({ post: { platforms: [{ platform: 'instagram', status: 'posted' }] } }) };
      };
      await createPost({ ...base, format: 'reel', mediaUrls: ['https://cdn.example/photo.jpg'], fetchFn });
      assert.deepEqual(seenBody.mediaItems.map((m) => m.type), ['video']);
    });
  });

  it('surfaces a 207-partial as ok:false end to end, even though the HTTP status is a success', async () => {
    const fetchFn = async () => ({
      ok: true, status: 207,
      json: async () => ({
        post: {
          id: 'p1',
          platforms: [
            { platform: 'instagram', status: 'posted' },
            { platform: 'tiktok', status: 'failed', error: 'duplicate' },
          ],
        },
      }),
    });
    const result = await createPost({ ...base, platform: 'tiktok', mediaUrls: ['https://cdn.example/a.mp4'], fetchFn });
    assert.equal(result.ok, false);
    assert.equal(result.failed[0].platform, 'tiktok');
    assert.equal(result.failed[0].error, 'duplicate');
  });

  it('throws with the upstream error message when the HTTP response itself is not ok', async () => {
    const fetchFn = async () => ({ ok: false, status: 500, json: async () => ({ message: 'upstream down' }) });
    await assert.rejects(
      createPost({ ...base, mediaUrls: ['https://cdn.example/a.jpg'], fetchFn }),
      /upstream down/,
    );
  });

  it('only carries the tiktok settings object for a tiktok platform post', async () => {
    let seenBody;
    const fetchFn = async (url, init) => {
      seenBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ post: { platforms: [{ platform: 'instagram', status: 'posted' }] } }) };
    };
    await createPost({ ...base, mediaUrls: ['https://cdn.example/a.jpg'], tiktok: { privacyLevel: 'PUBLIC_TO_EVERYONE' }, fetchFn });
    assert.equal(seenBody.platforms[0].tiktok, undefined); // platform is instagram — tiktok settings must not leak in
  });
});

describe('getPost / retryPost — thin wrappers that still go through interpretPost', () => {
  it('getPost hits the expected path and interprets the response', async () => {
    let seenUrl, seenInit;
    const fetchFn = async (url, init) => {
      seenUrl = url; seenInit = init;
      return { ok: true, json: async () => ({ post: { id: 'p1', platforms: [{ platform: 'instagram', status: 'posted' }] } }) };
    };
    const result = await getPost('p1', { fetchFn });
    assert.equal(seenUrl, 'https://zernio.com/api/v1/posts/p1');
    assert.equal(seenInit.method, 'GET');
    assert.equal(result.ok, true);
  });

  it('retryPost POSTs to the retry path with the given request id', async () => {
    let seenUrl, seenInit;
    const fetchFn = async (url, init) => {
      seenUrl = url; seenInit = init;
      return { ok: true, json: async () => ({ post: { platforms: [{ platform: 'tiktok', status: 'posted' }] } }) };
    };
    const result = await retryPost('p1', { requestId: 'retry-1', fetchFn });
    assert.equal(seenUrl, 'https://zernio.com/api/v1/posts/p1/retry');
    assert.equal(seenInit.method, 'POST');
    assert.equal(seenInit.headers['x-request-id'], 'retry-1');
    assert.equal(result.ok, true);
  });

  it('retryPost still surfaces a 207-style partial failure as ok:false', async () => {
    const fetchFn = async () => ({
      ok: true,
      json: async () => ({ post: { platforms: [{ platform: 'tiktok', status: 'failed', error: 'still broken' }] } }),
    });
    const result = await retryPost('p1', { fetchFn });
    assert.equal(result.ok, false);
  });
});

describe('ZERNIO_PLATFORMS', () => {
  it('is exactly instagram and tiktok — a pack never reaches anything else', () => {
    assert.deepEqual(ZERNIO_PLATFORMS, ['instagram', 'tiktok']);
  });
});

// A fetch stub that records every call and answers with `reply` (or `reply(url, init)`).
const recorder = (reply, { ok = true, status = 200 } = {}) => {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, init });
    const body = typeof reply === 'function' ? reply(url, init) : reply;
    return { ok, status, json: async () => body };
  };
  return { calls, fetchFn };
};

describe('interpretAutomation — one shape whichever endpoint answered', () => {
  it('reads the list-endpoint counter names', () => {
    const a = interpretAutomation({
      id: 'a1', isActive: true, platformPostId: 'ig1', keywords: ['VOICES'], matchMode: 'word',
      stats: { triggered: 9, dmsSent: 7, dmsFailed: 2, read: 5, linkClicks: 3, uniqueContacts: 6 },
    });
    assert.deepEqual(a.stats, { triggered: 9, sent: 7, failed: 2, read: 5, linkClicks: 3, uniqueContacts: 6 });
    assert.equal(a.id, 'a1');
    assert.equal(a.platformPostId, 'ig1');
  });

  it('reads the create-endpoint counter names, inside the {automation} wrapper', () => {
    const a = interpretAutomation({ success: true, automation: { id: 'a2', stats: { totalTriggered: 4, totalSent: 3, totalFailed: 1 } } });
    assert.equal(a.id, 'a2');
    assert.equal(a.stats.triggered, 4);
    assert.equal(a.stats.sent, 3);
    assert.equal(a.stats.failed, 1);
  });

  it('never reports a delivered figure — Instagram has no delivery receipt', () => {
    const a = interpretAutomation({ id: 'a3', stats: { delivered: 99, dmsSent: 99 } });
    assert.equal('delivered' in a.stats, false);
  });

  it('turns missing or junk counters into 0, not NaN or undefined', () => {
    const a = interpretAutomation({ id: 'a4', stats: { dmsSent: 'lots' } });
    assert.equal(a.stats.sent, 0);
    assert.equal(a.stats.read, 0);
    assert.equal(interpretAutomation(undefined).stats.triggered, 0);
  });

  // Every Zernio automation is created live (Z1 spike), so a missing field must read as live:
  // reading it as paused would make the collision check skip an automation that is answering.
  it('reports live unless Zernio explicitly says it is paused', () => {
    assert.equal(interpretAutomation({ id: 'x' }).isActive, true);
    assert.equal(interpretAutomation({ id: 'x', isActive: true }).isActive, true);
    assert.equal(interpretAutomation({ id: 'x', isActive: false }).isActive, false);
  });
});

describe('createCommentAutomation', () => {
  it('POSTs the payload unchanged, with the auth header and optional request id', async () => {
    const { calls, fetchFn } = recorder({ success: true, automation: { id: 'new1', isActive: false } });
    const payload = { profileId: 'p', accountId: 'acc', name: 'n', dmMessage: 'hi', keywords: ['VOICES'] };
    const result = await createCommentAutomation(payload, { requestId: 'merlows-dm-ig1', fetchFn });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://zernio.com/api/v1/comment-automations');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer test-zernio-key');
    assert.equal(calls[0].init.headers['x-request-id'], 'merlows-dm-ig1');
    assert.deepEqual(JSON.parse(calls[0].init.body), payload);
    assert.equal(result.id, 'new1');
  });

  it('surfaces a 409 (second automation on one post) with its status, so a caller can treat it as done', async () => {
    const { fetchFn } = recorder({ error: 'An active automation already exists for this post' }, { ok: false, status: 409 });
    await assert.rejects(
      createCommentAutomation({ dmMessage: 'x' }, { fetchFn }),
      (err) => err.status === 409 && /already exists/.test(err.message),
    );
  });

  it('refuses to run without ZERNIO_API_KEY, without calling fetch', async () => {
    delete process.env.ZERNIO_API_KEY;
    await assert.rejects(createCommentAutomation({ dmMessage: 'x' }, { fetchFn: throwFetch }), /ZERNIO_API_KEY is not configured/);
  });

  it('uses a separate apiKey when one is given, on every automation call', async () => {
    const { calls, fetchFn } = recorder({ success: true, automation: { id: 'a1' }, automations: [], logs: [] });
    const apiKey = 'dm-only-key';
    await createCommentAutomation({ dmMessage: 'x' }, { fetchFn, apiKey });
    await updateCommentAutomation('a1', { isActive: false }, { fetchFn, apiKey });
    await deleteCommentAutomation('a1', { fetchFn, apiKey });
    await listCommentAutomations({ profileId: 'p', fetchFn, apiKey });
    await getCommentAutomationLogs('a1', { fetchFn, apiKey });
    assert.equal(calls.length, 5);
    for (const call of calls) assert.equal(call.init.headers.Authorization, 'Bearer dm-only-key', call.url);
  });
});

describe('updateCommentAutomation / deleteCommentAutomation', () => {
  it('PATCHes only the given fields to the automation path', async () => {
    const { calls, fetchFn } = recorder({ success: true, automation: { id: 'a/1', isActive: false } });
    const result = await updateCommentAutomation('a/1', { isActive: false }, { fetchFn });
    assert.equal(calls[0].url, 'https://zernio.com/api/v1/comment-automations/a%2F1');
    assert.equal(calls[0].init.method, 'PATCH');
    assert.deepEqual(JSON.parse(calls[0].init.body), { isActive: false });
    assert.equal(result.isActive, false);
  });

  it('DELETEs with no body', async () => {
    const { calls, fetchFn } = recorder({});
    const result = await deleteCommentAutomation('a1', { fetchFn });
    assert.equal(calls[0].url, 'https://zernio.com/api/v1/comment-automations/a1');
    assert.equal(calls[0].init.method, 'DELETE');
    assert.equal(calls[0].init.body, undefined);
    assert.deepEqual(result, { id: 'a1', deleted: true });
  });

  it('refuses an empty id rather than PATCHing or DELETEing the collection path', async () => {
    await assert.rejects(updateCommentAutomation('', { isActive: false }, { fetchFn: throwFetch }), /id is required/);
    await assert.rejects(deleteCommentAutomation(undefined, { fetchFn: throwFetch }), /id is required/);
  });
});

describe('listCommentAutomations', () => {
  it('filters by profile and interprets every entry', async () => {
    const { calls, fetchFn } = recorder({ success: true, automations: [{ id: 'a1', stats: { dmsSent: 2 } }, { id: 'a2' }] });
    const list = await listCommentAutomations({ profileId: 'prof 1', fetchFn });
    assert.equal(calls[0].url, 'https://zernio.com/api/v1/comment-automations?profileId=prof%201');
    assert.equal(calls[0].init.method, 'GET');
    assert.deepEqual(list.map((a) => a.id), ['a1', 'a2']);
    assert.equal(list[0].stats.sent, 2);
  });

  it('returns an empty list when the response has no automations array', async () => {
    const { fetchFn } = recorder({ success: true });
    assert.deepEqual(await listCommentAutomations({ fetchFn }), []);
  });
});

describe('getCommentAutomationLogs', () => {
  it('pages with limit/skip and filters by status', async () => {
    const { calls, fetchFn } = recorder({ logs: [{ commentId: 'c1' }], total: 1, misses: { excluded: 0 } });
    const page = await getCommentAutomationLogs('a1', { status: 'failed', limit: 20, skip: 40, fetchFn });
    const url = new URL(calls[0].url);
    assert.equal(url.pathname, '/api/v1/comment-automations/a1/logs');
    assert.equal(url.searchParams.get('status'), 'failed');
    assert.equal(url.searchParams.get('limit'), '20');
    assert.equal(url.searchParams.get('skip'), '40');
    assert.deepEqual(page, { logs: [{ commentId: 'c1' }], total: 1, misses: { excluded: 0 } });
  });

  it('clamps limit into Zernio\'s 1–200 range and floors a negative skip at 0', async () => {
    const { calls, fetchFn } = recorder({ logs: [] });
    await getCommentAutomationLogs('a1', { limit: 5000, skip: -3, fetchFn });
    const url = new URL(calls[0].url);
    assert.equal(url.searchParams.get('limit'), '200');
    assert.equal(url.searchParams.get('skip'), '0');
  });

  it('rejects an unknown status before calling fetch', async () => {
    await assert.rejects(getCommentAutomationLogs('a1', { status: 'delivered', fetchFn: throwFetch }), /unknown log status/);
  });

  it('reports total as null, not 0, when Zernio does not send one', async () => {
    const { fetchFn } = recorder({ data: [{ commentId: 'c9' }] });
    const page = await getCommentAutomationLogs('a1', { fetchFn });
    assert.equal(page.total, null);
    assert.deepEqual(page.logs, [{ commentId: 'c9' }]);
  });
});

// ── an unreadable 2xx body ───────────────────────────────────────────────────
// `{}` on a failed parse used to be returned as success. On a MUTATING call that is the
// dangerous direction: the request landed, so Zernio holds a post, and we would report it as
// having no id — and a caller that retries creates a second post nothing can delete.
describe('zernioFetch — a 2xx whose body cannot be read', () => {
  const unreadable = async () => ({
    ok: true,
    status: 200,
    json: async () => { throw Object.assign(new SyntaxError('Unexpected end of JSON input')); },
  });

  it('throws on a POST, flagged as having reached Zernio, rather than reporting a post with no id', async () => {
    await assert.rejects(
      createPost({
        accountId: 'acct1', platform: 'instagram', format: 'reel',
        mediaUrls: ['https://cdn.example/a.mp4'], scheduledFor: '2026-06-15T12:00:00.000Z',
        fetchFn: unreadable,
      }),
      (err) => {
        assert.match(err.message, /body could not be read/);
        assert.equal(err.status, 200);
        assert.equal(err.reachedZernio, true, 'the caller must know the request landed before it retries');
        return true;
      },
    );
  });

  // A read is a different matter: GET and DELETE legitimately answer with an empty body, and
  // failing those would break deleting an automation.
  it('still tolerates an empty body on a DELETE', async () => {
    await deleteCommentAutomation('a1', { fetchFn: unreadable });
  });
});

// ── rehostMedia ──────────────────────────────────────────────────────────────
// TikTok fetches media by URL and refuses any domain not verified against the calling app, so
// our Blob URL is rejected with error 40002. The file has to be copied into Zernio's own
// storage, which is what this does. Every failure below is one that would otherwise surface
// later as a post that published without its video.
describe('rehostMedia', () => {
  const PRESIGNED = {
    uploadUrl: 'https://bucket.r2.cloudflarestorage.com/temp/1_abc_reel.mp4?X-Amz-Signature=sig',
    publicUrl: 'https://media.zernio.com/temp/1_abc_reel.mp4',
  };

  // Every leg of the upload, each overridable so a test can break exactly one.
  const upload = ({ source, presign, put } = {}) => {
    const seen = {};
    const fetchFn = async (url, init) => {
      const href = String(url);
      if (href.includes('/media/presign')) {
        seen.presign = JSON.parse(init.body);
        return presign ?? { ok: true, json: async () => PRESIGNED };
      }
      if (href.includes('r2.cloudflarestorage.com')) {
        seen.put = { method: init.method, headers: init.headers, body: init.body, redirect: init.redirect };
        return put ?? { ok: true, status: 200, json: async () => ({}) };
      }
      seen.read = href;
      return source ?? {
        ok: true,
        headers: { get: () => 'video/mp4' },
        arrayBuffer: async () => new Uint8Array([1, 2, 3, 4, 5]).buffer,
      };
    };
    return { seen, fetchFn };
  };

  beforeEach(() => { process.env.ZERNIO_API_KEY = 'test-zernio-key'; });
  afterEach(() => {
    delete process.env.ZERNIO_API_KEY;
    delete process.env.SOCIAL_MAX_REHOST_BYTES;
    delete process.env.ZERNIO_UPLOAD_TIMEOUT_MS;
  });

  it('presigns, PUTs the bytes and returns the Zernio-hosted URL', async () => {
    const { seen, fetchFn } = upload();
    const result = await rehostMedia('https://cdn.example/social/abc/reel-xyz.mp4', { fetchFn });

    assert.deepEqual(seen.presign, { filename: 'reel-xyz.mp4', contentType: 'video/mp4', size: 5 });
    assert.equal(seen.put.method, 'PUT');
    assert.equal(seen.put.headers['Content-Type'], 'video/mp4');
    assert.equal(seen.put.body.length, 5);
    assert.equal(result.url, PRESIGNED.publicUrl);
    assert.equal(result.bytes, 5);
  });

  // Storage takes the signature in the URL as the credential. Sending our API key to a third
  // party's bucket would leak it for nothing.
  it('sends no Authorization header on the PUT to storage', async () => {
    const { seen, fetchFn } = upload();
    await rehostMedia('https://cdn.example/reel.mp4', { fetchFn });
    assert.equal(seen.put.headers.Authorization, undefined);
  });

  it('reports an upload deadline 7 days out, which is when Zernio deletes an unused upload', async () => {
    const { fetchFn } = upload();
    const before = Date.now();
    const result = await rehostMedia('https://cdn.example/reel.mp4', { fetchFn });
    assert.ok(result.expiresAt >= before + UPLOAD_TTL_MS);
    assert.equal(UPLOAD_TTL_MS, 7 * 24 * 60 * 60 * 1000);
  });

  it('falls back to the file extension when the source serves no usable content type', async () => {
    const { seen, fetchFn } = upload({
      source: {
        ok: true,
        headers: { get: () => 'application/octet-stream' },
        arrayBuffer: async () => new Uint8Array([1]).buffer,
      },
    });
    await rehostMedia('https://cdn.example/reel.mp4', { fetchFn });
    // NOT application/octet-stream — presign rejects that with a 400.
    assert.equal(seen.presign.contentType, 'video/mp4');
  });

  it('refuses when neither the served type nor the extension names a real format', async () => {
    const { fetchFn } = upload({
      source: {
        ok: true,
        headers: { get: () => 'application/octet-stream' },
        arrayBuffer: async () => new Uint8Array([1]).buffer,
      },
    });
    await assert.rejects(rehostMedia('https://cdn.example/reel', { fetchFn }), /cannot tell Zernio what kind of file/);
  });

  it('refuses a non-https source rather than asking Zernio to fetch it', async () => {
    await assert.rejects(rehostMedia('http://cdn.example/reel.mp4', { fetchFn: throwFetch }), /must be https/);
    await assert.rejects(rehostMedia('data:video/mp4;base64,AAAA', { fetchFn: throwFetch }), /must be https/);
  });

  it('refuses an unreadable source before paying for a presign', async () => {
    const { seen, fetchFn } = upload({ source: { ok: false, status: 404 } });
    await assert.rejects(rehostMedia('https://cdn.example/gone.mp4', { fetchFn }), /HTTP 404/);
    assert.equal(seen.presign, undefined);
  });

  // A zero-byte render uploads happily and publishes as a broken post, which is the one
  // outcome nothing downstream can detect.
  it('refuses an empty file', async () => {
    const { seen, fetchFn } = upload({
      source: { ok: true, headers: { get: () => 'video/mp4' }, arrayBuffer: async () => new ArrayBuffer(0) },
    });
    await assert.rejects(rehostMedia('https://cdn.example/reel.mp4', { fetchFn }), /empty/);
    assert.equal(seen.presign, undefined);
  });

  it('refuses a file over the memory cap instead of trying to buffer it twice', async () => {
    process.env.SOCIAL_MAX_REHOST_BYTES = '4';
    const { seen, fetchFn } = upload();
    await assert.rejects(rehostMedia('https://cdn.example/reel.mp4', { fetchFn }), /over the 4 cap/);
    assert.equal(seen.presign, undefined);
  });

  it('throws when presign answers without an upload URL, rather than posting a URL that is not there', async () => {
    const { fetchFn } = upload({ presign: { ok: true, json: async () => ({ key: 'temp/x' }) } });
    await assert.rejects(rehostMedia('https://cdn.example/reel.mp4', { fetchFn }), /no upload URL/);
  });

  it('throws when the PUT to storage fails, rather than returning a URL with nothing behind it', async () => {
    const { fetchFn } = upload({ put: { ok: false, status: 403, json: async () => ({}) } });
    await assert.rejects(rehostMedia('https://cdn.example/reel.mp4', { fetchFn }), /upload to Zernio storage failed/);
  });

  describe('filename derivation from the source URL', () => {
    it('derives the filename from the path only, dropping any query string', async () => {
      const { seen, fetchFn } = upload();
      await rehostMedia('https://cdn.example/social/abc/reel-final.mp4?sig=deadbeef&exp=123', { fetchFn });
      assert.equal(seen.presign.filename, 'reel-final.mp4');
      assert.equal(seen.presign.contentType, 'video/mp4');
    });

    it('falls back to "asset" as the filename when the URL ends in a trailing slash and has no last segment', async () => {
      const { seen, fetchFn } = upload();
      await rehostMedia('https://cdn.example/social/abc/', { fetchFn });
      assert.equal(seen.presign.filename, 'asset');
      // Resolved from the served Content-Type header, not from the (absent) extension.
      assert.equal(seen.presign.contentType, 'video/mp4');
    });

    it('refuses a trailing-slash URL with no usable content type, naming "asset" in the error', async () => {
      const { fetchFn } = upload({
        source: { ok: true, headers: { get: () => 'application/octet-stream' }, arrayBuffer: async () => new Uint8Array([1]).buffer },
      });
      await assert.rejects(rehostMedia('https://cdn.example/social/abc/', { fetchFn }), /name "asset"/);
    });

    it('decodes a percent-encoded path segment into the real filename', async () => {
      const { seen, fetchFn } = upload();
      await rehostMedia('https://cdn.example/social/my%20video%20final.mp4', { fetchFn });
      assert.equal(seen.presign.filename, 'my video final.mp4');
      assert.equal(seen.presign.contentType, 'video/mp4');
    });
  });

  // schedule.js's TikTok path runs `media.map((url) => rehostMedia(url, ...))` through
  // `Promise.all`, so a multi-item batch (were one ever to exist — see report on whether that
  // path is reachable today) has no way to undo an item that already finished uploading once a
  // sibling item fails. This proves the "no rollback" behaviour directly against rehostMedia.
  it('does not roll back an earlier successful upload when a sibling item in the same Promise.all batch fails', async () => {
    const good = upload();
    const bad = upload({ source: { ok: false, status: 404 } });
    // Hold references to both in-flight promises: Promise.all rejects as soon as the FIRST one
    // rejects, without waiting for or cancelling the other, so the "good" upload keeps running
    // in the background. Awaiting it separately afterwards is what proves that.
    const goodPromise = rehostMedia('https://cdn.example/good.mp4', { fetchFn: good.fetchFn });
    const badPromise = rehostMedia('https://cdn.example/bad.mp4', { fetchFn: bad.fetchFn });
    await assert.rejects(Promise.all([goodPromise, badPromise]), /HTTP 404/);
    await goodPromise; // let the still-running successful upload actually finish
    assert.ok(good.seen.put, 'the successful upload reached Zernio storage — nothing undoes it once the sibling failed');
  });

  // ── The two ways this call kills the function rather than failing ──────────
  // A killed function throws nothing, so `stageSchedule` never records the posts it already
  // sent to Zernio; the next tick re-plans the story into a different slot, which produces a
  // different requestIdFor, which Zernio does not dedupe — and the story posts twice to
  // accounts no API can delete from. Both guards below exist to keep a failure a FAILURE.

  it('refuses on the declared content-length WITHOUT reading the body, so the cap can prevent the allocation rather than describe it', async () => {
    process.env.SOCIAL_MAX_REHOST_BYTES = '1000';
    let readBody = false;
    const fetchFn = async (url) => {
      if (String(url).includes('/media/presign')) throw new Error('must not presign a file it has already refused');
      return {
        ok: true,
        headers: { get: (h) => (h.toLowerCase() === 'content-length' ? '5000' : 'video/mp4') },
        arrayBuffer: async () => { readBody = true; return new ArrayBuffer(5000); },
      };
    };
    await assert.rejects(rehostMedia('https://cdn.example/huge.mp4', { fetchFn }), /declares 5000 bytes, over the 1000 cap/);
    assert.equal(readBody, false, 'the body was buffered anyway — the cap cannot prevent an OOM it only measures afterwards');
  });

  it('still refuses after reading when the source declares no length at all', async () => {
    process.env.SOCIAL_MAX_REHOST_BYTES = '2';
    const fetchFn = async (url) => {
      if (String(url).includes('/media/presign')) throw new Error('must not presign an over-cap file');
      return {
        ok: true,
        headers: { get: (h) => (h.toLowerCase() === 'content-length' ? null : 'video/mp4') },
        arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
      };
    };
    await assert.rejects(rehostMedia('https://cdn.example/reel.mp4', { fetchFn }), /is 4 bytes, over the 2 cap/);
  });

  // A stall is the dangerous case, not an error: undici's defaults are INACTIVITY timeouts of
  // 300s, the same as the function's own ceiling, and a slow-but-progressing transfer never
  // trips them at all.
  const hangs = () => async (url, init) => new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => {
      reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
    });
  });

  it('times out a stalled read of our own media instead of running to the function kill', async () => {
    process.env.ZERNIO_UPLOAD_TIMEOUT_MS = '120';
    await assert.rejects(
      rehostMedia('https://cdn.example/reel.mp4', { fetchFn: hangs() }),
      /reading media to upload timed out after 120ms/,
    );
  });

  it('times out a stalled upload to storage', async () => {
    // Budget spans the WHOLE rehost, so this must leave enough for the read leg to finish and
    // the PUT to then stall inside what is left.
    process.env.ZERNIO_UPLOAD_TIMEOUT_MS = '300';
    const stallOnPut = async (url, init) => {
      const href = String(url);
      if (href.includes('/media/presign')) return { ok: true, json: async () => PRESIGNED };
      if (href.includes('r2.cloudflarestorage.com')) return hangs()(url, init);
      return { ok: true, headers: { get: () => 'video/mp4' }, arrayBuffer: async () => new Uint8Array([1]).buffer };
    };
    await assert.rejects(
      rehostMedia('https://cdn.example/reel.mp4', { fetchFn: stallOnPut }),
      /upload to Zernio storage timed out after/,
    );
  });

  // THE CASE THE FIRST VERSION OF THIS SUITE COULD NOT CATCH. `fetch` resolves when the
  // response HEADERS arrive; a deadline that stops there bounds nothing about the body, and a
  // body is where a whole video lives. `hangs()` above never resolves the fetch at all, so it
  // only ever exercised the headers window — the download could hang for the full 300s
  // function lifetime with both stall tests green.
  it('times out a source that sends headers and then stalls its BODY', async () => {
    process.env.ZERNIO_UPLOAD_TIMEOUT_MS = '150';
    const headersThenStall = async (url, init) => {
      if (String(url).includes('/media/presign')) throw new Error('must not presign a file it never finished reading');
      return {
        ok: true,
        headers: { get: (h) => (h.toLowerCase() === 'content-length' ? null : 'video/mp4') },
        // Resolves the fetch immediately, then never delivers the bytes — until the abort.
        arrayBuffer: () => new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
          });
        }),
      };
    };
    await assert.rejects(
      rehostMedia('https://cdn.example/reel.mp4', { fetchFn: headersThenStall }),
      /reading media to upload timed out after 150ms/,
    );
  });

  // `content-length` counts COMPRESSED bytes and undici decompresses transparently, so an
  // honest length can still blow the cap. Reading chunk by chunk is where that is caught.
  it('refuses mid-transfer when a streamed body exceeds the cap despite an honest declared length', async () => {
    process.env.SOCIAL_MAX_REHOST_BYTES = '10';
    let cancelled = false;
    const streamed = async (url) => {
      if (String(url).includes('/media/presign')) throw new Error('must not presign a file that blew the cap');
      let sent = 0;
      return {
        ok: true,
        headers: { get: (h) => (h.toLowerCase() === 'content-length' ? '8' : 'video/mp4') },
        body: {
          getReader: () => ({
            read: async () => (sent++ < 5 ? { done: false, value: new Uint8Array(4) } : { done: true }),
            cancel: async () => { cancelled = true; },
          }),
        },
      };
    };
    await assert.rejects(rehostMedia('https://cdn.example/reel.mp4', { fetchFn: streamed }), /exceeded the 10 cap mid-transfer/);
    assert.equal(cancelled, true, 'the stalled/oversized stream must be torn down, not left open');
  });

  it('reads a streamed body normally when it stays inside the cap', async () => {
    const streamed = (seen) => async (url, init) => {
      const href = String(url);
      if (href.includes('/media/presign')) { seen.presign = JSON.parse(init.body); return { ok: true, json: async () => PRESIGNED }; }
      if (href.includes('r2.cloudflarestorage.com')) { seen.put = { body: init.body }; return { ok: true, status: 200 }; }
      let sent = 0;
      return {
        ok: true,
        headers: { get: (h) => (h.toLowerCase() === 'content-length' ? '6' : 'video/mp4') },
        body: { getReader: () => ({ read: async () => (sent++ < 2 ? { done: false, value: new Uint8Array([1, 2, 3]) } : { done: true }) }) },
      };
    };
    const seen = {};
    const result = await rehostMedia('https://cdn.example/reel.mp4', { fetchFn: streamed(seen) });
    assert.equal(seen.presign.size, 6);
    assert.equal(seen.put.body.length, 6);
    assert.equal(result.bytes, 6);
  });

  // The caller's tick is the real constraint, not a fixed env number: a per-leg deadline can
  // be honoured exactly and the function still be killed because the tick had less left.
  // "No budget given" and "given, and there is none left" are OPPOSITE instructions, and
  // conflating them failed in the worst direction: a caller down to its last second passes a
  // number at or below zero, a `budgetMs > 0` test rejects it, and the full default deadline
  // gets handed to the one caller that must not start at all. This is defence in depth —
  // `ensureTiktokUpload` also refuses — but it is the layer that owns the deadline.
  it('refuses a budget that is already spent instead of falling back to the default deadline', async () => {
    process.env.ZERNIO_UPLOAD_TIMEOUT_MS = '600000';
    for (const budgetMs of [0, -8000]) {
      // eslint-disable-next-line no-await-in-loop
      await assert.rejects(
        rehostMedia('https://cdn.example/reel.mp4', { fetchFn: throwFetch, budgetMs }),
        /no time left in the budget/,
        `budgetMs ${budgetMs} was treated as "not given"`,
      );
    }
  });

  it('honours a caller-supplied budget smaller than the env default', async () => {
    process.env.ZERNIO_UPLOAD_TIMEOUT_MS = '600000';
    await assert.rejects(
      rehostMedia('https://cdn.example/reel.mp4', { fetchFn: hangs(), budgetMs: 120 }),
      /reading media to upload timed out after 120ms/,
    );
  });

  // ── Where the file is allowed to go ───────────────────────────────────────
  // `uploadUrl` is a URL out of a response body that we then send the whole file to, with no
  // credential, from our egress IP. Unconstrained it is a way to push 100 MB to any host, and
  // it hands out the finished cut before it is public.

  it('refuses an upload URL on a host that is not Zernio storage, without sending the file', async () => {
    const { seen, fetchFn } = upload({
      presign: { ok: true, json: async () => ({ uploadUrl: 'https://attacker.example/collect', publicUrl: PRESIGNED.publicUrl }) },
    });
    await assert.rejects(rehostMedia('https://cdn.example/reel.mp4', { fetchFn }), /upload URL we will not use: https:\/\/attacker\.example/);
    assert.equal(seen.put, undefined, 'the file was sent to a host that is not on the list');
  });

  it('refuses a plain-http upload URL even on an allowed host', async () => {
    const { seen, fetchFn } = upload({
      presign: {
        ok: true,
        json: async () => ({ uploadUrl: 'http://bucket.r2.cloudflarestorage.com/temp/x', publicUrl: PRESIGNED.publicUrl }),
      },
    });
    await assert.rejects(rehostMedia('https://cdn.example/reel.mp4', { fetchFn }), /upload URL we will not use/);
    assert.equal(seen.put, undefined);
  });

  // A lookalike must not pass: the check is a host-suffix match, not "contains".
  it('refuses a host that merely ends with an allowed name as a substring', async () => {
    const { fetchFn } = upload({
      presign: {
        ok: true,
        json: async () => ({ uploadUrl: 'https://r2.cloudflarestorage.com.attacker.example/x', publicUrl: PRESIGNED.publicUrl }),
      },
    });
    await assert.rejects(rehostMedia('https://cdn.example/reel.mp4', { fetchFn }), /upload URL we will not use/);
  });

  // Deliberately NOT host-restricted, unlike the upload URL. We send the file to `uploadUrl`,
  // so an unexpected host there is a hard failure; `publicUrl` is only handed back to Zernio
  // to fetch, and the host patterns have never been seen in a real presign response — so
  // enforcing them would risk failing every TikTok post, after the upload was paid for, to
  // guard almost nothing. It warns and carries on so the first live post reveals the real host.
  it('accepts an https public URL on an unrecognised host, warning rather than failing the post', async () => {
    const warnings = [];
    const realWarn = console.warn;
    console.warn = (msg) => warnings.push(String(msg));
    try {
      const { fetchFn } = upload({
        presign: { ok: true, json: async () => ({ uploadUrl: PRESIGNED.uploadUrl, publicUrl: 'https://pub-abc.r2.dev/x.mp4' }) },
      });
      const result = await rehostMedia('https://cdn.example/reel.mp4', { fetchFn });
      assert.equal(result.url, 'https://pub-abc.r2.dev/x.mp4');
      assert.ok(warnings.some((w) => w.includes('unrecognised host')), 'an unexpected host must be logged, not silently accepted');
    } finally {
      console.warn = realWarn;
    }
  });

  it('still refuses a non-https public URL, which could never be fetched by a platform', async () => {
    const { fetchFn } = upload({
      presign: { ok: true, json: async () => ({ uploadUrl: PRESIGNED.uploadUrl, publicUrl: 'http://media.zernio.com/x.mp4' }) },
    });
    await assert.rejects(rehostMedia('https://cdn.example/reel.mp4', { fetchFn }), /non-https public URL/);
  });

  // The parser strips tabs and newlines anywhere in the input, so the string that passed the
  // check is not always the string that would ship. Returning the parsed href keeps them one.
  it('returns the parsed public URL, not the raw string it was given', async () => {
    const { fetchFn } = upload({
      presign: { ok: true, json: async () => ({ uploadUrl: PRESIGNED.uploadUrl, publicUrl: 'https://media.zernio.com/temp/a\tb.mp4' }) },
    });
    const result = await rehostMedia('https://cdn.example/reel.mp4', { fetchFn });
    assert.ok(!result.url.includes('\t'), 'the raw value shipped instead of the validated one');
  });

  // A redirect is followed with the METHOD AND BODY INTACT, so a 302 off an allowed host would
  // carry the whole file somewhere the allowlist just refused.
  it('refuses to follow a redirect on the upload', async () => {
    const { seen, fetchFn } = upload();
    await rehostMedia('https://cdn.example/reel.mp4', { fetchFn });
    assert.equal(seen.put.redirect, 'error');
  });
});
