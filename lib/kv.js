// lib/kv.js
// Drop-in replacement for @vercel/kv that namespaces all keys with KV_PREFIX.
// Set KV_PREFIX=ibdhub in Vercel env vars to isolate this project's data when
// sharing a Redis database with another project (e.g. SLA Health).
// If KV_PREFIX is unset the wrapper is transparent — same behaviour as before.

import { kv as _kv } from '@vercel/kv';

const PREFIX = process.env.KV_PREFIX ? `${process.env.KV_PREFIX}:` : '';

function p(key) {
  return `${PREFIX}${key}`;
}

export const kv = {
  // strings
  get:    (key)                    => _kv.get(p(key)),
  set:    (key, value, opts)       => _kv.set(p(key), value, ...(opts ? [opts] : [])),
  del:    (key)                    => _kv.del(p(key)),
  keys:   (pattern)                => _kv.keys(p(pattern)),
  mget:   (...keys)                => _kv.mget(...keys.map(p)),
  // lists
  lpush:  (key, ...values)         => _kv.lpush(p(key), ...values),
  rpush:  (key, ...values)         => _kv.rpush(p(key), ...values),
  lrange: (key, start, stop)       => _kv.lrange(p(key), start, stop),
  llen:   (key)                    => _kv.llen(p(key)),
  ltrim:  (key, start, stop)       => _kv.ltrim(p(key), start, stop),
  lrem:   (key, count, value)      => _kv.lrem(p(key), count, value),
  // sorted sets (used by social cron queue)
  zadd:          (key, ...args)              => _kv.zadd(p(key), ...args),
  zrange:        (key, start, stop, opts)    => _kv.zrange(p(key), start, stop, ...(opts ? [opts] : [])),
  // Read by SCORE, not by rank. This used to forward to `_kv.zrangebyscore`, which does not
  // exist and never has: ZRANGEBYSCORE was deprecated in Redis 6.2 in favour of
  // `ZRANGE ... BYSCORE`, and @upstash/redis (1.25.1, under @vercel/kv) only ships `zrange`.
  // Every caller therefore threw `_kv.zrangebyscore is not a function` the first time it ran
  // in production — invisible for months because the one command was never reached, and
  // invisible under test because every test replaces this whole `kv` object with a stub that
  // supplies the method. lib/kv-client-surface.test.js checks the forwarders in this file
  // against the real client so that cannot happen again.
  // The name is kept because it says what the call means; `opts` passes through, so a caller
  // that knows its limit can bound the transfer server-side with `{ offset: 0, count: n }`
  // (emitted as `LIMIT offset count`).
  zrangebyscore: (key, min, max, opts)       => _kv.zrange(p(key), min, max, { byScore: true, ...opts }),
  zrem:          (key, ...members)           => _kv.zrem(p(key), ...members),
};

// Read many keys in sequential MGET batches. Returns values in key order,
// null for missing keys. Never fan out one kv.get per key: this client opens a
// new connection per in-flight request, so a 1,000+ key Promise.all exhausts
// the function's 1,024 file descriptors, and every outbound fetch that follows
// (OpenRouter, RSS) fails with "fetch failed". That silently stopped scheduled
// articles from 2026-08 to 2026-09.
// Only for SMALL records (e.g. automation jobs, <1 KB): Upstash rejects any
// response over 10 MB, and content records reach 2.5 MB each. Use getLimited
// for large ones.
export async function mgetBatched(keys, store = kv, batchSize = 200) {
  const out = [];
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    const vals = await store.mget(...batch);
    for (let j = 0; j < batch.length; j++) out.push(vals?.[j] ?? null);
  }
  return out;
}

// Read many possibly-large keys one per request, at most `concurrency` in
// flight (so at most that many connections). Values in key order, null if missing.
export async function getLimited(keys, store = kv, concurrency = 10) {
  const out = new Array(keys.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < keys.length) {
      const i = next++;
      out[i] = (await store.get(keys[i])) ?? null;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, keys.length) }, worker));
  return out;
}
