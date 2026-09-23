// lib/route-auth.test.js — dispatch simulation for the API auth gates.
//
// Drives the real catch-alls (api/{core,content,automation,review}/[...slug].js)
// with every identity — anonymous, 'user', 'content', 'admin', and the internal
// CRON_SECRET bearer — and asserts the status each gets per route + method.
// A denied request must stop at 401/403 (503 for unset secrets); an allowed one
// must reach its handler, which with the stubbed empty store answers 200/204/400/
// 404/405. Asserting the handler's own status (not just "not 401") is what makes
// an allowed row able to fail if the gate wrongly blocks it.
//
// The shared `kv` singleton is monkeypatched with an in-memory store and the
// global fetch is replaced with one that throws, so nothing touches real KV or
// the network.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'test-jwt-secret-route-auth';
process.env.CRON_SECRET = 'test-cron-secret';
process.env.TELEGRAM_WEBHOOK_SECRET = 'test-telegram-secret';
process.env.NEXT_PUBLIC_APP_URL = 'https://app.test';

const { kv } = await import('./kv.js');
const { signSession } = await import('./auth.js');
const { authorize, LEVEL, DEFAULT_LEVEL } = await import('./route-auth.js');
const { isInternalRequest, verifyCronSecret, internalAuthHeaders } = await import('./cron-auth.js');
const core = (await import('../api/core/[...slug].js')).default;
const content = (await import('../api/content/[...slug].js')).default;
const automation = (await import('../api/automation/[...slug].js')).default;
const review = (await import('../api/review/[...slug].js')).default;
const authRouter = (await import('../api/auth/[...slug].js')).default;

const ROUTERS = { core, content, automation, review, auth: authRouter };

const USERS = [
  { id: 'u-admin',   name: 'Ada',  email: 'a@test', appRole: 'admin' },
  { id: 'u-content', name: 'Cora', email: 'c@test', appRole: 'content' },
  { id: 'u-user',    name: 'Uma',  email: 'u@test', appRole: 'user' },
];

const COOKIES = {
  admin:   `vance_session=${await signSession('u-admin')}`,
  content: `vance_session=${await signSession('u-content')}`,
  user:    `vance_session=${await signSession('u-user')}`,
};

function headersFor(who) {
  if (who === 'anon') return {};
  if (who === 'internal') return { authorization: `Bearer ${process.env.CRON_SECRET}` };
  return { cookie: COOKIES[who] };
}

// ── In-memory kv + no-network fetch ─────────────────────────────────────────
const KV_METHODS = ['get', 'set', 'del', 'keys', 'mget', 'lpush', 'rpush', 'lrange', 'llen', 'ltrim', 'lrem', 'zadd', 'zrange', 'zrangebyscore', 'zrem'];
let saved = {};
let store;
let fetchCalls;
let origFetch;

function seed() {
  store = new Map([
    ['users', USERS],
    ['content:item-draft', { id: 'item-draft', title: 'Draft', body: 'one two', status: 'draft', approvals: [], rejections: [] }],
    ['content:item-approved', { id: 'item-approved', title: 'Approved', body: 'x', status: 'approved', approvals: [], rejections: [] }],
  ]);
}

beforeEach(() => {
  seed();
  for (const m of KV_METHODS) saved[m] = kv[m];
  const clone = v => (v == null ? null : structuredClone(v));
  kv.get    = async k => clone(store.get(k));
  kv.set    = async (k, v) => { store.set(k, clone(v)); return 'OK'; };
  kv.del    = async k => { store.delete(k); return 1; };
  kv.keys   = async () => [];
  kv.mget   = async (...ks) => ks.map(k => clone(store.get(k)));
  kv.lpush  = async (k, ...v) => { store.set(k, [...v.reverse(), ...(store.get(k) || [])]); return 1; };
  kv.rpush  = async (k, ...v) => { store.set(k, [...(store.get(k) || []), ...v]); return 1; };
  kv.lrange = async k => (Array.isArray(store.get(k)) ? [...store.get(k)] : []);
  kv.llen   = async k => (store.get(k) || []).length;
  kv.ltrim  = async () => 'OK';
  kv.lrem   = async () => 0;
  kv.zadd = kv.zrem = async () => 0;
  kv.zrange = kv.zrangebyscore = async () => [];
  fetchCalls = [];
  origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    fetchCalls.push({ url: String(url), opts });
    throw new Error('network disabled in route-auth.test.js');
  };
});

