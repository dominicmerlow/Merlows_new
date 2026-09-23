// lib/auth-password-policy.test.js — 2026-09-23 forced-password-change security change.
//
// Covers:
//  - lib/auth.js getCurrentUser(req, { allowPendingPasswordChange }): a user
//    flagged mustChangePassword is null to every caller unless it opts in.
//  - That gate is inherited by the SESSION-level route gate (lib/route-auth.js
//    → the content catch-all), not just by handlers that call getCurrentUser
//    directly.
//  - lib/auth/handlers/me.js and change-password.js, the two routes that DO
//    opt in.
//  - change-password.js writes ONLY the `users` KV key on success — never
//    `reviewers` (previously saveUsers() regenerated reviewers from users).
//  - lib/users.js buildUser (no default password), randomTemporaryPassword,
//    and loadUsers' empty-store seeding (INITIAL_USERS only, random
//    passwords, forced change).
//
// Mirrors lib/route-auth.test.js / lib/content/handlers/index.test.js: the
// shared `kv` singleton from lib/kv.js is monkeypatched with an in-memory
// store per test and restored in `finally`. Never touches real KV.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ??= 'test-jwt-secret-for-auth-password-policy';

const { kv } = await import('./kv.js');
const {
  getCurrentUser, signSession, hashPassword, verifyPassword, randomTemporaryPassword, INITIAL_USERS,
} = await import('./auth.js');
const { buildUser, loadUsers } = await import('./users.js');
const { default: meHandler } = await import('./auth/handlers/me.js');
const { default: changePasswordHandler, MIN_PASSWORD_LENGTH } = await import('./auth/handlers/change-password.js');
const contentRouter = (await import('../api/content/[...slug].js')).default;

function mkRes() {
  const r = { statusCode: 200, body: null };
  r.status = c => { r.statusCode = c; return r; };
  r.json = b => { r.body = b; return r; };
  return r;
}

// Monkeypatches the subset of kv methods these handlers touch. `store` is a
// plain Map the test owns; `setCalls` records every key ever written so a
// test can assert a key was NOT written (the reviewers-not-written case).
async function withKv(store, testFn) {
  const KV_METHODS = ['get', 'set', 'lrange', 'mget'];
  const saved = {};
  for (const m of KV_METHODS) saved[m] = kv[m];
  const setCalls = [];
  kv.get = async k => (store.has(k) ? structuredClone(store.get(k)) : null);
  kv.set = async (k, v) => { setCalls.push(k); store.set(k, structuredClone(v)); return 'OK'; };
  kv.lrange = async () => [];
  kv.mget = async (...ks) => ks.map(k => (store.has(k) ? structuredClone(store.get(k)) : null));
  try {
    await testFn({ store, setCalls });
  } finally {
    for (const m of KV_METHODS) kv[m] = saved[m];
  }
}

