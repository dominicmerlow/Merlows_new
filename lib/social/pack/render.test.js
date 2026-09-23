// lib/social/pack/render.js — client for the separate Remotion render service. Every network
// call takes an injected fetchFn, so no real render service is ever contacted here.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  CUTS, startRender, pollRender, stillsFor, renderStill, checkRender, isRenderableAsset,
  MIN_BYTES, MAX_BYTES,
} from './render.js';

describe('isRenderableAsset', () => {
  // This is an allowlist in its own right: it decides which URLs a browser inside the render
  // sandbox will be asked to fetch, and it must not be MORE permissive than `assetRef` in
  // merlows-studio/src/schema.ts, or a pack passes here and dies at composition selection —
  // losing both cuts and every still over one image.
  const accepted = [
    ['the brand site', 'https://merlows.com/wp-content/uploads/2026/09/hero.jpg'],
    ['the brand site with www', 'https://www.merlows.com/x.jpg'],
    ['our own Blob store', 'https://abc123.public.blob.vercel-storage.com/social/c1/still.png'],
    ['an uppercase host, which the URL parser lowercases', 'https://MERLOWS.COM/x.jpg'],
  ];
  for (const [what, url] of accepted) {
    it(`accepts ${what}`, () => assert.equal(isRenderableAsset(url), true));
  }

  const refused = [
    ['plain http', 'http://merlows.com/x.jpg'],
    ['a data URI, which the content store really does hold', 'data:image/png;base64,iVBORw0KGgo='],
    ['userinfo dressed up as the brand host', 'https://merlows.com@evil.example/x.jpg'],
    ['a trailing-dot host', 'https://merlows.com./x.jpg'],
    ['a subdomain of the brand site', 'https://cdn.merlows.com/x.jpg'],
    ['a lookalike domain', 'https://merlows.com.evil.example/x.jpg'],
    ['a private Blob host', 'https://abc123.private.blob.vercel-storage.com/x.png'],
    ['a model provider CDN', 'https://cdn.provider.example/img.png'],
    ['a bundled asset name', 'brand/placeholder.jpg'],
    ['a protocol-relative URL', '//evil.example/x.jpg'],
    ['nothing at all', ''],
    ['undefined', undefined],
  ];
  for (const [what, url] of refused) {
    it(`refuses ${what}`, () => assert.equal(isRenderableAsset(url), false));
  }
});

describe('CUTS', () => {
  it('reel is uncapped', () => {
    assert.equal(CUTS.reel.maxPoints, null);
  });

  it('tiktok caps at 3 points', () => {
    assert.equal(CUTS.tiktok.maxPoints, 3);
  });
});

describe('render service config guards', () => {
  let savedUrl, savedSecret;
  beforeEach(() => {
    savedUrl = process.env.RENDER_SERVICE_URL;
    savedSecret = process.env.RENDER_API_SECRET;
  });
  afterEach(() => {
    if (savedUrl === undefined) delete process.env.RENDER_SERVICE_URL; else process.env.RENDER_SERVICE_URL = savedUrl;
    if (savedSecret === undefined) delete process.env.RENDER_API_SECRET; else process.env.RENDER_API_SECRET = savedSecret;
  });

  it('throws without ever calling fetch when RENDER_SERVICE_URL is missing', async () => {
    delete process.env.RENDER_SERVICE_URL;
    process.env.RENDER_API_SECRET = 'secret';
    const fetchFn = async () => { throw new Error('fetchFn should not have been called'); };
    await assert.rejects(
      startRender({ points: [] }, 'reel', { contentId: 'c1', fetchFn }),
      /RENDER_SERVICE_URL is not configured/,
    );
  });

  it('throws without ever calling fetch when RENDER_API_SECRET is missing', async () => {
    process.env.RENDER_SERVICE_URL = 'https://render.example';
    delete process.env.RENDER_API_SECRET;
    const fetchFn = async () => { throw new Error('fetchFn should not have been called'); };
    await assert.rejects(
      startRender({ points: [] }, 'reel', { contentId: 'c1', fetchFn }),
      /RENDER_API_SECRET is not configured/,
    );
  });
});

