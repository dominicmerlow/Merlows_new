import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildWpPayload, toWpDate } from '../../lib/core/handlers/publish.js';

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

test('buildWpPayload omits date when no publishDate', () => {
  const payload = buildWpPayload({ title: 'x', body: 'y' }, []);
  assert.equal('date' in payload, false);
});

test('buildWpPayload sets WP date from ISO publishDate', () => {
  const payload = buildWpPayload({ title: 'x', body: 'y', publishDate: '2025-06-15T09:30:00.000Z' }, []);
  assert.equal(payload.date, '2025-06-15T09:30:00');
});

test('toWpDate parses DD/MM/YYYY sheet dates', () => {
  assert.equal(toWpDate('15/06/2025'), '2025-06-15T00:00:00');
});

test('buildWpPayload strips title-block dateline / prepared-for from body', () => {
  const body = [
    '# Some Title',
    'Prepared for Merlows.com',
    '26 October 2023',
    '## Executive Summary',
    'The accord, signed on 23 June 2025, holds.',
  ].join('\n');
  const { content } = buildWpPayload({ title: 't', body }, []);
  assert.ok(!content.includes('Prepared for'), 'prepared-for removed');
  assert.ok(!content.includes('26 October 2023'), 'standalone dateline removed');
  assert.ok(content.includes('23 June 2025'), 'prose date kept');
});

test('toWpDate returns null for unparseable input', () => {
  assert.equal(toWpDate('not a date'), null);
  assert.equal(toWpDate(''), null);
  assert.equal(toWpDate(null), null);
});
