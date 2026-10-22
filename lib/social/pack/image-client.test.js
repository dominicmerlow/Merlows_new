// lib/social/pack/image-client.js — decodeDataUri boundaries, and generateWithFallbackPublic
// with global fetch stubbed (generateWithFallback in lib/social/media.js calls fetch
// directly — there is no injection point) and an injected putFn, so no real OpenRouter call
// or @vercel/blob upload ever happens here.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { decodeDataUri, generateWithFallbackPublic } from './image-client.js';

describe('decodeDataUri', () => {
  it('decodes a valid PNG data URI', () => {
    const payload = Buffer.from('fake-png-bytes').toString('base64');
    const result = decodeDataUri(`data:image/png;base64,${payload}`);
    assert.equal(result.contentType, 'image/png');
    assert.equal(result.buffer.toString(), 'fake-png-bytes');
  });

  it('decodes a valid JPEG data URI', () => {
    const payload = Buffer.from('fake-jpeg-bytes').toString('base64');
    const result = decodeDataUri(`data:image/jpeg;base64,${payload}`);
    assert.equal(result.contentType, 'image/jpeg');
    assert.equal(result.buffer.toString(), 'fake-jpeg-bytes');
  });

  it('returns null for a non-image data URI', () => {
    const payload = Buffer.from('hello').toString('base64');
    assert.equal(decodeDataUri(`data:text/plain;base64,${payload}`), null);
  });

  it('returns null for a string that is not a data URI at all', () => {
    assert.equal(decodeDataUri('https://example.com/image.png'), null);
  });

  it('returns null for an empty or missing uri', () => {
    assert.equal(decodeDataUri(''), null);
    assert.equal(decodeDataUri(undefined), null);
  });

  it('returns null once the decoded buffer is over the size ceiling', () => {
    const oversized = Buffer.alloc(8 * 1024 * 1024 + 10, 1).toString('base64');
    assert.equal(decodeDataUri(`data:image/png;base64,${oversized}`), null);
  });

  it('returns null when the payload decodes to an empty buffer', () => {
    // "!" is not part of the base64 alphabet, so Node's decoder drops it and yields 0 bytes.
    assert.equal(decodeDataUri('data:image/png;base64,!!!!'), null);
  });
});

