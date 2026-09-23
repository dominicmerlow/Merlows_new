// lib/kv-client-surface.test.js — does the REAL client have the methods lib/kv.js calls?
//
// Why this file exists. On 2026-09-23 the social autopilot was switched on for the first
// time and every cron tick died with:
//
//   TypeError: _kv.zrangebyscore is not a function
//       at Object.zrangebyscore (lib/kv.js:32)
//       at dueContentIdsInRange (lib/social/pack/store.js:99)
//
// @upstash/redis has never shipped `zrangebyscore` — ZRANGEBYSCORE was deprecated in Redis
// 6.2 in favour of `ZRANGE ... BYSCORE`. The whole suite was green anyway, because every
// test in this area replaces the `kv` singleton wholesale (`kv.zrangebyscore = async () =>
// [...]`), so the stub supplied the method no matter what the real client had. A stub can
// only prove the CALLER is wired up; it says nothing about whether the name on the other
// side of the wrapper exists. Nothing else in the repo asks that question.
//
// So this file deliberately does not stub. It reads the forwarder names straight out of
// lib/kv.js and checks each one against the client the application actually imports, then
// drives a real by-score read through the whole @vercel/kv + @upstash/redis stack to see
// the command that comes out on the wire.
//
// SAFETY. The Upstash database is shared with another company's production data and
// KV_PREFIX is the only thing isolating this app, so no test may touch it. The credentials
// are overwritten with a loopback address at the TOP of this file, before @vercel/kv is
// imported anywhere (its `kv` export builds a client from process.env on the first property
// access and caches it forever) — hence the top-level await below rather than a `before`
// hook, which runs too late if a test body has already triggered that import. Every request
// made here is asserted to have arrived at the local server, with a fake bearer token.
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

// ---------------------------------------------------------------------------------------
// A stand-in for the Upstash REST endpoint. Records what it was asked for and answers
// canned JSON. The real client base64-decodes values when it sent Upstash-Encoding: base64.
// ---------------------------------------------------------------------------------------
const requests = [];
let nextResult = [];

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    requests.push({ auth: req.headers.authorization, command: JSON.parse(body) });
    const b64 = req.headers['upstash-encoding'] === 'base64';
    const encode = (v) => (b64 && typeof v === 'string' ? Buffer.from(v).toString('base64') : v);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ result: nextResult.map(encode) }));
  });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

process.env.KV_REST_API_URL = `http://127.0.0.1:${server.address().port}`;
process.env.KV_REST_API_TOKEN = 'not-a-real-credential';
process.env.KV_PREFIX = 'kvsurfacetest'; // read once, at lib/kv.js module load

after(() => server.close());

// ---------------------------------------------------------------------------------------
// Part 1 — the surface. Derived from source, so a forwarder added later is checked for free.
// ---------------------------------------------------------------------------------------
const KV_SOURCE = readFileSync(fileURLToPath(new URL('./kv.js', import.meta.url)), 'utf8');

/** Every `_kv.<name>(` in lib/kv.js: the methods this app requires the client to provide. */
function forwardedMethodNames(source) {
  const matches = [...source.matchAll(/\b_kv\.([A-Za-z_]\w*)\s*\(/g)];
  return [...new Set(matches.map((m) => m[1]))].sort();
}

const forwarded = forwardedMethodNames(KV_SOURCE);

describe('lib/kv.js only forwards to methods the installed client really has', () => {
  // Without this, a regex that silently stopped matching would make every assertion below
  // vacuous: zero names, zero checks, green suite — the exact failure mode being fixed here.
  it('extracted the forwarder list from lib/kv.js', () => {
    assert.ok(
      forwarded.length >= 14,
      `expected >= 14 forwarded methods in lib/kv.js, found ${forwarded.length}: ${forwarded.join(', ')}`,
    );
    for (const expected of ['get', 'set', 'del', 'mget', 'lpush', 'zadd', 'zrange', 'zrem']) {
      assert.ok(forwarded.includes(expected), `expected '${expected}' among: ${forwarded.join(', ')}`);
    }
  });

  for (const name of forwarded) {
    it(`@vercel/kv exposes ${name}()`, async () => {
      const { kv: client } = await import('@vercel/kv');
      assert.equal(
        typeof client[name],
        'function',
        `lib/kv.js calls _kv.${name}(), but the installed @vercel/kv / @upstash/redis client `
          + `has no such method (typeof is ${typeof client[name]}). Every call through the `
          + `wrapper would throw "_kv.${name} is not a function" the first time it ran in `
          + `production. Check the installed package's type definitions for the spelling it `
          + `actually uses — do not guess.`,
      );
    });
  }
});

// ---------------------------------------------------------------------------------------
// Part 2 — the wire. What does a by-score read actually send?
// ---------------------------------------------------------------------------------------
describe('kv.zrangebyscore over the real client', () => {
  it('sends ZRANGE ... BYSCORE against the KV_PREFIX-namespaced key, and decodes the reply', async () => {
    const { kv } = await import('./kv.js');
    requests.length = 0;
    nextResult = ['content-a', 'content-b'];

    const ids = await kv.zrangebyscore('social:pack:queue', 0, 1_700_000_000_000);

    assert.equal(requests.length, 1, 'expected exactly one request, at the local fake server');
    assert.equal(requests[0].auth, 'Bearer not-a-real-credential', 'must not use real credentials');
    // `zrangebyscore` is this wrapper's name for the operation; the client speaks ZRANGE.
    assert.deepEqual(requests[0].command, [
      'zrange',
      'kvsurfacetest:social:pack:queue', // KV_PREFIX applied: the shared store is not ours to read
      0,
      1_700_000_000_000,
      'byscore',
    ]);
    assert.deepEqual(ids, ['content-a', 'content-b']);
  });

  it('passes offset/count through as LIMIT so a caller can bound the transfer', async () => {
    const { kv } = await import('./kv.js');
    requests.length = 0;
    nextResult = ['content-a'];

    await kv.zrangebyscore('social:pack:queue', 0, 99, { offset: 0, count: 1 });

    assert.deepEqual(requests[0].command, [
      'zrange', 'kvsurfacetest:social:pack:queue', 0, 99, 'byscore', 'limit', 0, 1,
    ]);
  });
});

// ---------------------------------------------------------------------------------------
// Part 3 — the calls from the production stack trace, with nothing stubbed.
// ---------------------------------------------------------------------------------------
describe('lib/social/pack/store.js queue reads over the real client', () => {
  it('dueContentIdsInRange returns the due ids instead of throwing', async () => {
    const { dueContentIdsInRange } = await import('./social/pack/store.js');
    requests.length = 0;
    nextResult = ['content-a', 'content-b', 'content-c'];

    const ids = await dueContentIdsInRange(0, 1_700_000_000_000, 2);

    assert.deepEqual(requests[0].command.slice(0, 2), ['zrange', 'kvsurfacetest:social:pack:queue']);
    assert.deepEqual(ids, ['content-a', 'content-b'], 'sliced to the requested limit');
  });

  it('dueContentIds returns the due ids instead of throwing', async () => {
    const { dueContentIds } = await import('./social/pack/store.js');
    requests.length = 0;
    nextResult = ['content-a', 'content-b'];

    const ids = await dueContentIds(5, 1_700_000_000_000);

    assert.deepEqual(requests[0].command, [
      'zrange', 'kvsurfacetest:social:pack:queue', 0, 1_700_000_000_000, 'byscore',
    ]);
    assert.deepEqual(ids, ['content-a', 'content-b']);
  });
});
