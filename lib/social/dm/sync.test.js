// lib/social/dm/sync.js — the Z4 sweeper that creates one comment automation per Instagram post.
//
// Every test runs against an in-memory store and a fake Zernio. Nothing here may reach the real
// KV (shared with Vance's production data) or the real Zernio API (creating an automation there
// switches it on for real readers).
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  syncDmAutomations, dmEnabled, dmConfig, candidatesFrom, resolveScope, RECORD_KEY, MAX_ATTEMPTS, WAIT_LIMIT_MS,
} from './sync.js';

const ENV_KEYS = ['BRAND_SITE_HOST', 'BRAND_SOCIAL_HANDLE'];
let savedEnv;
beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

// Zernio ids are 24 hex characters, and dmConfig refuses anything else (a handle in
// ZERNIO_INSTAGRAM_ACCOUNT_ID reached production config on 2026-09-23).
const PROFILE = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const ACCOUNT = 'bbbbbbbbbbbbbbbbbbbbbbb2';
const ON = { SOCIAL_DM: 'on', ZERNIO_DM_API_KEY: 'dm-key', ZERNIO_PROFILE_ID: PROFILE, ZERNIO_INSTAGRAM_ACCOUNT_ID: ACCOUNT };
const quietLog = { error() {}, warn() {}, info() {} };

function memoryStore() {
  const data = new Map();
  const ttl = new Map();
  return {
    data,
    ttl,
    async get(key) { return data.has(key) ? data.get(key) : null; },
    async set(key, value, opts = {}) {
      if (opts.nx && data.has(key)) return null;
      data.set(key, value);
      ttl.set(key, opts.ex ?? null);
      return 'OK';
    },
    async del(key) { data.delete(key); ttl.delete(key); return 1; },
    async mget(...keys) { return keys.map((key) => (data.has(key) ? data.get(key) : null)); },
  };
}

/**
 * A fake Zernio. `create` decides what a POST does: 'ok' (default), a status number to fail
 * with, or a function. Every call is recorded with its method, path, headers and body.
 *
 * Shaped like Zernio's documented responses, not like what would be convenient: the list and
 * create responses carry NO `postId` (only the single-automation GET does). An earlier version
 * echoed it, and that hid a real duplicate-automation bug from every test (review 2026-09-23).
 */
const withoutPostId = ({ postId, ...rest }) => rest;
function fakeZernio({ automations = [], create = 'ok', posts = {} } = {}) {
  const calls = [];
  let nextId = 1;
  const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
  const fetchFn = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    const path = u.pathname.replace('/api/v1', '');
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, search: u.search, headers: init.headers ?? {}, body });
    if (method === 'GET' && path === '/comment-automations') {
      return reply(200, { success: true, automations: automations.map(withoutPostId) });
    }
    if (method === 'POST' && path === '/comment-automations') {
      const how = typeof create === 'function' ? create(body, calls) : create;
      if (typeof how === 'number') return reply(how, { error: `fake ${how}` });
      const automation = { id: `auto${nextId++}`, ...body, isActive: true };
      automations.push(automation);
      return reply(200, { success: true, automation: withoutPostId(automation) });
    }
    if (method === 'GET' && path.startsWith('/posts/')) {
      const id = decodeURIComponent(path.slice('/posts/'.length));
      return posts[id] ? reply(200, { post: posts[id] }) : reply(404, { error: 'no such post' });
    }
    return reply(500, { error: `fake: unexpected ${method} ${path}` });
  };
  return { calls, fetchFn, automations, posts: () => calls.filter((c) => c.method === 'POST') };
}

const pack = (contentId, posts, extra = {}) => ({
  contentId, url: `https://merlows.com/${contentId}/`, title: `Story ${contentId}`, posts, ...extra,
});
const reel = (id, status = 'scheduled') => ({ format: 'reel', platform: 'instagram', zernioPostId: id, status });
const carousel = (id, status = 'scheduled') => ({ format: 'carousel', platform: 'instagram', zernioPostId: id, status });

const run = (packs, zernio, { store = memoryStore(), env = ON, ...rest } = {}) =>
  syncDmAutomations({ env, store, fetchFn: zernio.fetchFn, listPacksFn: async () => packs, log: quietLog, now: 1_000, ...rest });

