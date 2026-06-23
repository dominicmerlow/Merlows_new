import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildContentItem, validateContentItem } from '../../lib/content/handlers/index.js';

test('buildContentItem creates item with correct defaults', () => {
  const item = buildContentItem({ title: 'Test', body: '<p>Hello</p>', category: 'news' });
  assert.equal(item.status, 'draft');
  assert.equal(item.title, 'Test');
  assert.ok(item.id);
  assert.ok(item.createdAt);
  assert.deepEqual(item.approvals, []);
});

test('validateContentItem rejects missing title', () => {
  assert.throws(() => validateContentItem({ body: 'x' }), /title/i);
});

test('validateContentItem allows missing body (body is optional)', () => {
  // body is optional — title-only drafts are valid
  assert.doesNotThrow(() => validateContentItem({ title: 'x' }));
});
