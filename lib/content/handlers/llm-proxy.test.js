// lib/content/handlers/llm-proxy.js — POST /api/content/llm-proxy
// New route this session: routes the browser's OpenRouter chat calls through
// the server so the built-in key never ships to the client. The handler takes
// { fetchFn, getUser } as injectable deps specifically for tests, so nothing
// here needs to touch real kv/auth or make a real network call.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import handler, { buildUpstreamPayload } from './llm-proxy.js';
import contentRouter from '../../../api/content/[...slug].js';

function mkRes() {
  const r = { statusCode: null, body: null, headers: {}, chunks: [], ended: false };
  r.status    = c => { r.statusCode = c; return r; };
  r.json      = b => { r.body = b;       return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; return r; };
  r.write     = chunk => { r.chunks.push(chunk); return true; };
  r.end       = () => { r.ended = true; return r; };
  return r;
}

const ME = { id: 'u1', appRole: 'content' };
const getUserOk = async () => ME;
const getUserNone = async () => null;
const noFetch = async () => { throw new Error('fetchFn should not have been called'); };

let savedKey;
function setKey(v) { savedKey = process.env.OPENROUTER_API_KEY; process.env.OPENROUTER_API_KEY = v; }
function unsetKey() { savedKey = process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_API_KEY; }
function restoreKey() { if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = savedKey; }

describe('buildUpstreamPayload', () => {
  it('returns null for a null body', () => {
    assert.equal(buildUpstreamPayload(null), null);
  });

  it('returns null when messages is an empty array', () => {
    assert.equal(buildUpstreamPayload({ model: 'x/y', messages: [] }), null);
  });

  it('returns null when model is missing', () => {
    assert.equal(buildUpstreamPayload({ messages: [{ role: 'user', content: 'hi' }] }), null);
  });

  it('keeps only the whitelisted fields that are present, dropping everything else', () => {
    const payload = buildUpstreamPayload({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
      apiKey: 'should-not-leak',
      foo: 'bar',
    });
    assert.deepEqual(payload, {
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
    });
    assert.equal('apiKey' in payload, false);
    assert.equal('foo' in payload, false);
  });
});