describe('the switch', () => {
  it('is on only for exactly "on", whatever the case or surrounding space', () => {
    assert.equal(dmEnabled({ SOCIAL_DM: 'on' }), true);
    assert.equal(dmEnabled({ SOCIAL_DM: ' On\n' }), true);
    for (const value of [undefined, '', 'off', 'yes', 'true', '1', 'onn']) {
      assert.equal(dmEnabled({ SOCIAL_DM: value }), false, String(value));
    }
  });

  it('does nothing at all when off: no Zernio call, no KV write', async () => {
    const zernio = fakeZernio();
    const store = memoryStore();
    const result = await run([pack('c1', [reel('zp1')])], zernio, { store, env: { ...ON, SOCIAL_DM: 'off' } });
    assert.deepEqual(result, { enabled: false });
    assert.equal(zernio.calls.length, 0);
    assert.equal(store.data.size, 0);
  });

  it('refuses to run when on but not configured, naming what is missing, before any call', async () => {
    const zernio = fakeZernio();
    await assert.rejects(
      run([pack('c1', [reel('zp1')])], zernio, { env: { SOCIAL_DM: 'on', ZERNIO_PROFILE_ID: 'p' } }),
      (err) => err.status === 503 && /ZERNIO_DM_API_KEY/.test(err.message) && /ZERNIO_INSTAGRAM_ACCOUNT_ID/.test(err.message),
    );
    assert.equal(zernio.calls.length, 0);
  });

  it('never falls back to the posting key', () => {
    assert.throws(() => dmConfig({ ...ON, ZERNIO_DM_API_KEY: undefined, ZERNIO_API_KEY: 'posting-key' }), /ZERNIO_DM_API_KEY/);
  });

  it('trims a pasted newline off every setting', () => {
    assert.deepEqual(dmConfig({ ...ON, ZERNIO_DM_API_KEY: 'dm-key\n', ZERNIO_PROFILE_ID: ` ${PROFILE} ` }), {
      apiKey: 'dm-key', profileId: PROFILE, accountId: ACCOUNT,
    });
  });

  it('refuses a handle or any other non-id in the id variables, without echoing the value', () => {
    for (const [name, value] of [
      ['ZERNIO_INSTAGRAM_ACCOUNT_ID', '@merlows.news'],
      ['ZERNIO_INSTAGRAM_ACCOUNT_ID', 'merlows.news'],
      ['ZERNIO_PROFILE_ID', '6ab2985ea77a696ba3a9610'], // one character short
      ['ZERNIO_PROFILE_ID', '6ab2985ea77a696ba3a9610fz'],
    ]) {
      assert.throws(
        () => dmConfig({ ...ON, [name]: value }),
        (err) => err.status === 503 && err.message.includes(name) && !err.message.includes(value),
        `${name}=${value}`,
      );
    }
  });

  it('accepts the real Merlows ids', () => {
    assert.doesNotThrow(() => dmConfig({ ...ON, ZERNIO_PROFILE_ID: '6ab2985ea77a696ba3a9610f', ZERNIO_INSTAGRAM_ACCOUNT_ID: '6ab29cf68d284ffb212e1818' }));
  });

  it('stops the whole run on a handle before touching Zernio or KV', async () => {
    const zernio = fakeZernio();
    const store = memoryStore();
    await assert.rejects(
      run([pack('c1', [reel('zp1')])], zernio, { store, env: { ...ON, ZERNIO_INSTAGRAM_ACCOUNT_ID: '@merlows.news' } }),
      /ZERNIO_INSTAGRAM_ACCOUNT_ID is not a 24-character Zernio id/,
    );
    assert.equal(zernio.calls.length, 0);
    assert.equal(store.data.size, 0);
  });
});