afterEach(() => {
  for (const m of KV_METHODS) kv[m] = saved[m];
  globalThis.fetch = origFetch;
});

function mkRes() {
  const r = { statusCode: 200, body: null, headers: {}, ended: false };
  r.status    = c => { r.statusCode = c; return r; };
  r.json      = b => { r.body = b; r.ended = true; return r; };
  r.send      = b => { r.body = b; r.ended = true; return r; };
  r.end       = () => { r.ended = true; return r; };
  r.write     = () => true;
  r.setHeader = (k, v) => { r.headers[k] = v; return r; };
  r.redirect  = (c, u) => { r.statusCode = c; r.headers.Location = u; r.ended = true; return r; };
  return r;
}

async function call(router, { method, path = '', query = {}, body, headers = {} }, { rewrite = false } = {}) {
  const req = {
    method,
    headers,
    query: { ...(rewrite ? { slug: path } : { '...slug': path }), ...query },
    body,
  };
  const res = mkRes();
  await ROUTERS[router](req, res);
  assert.ok(res.ended, `${method} /api/${router}/${path} never answered`);
  return res;
}

const FUTURE = new Date(Date.now() + 86400000).toISOString();
const WHO = ['anon', 'user', 'content', 'admin', 'internal'];

// [router, method, path, { query, body }, [anon, user, content, admin, internal]]
const MATRIX = [
  // ── core ──────────────────────────────────────────────────────────────────
  ['core', 'POST',   'publish',   { body: { contentId: 'missing' } },                    [401, 403, 404, 404, 404]],
  ['core', 'GET',    'publish',   {},                                                     [401, 403, 403, 405, 405]],
  ['core', 'POST',   'schedule',  { body: { contentId: 'missing', scheduledAt: FUTURE } }, [401, 403, 404, 404, 404]],
  ['core', 'GET',    'reviewers', {},                                                     [401, 200, 200, 200, 200]],
  ['core', 'POST',   'reviewers', { body: { email: 'not-an-email' } },                   [401, 403, 403, 400, 400]],
  ['core', 'PATCH',  'reviewers', { query: { id: 'nope' }, body: {} },                    [401, 403, 403, 404, 404]],
  ['core', 'DELETE', 'reviewers', { query: { id: 'nope' } },                              [401, 403, 403, 204, 204]],
  ['core', 'GET',    'bogus',     {},                                                     [401, 403, 403, 404, 404]],

  // ── content ───────────────────────────────────────────────────────────────
  ['content', 'GET',  '', {},                                             [401, 200, 200, 200, 200]],
  ['content', 'GET',  '', { query: { slim: '1' } },                       [401, 200, 200, 200, 200]],
  ['content', 'GET',  '', { query: { action: 'summary' } },               [401, 200, 200, 200, 200]],
  ['content', 'POST', '', { body: {} },                                   [401, 400, 400, 400, 400]],
  // admin diagnostics: catch-all admin gate; the handler itself wants a real admin user
  ['content', 'POST', '', { query: { action: 'email-diagnostic' }, body: {} }, [401, 403, 403, 400, 401]],
  // named config routes: session at the catch-all, finer role checks inside
  ['content', 'GET',  'word-limits', {},                                  [401, 200, 200, 200, 401]],
  ['content', 'PUT',  'word-limits', { body: {} },                        [401, 403, 200, 200, 401]],
  // /api/content/:id
  ['content', 'GET',    'item-draft', {},                                 [401, 200, 200, 200, 200]],
  ['content', 'GET',    'missing',    {},                                 [401, 404, 404, 404, 404]],
  ['content', 'PUT',    'item-draft', { body: { title: 'Renamed' } },     [401, 200, 200, 200, 200]],
  ['content', 'PUT',    'item-draft', { body: { status: 'in_review' } },  [401, 200, 200, 200, 200]],
  ['content', 'PUT',    'item-draft', { body: { status: 'approved' } },   [401, 403, 200, 200, 200]],
  ['content', 'PUT',    'item-approved', { body: { status: 'scheduled' } }, [401, 403, 200, 200, 200]],
  ['content', 'PUT',    'item-approved', { body: { status: 'published' } }, [401, 403, 200, 200, 200]],
  // re-sending the current status is not a status change → no content+ requirement
  // A basic user may not edit an article already cleared to publish, even without a status change.
  ['content', 'PUT',    'item-approved', { body: { status: 'approved', title: 'T' } }, [401, 403, 200, 200, 200]],
  ['content', 'DELETE', 'item-draft', {},                                 [401, 204, 204, 204, 204]],
  ['content', 'POST',   'item-draft',  {},                                [401, 403, 403, 405, 405]],
  // sub-actions: content+ at the catch-all; handlers need a real user (internal → 401)
  ['content', 'POST', 'item-draft/ai-revise',      { body: {} },          [401, 403, 400, 400, 401]],
  ['content', 'POST', 'item-draft/apply-revision', { body: {} },          [401, 403, 400, 400, 401]],
  ['content', 'POST', 'item-draft/comment',        { body: { overall: 'hi' } }, [401, 403, 200, 200, 401]],
  // auth is checked BEFORE the existence lookup: internal on a missing id is
  // 401 (the handler's user check), not 404
  ['content', 'POST', 'missing/ai-revise',         { body: {} },          [401, 403, 404, 404, 401]],
  ['content', 'POST', 'missing/apply-revision',    { body: {} },          [401, 403, 404, 404, 401]],
  ['content', 'POST', 'missing/comment',           { body: {} },          [401, 403, 404, 404, 401]],
  ['content', 'GET',  'item-draft/bogus',          {},                    [401, 403, 403, 404, 404]],

  // ── automation ────────────────────────────────────────────────────────────
  // signed-token flavour: public; a bad token is the handler's 400, for everyone
  ['automation', 'GET',  'approve', { query: { token: 'garbage' } },                      [400, 400, 400, 400, 400]],
  ['automation', 'POST', 'approve', { query: { token: 'garbage' }, body: {} },            [400, 400, 400, 400, 400]],
  // JSON flavour: content+ or internal
  ['automation', 'POST', 'approve', { body: { jobId: 'missing', action: 'approve' } },    [401, 403, 404, 404, 404]],
  ['automation', 'PUT',  'approve', { body: {} },                                          [401, 403, 403, 405, 405]],
  // backfill routes keep their own x-backfill-auth — even admin/internal need it
  ['automation', 'GET',  'backfill-heroes', {},                                            [401, 401, 401, 401, 401]],
  ['automation', 'GET',  'backfill-missing-heroes', {},                                    [401, 401, 401, 401, 401]],
  // run: GET is cron-only (a session never suffices); POST is content+ (not run here)
  ['automation', 'GET',  'run', {},                                                        [401, 401, 401, 401, null]],
  ['automation', 'POST', 'run', { body: {} },                                              [401, 403, null, null, null]],
  ['automation', 'PUT',  'run', {},                                                        [401, 403, 403, 405, 405]],
  ['automation', 'POST', 'telegram-test', { body: {} },                                    [401, 403, 400, 400, 400]],
  ['automation', 'GET',    'logs', {},                                                     [401, 403, 200, 200, 200]],
  ['automation', 'DELETE', 'logs', {},                                                     [401, 403, 200, 200, 200]],
  ['automation', 'GET',    'rules', {},                                                    [401, 403, 200, 200, 200]],
  ['automation', 'POST',   'rules', { body: {} },                                          [401, 403, 400, 400, 400]],
  ['automation', 'GET',    'rules/r-missing', {},                                          [401, 403, 404, 404, 404]],
  ['automation', 'PATCH',  'rules/r-missing', { body: {} },                                [401, 403, 404, 404, 404]],
  ['automation', 'DELETE', 'rules/r-missing', {},                                          [401, 403, 404, 404, 404]],
  ['automation', 'GET',    'jobs', {},                                                     [401, 200, 200, 200, 200]],
  ['automation', 'GET',    'jobs/j-missing', {},                                           [401, 404, 404, 404, 404]],
  ['automation', 'POST',   'jobs', {},                                                     [401, 403, 403, 405, 405]],
  ['automation', 'GET',    'bibliography', {},                                             [401, 403, 200, 200, 200]],
  ['automation', 'POST',   'sources-list', { body: {} },                                   [401, 403, 400, 400, 400]],
  ['automation', 'POST',   'auth/config', { body: {} },                                    [401, 403, 403, 400, 400]],
  ['automation', 'GET',    'auth/status', {},                                              [401, 403, 200, 200, 200]],
  ['automation', 'GET',    'auth/google', {},                                              [401, 403, 403, 400, 400]],
  ['automation', 'GET',    'auth/dropbox', {},                                             [401, 403, 403, 400, 400]],
  ['automation', 'DELETE', 'auth/google', {},                                              [401, 403, 403, 200, 200]],
  ['automation', 'DELETE', 'auth/dropbox', {},                                             [401, 403, 403, 200, 200]],
  // OAuth redirect target stays public
  ['automation', 'GET',    'auth/google/callback', { query: { error: 'access_denied' } },  [200, 200, 200, 200, 200]],
  ['automation', 'GET',    'auth/dropbox/callback', { query: { error: 'access_denied' } }, [200, 200, 200, 200, 200]],
  ['automation', 'POST',   'auth/google/callback', {},                                     [401, 403, 403, 404, 404]],
  ['automation', 'GET',    'bogus', {},                                                    [401, 403, 403, 404, 404]],

  // ── review ────────────────────────────────────────────────────────────────
  ['review', 'POST', 'send', { body: { contentId: 'missing' } },                           [401, 403, 404, 404, 404]],
  ['review', 'GET',  'send', {},                                                           [401, 403, 403, 405, 405]],
  ['review', 'GET',  'not-a-jwt', {},                                                      [400, 400, 400, 400, 400]],
  ['review', 'POST', 'not-a-jwt', { body: {} },                                            [400, 400, 400, 400, 400]],
];

