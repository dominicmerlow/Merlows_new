import { loadUsers, safe } from '../../users.js';
import { verifyPassword, signSession, setSessionCookie, isJwtSecretConfigured } from '../../auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  // No JWT_SECRET → no session can be signed (and none would verify). Say so
  // before checking the password, rather than 500 on signSession.
  if (!isJwtSecretConfigured()) {
    return res.status(503).json({ error: 'JWT_SECRET is not configured on this deployment' });
  }
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const users = await loadUsers();
  const user = users.find(u => u.email.toLowerCase() === String(email).toLowerCase());
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = await signSession(user.id);
  setSessionCookie(res, token);
  return res.json({ user: safe(user) });
}
