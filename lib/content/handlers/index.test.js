// lib/content/handlers/index.test.js — the default HTTP handler in
// lib/content/handlers/index.js (buildContentItem/validateContentItem are
// already covered by api/content/index.test.js — not duplicated here).
//
// Covers the 2026-09-23 fix: the plain GET list, ?action=summary, and
// ?action=review-tasks branches used to Promise.all one kv.get per content
// id. Over 1,100+ ids that opened one socket each and exhausted Vercel's
// ~1,024 file-descriptor limit ("fetch failed" on every other outbound call
// during a scheduled tick). They now go through readContent(), which is
// getLimited(..., kv, 25) — at most 25 kv.get calls in flight at once.
//
// This handler has no injectable {fetchFn, getUser} deps (unlike
// lib/content/handlers/llm-proxy.js), so — same workaround as
// api/cron/publish.test.js — the shared `kv` singleton's methods are
// monkeypatched for the duration of each test and restored in `finally`.
// Never touches real KV.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// signSession needs JWT_SECRET (no built-in fallback any more). Set it before
// the modules that read it load.
process.env.JWT_SECRET ??= 'test-jwt-secret-for-content-index-tests';
const { default: handler } = await import('./index.js');
const { kv } = await import('../../kv.js');
const { signSession } = await import('../../auth.js');

function mkRes() {
  const r = { statusCode: 200, body: null };
  r.status = c => { r.statusCode = c; return r; };
  r.json   = b => { r.body = b;       return r; };
  return r;
}

// Builds a kv.get mock that answers 'users' (for getCurrentUser) and
// `content:<id>` lookups from a supplied map, tracking how many content
// reads are ever in flight simultaneously.
function makeKvGet(contentMap, { users = null } = {}) {
  let inFlight = 0;
  let maxInFlight = 0;
  const get = async (key) => {
    if (key === 'users') return users;
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise(resolve => setTimeout(resolve, 1));
    inFlight--;
    return Object.prototype.hasOwnProperty.call(contentMap, key) ? contentMap[key] : null;
  };
  return { get, maxInFlight: () => maxInFlight };
}

async function withKv({ lrange, get }, testFn) {
  const origLrange = kv.lrange;
  const origGet = kv.get;
  kv.lrange = lrange;
  kv.get = get;
  try {
    await testFn();
  } finally {
    kv.lrange = origLrange;
    kv.get = origGet;
  }
}

// Builds a req with a valid signed-in session cookie for the given user id.
async function authedReq({ method = 'GET', query = {}, uid = 'u1' } = {}) {
  const token = await signSession(uid);
  return { method, query, headers: { cookie: `vance_session=${token}` } };
}

const N = 300;
function buildIdsAndMap({ nullEvery = 10 } = {}) {
  const ids = Array.from({ length: N }, (_, i) => `id${i}`);
  const map = {};
  ids.forEach((id, i) => {
    if (nullEvery && i % nullEvery === 0) {
      map[`content:${id}`] = null; // missing record
    } else {
      map[`content:${id}`] = {
        id,
        title: `Title ${i}`,
        body: '<p>Some body prose here with several words in it.</p>',
        category: i % 2 === 0 ? 'breaking-news' : 'diplomatic-analysis',
        status: i % 3 === 0 ? 'published' : 'draft',
        automationRuleId: i % 4 === 0 ? 'rule1' : null,
        heroImageUrl: i === 1 ? 'data:image/png;base64,AAAA' : 'https://example.com/hero.jpg',
        updatedAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
        createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
      };
    }
  });
  return { ids, map };
}

describe('GET /api/content (plain list)', () => {
  it('returns items in reversed id order, drops missing records, and never exceeds 25 concurrent kv.get calls', async () => {
    const { ids, map } = buildIdsAndMap();
    const kvGet = makeKvGet(map);
    await withKv({ lrange: async () => ids, get: kvGet.get }, async () => {
      const req = { method: 'GET', query: {} };
      const res = mkRes();
      await handler(req, res);

      assert.equal(res.statusCode, 200);
      const expectedIds = ids.filter((id, i) => i % 10 !== 0).reverse();
      assert.deepEqual(res.body.map(i => i.id), expectedIds);
      assert.ok(kvGet.maxInFlight() <= 25, `max in-flight was ${kvGet.maxInFlight()}, expected <= 25`);
      assert.ok(kvGet.maxInFlight() > 0);
    });
  });

  it('returns [] and calls kv.get zero times when the index is empty', async () => {
    let getCalls = 0;
    await withKv({ lrange: async () => [], get: async () => { getCalls++; return null; } }, async () => {
      const req = { method: 'GET', query: {} };
      const res = mkRes();
      await handler(req, res);
      assert.deepEqual(res.body, []);
      assert.equal(getCalls, 0);
    });
  });

  it('?slim=1 strips body/versions/auditLog, computes wordCount, and strips data: hero URIs', async () => {
    const { ids, map } = buildIdsAndMap({ nullEvery: 0 });
    const kvGet = makeKvGet(map);
    await withKv({ lrange: async () => ids, get: kvGet.get }, async () => {
      const req = { method: 'GET', query: { slim: '1' } };
      const res = mkRes();
      await handler(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.length, N);
      for (const item of res.body) {
        assert.equal(item.body, undefined);
        assert.equal(item.versions, undefined);
        assert.equal(item.auditLog, undefined);
        assert.equal(typeof item.wordCount, 'number');
        assert.ok(item.wordCount > 0);
      }
      // id1's hero was a data: URI and must be nulled out.
      const item1 = res.body.find(i => i.id === 'id1');
      assert.equal(item1.heroImageUrl, null);
      // a non-data: hero URL passes through unchanged.
      const item2 = res.body.find(i => i.id === 'id2');
      assert.equal(item2.heroImageUrl, 'https://example.com/hero.jpg');
    });
  });
});