function pendingUser(overrides = {}) {
  return {
    id: 'u-pending', name: 'Penny', email: 'penny@test.com', appRole: 'user', role: 'must_approve',
    passwordHash: hashPassword('correct-horse'), mustChangePassword: true,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function activeUser(overrides = {}) {
  return {
    id: 'u-active', name: 'Alan', email: 'alan@test.com', appRole: 'user', role: 'must_approve',
    passwordHash: hashPassword('current-pw-1'), mustChangePassword: false,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

async function reqFor(uid, { method = 'GET', query = {}, body } = {}) {
  const token = await signSession(uid);
  return { method, query, body, headers: { cookie: `vance_session=${token}` } };
}

describe('getCurrentUser — mustChangePassword gate', () => {
  it('returns null for a pending user by default', async () => {
    await withKv(new Map([['users', [pendingUser()]]]), async () => {
      const req = await reqFor('u-pending');
      const user = await getCurrentUser(req);
      assert.equal(user, null);
    });
  });

  it('returns the safe user object when allowPendingPasswordChange is set', async () => {
    await withKv(new Map([['users', [pendingUser()]]]), async () => {
      const req = await reqFor('u-pending');
      const user = await getCurrentUser(req, { allowPendingPasswordChange: true });
      assert.equal(user.id, 'u-pending');
      assert.equal(user.mustChangePassword, true);
      assert.equal('passwordHash' in user, false, 'the hash must never leak to callers');
    });
  });

  it('a non-pending user is returned either way (the option is a no-op for them)', async () => {
    await withKv(new Map([['users', [activeUser()]]]), async () => {
      const req = await reqFor('u-active');
      assert.ok(await getCurrentUser(req));
      assert.ok(await getCurrentUser(req, { allowPendingPasswordChange: true }));
    });
  });
});

describe('a pending session is refused on SESSION-level routes', () => {
  it('GET /api/content → 401', async () => {
    await withKv(new Map([['users', [pendingUser()]]]), async () => {
      const req = await reqFor('u-pending', { query: {} });
      const res = mkRes();
      await contentRouter(req, res);
      assert.equal(res.statusCode, 401);
    });
  });

  it('GET /api/content/gh-data → 401', async () => {
    await withKv(new Map([['users', [pendingUser()]]]), async () => {
      const req = await reqFor('u-pending', { query: { '...slug': 'gh-data', path: 'data/breaking-news/reviews.json' } });
      const res = mkRes();
      await contentRouter(req, res);
      assert.equal(res.statusCode, 401);
    });
  });
});

describe('/api/auth/me opts in to a pending session', () => {
  it('returns 200 with mustChangePassword:true for a pending session', async () => {
    await withKv(new Map([['users', [pendingUser()]]]), async () => {
      const req = await reqFor('u-pending');
      const res = mkRes();
      await meHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.id, 'u-pending');
      assert.equal(res.body.mustChangePassword, true);
    });
  });
});

describe('change-password handler', () => {
  it('a pending user can change password with no oldPassword → 200, record updated, mustChangePassword cleared', async () => {
    await withKv(new Map([['users', [pendingUser()]]]), async ({ store, setCalls }) => {
      const req = await reqFor('u-pending', { method: 'POST', body: { newPassword: 'new-strong-pw' } });
      const res = mkRes();
      await changePasswordHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, { ok: true });

      const updated = store.get('users').find(u => u.id === 'u-pending');
      assert.equal(updated.mustChangePassword, false);
      assert.ok(verifyPassword('new-strong-pw', updated.passwordHash));
      assert.equal(setCalls.includes('reviewers'), false);
    });
  });

  it('afterwards, getCurrentUser returns the user with no option needed', async () => {
    await withKv(new Map([['users', [pendingUser()]]]), async () => {
      const req = await reqFor('u-pending', { method: 'POST', body: { newPassword: 'new-strong-pw' } });
      await changePasswordHandler(req, mkRes());

      const req2 = await reqFor('u-pending');
      const user = await getCurrentUser(req2);
      assert.ok(user, 'the session should now authenticate without allowPendingPasswordChange');
      assert.equal(user.mustChangePassword, false);
    });
  });

  it(`rejects a ${MIN_PASSWORD_LENGTH - 1}-character password with 400 and leaves the record untouched`, async () => {
    await withKv(new Map([['users', [pendingUser()]]]), async ({ store }) => {
      assert.equal('123456789'.length, MIN_PASSWORD_LENGTH - 1);
      const req = await reqFor('u-pending', { method: 'POST', body: { newPassword: '123456789' } });
      const res = mkRes();
      await changePasswordHandler(req, res);
      assert.equal(res.statusCode, 400);
      assert.equal(store.get('users')[0].mustChangePassword, true);
    });
  });

  it('rejects a non-string newPassword with 400', async () => {
    await withKv(new Map([['users', [pendingUser()]]]), async () => {
      const req = await reqFor('u-pending', { method: 'POST', body: { newPassword: 12345678901234 } });
      const res = mkRes();
      await changePasswordHandler(req, res);
      assert.equal(res.statusCode, 400);
    });
  });

  it('a non-pending user with the wrong oldPassword → 401, record unchanged', async () => {
    await withKv(new Map([['users', [activeUser()]]]), async ({ store }) => {
      const req = await reqFor('u-active', { method: 'POST', body: { oldPassword: 'wrong-password', newPassword: 'brand-new-pw-1' } });
      const res = mkRes();
      await changePasswordHandler(req, res);
      assert.equal(res.statusCode, 401);
      const user = store.get('users').find(u => u.id === 'u-active');
      assert.ok(verifyPassword('current-pw-1', user.passwordHash), 'old password must still verify');
    });
  });

  it('a non-pending user must supply oldPassword at all (missing → 401)', async () => {
    await withKv(new Map([['users', [activeUser()]]]), async () => {
      const req = await reqFor('u-active', { method: 'POST', body: { newPassword: 'brand-new-pw-1' } });
      const res = mkRes();
      await changePasswordHandler(req, res);
      assert.equal(res.statusCode, 401);
    });
  });

  it('the `reviewers` key is never written, even on a successful non-pending change', async () => {
    await withKv(new Map([['users', [activeUser()]]]), async ({ setCalls }) => {
      const req = await reqFor('u-active', { method: 'POST', body: { oldPassword: 'current-pw-1', newPassword: 'brand-new-pw-1' } });
      const res = mkRes();
      await changePasswordHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.ok(setCalls.includes('users'), 'users must be written on success');
      assert.equal(setCalls.includes('reviewers'), false, 'reviewers must never be touched by change-password');
    });
  });
});

describe('buildUser — no default password', () => {
  it('a user built with no password gets a hash that does not verify against the old seed "2026" or an empty string', () => {
    const u = buildUser({ email: 'x@test.com' });
    assert.equal(verifyPassword('2026', u.passwordHash), false);
    assert.equal(verifyPassword('', u.passwordHash), false);
  });

  it('two calls produce different hashes (a fresh random password each time)', () => {
    const a = buildUser({ email: 'x@test.com' });
    const b = buildUser({ email: 'x@test.com' });
    assert.notEqual(a.passwordHash, b.passwordHash);
  });
});

describe('randomTemporaryPassword', () => {
  it('is a 32-char base64url string (24 random bytes) and differs on every call', () => {
    const a = randomTemporaryPassword();
    const b = randomTemporaryPassword();
    assert.notEqual(a, b);
    assert.equal(a.length, 32);
    assert.match(a, /^[A-Za-z0-9_-]+$/);
  });
});

describe('loadUsers — seeding an empty store', () => {
  it('seeds only INITIAL_USERS, each with mustChangePassword:true, none verifying the old seed "2026"', async () => {
    await withKv(new Map(), async ({ store }) => {
      const users = await loadUsers();
      assert.equal(users.length, INITIAL_USERS.length);
      assert.deepEqual(users.map(u => u.email).sort(), INITIAL_USERS.map(u => u.email).sort());
      for (const u of users) {
        assert.equal(u.mustChangePassword, true);
        assert.equal(verifyPassword('2026', u.passwordHash), false);
      }
      assert.equal(store.get('users').length, INITIAL_USERS.length);
    });
  });

  it('merges legacy `reviewers` entries not already in INITIAL_USERS, also pending + random-password', async () => {
    await withKv(new Map([['reviewers', [{ name: 'Rex', email: 'rex@test.com' }]]]), async () => {
      const users = await loadUsers();
      const rex = users.find(u => u.email === 'rex@test.com');
      assert.ok(rex, 'legacy reviewer should be seeded into users');
      assert.equal(rex.mustChangePassword, true);
      assert.equal(verifyPassword('2026', rex.passwordHash), false);
    });
  });
});
