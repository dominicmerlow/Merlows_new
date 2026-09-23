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
  let savedFetch;
  beforeEach(() => { savedFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = savedFetch; });

  const chatResponse = (message) => ({ ok: true, json: async () => ({ choices: [{ message }] }) });

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
});