describe('GET /api/content?action=summary', () => {
  it('counts autoGen/manualGen/publishedCount/byCategory correctly over many items', async () => {
    const { ids, map } = buildIdsAndMap();
    const kvGet = makeKvGet(map);
    await withKv({ lrange: async () => ids, get: kvGet.get }, async () => {
      const req = { method: 'GET', query: { action: 'summary' } };
      const res = mkRes();
      await handler(req, res);

      assert.equal(res.statusCode, 200);
      const present = ids.filter((id, i) => i % 10 !== 0);
      const total = present.length;
      assert.equal(res.body.total, total);

      // Recompute expected counts the same way the handler does, from the
      // same fixture, so this assertion can't just mirror the handler's math.
      let autoGen = 0, manualGen = 0, publishedCount = 0;
      const byCategory = {};
      ids.forEach((id, i) => {
        if (i % 10 === 0) return; // dropped null record
        const rec = map[`content:${id}`];
        if (rec.automationRuleId) autoGen++; else manualGen++;
        if (rec.status === 'published') publishedCount++;
        byCategory[rec.category] = (byCategory[rec.category] || 0) + 1;
      });
      assert.equal(res.body.autoGen, autoGen);
      assert.equal(res.body.manualGen, manualGen);
      assert.equal(res.body.publishedCount, publishedCount);
      assert.deepEqual(res.body.byCategory, byCategory);
      assert.ok(kvGet.maxInFlight() <= 25);
    });
  });

  it('respects ?recent=N, clamped to [1,50], for the recent list', async () => {
    const { ids, map } = buildIdsAndMap();
    const kvGet = makeKvGet(map);
    await withKv({ lrange: async () => ids, get: kvGet.get }, async () => {
      const req = { method: 'GET', query: { action: 'summary', recent: '3' } };
      const res = mkRes();
      await handler(req, res);
      assert.equal(res.body.recent.length, 3);
      // Newest-first by updatedAt.
      const sortedDesc = [...res.body.recent].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      assert.deepEqual(res.body.recent.map(r => r.id), sortedDesc.map(r => r.id));
    });
  });

  it('returns all-zero counts and calls kv.get zero times when the index is empty', async () => {
    let getCalls = 0;
    await withKv({ lrange: async () => [], get: async () => { getCalls++; return null; } }, async () => {
      const req = { method: 'GET', query: { action: 'summary' } };
      const res = mkRes();
      await handler(req, res);
      assert.deepEqual(res.body, { total: 0, autoGen: 0, manualGen: 0, publishedCount: 0, byCategory: {}, recent: [] });
      assert.equal(getCalls, 0);
    });
  });
});

describe('GET /api/content?action=review-tasks', () => {
  it('rejects a signed-out caller with 401 and never touches the content index', async () => {
    let lrangeCalls = 0;
    await withKv({ lrange: async () => { lrangeCalls++; return []; }, get: async () => null }, async () => {
      const req = { method: 'GET', query: { action: 'review-tasks' }, headers: {} };
      const res = mkRes();
      await handler(req, res);
      assert.equal(res.statusCode, 401);
      assert.equal(lrangeCalls, 0);
    });
  });

  it('computes stats scoped to the signed-in user and never exceeds 25 concurrent kv.get calls', async () => {
    const ids = ['a', 'b', 'c', 'd'];
    const map = {
      'content:a': { id: 'a', status: 'in_review', reviewers: ['u1'], approvals: [], rejections: [], rejectionComments: [] },
      'content:b': { id: 'b', status: 'in_review', reviewers: ['u2'], approvals: ['u1'], rejections: [], rejectionComments: [] },
      'content:c': { id: 'c', status: 'in_review', reviewers: ['u1'], approvals: [], rejections: [], rejectionComments: [{ reviewerId: 'u1', at: '2026-01-01T00:00:00Z' }] },
      'content:d': null, // missing record, must be dropped
    };
    const kvGet = makeKvGet(map, { users: [{ id: 'u1', appRole: 'content' }] });
    await withKv({ lrange: async () => ids, get: kvGet.get }, async () => {
      const req = await authedReq({ query: { action: 'review-tasks' } });
      const res = mkRes();
      await handler(req, res);

      assert.equal(res.statusCode, 200);
      // a: open task (in_review, reviewer u1, not approved/rejected). b: not a review item for u1
      // (reviewers=[u2]) but u1 approved it. c: reviewer u1 with a comment, still open too.
      assert.equal(res.body.stats.totalReviewRequests, 2); // a, c
      assert.equal(res.body.stats.approvedByUser, 1);      // b
      assert.equal(res.body.stats.commentsByUser, 1);      // c
      assert.deepEqual(res.body.openTasks.map(t => t.id).sort(), ['a', 'c']);
      assert.ok(kvGet.maxInFlight() <= 25);
    });
  });

  it('returns zero stats and skips reading content when the index is empty', async () => {
    const kvGet = makeKvGet({}, { users: [{ id: 'u1', appRole: 'content' }] });
    await withKv({ lrange: async () => [], get: kvGet.get }, async () => {
      const req = await authedReq({ query: { action: 'review-tasks' } });
      const res = mkRes();
      await handler(req, res);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body.stats, { totalReviewRequests: 0, approvedByUser: 0, commentsByUser: 0 });
      assert.deepEqual(res.body.openTasks, []);
    });
  });
});