describe('which posts get an automation', () => {
  it('Instagram reels and carousels only, once each, skipping failed posts and posts with nothing to link to', () => {
    const packs = [
      pack('c1', [
        reel('zp-reel'),
        carousel('zp-carousel', 'published'),
        { format: 'story', platform: 'instagram', zernioPostId: 'zp-story', status: 'scheduled' },
        { format: 'tiktok', platform: 'tiktok', zernioPostId: 'zp-tiktok', status: 'scheduled' },
        reel('zp-failed', 'failed'),
        { format: 'reel', platform: 'instagram', status: 'scheduled' }, // no Zernio id yet
        reel('zp-reel'), // the same post twice
      ]),
      pack('c2', [reel('zp-nolink')], { url: null }),
    ];
    assert.deepEqual(candidatesFrom(packs).map(({ post }) => post.zernioPostId), ['zp-reel', 'zp-carousel']);
  });

  it('tolerates a board with junk in it', () => {
    assert.deepEqual(candidatesFrom(null), []);
    assert.deepEqual(candidatesFrom([null, { url: 'x' }, { url: 'x', posts: 'nope' }]), []);
  });
});

describe('scope', () => {
  it('a scheduled post is named by Zernio\'s own id, without asking Zernio anything', async () => {
    const zernio = fakeZernio();
    assert.deepEqual(await resolveScope(reel('zp1'), { fetchFn: zernio.fetchFn, apiKey: 'k' }), { postId: 'zp1' });
    assert.equal(zernio.calls.length, 0);
  });

  it('a published post is named by its Instagram media id, fetched with the DM key', async () => {
    const zernio = fakeZernio({ posts: { zp1: { id: 'zp1', platforms: [{ platform: 'instagram', status: 'published', platformPostId: '1790001' }] } } });
    assert.deepEqual(await resolveScope(reel('zp1', 'published'), { fetchFn: zernio.fetchFn, apiKey: 'dm-key' }), { platformPostId: '1790001' });
    assert.equal(zernio.calls[0].headers.Authorization, 'Bearer dm-key');
  });

  // Zernio's docs: postId is for a NOT-yet-published post; a live one takes platformPostId alone.
  it('waits (null) rather than scoping a published post by Zernio\'s id when the media id is unknown', async () => {
    const missing = fakeZernio();
    assert.equal(await resolveScope(reel('zp1', 'published'), { fetchFn: missing.fetchFn, apiKey: 'k' }), null);
    const tiktokOnly = fakeZernio({ posts: { zp2: { platforms: [{ platform: 'tiktok', platformPostId: 't1' }] } } });
    assert.equal(await resolveScope(reel('zp2', 'published'), { fetchFn: tiktokOnly.fetchFn, apiKey: 'k' }), null);
  });

  it('asks Zernio once a scheduled post\'s slot has passed, because the board can lag', async () => {
    const past = { ...reel('zp1'), at: '2026-09-23T08:00:00.000Z' };
    const now = Date.parse('2026-09-23T09:00:00.000Z');
    const cases = [
      [{ platforms: [{ platform: 'instagram', status: 'published', platformPostId: 'ig7' }] }, { platformPostId: 'ig7' }],
      [{ platforms: [{ platform: 'instagram', status: 'scheduled' }] }, { postId: 'zp1' }],
      [{ platforms: [{ platform: 'instagram', status: 'publishing' }] }, null],
      [{ platforms: [{ platform: 'instagram', status: 'failed' }] }, null],
    ];
    for (const [post, expected] of cases) {
      const zernio = fakeZernio({ posts: { zp1: post } });
      assert.deepEqual(await resolveScope(past, { fetchFn: zernio.fetchFn, apiKey: 'k', now }), expected, JSON.stringify(post));
      assert.equal(zernio.calls.length, 1);
    }
  });

  it('does not ask Zernio about a post whose slot is still in the future', async () => {
    const future = { ...reel('zp1'), at: '2026-09-23T18:00:00.000Z' };
    const zernio = fakeZernio();
    assert.deepEqual(await resolveScope(future, { fetchFn: zernio.fetchFn, apiKey: 'k', now: Date.parse('2026-09-23T09:00:00.000Z') }), { postId: 'zp1' });
    assert.equal(zernio.calls.length, 0);
  });
});

