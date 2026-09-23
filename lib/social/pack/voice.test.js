// lib/social/pack/voice.js — British voice-over generation and clip storage.
// `speak`/`voicePack` are injected with fetchFn (and voicePack with putFn), so no real
// OpenRouter TTS call or Blob upload ever happens here.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { VOICES, voiceForArticle, isMp3, linesOf, speak, voicePack, applyAudio } from './voice.js';

/** A byte buffer that looks like a real MP3 to isMp3: ID3 header, >= 4000 bytes. */
function mp3Bytes(len = 4200) {
  const arr = new Uint8Array(len);
  arr[0] = 0x49; arr[1] = 0x44; arr[2] = 0x33; // "ID3"
  return arr;
}

describe('voiceForArticle', () => {
  it('is deterministic: the same article id always picks the same voice', () => {
    const a = voiceForArticle('article-42');
    const b = voiceForArticle('article-42');
    assert.equal(a, b);
    assert.equal(VOICES.includes(a), true);
  });

  it('returns one of the three defined voices for an arbitrary id', () => {
    const v = voiceForArticle('some-other-id');
    assert.equal(VOICES.some((candidate) => candidate.id === v.id), true);
  });
});

describe('isMp3', () => {
  it('is true for a buffer with an ID3 header of at least 512 bytes', () => {
    assert.equal(isMp3(Buffer.from(mp3Bytes())), true);
  });

  it('is true for a buffer with an MPEG frame sync header', () => {
    const arr = mp3Bytes();
    arr[0] = 0xff;
    arr[1] = 0xfb; // 1111 1011 — top 3 bits set, satisfies (b & 0xe0) === 0xe0
    arr[2] = 0x90;
    assert.equal(isMp3(Buffer.from(arr)), true);
  });

  it('accepts a short legitimate clip (e.g. the ~600-byte outro) that the old 4000-byte floor rejected', () => {
    assert.equal(isMp3(Buffer.from(mp3Bytes(600))), true);
  });

  it('is false one byte under the 512-byte floor, true one byte over it', () => {
    assert.equal(isMp3(Buffer.from(mp3Bytes(511))), false);
    assert.equal(isMp3(Buffer.from(mp3Bytes(512))), true);
  });

  it('is false when the buffer is smaller than the floor even with a valid ID3 header', () => {
    assert.equal(isMp3(Buffer.from('ID3 tiny')), false);
  });

  it('is false for an HTML error body padded past the floor', () => {
    const html = '<html><body>Internal Server Error</body></html>'.padEnd(600, ' ');
    assert.equal(isMp3(Buffer.from(html, 'utf8')), false);
  });

  it('is false for a null or undefined buffer', () => {
    assert.equal(isMp3(null), false);
    assert.equal(isMp3(undefined), false);
  });
});

describe('linesOf', () => {
  it('includes hook, each point, mid-hook, quote and outro in render order', () => {
    const pack = {
      hook: 'H',
      points: [{ caption: 'c1', vo: 'v1' }, { caption: 'c2' }],
      midHook: 'M',
      quote: { text: 'Q' },
      outro: 'O',
    };
    assert.deepEqual(linesOf(pack), [
      { key: 'hook', text: 'H' },
      { key: 'p1', text: 'v1' },
      { key: 'p2', text: 'c2' }, // falls back to caption when a point has no vo
      { key: 'mid', text: 'M' },
      { key: 'quote', text: 'Q' },
      { key: 'outro', text: 'O' },
    ]);
  });

  it('skips mid-hook and quote when the pack lacks them, and speaks the default outro', () => {
    const pack = { hook: 'H', points: [{ caption: 'c1' }] };
    assert.deepEqual(linesOf(pack), [
      { key: 'hook', text: 'H' },
      { key: 'p1', text: 'c1' },
      { key: 'outro', text: 'Full story at merlows dot com' },
    ]);
  });
});

