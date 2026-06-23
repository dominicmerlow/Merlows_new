import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyStatusTransition } from '../../lib/content/handlers/item.js';

test('draft -> in_review is valid', () => {
  assert.equal(applyStatusTransition('draft', 'in_review'), 'in_review');
});

test('draft -> published is invalid', () => {
  assert.throws(() => applyStatusTransition('draft', 'published'), /invalid/i);
});

test('approved -> scheduled is valid', () => {
  assert.equal(applyStatusTransition('approved', 'scheduled'), 'scheduled');
});