describe('creating', () => {
  it('creates one automation per eligible post, with the DM key, a stable request id and the agreed payload', async () => {
    const zernio = fakeZernio();
    const store = memoryStore();
    const result = await run([pack('c1', [reel('zp1'), carousel('zp2')])], zernio, { store });

    assert.equal(result.created, 2);
    const posts = zernio.posts();
    assert.equal(posts.length, 2);
    for (const call of zernio.calls) assert.equal(call.headers.Authorization, 'Bearer dm-key');
    assert.equal(posts[0].headers['x-request-id'], 'merlows-dm-zp1');
    const body = posts[0].body;
    assert.equal(body.name, 'merlows-dm zp1');
    assert.equal(body.postId, 'zp1');
    assert.equal(body.profileId, PROFILE);
    assert.equal(body.accountId, ACCOUNT);
    assert.deepEqual(body.keywords, ['VOICES']);
    assert.equal(Object.hasOwn(body, 'isActive'), false);
    assert.match(body.dmMessage, /Here's the full story: Story c1\nhttps:\/\/merlows\.com\/c1\/\?utm_source=instagram/);

    const record = store.data.get(RECORD_KEY('zp1'));
    assert.equal(record.state, 'done');
    assert.equal(record.automationId, 'auto1');
    assert.deepEqual(record.scope, { postId: 'zp1' });
    assert.equal(store.ttl.get(RECORD_KEY('zp1')), 180 * 24 * 60 * 60);
  });

  it('is idempotent: a second run touches nothing, not even Zernio', async () => {
    const store = memoryStore();
    await run([pack('c1', [reel('zp1')])], fakeZernio(), { store });
    const second = fakeZernio();
    const result = await run([pack('c1', [reel('zp1')])], second, { store });
    assert.equal(result.pending, 0);
    assert.equal(second.calls.length, 0);
  });

  it('leaves no lease behind, whether the create worked or failed', async () => {
    const store = memoryStore();
    await run([pack('c1', [reel('ok1')]), pack('c2', [reel('bad1')])], fakeZernio({ create: (body) => (body.postId === 'bad1' ? 500 : 'ok') }), { store });
    assert.deepEqual([...store.data.keys()].filter((k) => k.endsWith(':lease')), []);
  });

  it('skips a post another run holds the lease on', async () => {
    const store = memoryStore();
    await store.set(`${RECORD_KEY('zp1')}:lease`, { at: 0 }, { nx: true, ex: 300 });
    const zernio = fakeZernio();
    const result = await run([pack('c1', [reel('zp1')])], zernio, { store });
    assert.equal(result.busy, 1);
    assert.equal(zernio.posts().length, 0);
  });

  it('caps how many it creates in one run and leaves the rest for the next', async () => {
    const packs = Array.from({ length: 7 }, (_, i) => pack(`c${i}`, [reel(`zp${i}`)]));
    const zernio = fakeZernio();
    const store = memoryStore();
    const first = await run(packs, zernio, { store });
    assert.equal(first.created, 5);
    assert.equal(first.deferred, 2);
    const second = await run(packs, fakeZernio(), { store });
    assert.equal(second.created, 2);
  });
});

describe('never a second automation on one post', () => {
  it('adopts a live automation carrying this post\'s name (an earlier create whose record was lost)', async () => {
    const zernio = fakeZernio({ automations: [{ id: 'earlier', isActive: true, name: 'merlows-dm zp1', postId: 'zp1', keywords: ['VOICES'] }] });
    const store = memoryStore();
    const result = await run([pack('c1', [reel('zp1')])], zernio, { store });
    assert.equal(result.adopted, 1);
    assert.equal(zernio.posts().length, 0);
    assert.equal(store.data.get(RECORD_KEY('zp1')).automationId, 'earlier');
  });

  it('adopts a live automation on the same Instagram post whatever its name (one made by hand)', async () => {
    const posts = { zp1: { platforms: [{ platform: 'instagram', status: 'published', platformPostId: 'ig5' }] } };
    const zernio = fakeZernio({ posts, automations: [{ id: 'handmade', isActive: true, name: 'my own', platformPostId: 'ig5', keywords: ['VOICES'] }] });
    const result = await run([pack('c1', [reel('zp1', 'published')])], zernio);
    assert.equal(result.adopted, 1);
    assert.equal(zernio.posts().length, 0);
  });

  it('treats a 409 as "it exists" and adopts it when the re-list finds it', async () => {
    const automations = [];
    const zernio = fakeZernio({
      automations,
      create: (body) => {
        automations.push({ id: 'raced', isActive: true, name: body.name, postId: body.postId, keywords: ['VOICES'] });
        return 409;
      },
    });
    const store = memoryStore();
    const result = await run([pack('c1', [reel('zp1')])], zernio, { store });
    assert.equal(result.adopted, 1);
    assert.equal(store.data.get(RECORD_KEY('zp1')).automationId, 'raced');
  });

  it('does not adopt a paused automation: the post still needs a live one', async () => {
    const zernio = fakeZernio({ automations: [{ id: 'paused', isActive: false, name: 'merlows-dm zp1', postId: 'zp1', keywords: ['VOICES'] }] });
    const result = await run([pack('c1', [reel('zp1')])], zernio);
    assert.equal(result.created, 1);
  });

  it('a create that timed out after Zernio stored it is found by name on the next run, while still scheduled', async () => {
    // Review 2026-09-23 (Can break): Zernio ignores x-request-id here, its list carries no postId
    // and its documented 409 is for platformPostId only, so nothing else would catch this.
    const automations = [];
    const store = memoryStore();
    const ghostThenFail = fakeZernio({
      automations,
      create: (body) => {
        automations.push({ id: 'ghost', isActive: true, name: body.name, postId: body.postId, keywords: ['VOICES'] });
        return 503;
      },
    });
    assert.equal((await run([pack('c1', [reel('zp1')])], ghostThenFail, { store })).retrying, 1);

    const next = fakeZernio({ automations });
    const result = await run([pack('c1', [reel('zp1')])], next, { store });
    assert.equal(result.adopted, 1);
    assert.equal(next.posts().length, 0);
    assert.equal(automations.filter((a) => a.isActive).length, 1);
    assert.equal(store.data.get(RECORD_KEY('zp1')).automationId, 'ghost');
  });
});

describe('overlapping runs', () => {
  // A store whose batched snapshot is stale: mget says "no record", but by the time this run holds
  // the lease another run has written one, which get() returns.
  const staleSnapshot = (freshRecord) => {
    const store = memoryStore();
    store.mget = async (...keys) => keys.map(() => null);
    store.get = async (key) => (key === RECORD_KEY('zp1') ? freshRecord : null);
    return store;
  };

  it('skips a post another run finished after this run took its snapshot', async () => {
    const zernio = fakeZernio();
    const result = await run([pack('c1', [reel('zp1')])], zernio, { store: staleSnapshot({ state: 'done', automationId: 'other' }) });
    assert.equal(result.raced, 1);
    assert.equal(zernio.posts().length, 0);
  });

  it('looks at Zernio again when another run attempted the post meanwhile, and adopts what it made', async () => {
    const automations = [];
    let lists = 0;
    const zernio = fakeZernio({ automations });
    const fetchFn = async (url, init = {}) => {
      if ((init.method || 'GET') === 'GET' && new URL(url).pathname.endsWith('/comment-automations')) {
        lists += 1;
        // The other run's create lands between this run's first list and its lease.
        if (lists === 2) automations.push({ id: 'theirs', isActive: true, name: 'merlows-dm zp1', keywords: ['VOICES'] });
      }
      return zernio.fetchFn(url, init);
    };
    const result = await run([pack('c1', [reel('zp1')])], { fetchFn }, { store: staleSnapshot({ state: 'retry', attempts: 1, at: 5 }) });
    assert.equal(lists, 2);
    assert.equal(result.adopted, 1);
    assert.equal(zernio.posts().length, 0);
  });
});

describe('failures', () => {
  it('retries a failed create on later runs, then gives up after the limit and stops trying', async () => {
    const store = memoryStore();
    const packs = [pack('c1', [reel('zp1')])];
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      const result = await run(packs, fakeZernio({ create: 500 }), { store });
      assert.equal(result.retrying, 1, `attempt ${attempt}`);
      assert.equal(store.data.get(RECORD_KEY('zp1')).attempts, attempt);
      assert.equal(store.ttl.get(RECORD_KEY('zp1')), 7 * 24 * 60 * 60);
    }
    const last = await run(packs, fakeZernio({ create: 500 }), { store });
    assert.equal(last.gaveUp, 1);
    assert.equal(store.data.get(RECORD_KEY('zp1')).state, 'gave-up');

    const after = fakeZernio();
    const result = await run(packs, after, { store });
    assert.equal(result.pending, 0);
    assert.equal(after.calls.length, 0);
  });

  it('recovers on retry once Zernio answers', async () => {
    const store = memoryStore();
    const packs = [pack('c1', [reel('zp1')])];
    await run(packs, fakeZernio({ create: 503 }), { store });
    const result = await run(packs, fakeZernio(), { store });
    assert.equal(result.created, 1);
    assert.equal(store.data.get(RECORD_KEY('zp1')).state, 'done');
  });

  it('records an article that cannot be linked safely as rejected, once, and never sends it', async () => {
    const store = memoryStore();
    const packs = [pack('c1', [reel('zp1')], { url: 'https://evil.com/c1/' })];
    const zernio = fakeZernio();
    const result = await run(packs, zernio, { store });
    assert.equal(result.rejected, 1);
    assert.equal(zernio.posts().length, 0);
    assert.match(store.data.get(RECORD_KEY('zp1')).problems.join(' '), /not on merlows\.com/);

    const again = fakeZernio();
    assert.equal((await run(packs, again, { store })).pending, 0);
    assert.equal(again.calls.length, 0);
  });

  it('keeps going when the store fails for one post, and does not record that post', async () => {
    const store = memoryStore();
    const realSet = store.set.bind(store);
    store.set = async (key, value, opts) => {
      if (key === RECORD_KEY('zp1')) throw new Error('kv down');
      return realSet(key, value, opts);
    };
    const result = await run([pack('c1', [reel('zp1'), reel('zp2')])], fakeZernio(), { store });
    assert.equal(result.errors, 1);
    assert.equal(result.created, 1);
    assert.equal(store.data.has(RECORD_KEY('zp1')), false);
    assert.equal(store.data.get(RECORD_KEY('zp2')).state, 'done');
  });

  it('propagates a failure of the initial Zernio list call: the whole run cannot start, not just this post', async () => {
    // The one-time listCommentAutomations() read sits OUTSIDE the per-post try/catch — unlike a
    // per-post failure, this must not be swallowed into a 'retrying' count. syncDmAutomations
    // has no summary shape for "the run itself never got going".
    const listFails = async (url, init = {}) => {
      const method = init.method || 'GET';
      if (method === 'GET' && String(url).includes('/comment-automations')) {
        return { ok: false, status: 500, json: async () => ({ error: 'zernio down' }) };
      }
      throw new Error(`unexpected call in this test: ${method} ${url}`);
    };
    await assert.rejects(
      run([pack('c1', [reel('zp1')])], { fetchFn: listFails }),
      (err) => err.status === 500 && /Zernio GET \/comment-automations.*: zernio down/.test(err.message),
    );
  });

  it('a 409 whose re-list does not find a live match is an ordinary failure, not a silent adopt', async () => {
    const store = memoryStore();
    // create() always answers 409, and the re-list (GET) sees the same empty automations list —
    // modelling a 409 caused by something other than "the automation we tried to make already
    // exists", e.g. a stale profile lock or a race with something unrelated.
    const zernio = fakeZernio({ create: () => 409 });
    const result = await run([pack('c1', [reel('zp1')])], zernio, { store });
    assert.equal(result.retrying, 1);
    assert.equal(result.adopted, 0);
    const record = store.data.get(RECORD_KEY('zp1'));
    assert.equal(record.state, 'retry');
    assert.equal(record.attempts, 1);
    assert.match(record.error, /fake 409/);
  });
});

