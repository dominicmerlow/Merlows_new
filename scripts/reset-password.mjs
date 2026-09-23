// scripts/reset-password.mjs
//
// Two modes, both against the live KV `users` array:
//
//   --check   read-only. Tells you whether a candidate password matches the
//             stored hash, and whether that hash is even well-formed. This is
//             the diagnostic: /api/auth/login returns the same 401 for "no such
//             user" and "wrong password", so it cannot tell you which.
//
//   (default) sets a new password and clears mustChangePassword.
//
// Uses the app's own hashPassword/verifyPassword, so a "match" here means the
// exact comparison the login endpoint performs would also succeed.
//
//   node scripts/reset-password.mjs --check <email> <candidate-password>
//   $env:NEW_PASSWORD = '...'; node scripts/reset-password.mjs <email>
//
// Clear NEW_PASSWORD (or close the shell) afterwards — PowerShell keeps history.

import { createInterface } from 'node:readline/promises';
import { loadUsers, saveUsers } from '../lib/users.js';
import { hashPassword, verifyPassword } from '../lib/auth.js';

const argv  = process.argv.slice(2);
const check = argv[0] === '--check';
const [EMAIL, CANDIDATE] = check ? argv.slice(1) : argv;

if (!EMAIL) {
  console.error('usage: node scripts/reset-password.mjs [--check] <email> [candidate-password]');
  process.exit(1);
}
if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
  console.error('KV_REST_API_URL / KV_REST_API_TOKEN are not set.');
  process.exit(1);
}

const users = await loadUsers();
const idx = users.findIndex(u => String(u.email).trim().toLowerCase() === EMAIL.trim().toLowerCase());
if (idx === -1) {
  console.error(`No user matches "${EMAIL}".`);
  console.error(`Stored emails: ${users.map(u => JSON.stringify(u.email)).join(', ')}`);
  process.exit(1);
}

const u = users[idx];
const stored = u.passwordHash;
const wellFormed = typeof stored === 'string' && stored.includes(':')
  && Buffer.from(stored.split(':')[1] ?? '', 'hex').length === 64;

console.log(`${u.email}  name=${u.name}  appRole=${u.appRole}  mustChangePassword=${u.mustChangePassword}`);
console.log(`passwordHash: ${stored ? `present, ${wellFormed ? 'well-formed' : 'MALFORMED — login can never succeed'}` : 'MISSING — login can never succeed'}`);

if (check) {
  if (!CANDIDATE) { console.error('\n--check needs a candidate password.'); process.exit(1); }
  const match = verifyPassword(CANDIDATE, stored);
  console.log(`\ncandidate password: ${match ? 'MATCHES — login should succeed' : 'does NOT match'}`);
  process.exit(match ? 0 : 1);
}

let next = process.env.NEW_PASSWORD;
if (!next) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  next = await rl.question('New password (will be visible as you type): ');
  rl.close();
}
if (!next || next.length < 4) { console.error('Password too short. Nothing written.'); process.exit(1); }

users[idx] = { ...u, passwordHash: hashPassword(next), mustChangePassword: false, updatedAt: new Date().toISOString() };
await saveUsers(users);

// Read back from KV and re-verify — fails loudly if the write did not land.
const after = (await loadUsers()).find(x => x.id === u.id);
const ok = verifyPassword(next, after?.passwordHash);
console.log(`\nread-back verify: ${ok ? 'OK' : 'FAILED'}`);
if (!ok) { console.error('Write did not land. Do not assume the password changed.'); process.exit(1); }
console.log(`Log in at https://merlows.vercel.app as ${u.email}`);
