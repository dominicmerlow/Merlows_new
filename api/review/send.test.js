import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.JWT_SECRET = 'test-secret-32-chars-minimum-length!!';
const { buildApprovalToken, parseApprovalToken } = await import('../../lib/review/handlers/send.js');

test('buildApprovalToken creates a 3-part JWT', async () => {
  const token = await buildApprovalToken({ contentId: 'abc', reviewerId: 'r1', action: 'approve' });
  assert.ok(typeof token === 'string');
  assert.equal(token.split('.').length, 3);
});

test('parseApprovalToken round-trips correctly', async () => {
  const token = await buildApprovalToken({ contentId: 'abc', reviewerId: 'r1', action: 'approve' });
  const payload = await parseApprovalToken(token);
  assert.equal(payload.contentId, 'abc');
  assert.equal(payload.action, 'approve');
});

test('parseApprovalToken rejects tampered token', async () => {
  const token = await buildApprovalToken({ contentId: 'abc', reviewerId: 'r1', action: 'approve' });
  const tampered = token.slice(0, -5) + 'XXXXX';
  await assert.rejects(() => parseApprovalToken(tampered), /invalid/i);
});
