// Auth gate on /api/automation/run. Before 2026-08-19 this endpoint was fully
// open: any GET from anywhere started a full pipeline run. These tests exist to
// make sure it never falls open again.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import handler from './run.js';
import { verifyCronSecret } from '../../cron-auth.js';

const SECRET = 'test-cron-secret';
let saved;
beforeEach(() => { saved = process.env.CRON_SECRET; process.env.CRON_SECRET = SECRET; });
afterEach(()  => { if (saved === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = saved; });

function mkRes() {
  const r = { statusCode: null, body: null };
  r.status = c => { r.statusCode = c; return r; };
  r.json   = b => { r.body = b;       return r; };
  return r;
}
// fetchFn that fails the test loudly if the run is ever reached.
const noRun = () => { throw new Error('executeRun should not have been reached'); };

describe('GET /api/automation/run', () => {
  it('rejects a request with no Authorization header', async () => {
    const res = mkRes();
    await handler({ method: 'GET', headers: {}, query: {} }, res, { fetchFn: noRun });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Unauthorized');
  });

  it('rejects a wrong secret', async () => {
    const res = mkRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer wrong' }, query: {} }, res, { fetchFn: noRun });
    assert.equal(res.statusCode, 401);
  });

  it('does not fall open when CRON_SECRET is unset — 503, not 202', async () => {
    delete process.env.CRON_SECRET;
    const res = mkRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer anything' }, query: {} }, res, { fetchFn: noRun });
    assert.equal(res.statusCode, 503);
    assert.match(res.body.error, /CRON_SECRET/);
  });
});

describe('POST /api/automation/run', () => {
  it('rejects an anonymous caller (no session cookie, no secret)', async () => {
    const res = mkRes();
    await handler({ method: 'POST', headers: {}, query: {}, body: {} }, res, { fetchFn: noRun });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Not authenticated');
  });

  it('rejects a session cookie that is not a valid JWT', async () => {
    const res = mkRes();
    await handler({ method: 'POST', headers: { cookie: 'vance_session=garbage' }, query: {}, body: {} }, res, { fetchFn: noRun });
    assert.equal(res.statusCode, 401);
  });
});

describe('verifyCronSecret', () => {
  it('accepts the matching bearer token', () => {
    assert.deepEqual(verifyCronSecret({ headers: { authorization: `Bearer ${SECRET}` } }), { ok: true });
  });
  it('rejects a missing header', () => {
    assert.equal(verifyCronSecret({ headers: {} }).ok, false);
  });
});
