// scripts/change-user-email.mjs
// Rewrites a user's login email in the KV `users` array (and the derived
// `reviewers` mirror). There is no API endpoint that can do this — /api/auth/*
// only exposes login/logout/me/change-password, and PATCH /api/reviewers edits
// the mirror, which saveUsers() overwrites on the next user write.
//
// Requires KV_REST_API_URL + KV_REST_API_TOKEN (and KV_PREFIX, if the project
// sets one) in the environment. Uses the project's own lib/kv.js so the key
// prefixing and JSON handling match production exactly.
//
//   node scripts/change-user-email.mjs <old-email> <new-email>
//   node scripts/change-user-email.mjs --dry-run <old-email> <new-email>

import { kv } from '../lib/kv.js';

const args   = process.argv.slice(2);
const dryRun = args[0] === '--dry-run';
const [FROM, TO] = dryRun ? args.slice(1) : args;

if (!FROM || !TO) {
  console.error('usage: node scripts/change-user-email.mjs [--dry-run] <old-email> <new-email>');
  process.exit(1);
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(TO)) {
  console.error(`"${TO}" is not a valid email address.`);
  process.exit(1);
}
if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
  console.error('KV_REST_API_URL / KV_REST_API_TOKEN are not set. Aborting before touching anything.');
  process.exit(1);
}

console.log(`KV_PREFIX = ${process.env.KV_PREFIX ? `"${process.env.KV_PREFIX}"` : '(unset)'}`);

const users = await kv.get('users');
if (!Array.isArray(users)) {
  console.error('No `users` array found in KV. Wrong store, or KV_PREFIX is wrong. Nothing written.');
  process.exit(1);
}
console.log(`Found ${users.length} user(s): ${users.map(u => u.email).join(', ')}`);

const idx = users.findIndex(u => String(u.email).toLowerCase() === FROM.toLowerCase());
if (idx === -1) {
  console.error(`No user with email "${FROM}". Nothing written.`);
  process.exit(1);
}
if (users.some((u, i) => i !== idx && String(u.email).toLowerCase() === TO.toLowerCase())) {
  console.error(`"${TO}" is already used by another account. Nothing written.`);
  process.exit(1);
}

const target = users[idx];
console.log(`\nWill change: ${target.name} (${target.appRole})  ${target.email}  ->  ${TO}`);
console.log(`  id=${target.id}  mustChangePassword=${target.mustChangePassword}`);

if (dryRun) { console.log('\n--dry-run: nothing written.'); process.exit(0); }

users[idx] = { ...target, email: TO, updatedAt: new Date().toISOString() };

await kv.set('users', users);
await kv.set('reviewers', users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role })));

// Read back from KV — this comparison fails loudly if the write did not land.
const after   = (await kv.get('users'))?.find(u => u.id === target.id);
const mirror  = (await kv.get('reviewers'))?.find(r => r.id === target.id);
const okUsers = after?.email === TO;
const okMirror = mirror?.email === TO;

console.log(`\nusers:     ${okUsers  ? 'OK' : 'FAILED'} — now "${after?.email ?? '(missing)'}"`);
console.log(`reviewers: ${okMirror ? 'OK' : 'FAILED'} — now "${mirror?.email ?? '(missing)'}"`);

if (!okUsers || !okMirror) { console.error('\nWrite did not land. Investigate before retrying.'); process.exit(1); }
console.log(`\nDone. Log in at https://merlows.vercel.app with ${TO} (password unchanged).`);