describe('startRender', () => {
  let savedUrl, savedSecret;
  beforeEach(() => {
    savedUrl = process.env.RENDER_SERVICE_URL;
    savedSecret = process.env.RENDER_API_SECRET;
    process.env.RENDER_SERVICE_URL = 'https://render.example';
    process.env.RENDER_API_SECRET = 'top-secret';
  });
  afterEach(() => {
    if (savedUrl === undefined) delete process.env.RENDER_SERVICE_URL; else process.env.RENDER_SERVICE_URL = savedUrl;
    if (savedSecret === undefined) delete process.env.RENDER_API_SECRET; else process.env.RENDER_API_SECRET = savedSecret;
  });

  const pack = { headline: 'H', points: [{ caption: 'a' }, { caption: 'b' }] };

  it('posts the composition and the pack as inputProps, with the bearer secret', async () => {
    let seen;
    const fetchFn = async (url, init) => {
      seen = { url, init };
      return { ok: true, json: async () => ({ sandboxId: 'sb1', cmdId: 'cmd1' }) };
    };

    await startRender(pack, 'reel', { contentId: 'c1', fetchFn });

    assert.equal(seen.url, 'https://render.example/api/render');
    assert.equal(seen.init.headers.Authorization, 'Bearer top-secret');
    const body = JSON.parse(seen.init.body);
    assert.equal(body.composition, 'Newsflash');
    assert.deepEqual(body.inputProps, pack); // reel is uncapped — no maxPoints added
    // The service owns the storage key (and adds the random suffix); we only name the story
    // and the cut, so a caller cannot choose where the file lands.
    assert.equal(body.storyId, 'c1');
    assert.equal(body.name, 'reel');
    assert.equal(body.blobPath, undefined);
  });

  it('adds maxPoints to inputProps only for a capped cut', async () => {
    let seenBody;
    const fetchFn = async (url, init) => {
      seenBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ sandboxId: 'sb1', cmdId: 'cmd1' }) };
    };

    await startRender(pack, 'tiktok', { contentId: 'c1', fetchFn });

    assert.equal(seenBody.inputProps.maxPoints, 3);
    assert.equal(seenBody.inputProps.headline, 'H');
  });

  it('returns the handle to poll', async () => {
    const fetchFn = async () => ({ ok: true, json: async () => ({ sandboxId: 'sb-42', cmdId: 'cmd-42' }) });

    const handle = await startRender(pack, 'reel', { contentId: 'c1', fetchFn });

    assert.equal(handle.cut, 'reel');
    assert.equal(handle.sandboxId, 'sb-42');
    assert.equal(handle.cmdId, 'cmd-42');
    assert.equal(typeof handle.startedAt, 'number');
  });

  it('throws on an unknown cut before ever calling fetch', async () => {
    const fetchFn = async () => { throw new Error('fetchFn should not have been called'); };
    await assert.rejects(startRender(pack, 'bogus', { contentId: 'c1', fetchFn }), /unknown cut: bogus/);
  });

  it('throws when the service returns no handle', async () => {
    const fetchFn = async () => ({ ok: true, json: async () => ({}) });
    await assert.rejects(
      startRender(pack, 'reel', { contentId: 'c1', fetchFn }),
      /render service did not return a handle/,
    );
  });
});

describe('pollRender', () => {
  let savedUrl, savedSecret;
  beforeEach(() => {
    savedUrl = process.env.RENDER_SERVICE_URL;
    savedSecret = process.env.RENDER_API_SECRET;
    process.env.RENDER_SERVICE_URL = 'https://render.example';
    process.env.RENDER_API_SECRET = 'top-secret';
  });
  afterEach(() => {
    if (savedUrl === undefined) delete process.env.RENDER_SERVICE_URL; else process.env.RENDER_SERVICE_URL = savedUrl;
    if (savedSecret === undefined) delete process.env.RENDER_API_SECRET; else process.env.RENDER_API_SECRET = savedSecret;
  });

  const handle = { sandboxId: 'sb1', cmdId: 'cmd1' };

  it('returns the url/size/contentType when the render is done', async () => {
    const fetchFn = async () => ({
      ok: true,
      json: async () => ({ stage: 'done', url: 'https://blob.example/v.mp4', size: 4_000_000, contentType: 'video/mp4' }),
    });

    const result = await pollRender(handle, { fetchFn });

    assert.deepEqual(result, { done: true, url: 'https://blob.example/v.mp4', size: 4_000_000, contentType: 'video/mp4' });
  });

  it('treats "error" as a terminal failure', async () => {
    const fetchFn = async () => ({ ok: true, json: async () => ({ stage: 'error', message: 'renderer crashed' }) });

    const result = await pollRender(handle, { fetchFn });

    assert.deepEqual(result, { done: true, error: 'renderer crashed' });
  });

  it('treats "expired" as a terminal failure with its own message', async () => {
    const fetchFn = async () => ({ ok: true, json: async () => ({ stage: 'expired' }) });

    const result = await pollRender(handle, { fetchFn });

    assert.deepEqual(result, { done: true, error: 'render sandbox expired before the video was uploaded' });
  });

  it('returns not-done with the progress number for any other stage', async () => {
    const fetchFn = async () => ({ ok: true, json: async () => ({ stage: 'rendering', overallProgress: 0.65 }) });

    const result = await pollRender(handle, { fetchFn });

    assert.deepEqual(result, { done: false, stage: 'rendering', progress: 0.65 });
  });

  it('defaults progress to 0 when the service omits overallProgress', async () => {
    const fetchFn = async () => ({ ok: true, json: async () => ({ stage: 'queued' }) });

    const result = await pollRender(handle, { fetchFn });

    assert.deepEqual(result, { done: false, stage: 'queued', progress: 0 });
  });
});

