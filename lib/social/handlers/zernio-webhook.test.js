// lib/social/handlers/zernio-webhook.js — Zernio's PUBLIC callback endpoint.
//
// There is no session and no cron secret on this route: the HMAC over the RAW request body
// is the only credential, so a weak test here is worth less than none. These tests cover, in
// order: readRawBody (must read via 'data'/'end' events, never `for await` — see the header
// comment in the module under test for why), verifySignature (the exact-bytes property is
// the whole point — a body re-serialised through JSON.parse/stringify must NOT verify), then
// applyEvent (the pure state-machine step) and finally the routed handler (401/503/2xx and
// duplicate-event suppression).
//
// zernio-webhook.js imports the `kv` singleton straight from ../../kv.js, the same way
// store.test.js and connections.test.js do — each test that touches storage monkey-patches
// kv's methods and restores them afterwards. A real Upstash call must never happen here: that
// store is shared with another company's production data.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHmac } from 'node:crypto';
import { kv } from '../../kv.js';
import handler, { readRawBody, verifySignature, applyEvent, safeUrl } from './zernio-webhook.js';

const SECRET = 'zw-test-secret';
const hmacHex = (buf, secret) => createHmac('sha256', secret).update(buf).digest('hex');

function mkRes() {
  const r = { statusCode: null, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

/** A fresh request stream per call — Readable.from([buf]) hands the whole Buffer back as one
 * 'data' event, which is exactly what readRawBody consumes. */
function mkReq({ method = 'POST', headers = {}, body = Buffer.alloc(0) } = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const req = Readable.from([buf]);
  req.method = method;
  req.headers = headers;
  return req;
}

// ── readRawBody ──────────────────────────────────────────────────────────────────────────
// Deliberately NOT rewritten to `for await`: on Vercel's Node runtime that returns an empty
// buffer and throws nothing (the platform drains the stream before the handler runs and
// replays it through a PassThrough that rewires 'data'/'end' but not 'readable', which is
// what async iteration uses). These tests pin the 'data'/'end' behaviour directly.
describe('readRawBody', () => {
  it('reconstructs the exact bytes from a single chunk', async () => {
    const raw = Buffer.from('{"b":1,  "a":1.50}', 'utf8');
    const result = await readRawBody(Readable.from([raw]));
    assert.equal(Buffer.compare(result, raw), 0);
  });

  it('concatenates multiple chunks in arrival order', async () => {
    const req = Readable.from([Buffer.from('{"a":'), Buffer.from('1.50}')]);
    const result = await readRawBody(req);
    assert.equal(result.toString('utf8'), '{"a":1.50}');
  });

  it('converts a non-Buffer chunk to a Buffer before concatenating', async () => {
    const req = Readable.from(['plain string chunk'], { objectMode: true });
    const result = await readRawBody(req);
    assert.equal(Buffer.isBuffer(result), true);
    assert.equal(result.toString('utf8'), 'plain string chunk');
  });

  it('resolves an empty buffer when the stream ends with no chunks', async () => {
    const result = await readRawBody(Readable.from([]));
    assert.equal(result.length, 0);
  });

  it('rejects when the request stream errors', async () => {
    const req = new Readable({ read() {} });
    const promise = readRawBody(req);
    req.emit('error', new Error('socket hang up'));
    await assert.rejects(promise, /socket hang up/);
  });

  it('rejects immediately when the stream has already ended — an unauthenticated caller must not hang the function for the full timeout', async () => {
    const req = Readable.from([Buffer.from('{}')]);
    // eslint-disable-next-line no-empty, no-unused-vars
    for await (const _chunk of req) { /* drain it before readRawBody ever sees it */ }
    assert.equal(req.readableEnded, true); // sanity: the condition under test really holds
    await assert.rejects(readRawBody(req), /already consumed/);
  });

  it('rejects a body that never finishes arriving once the given timeoutMs elapses', async () => {
    const req = new Readable({ read() {} }); // never emits 'end'
    await assert.rejects(readRawBody(req, { timeoutMs: 20 }), /timed out reading body/);
  });

  it('rejects a body over the given maxBytes without waiting for it to finish', async () => {
    const req = new Readable({ read() {} });
    const promise = readRawBody(req, { maxBytes: 10 });
    req.emit('data', Buffer.alloc(11, 'a'));
    await assert.rejects(promise, /body too large/);
  });

  it('accepts a body exactly at maxBytes', async () => {
    const buf = Buffer.alloc(10, 'a');
    const result = await readRawBody(Readable.from([buf]), { maxBytes: 10 });
    assert.equal(result.length, 10);
  });

  it('accumulates across chunks before rejecting a body that only exceeds maxBytes once combined', async () => {
    const req = new Readable({ read() {} });
    const promise = readRawBody(req, { maxBytes: 10 });
    req.emit('data', Buffer.alloc(6, 'a')); // under the limit alone
    req.emit('data', Buffer.alloc(6, 'b')); // 12 combined — over it
    await assert.rejects(promise, /body too large/);
  });
});

// ── safeUrl ──────────────────────────────────────────────────────────────────────────────
// The outbound side of this app already refuses anything but https; this is the inbound side
// — a URL Zernio hands back on a public, unauthenticated-except-for-HMAC callback — and it is
// later emitted into an `href` on the board, so a `javascript:` value here is a stored-XSS
// vector executing in whichever admin's session clicks it.
describe('safeUrl', () => {
  it('accepts an https URL unchanged', () => {
    assert.equal(safeUrl('https://cdn.example/x.jpg'), 'https://cdn.example/x.jpg');
  });

  it('rejects a javascript: URL', () => {
    assert.equal(safeUrl('javascript:alert(1)'), null);
  });

  it('rejects a plain http (non-https) URL', () => {
    assert.equal(safeUrl('http://cdn.example/x.jpg'), null);
  });

  it('rejects a data: URL', () => {
    assert.equal(safeUrl('data:text/html,<script>alert(1)</script>'), null);
  });

  it('rejects a value that is not a URL at all, rather than throwing', () => {
    assert.equal(safeUrl('not a url'), null);
  });

  it('rejects null and undefined without throwing', () => {
    assert.equal(safeUrl(null), null);
    assert.equal(safeUrl(undefined), null);
  });
});

// ── verifySignature ──────────────────────────────────────────────────────────────────────
describe('verifySignature', () => {
  it('accepts a correct bare-hex signature over the exact bytes', () => {
    const raw = Buffer.from('{"type":"post.platform.published"}');
    const result = verifySignature(raw, hmacHex(raw, SECRET), SECRET);
    assert.equal(result.ok, true);
  });

  it('accepts a correct signature with the sha256= prefix', () => {
    const raw = Buffer.from('{"type":"post.platform.published"}');
    const result = verifySignature(raw, `sha256=${hmacHex(raw, SECRET)}`, SECRET);
    assert.equal(result.ok, true);
  });

  it('rejects a body re-serialised through JSON.parse/JSON.stringify', () => {
    // Whitespace dropped and 1.50 -> 1.5: exactly the normalisation the header comment warns
    // about. The signature is computed over the ORIGINAL bytes, as Zernio does; verifying it
    // against the re-serialised bytes must fail, proving the check is byte-exact and not
    // "semantically the same JSON".
    const raw = Buffer.from('{"b":1,  "a":1.50}');
    const reserialized = Buffer.from(JSON.stringify(JSON.parse(raw.toString('utf8'))));
    assert.notEqual(reserialized.toString('utf8'), raw.toString('utf8')); // sanity: bytes really differ
    const sig = hmacHex(raw, SECRET);
    const result = verifySignature(reserialized, sig, SECRET);
    assert.equal(result.ok, false);
  });

  it('rejects an empty body', () => {
    const empty = Buffer.alloc(0);
    const result = verifySignature(empty, hmacHex(empty, SECRET), SECRET);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'empty body');
  });

  it('rejects a signature made with the wrong secret', () => {
    const raw = Buffer.from('{"type":"x"}');
    const result = verifySignature(raw, hmacHex(raw, 'a-different-secret'), SECRET);
    assert.equal(result.ok, false);
  });

  it('rejects a truncated digest', () => {
    const raw = Buffer.from('{"type":"x"}');
    const result = verifySignature(raw, hmacHex(raw, SECRET).slice(0, -4), SECRET);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'signature length mismatch');
  });

  it('rejects an over-long digest', () => {
    const raw = Buffer.from('{"type":"x"}');
    const result = verifySignature(raw, `${hmacHex(raw, SECRET)}ab`, SECRET);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'signature length mismatch');
  });

  it('rejects a non-hex digest', () => {
    const raw = Buffer.from('{"type":"x"}');
    const result = verifySignature(raw, 'not-hex-zzzz', SECRET);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'missing or malformed signature');
  });

  it('rejects a missing signature header', () => {
    const raw = Buffer.from('{"type":"x"}');
    const result = verifySignature(raw, undefined, SECRET);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'missing or malformed signature');
  });

  it('reports "not configured" when the secret is unset, checked before anything else', () => {
    const raw = Buffer.from('{"type":"x"}');
    // Even a validly-shaped signature must not pass when there is nothing to verify against.
    const result = verifySignature(raw, hmacHex(raw, SECRET), '');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'ZERNIO_WEBHOOK_SECRET is not configured');
  });

  it('reports "not configured" for an undefined secret too', () => {
    const raw = Buffer.from('{"type":"x"}');
    const result = verifySignature(raw, hmacHex(raw, SECRET), undefined);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'ZERNIO_WEBHOOK_SECRET is not configured');
  });
});