describe('one run, two posts that turn out to be the same live post', () => {
  it('the automation created for the first candidate is visible to the second: adopt, not a duplicate create', async () => {
    // Two different Zernio post ids (a reel and a carousel) that are both already published to
    // the SAME underlying Instagram post — resolveScope names both by that platformPostId, so
    // they collide by scope even though candidatesFrom never saw them as the same post.
    const posts = {
      zp1: { id: 'zp1', platforms: [{ platform: 'instagram', status: 'published', platformPostId: 'ig-shared' }] },
      zp2: { id: 'zp2', platforms: [{ platform: 'instagram', status: 'published', platformPostId: 'ig-shared' }] },
    };
    const zernio = fakeZernio({ posts });
    const store = memoryStore();
    const result = await run([pack('c1', [reel('zp1', 'published'), carousel('zp2', 'published')])], zernio, { store });
    assert.equal(result.created, 1);
    assert.equal(result.adopted, 1);
    assert.equal(zernio.posts().length, 1); // only the first candidate's create reached Zernio
    assert.equal(store.data.get(RECORD_KEY('zp1')).automationId, store.data.get(RECORD_KEY('zp2')).automationId);
  });
});

describe('resolveScope when Zernio names the post but not (yet) a platform post id', () => {
  it('waits rather than scoping a live post by a stringified null or by Zernio\'s id', async () => {
    const zernio = fakeZernio({ posts: { zpX: { id: 'zpX', platforms: [{ platform: 'instagram', status: 'published' }] } } });
    assert.equal(await resolveScope(reel('zpX', 'published'), { fetchFn: zernio.fetchFn, apiKey: 'k' }), null);
  });

  it('a waiting post costs no create attempt: it is recorded as waiting, and looked at again next run', async () => {
    const store = memoryStore();
    const publishing = { zpX: { platforms: [{ platform: 'instagram', status: 'publishing' }] } };
    const first = await run([pack('c1', [reel('zpX', 'published')])], fakeZernio({ posts: publishing }), { store });
    assert.equal(first.waiting, 1);
    const record = store.data.get(RECORD_KEY('zpX'));
    assert.equal(record.state, 'waiting');
    assert.equal(record.attempts, undefined);
    assert.equal(record.since, 1_000);

    const live = { zpX: { platforms: [{ platform: 'instagram', status: 'published', platformPostId: 'ig1' }] } };
    const second = fakeZernio({ posts: live });
    const result = await run([pack('c1', [reel('zpX', 'published')])], second, { store });
    assert.equal(result.created, 1);
    assert.equal(second.posts()[0].body.platformPostId, 'ig1');
  });

  it('gives up on a post that is still not nameable a day later, so the lookups stop', async () => {
    const store = memoryStore();
    const stuck = { zpX: { platforms: [{ platform: 'instagram', status: 'failed' }] } };
    const packs = [pack('c1', [reel('zpX', 'published')])];
    await run(packs, fakeZernio({ posts: stuck }), { store, now: 1_000 });
    const almost = await run(packs, fakeZernio({ posts: stuck }), { store, now: 1_000 + WAIT_LIMIT_MS - 1 });
    assert.equal(almost.waiting, 1);
    assert.equal(store.data.get(RECORD_KEY('zpX')).since, 1_000, 'the wait is measured from the first time, not reset');

    const late = await run(packs, fakeZernio({ posts: stuck }), { store, now: 1_000 + WAIT_LIMIT_MS });
    assert.equal(late.gaveUp, 1);
    assert.equal(store.data.get(RECORD_KEY('zpX')).state, 'gave-up');

    const after = fakeZernio({ posts: stuck });
    assert.equal((await run(packs, after, { store, now: 1_000 + WAIT_LIMIT_MS + 1 })).pending, 0);
    assert.equal(after.calls.length, 0);
  });
});

