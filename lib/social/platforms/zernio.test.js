// lib/social/platforms/zernio.js — the Zernio adapter.
//
// Every network-capable call here is driven through an injected `fetchFn`. This file NEVER
// relies on the default `fetch = fetch` global, because ZERNIO_API_KEY is a real, live key in
// this environment — an accidental real call would post to the brand's actual Instagram/TikTok
// accounts, and neither platform lets the API delete a post.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ZERNIO_PLATFORMS, requestIdFor, creatorInfo, tiktokSettings, interpretPost,
  createPost, getPost, retryPost,
} from './zernio.js';

const throwFetch = async () => { throw new Error('fetch should not have been called'); };

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

  it('returns PUBLIC_TO_EVERYONE settings, mapping the disable flags, when the account is allowed to', () => {
    const info = { privacyLevels: ['PUBLIC_TO_EVERYONE'], commentDisabled: true, duetDisabled: false, stitchDisabled: true };
    assert.deepEqual(tiktokSettings(info), {
      privacyLevel: 'PUBLIC_TO_EVERYONE',
      disableComment: true,
      disableDuet: false,
      disableStitch: true,
      brandContentToggle: false,
      brandOrganicToggle: false,
    });
  });

  it('always sends both brand-content consent flags as false, regardless of the account info', () => {
    const settings = tiktokSettings({ privacyLevels: ['PUBLIC_TO_EVERYONE'] });
    assert.equal(settings.brandContentToggle, false);
    assert.equal(settings.brandOrganicToggle, false);
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

describe('creatorInfo', () => {
  it('maps a creator-info response, preferring camelCase field names', async () => {
    const fetchFn = async () => ({
      ok: true,
      json: async () => ({
        privacyLevels: ['PUBLIC_TO_EVERYONE'], commentDisabled: true, duetDisabled: false, stitchDisabled: true,
        maxVideoPostDuration_sec: 60,
      }),
    });
    const info = await creatorInfo('acct1', { fetchFn });
    assert.deepEqual(info, {
      privacyLevels: ['PUBLIC_TO_EVERYONE'], commentDisabled: true, duetDisabled: false, stitchDisabled: true, maxDurationSec: 60,
    });
  });

  it('falls back to snake_case field names', async () => {
    const fetchFn = async () => ({
      ok: true,
      json: async () => ({
        privacy_level_options: ['SELF_ONLY'], comment_disabled: true, duet_disabled: true, stitch_disabled: false, maxDurationSec: 30,
      }),
    });
    const info = await creatorInfo('acct1', { fetchFn });
    assert.deepEqual(info, {
      privacyLevels: ['SELF_ONLY'], commentDisabled: true, duetDisabled: true, stitchDisabled: false, maxDurationSec: 30,
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
    assert.deepEqual(body.platforms, [{ platform: 'instagram', accountId: 'acct1', instagram: { postType: 'carousel' } }]);
    assert.equal(body.mediaItems[0].url, 'https://cdn.example/a.jpg');
    assert.equal(body.scheduledFor, base.scheduledFor);
  });

  describe('format — reaches Zernio as instagram.postType, and drives each media item type', () => {
    it('maps reel/story/carousel to the matching Instagram postType', async () => {
      for (const format of ['reel', 'story', 'carousel']) {
        let seenBody;
        const fetchFn = async (url, init) => {
          seenBody = JSON.parse(init.body);
          return { ok: true, json: async () => ({ post: { platforms: [{ platform: 'instagram', status: 'posted' }] } }) };
        };
        // eslint-disable-next-line no-await-in-loop
        await createPost({ ...base, format, mediaUrls: ['https://cdn.example/a.jpg'], fetchFn });
        assert.equal(seenBody.platforms[0].instagram.postType, format, `format "${format}" did not produce a matching postType`);
      }
    });

    it('defaults the Instagram postType to "post" when no format is given', async () => {
      let seenBody;
      const fetchFn = async (url, init) => {
        seenBody = JSON.parse(init.body);
        return { ok: true, json: async () => ({ post: { platforms: [{ platform: 'instagram', status: 'posted' }] } }) };
      };
      await createPost({ ...base, mediaUrls: ['https://cdn.example/a.jpg'], fetchFn });
      assert.equal(seenBody.platforms[0].instagram.postType, 'post');
    });

    it('defaults the Instagram postType to "post" for an unrecognised format too, rather than throwing', async () => {
      let seenBody;
      const fetchFn = async (url, init) => {
        seenBody = JSON.parse(init.body);
        return { ok: true, json: async () => ({ post: { platforms: [{ platform: 'instagram', status: 'posted' }] } }) };
      };
      await createPost({ ...base, format: 'not-a-real-format', mediaUrls: ['https://cdn.example/a.jpg'], fetchFn });
      assert.equal(seenBody.platforms[0].instagram.postType, 'post');
    });

    it('never sends an instagram field at all for a tiktok platform post', async () => {
      let seenBody;
      const fetchFn = async (url, init) => {
        seenBody = JSON.parse(init.body);
        return { ok: true, json: async () => ({ post: { platforms: [{ platform: 'tiktok', status: 'posted' }] } }) };
      };
      await createPost({ ...base, platform: 'tiktok', format: 'tiktok', mediaUrls: ['https://cdn.example/a.mp4'], fetchFn });
      assert.equal(seenBody.platforms[0].instagram, undefined);
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
