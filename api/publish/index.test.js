import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildWpPayload } from '../../lib/core/handlers/publish.js';

test('buildWpPayload maps known category', () => {
  const item = { title: 'Test', body: '<p>Body</p>', excerpt: 'Short', category: 'industry-news' };
  const payload = buildWpPayload(item, { 'industry-news': 5 });
  assert.equal(payload.title, 'Test');
  assert.deepEqual(payload.categories, [5]);
  assert.equal(payload.status, 'publish');
});

test('buildWpPayload uses empty categories for unknown category', () => {
  const item = { title: 'x', body: 'y', excerpt: '', category: 'unknown' };
  const payload = buildWpPayload(item, {});
  assert.deepEqual(payload.categories, []);
});
