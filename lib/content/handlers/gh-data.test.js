// lib/content/handlers/gh-data.test.js — GET|PUT /api/content/gh-data
// Server-side GitHub Contents API proxy replacing the token that used to be
// hardcoded (disguised) in public index.html. Mirrors llm-proxy.test.js's
// style: fake req/res, injectable getUser + fetchFn via the handler's third arg.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import handler, { isAllowedPath } from './gh-data.js';

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

let savedToken;
function setToken(v) { savedToken = process.env.GITHUB_TOKEN; process.env.GITHUB_TOKEN = v; }
function unsetToken() { savedToken = process.env.GITHUB_TOKEN; delete process.env.GITHUB_TOKEN; }
function restoreToken() { if (savedToken === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = savedToken; }

function b64json(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

describe('isAllowedPath', () => {
  it('allows a reviews path for a simple slug', () => {
    assert.equal(isAllowedPath('data/cool-widget/reviews.json'), true);
  });

  it('allows the custom-categories config path', () => {
    assert.equal(isAllowedPath('data/config/custom-categories.json'), true);
  });

  it('rejects a path traversal attempt', () => {
    assert.equal(isAllowedPath('data/../x.json'), false);
  });

  it('rejects a file type outside reviews/prompts/comparisons', () => {
    assert.equal(isAllowedPath('data/x/secrets.json'), false);
  });

  it('rejects a completely unrelated file', () => {
    assert.equal(isAllowedPath('index.html'), false);
  });

  it('rejects an uppercase slug', () => {
    assert.equal(isAllowedPath('data/CoolWidget/reviews.json'), false);
  });

  it('allows a custom category id (cat_<timestamp>)', () => {
    assert.equal(isAllowedPath('data/cat_1719400000000/reviews.json'), true);
  });

  it('rejects a slug with a leading, trailing or doubled separator', () => {
    assert.equal(isAllowedPath('data/_x/reviews.json'), false);
    assert.equal(isAllowedPath('data/x_/reviews.json'), false);
    assert.equal(isAllowedPath('data/x__y/reviews.json'), false);
  });

  it('rejects a non-string path', () => {
    assert.equal(isAllowedPath(undefined), false);
  });
});

describe('GET|PUT /api/content/gh-data', () => {
  it('rejects a non-GET/PUT method with 405', async () => {
    const res = mkRes();
    await handler({ method: 'POST', query: {}, body: {} }, res, { fetchFn: noFetch, getUser: getUserNone });
    assert.equal(res.statusCode, 405);
    assert.equal(res.body.error, 'Method not allowed');
  });

  it('rejects a signed-out caller with 401 and never calls upstream', async () => {
    const res = mkRes();
    await handler({ method: 'GET', query: { path: 'data/x/reviews.json' } }, res, { fetchFn: noFetch, getUser: getUserNone });
    assert.equal(res.statusCode, 401);
    assert.match(res.body.error, /session has expired/);
  });

  it('returns 503 when GITHUB_TOKEN is not configured', async () => {
    unsetToken();
    const res = mkRes();
    await handler({ method: 'GET', query: { path: 'data/x/reviews.json' } }, res, { fetchFn: noFetch, getUser: getUserOk });
    restoreToken();
    assert.equal(res.statusCode, 503);
    assert.match(res.body.error, /GITHUB_TOKEN/);
  });

  it('returns 400 for a path traversal attempt', async () => {
    setToken('gh-test-token');
    const res = mkRes();
    await handler({ method: 'GET', query: { path: 'data/../x.json' } }, res, { fetchFn: noFetch, getUser: getUserOk });
    restoreToken();
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'path is not an allowed data file');
  });

  it('returns 400 for a disallowed file type under a valid slug', async () => {
    setToken('gh-test-token');
    const res = mkRes();
    await handler({ method: 'GET', query: { path: 'data/x/secrets.json' } }, res, { fetchFn: noFetch, getUser: getUserOk });
    restoreToken();
    assert.equal(res.statusCode, 400);
  });

  it('returns 400 for a completely unrelated path', async () => {
    setToken('gh-test-token');
    const res = mkRes();
    await handler({ method: 'GET', query: { path: 'index.html' } }, res, { fetchFn: noFetch, getUser: getUserOk });
    restoreToken();
    assert.equal(res.statusCode, 400);
  });

  it('returns 400 for an uppercase slug', async () => {
    setToken('gh-test-token');
    const res = mkRes();
    await handler({ method: 'GET', query: { path: 'data/CoolWidget/reviews.json' } }, res, { fetchFn: noFetch, getUser: getUserOk });
    restoreToken();
    assert.equal(res.statusCode, 400);
  });

  it('returns 400 when path is missing entirely', async () => {
    setToken('gh-test-token');
    const res = mkRes();
    await handler({ method: 'GET', query: {} }, res, { fetchFn: noFetch, getUser: getUserOk });
    restoreToken();
    assert.equal(res.statusCode, 400);
  });

  it('GET maps an upstream 404 to 200 with empty content and null sha', async () => {
    setToken('gh-test-token');
    const fetchFn = async () => ({ status: 404, ok: false });
    const res = mkRes();
    await handler({ method: 'GET', query: { path: 'data/x/reviews.json' } }, res, { fetchFn, getUser: getUserOk });
    restoreToken();
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { content: [], sha: null });
  });

  it('GET decodes base64 JSON content including non-ASCII text and returns sha', async () => {
    setToken('gh-test-token');
    const payload = [{ id: 1, text: 'שלום — hello' }];
    const fetchFn = async () => ({
      status: 200,
      ok: true,
      json: async () => ({ content: b64json(payload), sha: 'abc123' }),
    });
    const res = mkRes();
    await handler({ method: 'GET', query: { path: 'data/x/reviews.json' } }, res, { fetchFn, getUser: getUserOk });
    restoreToken();
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { content: payload, sha: 'abc123' });
  });

  it('GET returns 502 when the upstream content is not valid JSON', async () => {
    setToken('gh-test-token');
    const fetchFn = async () => ({
      status: 200,
      ok: true,
      json: async () => ({ content: Buffer.from('not json', 'utf8').toString('base64'), sha: 'abc' }),
    });
    const res = mkRes();
    await handler({ method: 'GET', query: { path: 'data/x/reviews.json' } }, res, { fetchFn, getUser: getUserOk });
    restoreToken();
    assert.equal(res.statusCode, 502);
    assert.match(res.body.error, /not valid JSON/);
  });

  it('GET maps an upstream 401 to a 502 that names GITHUB_TOKEN, never 401', async () => {
    setToken('gh-test-token');
    const fetchFn = async () => ({ status: 401, ok: false });
    const res = mkRes();
    await handler({ method: 'GET', query: { path: 'data/x/reviews.json' } }, res, { fetchFn, getUser: getUserOk });
    restoreToken();
    assert.equal(res.statusCode, 502);
    assert.match(res.body.error, /GITHUB_TOKEN/);
  });

  it('GET maps an upstream 403 to a 502 that names GITHUB_TOKEN, never 401', async () => {
    setToken('gh-test-token');
    const fetchFn = async () => ({ status: 403, ok: false });
    const res = mkRes();
    await handler({ method: 'GET', query: { path: 'data/x/reviews.json' } }, res, { fetchFn, getUser: getUserOk });
    restoreToken();
    assert.equal(res.statusCode, 502);
    assert.match(res.body.error, /GITHUB_TOKEN/);
  });

  it('GET sends the token in the Authorization header and never leaks it in the response body', async () => {
    setToken('gh-super-secret-token');
    let seenAuth;
    const fetchFn = async (url, opts) => {
      seenAuth = opts.headers.Authorization;
      return { status: 200, ok: true, json: async () => ({ content: b64json([]), sha: 's1' }) };
    };
    const res = mkRes();
    await handler({ method: 'GET', query: { path: 'data/x/reviews.json' } }, res, { fetchFn, getUser: getUserOk });
    restoreToken();
    assert.equal(seenAuth, 'token gh-super-secret-token');
    assert.equal(JSON.stringify(res.body).includes('gh-super-secret-token'), false);
  });

  it('GET returns 502 with a descriptive message when fetch rejects', async () => {
    setToken('gh-test-token');
    const fetchFn = async () => { throw new Error('getaddrinfo ENOTFOUND'); };
    const res = mkRes();
    await handler({ method: 'GET', query: { path: 'data/x/reviews.json' } }, res, { fetchFn, getUser: getUserOk });
    restoreToken();
    assert.equal(res.statusCode, 502);
    assert.match(res.body.error, /getaddrinfo ENOTFOUND/);
  });

  it('PUT returns 400 when content is missing', async () => {
    setToken('gh-test-token');
    const res = mkRes();
    await handler({ method: 'PUT', body: { path: 'data/x/reviews.json' } }, res, { fetchFn: noFetch, getUser: getUserOk });
    restoreToken();
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'content is required');
  });

  it('PUT returns 400 for a disallowed path before calling upstream', async () => {
    setToken('gh-test-token');
    const res = mkRes();
    await handler({ method: 'PUT', body: { path: 'index.html', content: [] } }, res, { fetchFn: noFetch, getUser: getUserOk });
    restoreToken();
    assert.equal(res.statusCode, 400);
  });

  it('PUT encodes content as base64 and sends branch + sha + message, returning { sha }', async () => {
    setToken('gh-test-token');
    let sentBody;
    let sentUrl;
    const fetchFn = async (url, opts) => {
      sentUrl = url;
      sentBody = JSON.parse(opts.body);
      return { status: 200, ok: true, json: async () => ({ content: { sha: 'new-sha-1' } }) };
    };
    const res = mkRes();
    const content = [{ id: 'r_1', note: 'hi — שלום' }];
    await handler(
      { method: 'PUT', body: { path: 'data/x/reviews.json', content, sha: 'old-sha', message: 'Update reviews' } },
      res,
      { fetchFn, getUser: getUserOk }
    );
    restoreToken();
    assert.match(sentUrl, /\/repos\/.+\/contents\/data\/x\/reviews\.json$/);
    assert.equal(sentBody.branch, 'ContentGenerator');
    assert.equal(sentBody.sha, 'old-sha');
    assert.equal(sentBody.message, 'Update reviews');
    assert.deepEqual(JSON.parse(Buffer.from(sentBody.content, 'base64').toString('utf8')), content);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { sha: 'new-sha-1' });
  });

  it('PUT without a sha omits sha from the upstream request body', async () => {
    setToken('gh-test-token');
    let sentBody;
    const fetchFn = async (url, opts) => {
      sentBody = JSON.parse(opts.body);
      return { status: 200, ok: true, json: async () => ({ content: { sha: 'first-sha' } }) };
    };
    const res = mkRes();
    await handler(
      { method: 'PUT', body: { path: 'data/x/reviews.json', content: [] } },
      res,
      { fetchFn, getUser: getUserOk }
    );
    restoreToken();
    assert.equal('sha' in sentBody, false);
    assert.deepEqual(res.body, { sha: 'first-sha' });
  });

  it('PUT passes a 409 conflict status straight through with GitHub\'s message', async () => {
    setToken('gh-test-token');
    const fetchFn = async () => ({
      status: 409,
      ok: false,
      json: async () => ({ message: 'sha does not match' }),
    });
    const res = mkRes();
    await handler(
      { method: 'PUT', body: { path: 'data/x/reviews.json', content: [], sha: 'stale-sha' } },
      res,
      { fetchFn, getUser: getUserOk }
    );
    restoreToken();
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, 'sha does not match');
  });

  it('PUT maps an upstream 401 to a 502 that names GITHUB_TOKEN, never 401', async () => {
    setToken('gh-test-token');
    const fetchFn = async () => ({ status: 401, ok: false, json: async () => ({}) });
    const res = mkRes();
    await handler(
      { method: 'PUT', body: { path: 'data/x/reviews.json', content: [] } },
      res,
      { fetchFn, getUser: getUserOk }
    );
    restoreToken();
    assert.equal(res.statusCode, 502);
    assert.match(res.body.error, /GITHUB_TOKEN/);
  });

  it('PUT sends the token in the Authorization header and never leaks it in the response body', async () => {
    setToken('gh-super-secret-put-token');
    let seenAuth;
    const fetchFn = async (url, opts) => {
      seenAuth = opts.headers.Authorization;
      return { status: 200, ok: true, json: async () => ({ content: { sha: 's2' } }) };
    };
    const res = mkRes();
    await handler(
      { method: 'PUT', body: { path: 'data/x/reviews.json', content: [] } },
      res,
      { fetchFn, getUser: getUserOk }
    );
    restoreToken();
    assert.equal(seenAuth, 'token gh-super-secret-put-token');
    assert.equal(JSON.stringify(res.body).includes('gh-super-secret-put-token'), false);
  });

  it('PUT returns 502 with a descriptive message when fetch rejects', async () => {
    setToken('gh-test-token');
    const fetchFn = async () => { throw new Error('socket hang up'); };
    const res = mkRes();
    await handler(
      { method: 'PUT', body: { path: 'data/x/reviews.json', content: [] } },
      res,
      { fetchFn, getUser: getUserOk }
    );
    restoreToken();
    assert.equal(res.statusCode, 502);
    assert.match(res.body.error, /socket hang up/);
  });
});

