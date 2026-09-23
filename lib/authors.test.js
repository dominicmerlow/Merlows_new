import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AUTHOR_REGISTRY, pickAuthor, listAuthors, FLOATER_SHARE, emailFor } from './authors.js';

// Sub-category slugs in the registry MUST match CATEGORY_SUBCATEGORIES in
// lib/core/handlers/publish.js, or content records won't bind to a dedicated author.
const EXPECTED_SUBCATS = {
  'breaking-news': ['trade-economy', 'peace-diplomacy', 'antisemitism', 'culture-war', 'nationalism'],
  'op-eds': ['original-spirit', 'explainers', 'blitz-echoes', 'spirit-today', 'carry-on'],
  'cyrus-accord': ['the-cyrus-vision', 'persian-jewish-heritage', 'conflict-diplomacy'],
  'abraham-accords': ['normalisation-diplomacy', 'regional-security', 'trade-connectivity'],
  'diplomatic-analysis': ['great-power-politics', 'security-strategy', 'treaties-institutions'],
  'regional-voices': ['gulf-perspectives', 'israeli-society', 'diaspora-dialogues'],
};

test('registry has exactly the expected categories and sub-categories', () => {
  assert.deepEqual(Object.keys(AUTHOR_REGISTRY).sort(), Object.keys(EXPECTED_SUBCATS).sort());
  for (const [cat, subs] of Object.entries(EXPECTED_SUBCATS)) {
    assert.deepEqual(Object.keys(AUTHOR_REGISTRY[cat].subcats).sort(), [...subs].sort(), `subcats for ${cat}`);
    assert.ok(AUTHOR_REGISTRY[cat].floater?.username, `${cat} has a floater`);
    assert.ok(subs.includes(AUTHOR_REGISTRY[cat].default), `${cat} default is a real sub-cat`);
  }
});

test('every author has a unique username and a bio', () => {
  const all = listAuthors();
  const seen = new Set();
  for (const a of all) {
    assert.ok(a.username && /^[a-z0-9-]+$/.test(a.username), `valid slug: ${a.username}`);
    assert.ok(a.name && a.bio, `name+bio for ${a.username}`);
    assert.equal(seen.has(a.username), false, `duplicate username ${a.username}`);
    seen.add(a.username);
  }
  // 5+5+3+3+3+3 dedicated + 6 floaters = 28
  assert.equal(all.length, 28);
});

test('pickAuthor returns the dedicated author when the floater roll misses', () => {
  // rand >= FLOATER_SHARE → dedicated
  const a = pickAuthor('breaking-news', 'antisemitism', { rand: 0.99 });
  assert.equal(a.role, 'dedicated');
  assert.equal(a.username, 'daniel-roth');
  assert.equal(a.subSlug, 'antisemitism');
});

test('pickAuthor matches sub-category by display name or slug', () => {
  const bySlug = pickAuthor('abraham-accords', 'regional-security', { rand: 0.5 });
  const byName = pickAuthor('abraham-accords', 'Regional Security', { rand: 0.5 });
  assert.equal(bySlug.username, 'noa-friedman');
  assert.equal(byName.username, 'noa-friedman');
});

test('pickAuthor returns the floater when the roll hits', () => {
  const a = pickAuthor('op-eds', 'explainers', { rand: 0.0 });
  assert.equal(a.role, 'floater');
  assert.equal(a.username, AUTHOR_REGISTRY['op-eds'].floater.username);
  assert.equal(a.subSlug, null);
});

test('pickAuthor falls back to the category default for unknown sub-categories', () => {
  const a = pickAuthor('cyrus-accord', 'something-unmapped', { rand: 0.9 });
  assert.equal(a.role, 'dedicated');
  assert.equal(a.subSlug, AUTHOR_REGISTRY['cyrus-accord'].default);
});

test('pickAuthor returns null for an unknown category', () => {
  assert.equal(pickAuthor('not-a-category', 'x', { rand: 0.5 }), null);
});

test('floater share is ~10% across a large sample', () => {
  let floaters = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) {
    // deterministic spread of rolls across [0,1)
    const a = pickAuthor('breaking-news', 'nationalism', { rand: (i + 0.5) / N });
    if (a.role === 'floater') floaters++;
  }
  const share = floaters / N;
  assert.ok(Math.abs(share - FLOATER_SHARE) < 0.005, `share ${share} ≈ ${FLOATER_SHARE}`);
});

test('emailFor builds an alias from the username', () => {
  assert.match(emailFor('adi-rosen'), /^adi-rosen@/);
});