describe('speak', () => {
  const mp3Response = () => ({ ok: true, arrayBuffer: async () => mp3Bytes().buffer });
  const errorResponse = () => ({ ok: false, status: 500, arrayBuffer: async () => new TextEncoder().encode('server error').buffer });

  it('falls back to the other two voices when the first one errors', async () => {
    const primary = VOICES[0];
    const fetchFn = async (url, opts) => {
      const body = JSON.parse(opts.body);
      return body.voice === primary.voice ? errorResponse() : mp3Response();
    };
    const result = await speak(primary, 'hello there', { apiKey: 'k', fetchFn });
    assert.notEqual(result.voice.id, primary.id);
    assert.equal(Buffer.isBuffer(result.buffer), true);
  });

  it('throws naming all three voices when every one of them fails', async () => {
    const fetchFn = async () => errorResponse();
    await assert.rejects(speak(VOICES[0], 'hello there', { apiKey: 'k', fetchFn }), (err) => {
      assert.match(err.message, /all voices failed/);
      for (const v of VOICES) assert.match(err.message, new RegExp(v.id));
      return true;
    });
  });

  it('rejects blank text for every candidate without ever calling fetch', async () => {
    let calls = 0;
    const fetchFn = async () => { calls += 1; return mp3Response(); };
    await assert.rejects(speak(VOICES[0], '   ', { apiKey: 'k', fetchFn }), /nothing to speak/);
    assert.equal(calls, 0);
  });

  it('no longer echoes the upstream error body in the failure message', () => {
    // speakWith now throws "<voice>: HTTP <status>" only — provider bodies can carry request
    // ids and other internal identifiers, and this string is stored in KV and shown on the
    // board, so leaking it is a real exposure, not just noise.
    const bodyfulErrorResponse = () => ({
      ok: false, status: 503, arrayBuffer: async () => new TextEncoder().encode('req_9f8e-secret-internal-id').buffer,
    });
    const fetchFn = async () => bodyfulErrorResponse();
    return assert.rejects(speak(VOICES[0], 'hello there', { apiKey: 'k', fetchFn }), (err) => {
      assert.doesNotMatch(err.message, /secret-internal-id/);
      assert.match(err.message, /HTTP 503/);
      return true;
    });
  });
});

