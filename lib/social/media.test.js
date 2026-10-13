// lib/social/media.js — cost guards: the default image chain stops at the second model, and
// the fal.ai video path is off unless SOCIAL_LEGACY_VIDEO=on.
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateWithFallback, startVideoGeneration } from './media.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.SOCIAL_LEGACY_VIDEO;
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
