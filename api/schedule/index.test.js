import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateScheduleDate } from '../../lib/core/handlers/schedule.js';

test('accepts future date', () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  assert.doesNotThrow(() => validateScheduleDate(future));
});

test('rejects past date', () => {
  const past = new Date(Date.now() - 86400000).toISOString();
  assert.throws(() => validateScheduleDate(past), /future/i);
});

test('rejects invalid date string', () => {
  assert.throws(() => validateScheduleDate('not-a-date'), /invalid/i);
});
