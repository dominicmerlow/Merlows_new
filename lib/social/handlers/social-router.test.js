// api/social/[...slug].js — the auth gate added in front of routing. Before this
// session every /api/social/* route (post, accounts/link, kits, connections/test,
// generate...) was reachable by anyone; these tests pin the gate so it never falls
// open again. Imports the router straight from api/ (not a lib/ shim — see the
// CLAUDE.md note on consolidated catch-alls) so no new file lands under api/.
//
// kv is a plain singleton object (lib/kv.js), so tests monkey-patch its get/set
// methods for the duration of each test and restore the originals afterwards —
// this repo has no real Upstash reachable from a test run, and it's shared with
// another company's production data, so a real call must never happen.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../../api/social/[...slug].js';
import { kv } from '../../kv.js';
// JWT_SECRET must be set BEFORE lib/auth.js is evaluated: it reads the env var into a
// module-level constant at import time, and the insecure 'dev-secret-replace-in-production'
// fallback is being removed (it is publicly readable at /lib/auth.js, so anyone could forge
// an admin session with it). A static import would be hoisted above this assignment, hence
// the dynamic import.
process.env.JWT_SECRET ??= 'test-jwt-secret-social-router';
const { signSession } = await import('../../auth.js');

function mkRes() {
  const r = { statusCode: null, body: null };
  r.status = c => { r.statusCode = c; return r; };
  r.json   = b => { r.body = b;       return r; };
  return r;
}

function mkReq({ method = 'GET', slug = '', headers = {}, body } = {}) {
  return { method, headers, query: { '...slug': slug }, body };
}

// If an unauthenticated request ever reaches a downstream handler, that handler
// will call kv.get/kv.set before doing anything else — so making those throw is
// a concrete proof the handler was never reached, not just that the status
// happened to come out as 401.
const throwKv = async () => { throw new Error('kv should not be touched for a rejected request'); };