// ── applyEvent ───────────────────────────────────────────────────────────────────────────
// applyEvent's `{ store }` option is never actually threaded through to getPack/savePack/
// listPacks (they always call the kv singleton directly), so — same as store.js and
// autopilot.js — these tests monkey-patch kv.get/kv.set rather than relying on that option.
describe('applyEvent', () => {
  let savedGet, savedSet;
  beforeEach(() => { savedGet = kv.get; savedSet = kv.set; });
  afterEach(() => { kv.get = savedGet; kv.set = savedSet; });

  /** In-memory single-pack store keyed the way getPack/savePack address it. */
  function stubStore(initialPack) {
    let pack = initialPack;
    const writes = [];
    kv.get = async (key) => (key === `social:pack:${initialPack.contentId}` ? pack : null);
    kv.set = async (key, value) => { pack = value; writes.push(value); };
    return { current: () => pack, writes };
  }

  it('updates the matching post to published and leaves the other post untouched', async () => {
    const other = { zernioPostId: 'zp-2', format: 'reel', status: 'scheduled' };
    const store = stubStore({
      contentId: 'c1',
      posts: [{ zernioPostId: 'zp-1', format: 'tiktok', status: 'scheduled' }, other],
    });

    const result = await applyEvent({
      type: 'post.platform.published',
      data: { postId: 'zp-1', url: 'https://tiktok.com/@x/1', metadata: { contentId: 'c1' } },
    });

    assert.equal(result.handled, true);
    const pack = store.current();
    assert.equal(pack.posts[0].status, 'published');
    assert.equal(pack.posts[0].url, 'https://tiktok.com/@x/1');
    assert.equal(typeof pack.posts[0].publishedAt, 'string');
    assert.deepEqual(pack.posts[1], other);
  });

  it('updates the matching post to failed and leaves the other post untouched', async () => {
    const other = { zernioPostId: 'zp-2', format: 'reel', status: 'published', url: 'https://x' };
    const store = stubStore({
      contentId: 'c1',
      posts: [{ zernioPostId: 'zp-1', format: 'tiktok', status: 'scheduled' }, other],
    });

    const result = await applyEvent({
      type: 'post.platform.failed',
      data: { postId: 'zp-1', error: 'upload rejected: file too large', metadata: { contentId: 'c1' } },
    });

    assert.equal(result.handled, true);
    const pack = store.current();
    assert.equal(pack.posts[0].status, 'failed');
    assert.equal(pack.posts[0].error, 'upload rejected: file too large');
    assert.deepEqual(pack.posts[1], other);
  });

  it('updates only the url on a tiktok url_resolved event, leaving status as-is', async () => {
    const other = { zernioPostId: 'zp-2', format: 'reel', status: 'published', url: 'https://x' };
    const store = stubStore({
      contentId: 'c1',
      posts: [{ zernioPostId: 'zp-1', format: 'tiktok', status: 'published', url: null }, other],
    });

    const result = await applyEvent({
      type: 'post.tiktok.url_resolved',
      data: { postId: 'zp-1', url: 'https://tiktok.com/@x/video/99', metadata: { contentId: 'c1' } },
    });

    assert.equal(result.handled, true);
    const pack = store.current();
    assert.equal(pack.posts[0].url, 'https://tiktok.com/@x/video/99');
    assert.equal(pack.posts[0].status, 'published'); // unchanged by this event
    assert.deepEqual(pack.posts[1], other);
  });

  it('handles account.disconnected as an alert, without reading or writing any pack', async () => {
    kv.get = async () => { throw new Error('must not read a pack for an account-level event'); };
    kv.set = async () => { throw new Error('must not write a pack for an account-level event'); };

    const result = await applyEvent({ type: 'account.disconnected', data: { accountId: 'acct-1' } });

    assert.equal(result.handled, true);
    assert.equal(result.type, 'account.disconnected');
  });

  it('acknowledges but does not apply an unknown event type, and saves nothing', async () => {
    const store = stubStore({
      contentId: 'c1',
      posts: [{ zernioPostId: 'zp-1', format: 'tiktok', status: 'scheduled' }],
    });

    const result = await applyEvent({
      type: 'post.platform.something_new',
      data: { postId: 'zp-1', metadata: { contentId: 'c1' } },
    });

    assert.equal(result.handled, false);
    assert.equal(result.reason, 'unhandled event type');
    assert.equal(store.writes.length, 0);
  });

  it('does not throw when no pack matches the content id', async () => {
    kv.get = async () => null;
    const result = await applyEvent({
      type: 'post.platform.published',
      data: { postId: 'zp-1', metadata: { contentId: 'missing-content' } },
    });
    assert.equal(result.handled, false);
    assert.equal(result.reason, 'no matching pack');
  });

  it('does not throw when the pack exists but has no matching post', async () => {
    const store = stubStore({
      contentId: 'c1',
      posts: [{ zernioPostId: 'zp-other', format: 'reel', status: 'scheduled' }],
    });
    const result = await applyEvent({
      type: 'post.platform.published',
      data: { postId: 'zp-1', metadata: { contentId: 'c1' } },
    });
    assert.equal(result.handled, false);
    assert.equal(result.reason, 'no matching post on the pack');
    assert.equal(store.writes.length, 0);
  });

  it('does not match a post recorded with a null zernioPostId when the event itself carries no post id', async () => {
    // Without the `zernioPostId &&` guard, a null id on the event would match the first post
    // recorded with a null id (e.g. one Zernio accepted without ever returning an id), letting
    // an unrelated event patch the wrong post.
    const store = stubStore({
      contentId: 'c1',
      posts: [{ zernioPostId: null, format: 'tiktok', status: 'scheduled' }],
    });
    const result = await applyEvent({
      type: 'post.platform.published',
      data: { metadata: { contentId: 'c1' } }, // no postId at all
    });
    assert.equal(result.handled, false);
    assert.equal(result.reason, 'no matching post on the pack');
    assert.equal(store.writes.length, 0);
  });

  it('stores null rather than a javascript: URL when a published event carries one', async () => {
    const store = stubStore({
      contentId: 'c1',
      posts: [{ zernioPostId: 'zp-1', format: 'tiktok', status: 'scheduled', url: null }],
    });
    const result = await applyEvent({
      type: 'post.platform.published',
      data: { postId: 'zp-1', url: 'javascript:alert(1)', metadata: { contentId: 'c1' } },
    });
    assert.equal(result.handled, true);
    assert.equal(store.current().posts[0].url, null);
    assert.equal(store.current().posts[0].status, 'published'); // the rest of the event still applies
  });

  it('falls back to the previously-stored url rather than a malicious one on a tiktok url_resolved event', async () => {
    const store = stubStore({
      contentId: 'c1',
      posts: [{ zernioPostId: 'zp-1', format: 'tiktok', status: 'published', url: 'https://tiktok.com/@x/1' }],
    });
    const result = await applyEvent({
      type: 'post.tiktok.url_resolved',
      data: { postId: 'zp-1', url: 'javascript:alert(document.cookie)', metadata: { contentId: 'c1' } },
    });
    assert.equal(result.handled, true);
    assert.equal(store.current().posts[0].url, 'https://tiktok.com/@x/1'); // unchanged, not overwritten with the bad value
  });
});