describe('dispatch simulation — status per route × identity', () => {
  for (const [router, method, path, opts, expected] of MATRIX) {
    WHO.forEach((who, i) => {
      const want = expected[i];
      if (want === null) return; // not exercised (would start a real automation run)
      it(`${method} /api/${router}${path ? '/' + path : ''}${opts.query ? '?' + new URLSearchParams(opts.query) : ''} as ${who} → ${want}`, async () => {
        const res = await call(router, { method, path, query: opts.query, body: opts.body, headers: headersFor(who) });
        assert.equal(res.statusCode, want, `body: ${JSON.stringify(res.body)?.slice(0, 200)}`);
      });
    });
  }

  it('POST /api/automation/telegram: public at the catch-all, but the handler requires the secret header', async () => {
    const ok = await call('automation', { method: 'POST', path: 'telegram', body: {}, headers: { 'x-telegram-bot-api-secret-token': 'test-telegram-secret' } });
    assert.equal(ok.statusCode, 200);
    const noHeader = await call('automation', { method: 'POST', path: 'telegram', body: {}, headers: headersFor('admin') });
    assert.equal(noHeader.statusCode, 401);
  });

  it('the rewrite form of the slug (req.query.slug) is gated the same way', async () => {
    const res = await call('automation', { method: 'DELETE', path: 'rules/r-missing', headers: headersFor('user') }, { rewrite: true });
    assert.equal(res.statusCode, 403);
    const res2 = await call('core', { method: 'POST', path: 'publish', body: { contentId: 'missing' }, headers: {} }, { rewrite: true });
    assert.equal(res2.statusCode, 401);
  });

  it('a wrong bearer is not internal — it is treated as anonymous', async () => {
    const res = await call('core', { method: 'POST', path: 'publish', body: { contentId: 'missing' }, headers: { authorization: 'Bearer wrong' } });
    assert.equal(res.statusCode, 401);
  });

  it('denied requests never reach KV writes or the network', async () => {
    const before = JSON.stringify([...store.entries()]);
    await call('core', { method: 'POST', path: 'reviewers', body: { email: 'x@y.z' }, headers: headersFor('user') });
    await call('automation', { method: 'DELETE', path: 'logs', headers: {} });
    await call('automation', { method: 'POST', path: 'auth/config', body: { service: 'google', clientId: 'a', clientSecret: 'b' }, headers: headersFor('content') });
    assert.equal(JSON.stringify([...store.entries()]), before);
    assert.equal(fetchCalls.length, 0);
  });
});

