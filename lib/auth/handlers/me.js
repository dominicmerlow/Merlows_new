import { getCurrentUser } from '../../auth.js';
import { loadUsers } from '../../users.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  // Opts in to pending-password-change sessions: the UI needs /me to know it must
  // show the forced change dialog. Every other route refuses such a session.
  const me = await getCurrentUser(req, { allowPendingPasswordChange: true });
  if (!me) return res.status(401).json({ error: 'Not authenticated' });
  const users = await loadUsers();
  const full = users.find(u => u.id === me.id);
  return res.json({ ...me, mustChangePassword: full?.mustChangePassword ?? false });
}