// ── handler (default export) ────────────────────────────────────────────────────────────
describe('handler', () => {
  let savedSecret;
  beforeEach(() => { savedSecret = process.env.ZERNIO_WEBHOOK_SECRET; process.env.ZERNIO_WEBHOOK_SECRET = SECRET; });
  afterEach(() => {
    if (savedSecret === undefined) delete process.env.ZERNIO_WEBHOOK_SECRET;
    else process.env.ZERNIO_WEBHOOK_SECRET = savedSecret;
  });

  it('returns 405 for a non-POST method without reading the body', async () => {
    const res = mkRes();
    await handler({ method: 'GET', headers: {} }, res);
    assert.equal(res.statusCode, 405);
  });

  it('returns 401 for a signature that does not match', async () => {
    const raw = Buffer.from(JSON.stringify({ type: 'post.platform.published' }));
    const res = mkRes();
    await handler(mkReq({ headers: { 'x-zernio-signature': 'deadbeef'.repeat(8) }, body: raw }), res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Unauthorized');
  });

  it('returns 503, never 401, when ZERNIO_WEBHOOK_SECRET is unset', async () => {
    delete process.env.ZERNIO_WEBHOOK_SECRET;
    const raw = Buffer.from(JSON.stringify({ type: 'post.platform.published' }));
    // A signature computed against SOME secret, to prove it's the missing config — not a bad
    // signature — that drives the response.
    const res = mkRes();
    await handler(mkReq({ headers: { 'x-zernio-signature': hmacHex(raw, SECRET) }, body: raw }), res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, 'ZERNIO_WEBHOOK_SECRET is not configured');
  });

  it('returns 400 when the request stream errors while reading the body', async () => {
    const req = new Readable({ read() {} });
    req.method = 'POST';
    req.headers = { 'x-zernio-signature': 'irrelevant' };
    const res = mkRes();
    const promise = handler(req, res);
    req.emit('error', new Error('socket reset'));
    await promise;
    assert.equal(res.statusCode, 400);
  });

  it('returns 400 when the signature is valid but the body is not JSON', async () => {
    const raw = Buffer.from('not-json-at-all');
    const res = mkRes();
    await handler(mkReq({ headers: { 'x-zernio-signature': hmacHex(raw, SECRET) }, body: raw }), res);
    assert.equal(res.statusCode, 400);
  });

  it('answers 200 for a signature-valid event of a type it does not handle, and saves nothing', async () => {
    const raw = Buffer.from(JSON.stringify({
      type: 'post.platform.retried', // a real-looking type with no branch in applyEvent
      data: { postId: 'zp-9', metadata: { contentId: 'c9' } },
    }));
    const pack = { contentId: 'c9', posts: [{ zernioPostId: 'zp-9', format: 'tiktok', status: 'scheduled' }] };
    const savedGet = kv.get, savedSet = kv.set;
    kv.get = async (key) => (key === 'social:pack:c9' ? pack : null);
    kv.set = async () => { throw new Error('must not write — this event type is not handled'); };
    const res = mkRes();
    try {
      await handler(mkReq({ headers: { 'x-zernio-signature': hmacHex(raw, SECRET) }, body: raw }), res);
    } finally {
      kv.get = savedGet; kv.set = savedSet;
    }
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.handled, false);
  });

  it('answers 200 even when applyEvent throws, so Zernio does not retry into a storm', async () => {
    const raw = Buffer.from(JSON.stringify({
      type: 'post.platform.published',
      data: { postId: 'zp-1', metadata: { contentId: 'c1' } },
    }));
    const savedGet = kv.get, savedSet = kv.set;
    kv.get = async () => { throw new Error('kv is down'); };
    kv.set = async () => { throw new Error('kv is down'); };
    const res = mkRes();
    try {
      await handler(mkReq({ headers: { 'x-zernio-signature': hmacHex(raw, SECRET) }, body: raw }), res);
    } finally {
      kv.get = savedGet; kv.set = savedSet;
    }
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, false);
  });

  it('suppresses a duplicate delivery of the same event id without re-applying it', async () => {
    // A failure delivered after this success must never be allowed to overwrite it — exactly
    // the scenario the module's own comment calls out. First delivery applies; second, with
    // the same x-zernio-event-id, must short-circuit before ever touching the pack again.
    const raw = Buffer.from(JSON.stringify({
      type: 'post.platform.published',
      data: { postId: 'zp-1', url: 'https://tiktok.com/@x/v/1', metadata: { contentId: 'c1' } },
    }));
    const sig = hmacHex(raw, SECRET);
    const headers = { 'x-zernio-signature': sig, 'x-zernio-event-id': 'evt-dup-1' };

    const seen = new Map();
    let pack = { contentId: 'c1', posts: [{ zernioPostId: 'zp-1', format: 'tiktok', status: 'scheduled' }] };
    let packWrites = 0;
    const savedGet = kv.get, savedSet = kv.set;
    kv.get = async (key) => {
      if (String(key).startsWith('social:zernio:event:')) return seen.get(key) ?? null;
      if (key === 'social:pack:c1') return pack;
      return null;
    };
    kv.set = async (key, value) => {
      if (String(key).startsWith('social:zernio:event:')) { seen.set(key, value); return; }
      if (key === 'social:pack:c1') { pack = value; packWrites += 1; return; }
    };

    try {
      const res1 = mkRes();
      await handler(mkReq({ headers, body: raw }), res1);
      assert.equal(res1.statusCode, 200);
      assert.equal(res1.body.duplicate, undefined);
      assert.equal(pack.posts[0].status, 'published');
      assert.equal(packWrites, 1);

      const res2 = mkRes();
      await handler(mkReq({ headers, body: raw }), res2);
      assert.equal(res2.statusCode, 200);
      assert.equal(res2.body.duplicate, true);
      assert.equal(packWrites, 1); // second delivery must not touch the pack again
    } finally {
      kv.get = savedGet; kv.set = savedSet;
    }
  });
});