let savedCronSecret, savedKvGet, savedKvSet, savedFetch;
beforeEach(() => {
  savedCronSecret = process.env.CRON_SECRET;
  savedKvGet = kv.get;
  savedKvSet = kv.set;
  savedFetch = globalThis.fetch;
});
afterEach(() => {
  if (savedCronSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = savedCronSecret;
  kv.get = savedKvGet;
  kv.set = savedKvSet;
  globalThis.fetch = savedFetch;
});

describe('api/social/[...slug] — non-cron routes require a session', () => {
  it('POST post with no session cookie is rejected before reaching the post handler', async () => {
    kv.get = throwKv; kv.set = throwKv;
    const res = mkRes();
    await handler(mkReq({ method: 'POST', slug: 'post', body: { kitId: 'k1', platform: 'twitter' } }), res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Not authenticated');
  });

  it('POST accounts/link with no session cookie is rejected before reaching the accounts handler', async () => {
    kv.get = throwKv; kv.set = throwKv;
    const res = mkRes();
    await handler(mkReq({ method: 'POST', slug: 'accounts/link', body: { platform: 'linkedin' } }), res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Not authenticated');
  });

  it('GET kits with no session cookie is rejected before reaching the kits handler', async () => {
    kv.get = throwKv; kv.set = throwKv;
    const res = mkRes();
    await handler(mkReq({ method: 'GET', slug: 'kits' }), res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Not authenticated');
  });

  it('POST connections/test with no session cookie is rejected before reaching the connections handler', async () => {
    kv.get = throwKv; kv.set = throwKv;
    const res = mkRes();
    await handler(mkReq({ method: 'POST', slug: 'connections/test', body: { platform: 'openrouter' } }), res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Not authenticated');
  });

  it('POST generate with no session cookie is rejected before reaching the generate handler', async () => {
    kv.get = throwKv; kv.set = throwKv;
    const res = mkRes();
    await handler(mkReq({ method: 'POST', slug: 'generate', body: {} }), res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Not authenticated');
  });

  it('a valid session with role "user" is rejected with 403', async () => {
    kv.get = async (key) => (key === 'users' ? [{ id: 'u1', appRole: 'user', name: 'Daisy' }] : null);
    const token = await signSession('u1');
    const res = mkRes();
    await handler(mkReq({ method: 'GET', slug: 'kits', headers: { cookie: `vance_session=${token}` } }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'Requires role: admin or content');
  });

  it('a valid admin session gets past the gate — unknown resource proves routing was reached', async () => {
    kv.get = async (key) => (key === 'users' ? [{ id: 'u2', appRole: 'admin', name: 'Clifton' }] : null);
    const token = await signSession('u2');
    const res = mkRes();
    await handler(mkReq({ method: 'GET', slug: 'not-a-real-resource', headers: { cookie: `vance_session=${token}` } }), res);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error, 'Not found');
  });
});

describe('api/social/[...slug] — POST /image is exempt from the admin/content role gate', () => {
  // POST /social/image sits ABOVE the admin/content gate: only getCurrentUser is
  // required, so any signed-in role (including plain "user") should pass. The old
  // branch that used to serve this route lived below the gate and 403'd "user".
  it('a user-role session reaches the image handler, not blocked by role', async () => {
    kv.get = async (key) => (key === 'users' ? [{ id: 'u3', appRole: 'user', name: 'Daisy' }] : null);
    const token = await signSession('u3');
    const res = mkRes();
    // No `prompt` in the body — imageHandler's own 400 validation only fires once
    // execution is genuinely inside it, which is stronger proof than "not 401/403".
    await handler(mkReq({ method: 'POST', slug: 'image', body: {}, headers: { cookie: `vance_session=${token}` } }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'prompt is required');
  });

  it('POST image with no session cookie is rejected 401 before reaching the image handler', async () => {
    kv.get = throwKv; kv.set = throwKv;
    globalThis.fetch = async () => { throw new Error('image handler should not be reached'); };
    const res = mkRes();
    await handler(mkReq({ method: 'POST', slug: 'image', body: { prompt: 'a cat in a hat' } }), res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Not authenticated');
  });

  it('a user-role session POSTing to a non-image route is still rejected 403', async () => {
    kv.get = async (key) => (key === 'users' ? [{ id: 'u4', appRole: 'user', name: 'Daisy' }] : null);
    const token = await signSession('u4');
    const res = mkRes();
    await handler(mkReq({ method: 'POST', slug: 'post', body: { kitId: 'k1', platform: 'twitter' }, headers: { cookie: `vance_session=${token}` } }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'Requires role: admin or content');
  });

  it('GET image from a user-role session does not reach the image handler — falls to the role gate, 403', async () => {
    kv.get = async (key) => (key === 'users' ? [{ id: 'u5', appRole: 'user', name: 'Daisy' }] : null);
    const token = await signSession('u5');
    const res = mkRes();
    await handler(mkReq({ method: 'GET', slug: 'image', headers: { cookie: `vance_session=${token}` } }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'Requires role: admin or content');
  });
});

describe('api/social/[...slug] — cron routes bypass the session gate', () => {
  it('connections/check with the right bearer is NOT blocked by the session gate (no cookie sent)', async () => {
    process.env.CRON_SECRET = 'test-cron-secret';
    // Stubbed so connections.js's own health-check logic (kv reads/writes) can't
    // touch real storage; fetch isn't stubbed here on purpose — no PLATFORMS env
    // vars are set in this test process, so every platform is reported
    // unconfigured and skipped before any network call would happen.
    kv.get = async () => null;
    kv.set = async () => {};
    const res = mkRes();
    await handler(mkReq({
      method: 'GET',
      slug: 'connections/check',
      headers: { authorization: 'Bearer test-cron-secret' },
    }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(typeof res.body.checkedAt, 'string');
  });

  it('connections/check with no bearer is rejected 401', async () => {
    process.env.CRON_SECRET = 'test-cron-secret';
    kv.get = throwKv; kv.set = throwKv;
    const res = mkRes();
    await handler(mkReq({ method: 'GET', slug: 'connections/check' }), res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Unauthorized');
  });

  it('cron with a wrong bearer is rejected 401', async () => {
    process.env.CRON_SECRET = 'test-cron-secret';
    kv.get = throwKv; kv.set = throwKv;
    const res = mkRes();
    await handler(mkReq({ method: 'GET', slug: 'cron', headers: { authorization: 'Bearer wrong' } }), res);
    assert.equal(res.statusCode, 401);
  });

  it('cron does not fall open when CRON_SECRET is unset — 503, not the queue drain', async () => {
    delete process.env.CRON_SECRET;
    kv.get = throwKv; kv.set = throwKv;
    const res = mkRes();
    await handler(mkReq({ method: 'GET', slug: 'cron', headers: { authorization: 'Bearer anything' } }), res);
    assert.equal(res.statusCode, 503);
    assert.match(res.body.error, /CRON_SECRET/);
  });

  it('cron with PUT is rejected 405 before the auth check runs', async () => {
    delete process.env.CRON_SECRET; // even fully unconfigured, the method check wins first
    kv.get = throwKv; kv.set = throwKv;
    const res = mkRes();
    await handler(mkReq({ method: 'PUT', slug: 'cron' }), res);
    assert.equal(res.statusCode, 405);
  });
});
