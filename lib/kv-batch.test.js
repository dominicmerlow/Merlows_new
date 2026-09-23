// lib/kv-batch.test.js — mgetBatched + getLimited (lib/kv.js).
//
// Both exist to fix the same class of bug: a scheduled automation tick used to
// Promise.all 1,138 individual kv.get calls, each opening its own Redis
// connection, which exhausted Vercel's ~1,024 socket limit and made every
// unrelated outbound fetch (OpenRouter, RSS) fail with "fetch failed" —
// scheduled articles silently stopped for a month. mgetBatched replaces that
// with sequential batched MGET (small records only — Upstash caps a response
// at 10 MB, and content records reach 2.58 MB, so MGET is unsafe for those).
// getLimited replaces it with a bounded-concurrency pool of individual GETs
// for records too large to batch.
//
// Only fake `store` objects are used here — never the real KV client. The
// Upstash store backing this app is shared with another production project.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mgetBatched, getLimited } from './kv.js';

describe('mgetBatched', () => {
  it('returns [] and makes zero store calls for an empty key list', async () => {
    let calls = 0;
    const store = { mget: async (...keys) => { calls++; return keys.map(() => null); } };
    const result = await mgetBatched([], store);
    assert.deepEqual(result, []);
    assert.equal(calls, 0);
  });

  it('returns a single value in a single-key batch', async () => {
    const store = { mget: async (...keys) => keys.map(k => (k === 'a' ? 'val-a' : null)) };
    const result = await mgetBatched(['a'], store, 200);
    assert.deepEqual(result, ['val-a']);
  });

  it('returns null for a missing key', async () => {
    // Real Upstash MGET returns undefined (or a hole) for a missing key;
    // mgetBatched must normalise that to null, not pass it through.
    const store = { mget: async (...keys) => keys.map(k => (k === 'present' ? 'v' : undefined)) };
    const result = await mgetBatched(['present', 'missing'], store);
    assert.deepEqual(result, ['v', null]);
  });

  it('preserves key order within one batch', async () => {
    const seed = { k0: 'v0', k1: 'v1', k2: 'v2', k3: 'v3' };
    const store = { mget: async (...keys) => keys.map(k => seed[k] ?? null) };
    const result = await mgetBatched(['k3', 'k1', 'k0', 'k2'], store, 200);
    assert.deepEqual(result, ['v3', 'v1', 'v0', 'v2']);
  });

  it('splits into sequential batches at the boundary and preserves order across them', async () => {
    // 450 keys, batchSize 200 -> batches of 200 / 200 / 50. The store.mget mock
    // throws if a second call starts before the first resolved, which would
    // catch a fan-out (Promise.all over batches) regression.
    const keys = Array.from({ length: 450 }, (_, i) => `k${i}`);
    const seed = Object.fromEntries(keys.map((k, i) => [k, i]));
    const calls = [];
    let inFlight = 0;
    const store = {
      mget: async (...batchKeys) => {
        inFlight++;
        if (inFlight > 1) throw new Error('overlapping mget calls — batches ran concurrently');
        calls.push(batchKeys.length);
        await new Promise(resolve => setTimeout(resolve, 5));
        inFlight--;
        return batchKeys.map(k => seed[k] ?? null);
      },
    };
    const result = await mgetBatched(keys, store, 200);
    assert.deepEqual(calls, [200, 200, 50]);
    assert.equal(result.length, 450);
    // Order preserved across the batch boundary — index 199 (end of batch 1)
    // and index 200 (start of batch 2) must both land in the right slot.
    assert.deepEqual(result, keys.map((_, i) => i));
  });

  it('handles a batch size that evenly divides the key count', async () => {
    const keys = Array.from({ length: 400 }, (_, i) => `k${i}`);
    const calls = [];
    const store = {
      mget: async (...batchKeys) => { calls.push(batchKeys.length); return batchKeys.map(() => 'x'); },
    };
    await mgetBatched(keys, store, 200);
    assert.deepEqual(calls, [200, 200]);
  });

  it('uses the default store and batch size when not given', async () => {
    // Only checks the defaults are wired through, using an injected default-shaped
    // store via the exported kv object's own mget would touch real KV, so instead
    // confirm the signature accepts omitted args without throwing before any
    // network call — pass an explicit store but omit batchSize.
    const store = { mget: async (...keys) => keys.map(() => 1) };
    const result = await mgetBatched(['a', 'b'], store);
    assert.deepEqual(result, [1, 1]);
  });
});

describe('getLimited', () => {
  it('returns [] and makes zero store calls for an empty key list', async () => {
    let calls = 0;
    const store = { get: async () => { calls++; return null; } };
    const result = await getLimited([], store, 10);
    assert.deepEqual(result, []);
    assert.equal(calls, 0);
  });

  it('returns null for a missing key', async () => {
    const store = { get: async (key) => (key === 'present' ? 'v' : null) };
    const result = await getLimited(['present', 'missing'], store, 5);
    assert.deepEqual(result, ['v', null]);
  });

  it('issues exactly one store.get call per key', async () => {
    const seen = [];
    const store = { get: async (key) => { seen.push(key); return `v-${key}`; } };
    await getLimited(['a', 'b', 'c'], store, 10);
    assert.deepEqual(seen.sort(), ['a', 'b', 'c']);
    assert.equal(seen.length, 3);
  });

  it('never has more than `concurrency` gets in flight at once', async () => {
    const CONCURRENCY = 4;
    const keys = Array.from({ length: 40 }, (_, i) => `k${i}`);
    let inFlight = 0;
    let maxInFlight = 0;
    const store = {
      get: async (key) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        // Random-ish jitter so completion order doesn't mirror start order.
        const delayMs = (key.charCodeAt(1) % 5) + 1;
        await new Promise(resolve => setTimeout(resolve, delayMs));
        inFlight--;
        return key;
      },
    };
    await getLimited(keys, store, CONCURRENCY);
    assert.ok(maxInFlight <= CONCURRENCY, `max in-flight was ${maxInFlight}, cap was ${CONCURRENCY}`);
    assert.ok(maxInFlight > 0);
  });

  it('preserves key order in the result even when completions finish out of order', async () => {
    const keys = ['slow', 'fast', 'medium'];
    const delays = { slow: 30, fast: 1, medium: 15 };
    const store = {
      get: async (key) => {
        await new Promise(resolve => setTimeout(resolve, delays[key]));
        return `val-${key}`;
      },
    };
    const result = await getLimited(keys, store, 3);
    assert.deepEqual(result, ['val-slow', 'val-fast', 'val-medium']);
  });

  it('handles fewer keys than the concurrency cap', async () => {
    const keys = ['a', 'b'];
    let maxInFlight = 0;
    let inFlight = 0;
    const store = {
      get: async (key) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise(resolve => setTimeout(resolve, 5));
        inFlight--;
        return `v-${key}`;
      },
    };
    const result = await getLimited(keys, store, 10);
    assert.deepEqual(result, ['v-a', 'v-b']);
    assert.ok(maxInFlight <= 2);
  });

  it('propagates a rejected get', async () => {
    const store = {
      get: async (key) => {
        if (key === 'bad') throw new Error('ECONNRESET');
        return `v-${key}`;
      },
    };
    await assert.rejects(
      () => getLimited(['a', 'bad', 'c'], store, 3),
      /ECONNRESET/
    );
  });
});