describe('POST /api/content/llm-proxy', () => {
  it('rejects a non-POST method with 405', async () => {
    const res = mkRes();
    await handler({ method: 'GET' }, res, { fetchFn: noFetch, getUser: getUserNone });
    assert.equal(res.statusCode, 405);
    assert.equal(res.body.error.message, 'Method not allowed');
  });

  it('rejects a signed-out caller with 401 and never calls upstream', async () => {
    const res = mkRes();
    await handler({ method: 'POST', headers: {}, body: {} }, res, { fetchFn: noFetch, getUser: getUserNone });
    assert.equal(res.statusCode, 401);
    assert.match(res.body.error.message, /session has expired/);
  });

  it('returns 503 when OPENROUTER_API_KEY is not configured', async () => {
    unsetKey();
    const res = mkRes();
    await handler({ method: 'POST', headers: {}, body: { model: 'x/y', messages: [{ role: 'user', content: 'hi' }] } }, res, { fetchFn: noFetch, getUser: getUserOk });
    restoreKey();
    assert.equal(res.statusCode, 503);
    assert.match(res.body.error.message, /OPENROUTER_API_KEY/);
  });

  it('returns 400 when model and messages are missing', async () => {
    setKey('sk-or-test');
    const res = mkRes();
    await handler({ method: 'POST', headers: {}, body: {} }, res, { fetchFn: noFetch, getUser: getUserOk });
    restoreKey();
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.message, 'model and messages are required');
  });

  it('sends the Authorization header built from the server env key', async () => {
    setKey('sk-or-secret-value');
    let seenAuth;
    const fetchFn = async (url, opts) => {
      seenAuth = opts.headers.Authorization;
      return { status: 200, headers: { get: () => 'application/json' }, body: null };
    };
    const res = mkRes();
    await handler(
      { method: 'POST', headers: {}, body: { model: 'x/y', messages: [{ role: 'user', content: 'hi' }] } },
      res,
      { fetchFn, getUser: getUserOk }
    );
    restoreKey();
    assert.equal(seenAuth, 'Bearer sk-or-secret-value');
  });

  it('forwards only the whitelisted fields to OpenRouter', async () => {
    setKey('sk-or-test');
    let sentBody;
    const fetchFn = async (url, opts) => {
      sentBody = JSON.parse(opts.body);
      return { status: 200, headers: { get: () => 'application/json' }, body: null };
    };
    const res = mkRes();
    await handler(
      {
        method: 'POST',
        headers: {},
        body: {
          model: 'x/y',
          messages: [{ role: 'user', content: 'hi' }],
          temperature: 0.7,
          userSecret: 'leak-me',
        },
      },
      res,
      { fetchFn, getUser: getUserOk }
    );
    restoreKey();
    assert.deepEqual(sentBody, {
      model: 'x/y',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.7,
    });
  });

  it('maps an upstream 401 to a 502 that names OPENROUTER_API_KEY', async () => {
    setKey('sk-or-bad');
    const fetchFn = async () => ({ status: 401 });
    const res = mkRes();
    await handler(
      { method: 'POST', headers: {}, body: { model: 'x/y', messages: [{ role: 'user', content: 'hi' }] } },
      res,
      { fetchFn, getUser: getUserOk }
    );
    restoreKey();
    assert.equal(res.statusCode, 502);
    assert.match(res.body.error.message, /OPENROUTER_API_KEY/);
    assert.match(res.body.error.message, /HTTP 401/);
  });

  it('maps an upstream 403 to a 502 that names OPENROUTER_API_KEY', async () => {
    setKey('sk-or-bad');
    const fetchFn = async () => ({ status: 403 });
    const res = mkRes();
    await handler(
      { method: 'POST', headers: {}, body: { model: 'x/y', messages: [{ role: 'user', content: 'hi' }] } },
      res,
      { fetchFn, getUser: getUserOk }
    );
    restoreKey();
    assert.equal(res.statusCode, 502);
    assert.match(res.body.error.message, /OPENROUTER_API_KEY/);
  });

  it('streams an upstream SSE body through byte for byte and ends the response', async () => {
    setKey('sk-or-test');
    const chunks = ['data: {"choices":[{"delta":{"content":"He"}}]}\n\n', 'data: {"choices":[{"delta":{"content":"llo"}}]}\n\n', 'data: [DONE]\n\n'];
    const encoder = new TextEncoder();
    const upstreamBody = new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(encoder.encode(c));
        controller.close();
      },
    });
    const fetchFn = async () => ({
      status: 200,
      headers: { get: (k) => (k === 'content-type' ? 'text/event-stream' : null) },
      body: upstreamBody,
    });
    const res = mkRes();
    await handler(
      { method: 'POST', headers: {}, body: { model: 'x/y', messages: [{ role: 'user', content: 'hi' }] } },
      res,
      { fetchFn, getUser: getUserOk }
    );
    restoreKey();
    const decoder = new TextDecoder();
    const written = res.chunks.map(c => decoder.decode(c)).join('');
    assert.equal(written, chunks.join(''));
    assert.equal(res.ended, true);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Content-Type'], 'text/event-stream');
    assert.equal(res.headers['Cache-Control'], 'no-store');
  });

  it('returns 502 with an { error: { message } } body when the upstream fetch rejects', async () => {
    setKey('sk-or-test');
    const fetchFn = async () => { throw new Error('getaddrinfo ENOTFOUND'); };
    const res = mkRes();
    await handler(
      { method: 'POST', headers: {}, body: { model: 'x/y', messages: [{ role: 'user', content: 'hi' }] } },
      res,
      { fetchFn, getUser: getUserOk }
    );
    restoreKey();
    assert.equal(res.statusCode, 502);
    assert.match(res.body.error.message, /getaddrinfo ENOTFOUND/);
  });
});

describe('api/content/[...slug] wiring', () => {
  it('POST /api/content/llm-proxy dispatches through the content catch-all', async () => {
    // No session cookie: llm-proxy's own 401 (not a 404) proves the catch-all's
    // NAMED map routed the request to the llm-proxy handler.
    const res = mkRes();
    await contentRouter({ method: 'POST', headers: {}, query: { '...slug': 'llm-proxy' }, body: {} }, res);
    assert.equal(res.statusCode, 401);
  });
});
