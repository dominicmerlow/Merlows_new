// lib/content/handlers/item-sanitize.test.js — sanitizeUpdates (item.js PUT)
// A basic 'user' must not rewrite an article already cleared to publish, nor set
// review/scheduling/WordPress/byline fields; nobody but the internal bearer may
// overwrite server-owned history.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeUpdates } from './item.js';

const USER = { user: { id: 'u', appRole: 'user' }, internal: false };
const CONTENT = { user: { id: 'c', appRole: 'content' }, internal: false };
const INTERNAL = { user: null, internal: true };

describe('sanitizeUpdates', () => {
  it('refuses a basic user any edit on approved/scheduled/published items, status unchanged', () => {
    for (const status of ['in_review', 'approved', 'scheduled', 'published']) {
      const out = sanitizeUpdates({ body: 'attacker text', scheduledAt: '2000-01-01T00:00:00Z' }, { status }, USER);
      assert.equal(out.error?.status, 403, status);
    }
  });

  it('strips review, scheduling, WordPress and byline fields from a basic user on a draft', () => {
    const { updates } = sanitizeUpdates({
      title: 'T', body: 'B', approvals: ['x'], reviewerIds: ['x'], requireAllApprovals: false,
      scheduledAt: '2000-01-01T00:00:00Z', wpPostUrl: 'https://evil', authorUsername: 'someone',
      heroMediaId: 1, wpCategorySlug: 'x', publishDate: '1999-01-01',
    }, { status: 'draft' }, USER);
    assert.deepEqual(updates, { title: 'T', body: 'B' });
  });

  it('strips server-owned history from every browser caller, content+ included', () => {
    for (const auth of [USER, CONTENT]) {
      const { updates } = sanitizeUpdates({ body: 'B', auditLog: [], versions: [], id: 'other', createdAt: 'x' }, { status: 'draft' }, auth);
      assert.deepEqual(updates, { body: 'B' });
    }
  });

  it('lets content+ edit cleared articles and set review/scheduling fields', () => {
    const { updates, error } = sanitizeUpdates({ body: 'B', approvals: [], scheduledAt: 'x' }, { status: 'scheduled' }, CONTENT);
    assert.equal(error, undefined);
    assert.deepEqual(updates, { body: 'B', approvals: [], scheduledAt: 'x' });
  });

  it('passes internal (server-to-server) updates through untouched', () => {
    const input = { status: 'published', wpPostUrl: 'u', auditLog: [] };
    assert.deepEqual(sanitizeUpdates({ ...input }, { status: 'approved' }, INTERNAL).updates, input);
  });

  it('still lets a basic user move a draft to trash and restore it', () => {
    assert.deepEqual(sanitizeUpdates({ status: 'trash' }, { status: 'draft' }, USER).updates, { status: 'trash' });
    assert.deepEqual(sanitizeUpdates({ status: 'draft' }, { status: 'trash' }, USER).updates, { status: 'draft' });
  });
});
