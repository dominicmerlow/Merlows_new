// lib/auth.js — password hashing + JWT session helpers
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import { kv } from './kv.js';

// JWT_SECRET is read lazily, on use — never at import. A module-level throw would
// stop every catch-all that imports this file from loading (an opaque
// FUNCTION_INVOCATION_FAILED instead of a legible error). There is no fallback
// string: signing or accepting with a publicly known secret would let anyone
// forge sessions and review/approval tokens. Unset → verification treats every
// token as invalid, and signing throws JwtSecretError (callers answer 503).
export class JwtSecretError extends Error {
  constructor() {
    super('JWT_SECRET is not configured on this deployment');
    this.name = 'JwtSecretError';
    this.status = 503;
  }
}

export function isJwtSecretConfigured() {
  return !!process.env.JWT_SECRET;
}

export function getSessionSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new JwtSecretError();
  return new TextEncoder().encode(s);
}
const COOKIE_NAME = 'vance_session';
const SESSION_TTL_DAYS = 30;

// ── Password hashing (scrypt; no extra deps) ──────────────────────────────────

export function hashPassword(plain) {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(plain, stored) {
  if (!stored || typeof stored !== 'string' || !stored.includes(':')) return false;
  const [saltHex, hashHex] = stored.split(':');
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(plain, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// ── Session JWTs ──────────────────────────────────────────────────────────────

export async function signSession(userId) {
  return new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_DAYS}d`)
    .sign(getSessionSecret());
}

async function verifySession(token) {
  if (!isJwtSecretConfigured()) return null;
  try {
    const { payload } = await jwtVerify(token, getSessionSecret());
    return payload.uid;
  } catch {
    return null;
  }
}

// ── Cookie plumbing ───────────────────────────────────────────────────────────

function parseCookies(header) {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map(c => {
      const [k, ...rest] = c.trim().split('=');
      return [k, decodeURIComponent(rest.join('='))];
    })
  );
}

export function setSessionCookie(res, token) {
  const maxAge = SESSION_TTL_DAYS * 24 * 60 * 60;
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

// ── User lookup + auth guard ──────────────────────────────────────────────────

// A user flagged mustChangePassword holds a session that is good for nothing but
// changing the password: every caller gets null (→ 401/403) unless it opts in with
// allowPendingPasswordChange (only /api/auth/me and /api/auth/change-password do).
// Enforced here so every gate — route-auth, the social router, handlers that call
// this directly — inherits it; the UI's forced-change modal alone was bypassable.
export async function getCurrentUser(req, { allowPendingPasswordChange = false } = {}) {
  const cookies = parseCookies(req.headers?.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const uid = await verifySession(token);
  if (!uid) return null;
  const users = await kv.get('users') ?? [];
  const u = users.find(x => x.id === uid);
  if (!u) return null;
  if (u.mustChangePassword && !allowPendingPasswordChange) return null;
  // Never leak the password hash to callers
  const { passwordHash, ...safe } = u;
  return safe;
}

export function requireRole(user, ...allowed) {
  if (!user) return { ok: false, status: 401, error: 'Not authenticated' };
  if (!allowed.includes(user.appRole)) {
    return { ok: false, status: 403, error: `Requires role: ${allowed.join(' or ')}` };
  }
  return { ok: true };
}

// ── Seed data ─────────────────────────────────────────────────────────────────

// Only used if the `users` store is ever empty. There is deliberately no shared seed
// password any more: the old one ('2026') sat in this publicly served file and left
// four never-used accounts open to anyone who read it (removed 2026-09-23). A seeded
// account gets a random password nobody knows, so it is locked until an admin resets
// it out of band.
export const INITIAL_USERS = [
  { name: 'Clifton Flack', email: 'cliftonflack@gmail.com', appRole: 'admin' },
];

export function randomTemporaryPassword() {
  return randomBytes(24).toString('base64url');
}