describe('posts stuck waiting cannot starve the rest (review 2026-09-23)', () => {
  it('a post never tried before is worked ahead of posts waiting on Zernio, and waiting does not use up the create cap', async () => {
    const store = memoryStore();
    const posts = {};
    const waitingPacks = [];
    for (let i = 0; i < 6; i++) {
      posts[`w${i}`] = { platforms: [{ platform: 'instagram', status: 'publishing' }] };
      waitingPacks.push(pack(`cw${i}`, [reel(`w${i}`, 'published')]));
      await store.set(RECORD_KEY(`w${i}`), { state: 'waiting', since: 1_000, at: 1_000 });
    }
    // Newest first, as the board is read: six stuck posts, then an older post nobody has tried.
    const packs = [...waitingPacks, pack('old', [reel('fresh1')])];
    const zernio = fakeZernio({ posts });
    const result = await run(packs, zernio, { store });
    assert.equal(result.created, 1);
    assert.equal(zernio.posts()[0].body.postId, 'fresh1');
    assert.equal(result.waiting, 6);
    assert.equal(result.deferred, 0);
  });

  it('works a never-tried post first even when the waiting posts alone would fill the run', async () => {
    const store = memoryStore();
    const posts = {};
    const packs = [];
    for (let i = 0; i < 10; i++) {
      posts[`w${i}`] = { platforms: [{ platform: 'instagram', status: 'publishing' }] };
      packs.push(pack(`cw${i}`, [reel(`w${i}`, 'published')]));
      await store.set(RECORD_KEY(`w${i}`), { state: 'waiting', since: 1_000, at: 1_000 });
    }
    packs.push(pack('old', [reel('fresh1')])); // oldest on the board, never tried
    const zernio = fakeZernio({ posts });
    const result = await run(packs, zernio, { store });
    assert.equal(result.created, 1);
    assert.equal(zernio.posts()[0].body.postId, 'fresh1');
    assert.equal(result.deferred, 1); // one waiting post, not the new one, waits for the next run
  });

  it('bounds how many posts one run looks at, and leaves the rest for the next run', async () => {
    const store = memoryStore();
    const posts = {};
    const packs = [];
    for (let i = 0; i < 12; i++) {
      posts[`w${i}`] = { platforms: [{ platform: 'instagram', status: 'publishing' }] };
      packs.push(pack(`c${i}`, [reel(`w${i}`, 'published')]));
    }
    const result = await run(packs, fakeZernio({ posts }), { store });
    assert.equal(result.waiting, 10);
    assert.equal(result.deferred, 2);
  });
});