describe('generateWithFallbackPublic', () => {
  let savedFetch, savedSocialKey, savedOrKey;
  beforeEach(() => {
    savedFetch = globalThis.fetch;
    savedSocialKey = process.env.MERLOWS_OPENROUTER_KEY;
    savedOrKey = process.env.OPENROUTER_API_KEY;
    process.env.MERLOWS_OPENROUTER_KEY = 'social-key';
    process.env.OPENROUTER_API_KEY = 'article-key';
  });
  afterEach(() => {
    globalThis.fetch = savedFetch;
    if (savedSocialKey === undefined) delete process.env.MERLOWS_OPENROUTER_KEY; else process.env.MERLOWS_OPENROUTER_KEY = savedSocialKey;
    if (savedOrKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = savedOrKey;
  });

  const chatResponse = (message) => ({ ok: true, json: async () => ({ choices: [{ message }] }) });

  it('bills social stills to MERLOWS_OPENROUTER_KEY, not the article key', async () => {
    const payload = Buffer.from('png').toString('base64');
    const auth = [];
    globalThis.fetch = async (url, init) => {
      auth.push(init.headers.Authorization);
      return chatResponse({ content: `data:image/png;base64,${payload}` });
    };
    const putFn = async (path) => ({ url: `https://blob.example/${path}` });

    await generateWithFallbackPublic('a prompt', { pathId: 'story-1', name: 'still-p1', putFn });

    assert.deepEqual(auth, ['Bearer social-key']);
  });

  it('refuses before any call when MERLOWS_OPENROUTER_KEY is unset, rather than billing the article key', async () => {
    delete process.env.MERLOWS_OPENROUTER_KEY;
    globalThis.fetch = async () => { throw new Error('fetch should not have been called'); };
    const putFn = async () => { throw new Error('putFn should not have been called'); };

    await assert.rejects(
      generateWithFallbackPublic('a prompt', { pathId: 'story-1', name: 'still-p1', putFn }),
      /MERLOWS_OPENROUTER_KEY is not configured/,
    );
  });

  it('stores decoded PNG bytes with the right content type via putFn', async () => {
    const payload = Buffer.from('generated-png-bytes').toString('base64');
    globalThis.fetch = async () => chatResponse({ content: `data:image/png;base64,${payload}` });
    const putCalls = [];
    const putFn = async (path, buffer, opts) => {
      putCalls.push({ path, buffer, opts });
      return { url: `https://blob.example/${path}` };
    };

    const url = await generateWithFallbackPublic('a prompt', { pathId: 'story-9', name: 'still-p1', putFn });

    assert.equal(url, 'https://blob.example/social/story-9/still-p1.png');
    assert.equal(putCalls.length, 1);
    assert.equal(putCalls[0].path, 'social/story-9/still-p1.png');
    assert.equal(putCalls[0].buffer.toString(), 'generated-png-bytes');
    assert.deepEqual(putCalls[0].opts, { access: 'public', contentType: 'image/png', addRandomSuffix: true });
  });

  it('maps a jpeg content type to a .jpg extension', async () => {
    const payload = Buffer.from('generated-jpeg-bytes').toString('base64');
    globalThis.fetch = async () => chatResponse({ content: `data:image/jpeg;base64,${payload}` });
    const putCalls = [];
    const putFn = async (path, buffer, opts) => {
      putCalls.push({ path, opts });
      return { url: `https://blob.example/${path}` };
    };

    const url = await generateWithFallbackPublic('a prompt', { pathId: 'story-12', name: 'still-p2', putFn });

    assert.equal(putCalls[0].path, 'social/story-12/still-p2.jpg');
    assert.equal(putCalls[0].opts.contentType, 'image/jpeg');
    assert.equal(url, 'https://blob.example/social/story-12/still-p2.jpg');
  });

  it('passes a hosted URL through only when the renderer would fetch it', async () => {
    const hosted = 'https://x1y2z3.public.blob.vercel-storage.com/social/story-10/still.png';
    globalThis.fetch = async () => chatResponse({ images: [{ image_url: { url: hosted } }] });
    const putFn = async () => { throw new Error('putFn should not have been called'); };

    const url = await generateWithFallbackPublic('a prompt', { pathId: 'story-10', name: 'still-p1', putFn });

    assert.equal(url, hosted);
  });

  it('refuses a hosted URL on a host the renderer will not fetch, rather than poisoning the pack', async () => {
    // An off-host `src` is refused by the templates' schema at composition selection, which
    // takes down both cuts and every still. Throwing here costs one slide instead.
    globalThis.fetch = async () => chatResponse({ images: [{ image_url: { url: 'https://cdn.provider.example/img.png' } }] });
    const putFn = async () => { throw new Error('putFn should not have been called'); };

    await assert.rejects(
      generateWithFallbackPublic('a prompt', { pathId: 'story-10', name: 'still-p1', putFn }),
      /host not allowed/,
    );
  });

  it('throws when the model returns neither a usable data URI nor an HTTPS URL', async () => {
    globalThis.fetch = async () => chatResponse({ images: [{ image_url: { url: 'not-a-real-url' } }] });
    const putFn = async () => { throw new Error('putFn should not have been called'); };

    await assert.rejects(
      generateWithFallbackPublic('a prompt', { pathId: 'story-11', name: 'still-p1', putFn }),
      /neither a usable data URI nor an HTTPS URL/,
    );
  });

  it('reports the OpenRouter billed cost via onCharge on a successful image', async () => {
    const payload = Buffer.from('generated-png-bytes').toString('base64');
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: `data:image/png;base64,${payload}` } }],
        usage: { cost: 0.02 },
      }),
    });
    const putFn = async (path) => ({ url: `https://blob.example/${path}` });
    const charges = [];

    await generateWithFallbackPublic('a prompt', { pathId: 'story-13', name: 'still-p1', putFn, onCharge: (c) => charges.push(c) });

    assert.deepEqual(charges, [{ usd: 0.02, estimated: false }]);
  });

  it('still reports a charge via onCharge even when the reply carries no usable image (billed anyway)', async () => {
    // No image in ANY reply means every model in the fallback chain is tried and each is
    // billed — this proves onCharge fires per call, not just once for the pack.
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'no image here' } }], usage: { cost: 0.01 } }) };
    };
    const putFn = async () => { throw new Error('putFn should not have been called'); };
    const charges = [];

    await assert.rejects(
      generateWithFallbackPublic('a prompt', { pathId: 'story-14', name: 'still-p1', putFn, onCharge: (c) => charges.push(c) }),
    );
    assert.equal(charges.length, calls);
    assert.ok(calls > 0);
    for (const charge of charges) assert.deepEqual(charge, { usd: 0.01, estimated: false });
  });

  it('falls back to the flat per-image estimate when OpenRouter omits usage.cost', async () => {
    const payload = Buffer.from('bytes').toString('base64');
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: `data:image/png;base64,${payload}` } }] }),
    });
    const putFn = async (path) => ({ url: `https://blob.example/${path}` });
    const charges = [];

    await generateWithFallbackPublic('a prompt', { pathId: 'story-15', name: 'still-p1', putFn, onCharge: (c) => charges.push(c) });

    assert.equal(charges.length, 1);
    assert.equal(charges[0].estimated, true);
    assert.ok(charges[0].usd > 0);
  });
});