describe('item PUT status gate', () => {
  it("a 'user' cannot schedule an approved article (the cron would publish it)", async () => {
    const res = await call('content', { method: 'PUT', path: 'item-approved', body: { status: 'scheduled' }, headers: headersFor('user') });
    assert.equal(res.statusCode, 403);
    assert.equal(store.get('content:item-approved').status, 'approved');
  });

  it('labels audit entries with the signed-in user', async () => {
    const res = await call('content', { method: 'PUT', path: 'item-draft', body: { title: 'New title' }, headers: headersFor('user') });
    assert.equal(res.statusCode, 200);
    const log = store.get('content:item-draft').auditLog || [];
    assert.ok(log.some(e => e.actor === 'Uma'), JSON.stringify(log));
  });
});

describe('JSON approve — voter is the authenticated identity, not req.body.channel', () => {
  function seedJob() {
    store.set('automation:rule:r1', { id: 'r1', name: 'R', review: { mode: 'all' }, publish: { wordpress: false } });
    store.set('automation:job:j1', {
      id: 'j1', ruleId: 'r1', contentId: 'item-draft', status: 'pending_review',
      reviewerIds: ['a', 'b', 'c'], approvals: [], rejections: [],
    });
  }
  const vote = (who, channel) => call('automation', {
    method: 'POST', path: 'approve', body: { jobId: 'j1', action: 'approve', channel }, headers: headersFor(who),
  });

  it('one user cannot stuff votes by varying channel', async () => {
    seedJob();
    const first = await vote('content', 'a');
    assert.equal(first.statusCode, 200);
    const second = await vote('content', 'b');
    assert.equal(second.statusCode, 409);
    const job = store.get('automation:job:j1');
    assert.deepEqual(job.approvals, ['u-content']);
    assert.equal(job.status, 'pending_review');
  });

  it("internal calls vote as 'internal', or 'timeout' for the timeout channel", async () => {
    seedJob();
    assert.equal((await vote('internal', 'timeout')).statusCode, 200);
    assert.equal((await vote('internal', 'manual')).statusCode, 200);
    assert.equal((await vote('internal', 'whatever')).statusCode, 409); // still 'internal'
    assert.deepEqual(store.get('automation:job:j1').approvals, ['timeout', 'internal']);
  });

  it("a 'user' cannot vote at all", async () => {
    seedJob();
    assert.equal((await vote('user', 'a')).statusCode, 403);
    assert.deepEqual(store.get('automation:job:j1').approvals, []);
  });

  it('the publish call after a threshold approval carries the internal bearer', async () => {
    store.set('automation:rule:r1', { id: 'r1', name: 'R', review: { mode: 'any' }, publish: { wordpress: true } });
    store.set('automation:job:j1', { id: 'j1', ruleId: 'r1', contentId: 'item-draft', status: 'pending_review', approvals: [], rejections: [] });
    const res = await vote('content', 'x');
    assert.equal(res.statusCode, 200);
    const pub = fetchCalls.find(c => c.url.endsWith('/api/publish'));
    assert.ok(pub, 'publish was attempted');
    assert.equal(pub.opts.headers.Authorization, 'Bearer test-cron-secret');
  });
});

