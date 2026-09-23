// scripts/list-users.mjs — read-only. Prints the live `users` array from KV
// with roles, so you can see who actually exists before changing anything.
// Never prints password hashes. Writes nothing.
//
//   node scripts/list-users.mjs
import { kv } from '../lib/kv.js';

if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
  console.error('KV_REST_API_URL / KV_REST_API_TOKEN are not set.');
  process.exit(1);
}
const users = await kv.get('users');
if (!Array.isArray(users)) { console.error('No `users` array in KV.'); process.exit(1); }

console.log(`${users.length} user(s):\n`);
for (const u of users) {
  console.log(`  ${u.email}`);
  console.log(`      name=${u.name}  appRole=${u.appRole}  role=${u.role}`);
  console.log(`      mustChangePassword=${u.mustChangePassword}  hasPassword=${Boolean(u.passwordHash)}`);
  console.log(`      created=${u.createdAt}  updated=${u.updatedAt}`);
  console.log('');
}
const admins = users.filter(u => u.appRole === 'admin').map(u => u.email);
console.log(`admin account(s): ${admins.length ? admins.join(', ') : 'NONE'}`);