describe('a retry record whose post is published before the next run', () => {
  // Found by the test-writer 2026-09-23: the scope changes from postId to platformPostId between
  // runs, so a scope comparison alone could not see the automation the failed attempt created.
  it('adopts the automation the failed attempt created, found by name across the scope change', async () => {
    const automations = [];
    const store = memoryStore();
    const zernioRun1 = fakeZernio({
      automations,
      create: (body) => {
        automations.push({ id: 'ghost', isActive: true, name: body.name, postId: body.postId, keywords: ['VOICES'] });
        return 500;
      },
    });
    const run1 = await run([pack('c1', [reel('zp1', 'scheduled')])], zernioRun1, { store });
    assert.equal(run1.retrying, 1);

    const posts = { zp1: { id: 'zp1', platforms: [{ platform: 'instagram', status: 'published', platformPostId: 'ig-999' }] } };
    const zernioRun2 = fakeZernio({ automations, posts });
    const run2 = await run([pack('c1', [reel('zp1', 'published')])], zernioRun2, { store });

    assert.equal(run2.adopted, 1);
    assert.equal(run2.created, 0);
    assert.equal(automations.filter((a) => a.isActive).length, 1, 'still exactly one live automation on the post');
  });
});

describe('SOCIAL_DM_MAX_PER_RUN parsing (a module-level constant — each case needs its own fresh import)', () => {
  const savedEnv = process.env.SOCIAL_DM_MAX_PER_RUN;
  afterEach(() => {
    if (savedEnv === undefined) delete process.env.SOCIAL_DM_MAX_PER_RUN;
    else process.env.SOCIAL_DM_MAX_PER_RUN = savedEnv;
  });

  const sixCandidates = Array.from({ length: 6 }, (_, i) => pack(`c${i}`, [reel(`zp${i}`)]));

  async function runWithFreshCap(envValue, tag) {
    if (envValue === undefined) delete process.env.SOCIAL_DM_MAX_PER_RUN;
    else process.env.SOCIAL_DM_MAX_PER_RUN = envValue;
    const mod = await import(`./sync.js?max-per-run-${tag}`);
    const store = memoryStore();
    return mod.syncDmAutomations({
      env: ON, store, fetchFn: fakeZernio().fetchFn, listPacksFn: async () => sixCandidates, log: quietLog, now: 1000,
    });
  }

  it('honours a positive integer', async () => {
    const result = await runWithFreshCap('2', 'positive');
    assert.equal(result.created, 2);
    assert.equal(result.deferred, 4);
  });

  it('"0" is falsy, so it silently falls back to the default of 5 rather than creating none', async () => {
    const result = await runWithFreshCap('0', 'zero');
    assert.equal(result.created, 5);
    assert.equal(result.deferred, 1);
  });

  it('a negative value floors to 1, never to "no cap"', async () => {
    const result = await runWithFreshCap('-3', 'negative');
    assert.equal(result.created, 1);
    assert.equal(result.deferred, 5);
  });

  it('a non-numeric value falls back to the default of 5', async () => {
    const result = await runWithFreshCap('not-a-number', 'nan');
    assert.equal(result.created, 5);
    assert.equal(result.deferred, 1);
  });
});