describe('unset secrets fail closed', () => {
  it('JWT_SECRET unset: a previously valid session cookie no longer authenticates', async () => {
    const saved = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      const res = await call('core', { method: 'GET', path: 'reviewers', headers: headersFor('admin') });
      assert.equal(res.statusCode, 401);
    } finally { process.env.JWT_SECRET = saved; }
  });

  it('JWT_SECRET unset: review-token, approve-token, review send and login answer 503', async () => {
    const saved = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      assert.equal((await call('review', { method: 'GET', path: 'some-token' })).statusCode, 503);
      assert.equal((await call('automation', { method: 'GET', path: 'approve', query: { token: 't' } })).statusCode, 503);
      assert.equal((await call('automation', { method: 'POST', path: 'approve', query: { token: 't' }, body: {} })).statusCode, 503);
      assert.equal((await call('review', { method: 'POST', path: 'send', body: { contentId: 'item-draft' }, headers: headersFor('internal') })).statusCode, 503);
      assert.equal((await call('auth', { method: 'POST', path: 'login', body: { email: 'a@test', password: 'x' } })).statusCode, 503);
      assert.equal(fetchCalls.length, 0);
    } finally { process.env.JWT_SECRET = saved; }
  });

  it('CRON_SECRET unset: `Bearer undefined` is not internal, and internalAuthHeaders throws', async () => {
    const saved = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    try {
      const req = { headers: { authorization: 'Bearer undefined' } };
      assert.equal(isInternalRequest(req), false);
      assert.equal(verifyCronSecret(req).status, 503);
      assert.throws(() => internalAuthHeaders(), /CRON_SECRET/);
      const res = await call('core', { method: 'POST', path: 'publish', body: { contentId: 'missing' }, headers: req.headers });
      assert.equal(res.statusCode, 401);
    } finally { process.env.CRON_SECRET = saved; }
  });
});

describe('lib/route-auth + cron-auth units', () => {
  it('an unknown level string denies instead of opening the route', async () => {
    const gate = await authorize({ headers: { authorization: 'Bearer test-cron-secret' } }, 'contnet');
    assert.equal(gate.ok, false);
    assert.equal(gate.status, 403);
  });

  it('the default level for an unlisted route is admin', () => {
    assert.equal(DEFAULT_LEVEL, LEVEL.ADMIN);
  });

  it('verifyCronSecret: different-length and same-length wrong bearers are both 401', () => {
    assert.equal(verifyCronSecret({ headers: { authorization: 'Bearer x' } }).status, 401);
    assert.equal(verifyCronSecret({ headers: { authorization: 'Bearer test-cron-secreX' } }).status, 401);
    assert.equal(verifyCronSecret({ headers: {} }).status, 401);
    assert.equal(verifyCronSecret({ headers: { authorization: 'Bearer test-cron-secret' } }).ok, true);
  });

  it('internalAuthHeaders returns the bearer for CRON_SECRET', () => {
    assert.deepEqual(internalAuthHeaders(), { Authorization: 'Bearer test-cron-secret' });
  });
});