describe('voicePack', () => {
  let savedTtsKey, savedOrKey;
  beforeEach(() => {
    savedTtsKey = process.env.SOCIAL_TTS_API_KEY;
    savedOrKey = process.env.OPENROUTER_API_KEY;
  });
  afterEach(() => {
    if (savedTtsKey === undefined) delete process.env.SOCIAL_TTS_API_KEY; else process.env.SOCIAL_TTS_API_KEY = savedTtsKey;
    if (savedOrKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = savedOrKey;
  });

  const pack = {
    articleId: 'article-77',
    hook: 'Hook text',
    points: [{ caption: 'c1', vo: 'v1' }, { caption: 'c2', vo: 'v2' }],
    outro: 'Full story at merlows.com',
  };
  const mp3Response = () => ({ ok: true, arrayBuffer: async () => mp3Bytes().buffer });
  const noCall = { fetchFn: async () => { throw new Error('fetchFn should not have been called'); }, putFn: async () => { throw new Error('putFn should not have been called'); } };

  it('throws when no TTS or OpenRouter key is configured', async () => {
    delete process.env.SOCIAL_TTS_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    await assert.rejects(
      voicePack({ articleId: 'a1', hook: 'H', points: [], outro: 'O' }, { pathId: 'a1', fetchFn: async () => { throw new Error('should not be called'); } }),
      /SOCIAL_TTS_API_KEY/,
    );
  });

  it('rejects an unsafe pathId before making any call — the storage folder must never come from a writable field', () => {
    // wpPostId is settable through the content API; a crafted value here could write clips
    // into another story's folder. Path traversal and a slash are the concrete proof.
    return assert.rejects(
      voicePack(pack, { apiKey: 'k', pathId: '../evil', ...noCall }),
      /unsafe path segment/,
    );
  });

  it('rejects a pathId containing a slash even without traversal dots', () => {
    return assert.rejects(voicePack(pack, { apiKey: 'k', pathId: 'a/b', ...noCall }), /unsafe path segment/);
  });

  it('resolves ONE voice for the whole pack when the primary succeeds outright', async () => {
    const primary = voiceForArticle(pack.articleId);
    const voicesSeen = new Set();
    const fetchFn = async (url, opts) => {
      voicesSeen.add(JSON.parse(opts.body).voice);
      return mp3Response();
    };
    const putFn = async (path) => ({ url: `https://blob.example/${path}` });

    const result = await voicePack(pack, { apiKey: 'k', pathId: 'c1', fetchFn, putFn });

    assert.equal(result.voiceId, primary.id);
    assert.deepEqual([...voicesSeen], [primary.voice]); // every one of the 4 lines used the same voice
  });

  it('falls back once on the first line, then keeps that SAME fallback voice for the rest — no per-line fallback', async () => {
    const primary = voiceForArticle(pack.articleId);
    let primaryAttempts = 0;
    const fetchFn = async (url, opts) => {
      const voice = JSON.parse(opts.body).voice;
      if (voice === primary.voice) {
        primaryAttempts += 1;
        return { ok: false, status: 500, arrayBuffer: async () => new TextEncoder().encode('down').buffer };
      }
      return mp3Response();
    };
    const putFn = async (path) => ({ url: `https://blob.example/${path}` });

    const result = await voicePack(pack, { apiKey: 'k', pathId: 'c1', fetchFn, putFn });

    assert.notEqual(result.voiceId, primary.id);
    // The primary is only ever tried once (line 1's failed attempt). A bulletin that changed
    // presenter halfway through was the exact fault this module exists to avoid, so lines
    // 2-4 must never re-try the primary looking for a per-line fallback.
    assert.equal(primaryAttempts, 1);
  });

  it('stores each new clip via putFn with an unguessable path and reports the voice used', async () => {
    const primary = voiceForArticle(pack.articleId);
    const fetchFn = async (url, opts) => {
      const voice = JSON.parse(opts.body).voice;
      if (voice === primary.voice) return { ok: false, status: 500, arrayBuffer: async () => new TextEncoder().encode('down').buffer };
      return mp3Response();
    };
    const putCalls = [];
    const putFn = async (path, buffer, opts) => {
      putCalls.push({ path, opts });
      return { url: `https://blob.example/${path}` };
    };

    const result = await voicePack(pack, { apiKey: 'k', pathId: 'content-id-1', fetchFn, putFn });

    assert.deepEqual(Object.keys(result.audio).sort(), ['hook', 'outro', 'p1', 'p2'].sort());
    assert.equal(result.audio.hook, 'https://blob.example/social/content-id-1/vo-hook.mp3');
    assert.equal(putCalls.length, 4);
    assert.deepEqual(putCalls[0].opts, {
      access: 'public',
      contentType: 'audio/mpeg',
      addRandomSuffix: true, // unguessable: predictable paths let anyone walk and hear unapproved packs
    });
  });

  it('resumes from `existing`, skipping clips already made and not re-paying for them', async () => {
    const primary = voiceForArticle(pack.articleId);
    const fetchFn = async () => mp3Response();
    const putCalls = [];
    const putFn = async (path) => { putCalls.push(path); return { url: `https://blob.example/${path}` }; };
    const existing = { hook: 'https://blob.example/social/content-id-1/vo-hook-OLD.mp3' };

    const result = await voicePack(pack, { apiKey: 'k', pathId: 'content-id-1', fetchFn, putFn, existing });

    assert.equal(result.audio.hook, existing.hook); // untouched — not regenerated
    assert.equal(putCalls.some((p) => p.includes('vo-hook')), false); // never re-paid for
    assert.equal(putCalls.length, 3); // p1, p2, outro only
    assert.equal(result.voiceId, primary.id);
  });

  it('throws once the pack budget is spent, without making a single call', () => {
    return assert.rejects(
      voicePack(pack, { apiKey: 'k', pathId: 'c1', startedAt: Date.now() - 999_999_999, ...noCall }),
      /voice budget spent/,
    );
  });
});

describe('applyAudio', () => {
  it('maps clip URLs into the pack shape the Remotion templates expect', () => {
    const pack = {
      hook: 'H',
      points: [{ caption: 'c1' }, { caption: 'c2' }],
      midHook: 'M',
      quote: { text: 'Q', attribution: 'A' },
      outro: 'O',
    };
    const audio = { hook: 'url-hook', p1: 'url-p1', p2: 'url-p2', mid: 'url-mid', quote: 'url-quote', outro: 'url-outro' };
    const result = applyAudio(pack, audio);

    assert.equal(result.hookAudio, 'url-hook');
    assert.equal(result.midHookAudio, 'url-mid');
    assert.equal(result.outroAudio, 'url-outro');
    assert.deepEqual(result.quote, { text: 'Q', attribution: 'A', audio: 'url-quote' });
    assert.deepEqual(result.points, [
      { caption: 'c1', audio: 'url-p1' },
      { caption: 'c2', audio: 'url-p2' },
    ]);
    // Input pack is not mutated.
    assert.equal('audio' in pack.points[0], false);
    assert.equal('hookAudio' in pack, false);
  });

  it('leaves quote undefined when the pack has none', () => {
    const pack = { hook: 'H', points: [] };
    const result = applyAudio(pack, {});
    assert.equal(result.quote, undefined);
    assert.deepEqual(result.points, []);
  });
});