describe('stillsFor', () => {
  it('builds cover, one slide per point, cta and story card, each with the right composition', () => {
    const pack = { points: [{ caption: 'p1' }, { caption: 'p2' }] };

    assert.deepEqual(stillsFor(pack), [
      { key: 'cover', composition: 'CarouselCover', props: { kind: 'cover', slide: 0 } },
      { key: 'slide-1', composition: 'CarouselPoint', props: { kind: 'point', slide: 0 } },
      { key: 'slide-2', composition: 'CarouselPoint', props: { kind: 'point', slide: 1 } },
      { key: 'cta', composition: 'CarouselCta', props: { kind: 'cta', slide: 0 } },
      { key: 'story', composition: 'StoryCard', props: { kind: 'cover', slide: 0 } },
    ]);
  });

  it('still returns cover, cta and story when the pack has no points', () => {
    assert.deepEqual(stillsFor({ points: [] }), [
      { key: 'cover', composition: 'CarouselCover', props: { kind: 'cover', slide: 0 } },
      { key: 'cta', composition: 'CarouselCta', props: { kind: 'cta', slide: 0 } },
      { key: 'story', composition: 'StoryCard', props: { kind: 'cover', slide: 0 } },
    ]);
  });
});

describe('renderStill', () => {
  let savedUrl, savedSecret;
  beforeEach(() => {
    savedUrl = process.env.RENDER_SERVICE_URL;
    savedSecret = process.env.RENDER_API_SECRET;
    process.env.RENDER_SERVICE_URL = 'https://render.example';
    process.env.RENDER_API_SECRET = 'top-secret';
  });
  afterEach(() => {
    if (savedUrl === undefined) delete process.env.RENDER_SERVICE_URL; else process.env.RENDER_SERVICE_URL = savedUrl;
    if (savedSecret === undefined) delete process.env.RENDER_API_SECRET; else process.env.RENDER_API_SECRET = savedSecret;
  });

  const pack = { points: [{ caption: 'p1' }] };
  const spec = { key: 'cover', composition: 'CarouselCover', props: { kind: 'cover', slide: 0 } };

  it('posts kind:"still" and returns the url', async () => {
    let seenBody;
    const fetchFn = async (url, init) => {
      seenBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ url: 'https://blob.example/cover.jpg', size: 55_000 }) };
    };

    const result = await renderStill(pack, spec, { contentId: 'c1', fetchFn });

    assert.equal(seenBody.kind, 'still');
    assert.equal(seenBody.composition, 'CarouselCover');
    assert.equal(seenBody.storyId, 'c1');
    assert.equal(seenBody.name, 'cover');
    assert.equal(seenBody.blobPath, undefined);
    assert.deepEqual(result, { key: 'cover', url: 'https://blob.example/cover.jpg', size: 55_000 });
  });

  it('throws when the service returns no URL', async () => {
    const fetchFn = async () => ({ ok: true, json: async () => ({}) });
    await assert.rejects(
      renderStill(pack, spec, { contentId: 'c1', fetchFn }),
      /render service returned no URL for cover/,
    );
  });
});

describe('checkRender', () => {
  const good = () => ({ url: 'https://blob.example/v.mp4', contentType: 'video/mp4', size: MIN_BYTES + 1000 });

  it('accepts a good render', () => {
    assert.deepEqual(checkRender(good()), { ok: true, problems: [] });
  });

  it('rejects a missing url', () => {
    const result = checkRender({ ...good(), url: undefined });
    assert.deepEqual(result, { ok: false, problems: ['no public URL'] });
  });

  it('rejects a non-https url', () => {
    const result = checkRender({ ...good(), url: 'http://blob.example/v.mp4' });
    assert.deepEqual(result, { ok: false, problems: ['no public URL'] });
  });

  it('rejects a non-video content type', () => {
    const result = checkRender({ ...good(), contentType: 'image/png' });
    assert.deepEqual(result, { ok: false, problems: ['content type is image/png, not video'] });
  });

  it('rejects a file below MIN_BYTES (a black or truncated render)', () => {
    const result = checkRender({ ...good(), size: MIN_BYTES - 1 });
    assert.deepEqual(result, { ok: false, problems: [`file is ${MIN_BYTES - 1} bytes, too small to be a finished video`] });
  });

  it('flags a missing size as too small, reporting 0 bytes', () => {
    const result = checkRender({ ...good(), size: undefined });
    assert.deepEqual(result, { ok: false, problems: ['file is 0 bytes, too small to be a finished video'] });
  });

  it('rejects a file above MAX_BYTES', () => {
    const result = checkRender({ ...good(), size: MAX_BYTES + 1 });
    assert.deepEqual(result, { ok: false, problems: [`file is ${((MAX_BYTES + 1) / 1024 / 1024).toFixed(1)} MB, over the limit`] });
  });
});