describe('gh-data PUT write guards', () => {
  const okFetch = async () => ({ status: 200, ok: true, json: async () => ({ content: { sha: 'ok' } }) });
  const asRole = appRole => async () => ({ id: 'u2', appRole });
  async function put(path, content, getUser, fetchFn = okFetch) {
    setToken('gh-test-token');
    const res = mkRes();
    try {
      await handler({ method: 'PUT', body: { path, content } }, res, { fetchFn, getUser });
    } finally {
      restoreToken();
    }
    return res;
  }

  it('rejects a record whose id carries markup, without calling GitHub', async () => {
    const res = await put('data/x/reviews.json', [{ id: 'x"><img src=x onerror=alert(1)>' }], getUserOk, noFetch);
    assert.equal(res.statusCode, 400);
  });

  it('rejects content that is not an array of objects with string ids', async () => {
    for (const bad of [{}, 'x', [null], [[]], [{}], [{ id: 5 }], [{ id: '' }], [{ id: 'a'.repeat(81) }]]) {
      const res = await put('data/x/reviews.json', bad, getUserOk, noFetch);
      assert.equal(res.statusCode, 400, JSON.stringify(bad));
    }
  });

  it('lets the basic user role save to the archive (reviews) and reports (comparisons)', async () => {
    assert.equal((await put('data/x/reviews.json', [{ id: 'r_1' }], asRole('user'))).statusCode, 200);
    assert.equal((await put('data/x/comparisons.json', [{ id: 'c_1' }], asRole('user'))).statusCode, 200);
  });

  it('refuses prompts and custom categories to the basic user role with 403', async () => {
    assert.equal((await put('data/x/prompts.json', [{ id: 'p_1' }], asRole('user'), noFetch)).statusCode, 403);
    assert.equal((await put('data/config/custom-categories.json', [{ id: 'cat_1' }], asRole('user'), noFetch)).statusCode, 403);
  });

  it('allows prompts and custom categories for admin and content', async () => {
    assert.equal((await put('data/x/prompts.json', [{ id: 'p_1' }], asRole('content'))).statusCode, 200);
    assert.equal((await put('data/config/custom-categories.json', [{ id: 'cat_1' }], asRole('admin'))).statusCode, 200);
  });
});
