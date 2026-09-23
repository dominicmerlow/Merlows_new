import { getCurrentUser, hashPassword, verifyPassword } from '../../auth.js';
import { loadUsers } from '../../users.js';
import { kv } from '../../kv.js';

export const MIN_PASSWORD_LENGTH = 10;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  // The one route (with /me) a pending-password-change session may use.
  const me = await getCurrentUser(req, { allowPendingPasswordChange: true });
  if (!me) return res.status(401).json({ error: 'Not authenticated' });
  const { oldPassword, newPassword } = req.body || {};
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `newPassword must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
  const users = await loadUsers();
  const idx = users.findIndex(u => u.id === me.id);
  if (idx === -1) return res.status(404).json({ error: 'User missing' });
  if (!users[idx].mustChangePassword) {
    if (!oldPassword || !verifyPassword(oldPassword, users[idx].passwordHash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
  }
  users[idx].passwordHash = hashPassword(newPassword);
  users[idx].mustChangePassword = false;
  users[idx].updatedAt = new Date().toISOString();
  // Write only `users`. saveUsers() would also regenerate the `reviewers` list from
  // the user list, silently replacing the reviewers curated via /api/reviewers.
  await kv.set('users', users);
  return res.json({ ok: true });
}
