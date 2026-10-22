// lib/social/media.js — cost guards: the default image chain stops at the second model, and
// the fal.ai video path is off unless SOCIAL_LEGACY_VIDEO=on.
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateWithFallback, generateImageFast, generateImage, startVideoGeneration } from './media.js';

const realFetch = globalThis.fetch;
const savedKeys = { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY, MERLOWS_OPENROUTER_KEY: process.env.MERLOWS_OPENROUTER_KEY };
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.SOCIAL_LEGACY_VIDEO;
  for (const [k, v] of Object.entries(savedKeys)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});

describe('OpenRouter key routing', () => {
  const imageReply = { ok: true, json: async () => ({ choices: [{ message: { content: 'data:image/png;base64,cG5n' } }] }) };
  const recordAuth = (auth) => async (url, init) => {
    auth.push(init.headers.Authorization);
    // craftImagePrompt is a text call; answer it with a prompt, the image calls with an image.
    return JSON.parse(init.body).modalities
      ? imageReply
      : { ok: true, json: async () => ({ choices: [{ message: { content: 'a crafted prompt' } }] }) };
  };

  it('hero images (generateImageFast) bill the article key', async () => {
    process.env.OPENROUTER_API_KEY = 'article-key';
    process.env.MERLOWS_OPENROUTER_KEY = 'social-key';
    const auth = [];
    globalThis.fetch = recordAuth(auth);
    await generateImageFast('A headline');
    assert.deepEqual(auth, ['Bearer article-key']);
  });

  it('social kit images (generateImage) bill the social key on both legs', async () => {
    process.env.OPENROUTER_API_KEY = 'article-key';
    process.env.MERLOWS_OPENROUTER_KEY = 'social-key';
    const auth = [];
    globalThis.fetch = recordAuth(auth);
    await generateImage('A headline', 'An excerpt', 'instagram', '4:5');
    assert.deepEqual(auth, ['Bearer social-key', 'Bearer social-key']);
  });

  it('social kit images refuse, with no call, when the social key is unset', async () => {
    process.env.OPENROUTER_API_KEY = 'article-key';
    delete process.env.MERLOWS_OPENROUTER_KEY;
    globalThis.fetch = async () => { throw new Error('fetch should not have been called'); };
    await assert.rejects(generateImage('A headline', 'An excerpt', 'instagram', '4:5'), /MERLOWS_OPENROUTER_KEY/);
  });
});

describe('default image chain', () => {
  it('tries the lite model, then 2.5-flash, and never the dearer 3.1-flash-image', async () => {
    const asked = [];
    globalThis.fetch = async (url, init) => {
      asked.push(JSON.parse(init.body).model);
      return { ok: false, status: 500, text: async () => 'boom', json: async () => ({}) };
    };
    await assert.rejects(generateWithFallback('p', '9:16'));
    assert.deepEqual(asked, ['google/gemini-3.1-flash-lite-image', 'google/gemini-2.5-flash-image']);
  });
});

describe('legacy fal.ai video', () => {
  const script = { hook: 'h', body: 'b', cta: 'c' };

  it('refuses to start, and makes no network call, unless SOCIAL_LEGACY_VIDEO=on', async () => {
    let called = false;
    globalThis.fetch = async () => { called = true; return { json: async () => ({}) }; };
    await assert.rejects(startVideoGeneration(script, 'title'), /disabled/);
    assert.equal(called, false);
  });

  it('proceeds to the network when SOCIAL_LEGACY_VIDEO=on', async () => {
    process.env.SOCIAL_LEGACY_VIDEO = 'on';
    let called = false;
    globalThis.fetch = async () => { called = true; return { json: async () => ({ request_id: 'r1' }) }; };
    const out = await startVideoGeneration(script, 'title');
    assert.equal(called, true);
    assert.equal(out.requestId, 'r1');
  });
});
