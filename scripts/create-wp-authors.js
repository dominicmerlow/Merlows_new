#!/usr/bin/env node
// scripts/create-wp-authors.js
//
// One-time (idempotent) creation of the Merlows author-team WP users from the
// registry in lib/authors.js. Each becomes a WordPress user with role "Author"
// (byline only — nobody is expected to log in; publishing still happens through
// the WP_USERNAME app account via the REST `author` param). Re-running is safe:
// existing usernames are detected and reused, and (unless --no-update) their
// display name / bio are refreshed.
//
// Requires an ADMIN WordPress application password (user-create capability):
//   WP_SITE_URL, WP_USERNAME, WP_APP_PASSWORD
//
// Usage:
//   node scripts/create-wp-authors.js --dry-run     # show what would happen
//   node scripts/create-wp-authors.js               # create / reconcile users
//   node scripts/create-wp-authors.js --no-update   # create missing only
//
// Output: writes scripts/.create-wp-authors-output.json with the resolved
// {username,id,email,generatedPassword?} for every author. Treat that file as a
// SECRET (it contains the generated passwords) — it is gitignored.

import { randomBytes } from 'crypto';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { listAuthors } from '../lib/authors.js';

const DRY = process.argv.includes('--dry-run');
const NO_UPDATE = process.argv.includes('--no-update');

const SITE = (process.env.WP_SITE_URL ?? '').trim().replace(/\/$/, '');
const USER = process.env.WP_USERNAME ?? '';
const PASS = process.env.WP_APP_PASSWORD ?? '';
if (!SITE || !USER || !PASS) {
  console.error('Missing WP_SITE_URL / WP_USERNAME / WP_APP_PASSWORD env vars.');
  process.exit(1);
}
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');

function strongPassword() {
  // 24 url-safe chars — humans never type these; bylines only.
  return randomBytes(18).toString('base64').replace(/[+/=]/g, '').slice(0, 24) + 'Aa1!';
}
function splitName(name) {
  const parts = String(name).trim().split(/\s+/);
  return { first: parts[0] || name, last: parts.slice(1).join(' ') || parts[0] || '' };
}
async function wp(path, init = {}) {
  const res = await fetch(`${SITE}/wp-json/wp/v2/${path}`, {
    ...init,
    headers: { Authorization: AUTH, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await res.text();
  let body; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
}
async function findUserBySlug(slug) {
  const r = await wp(`users?slug=${encodeURIComponent(slug)}&per_page=1&context=edit`);
  return r.ok && Array.isArray(r.body) && r.body.length ? r.body[0] : null;
}

async function main() {
  const authors = listAuthors();
  console.log(`${DRY ? '[DRY RUN] ' : ''}Reconciling ${authors.length} author accounts at ${SITE} ...\n`);
  const out = [];
  let created = 0, reused = 0, updated = 0, failed = 0;

  for (const a of authors) {
    const { first, last } = splitName(a.name);
    const existing = await findUserBySlug(a.username);

    if (existing) {
      reused++;
      let note = 'exists';
      if (!NO_UPDATE && !DRY) {
        const u = await wp(`users/${existing.id}`, {
          method: 'POST',
          body: JSON.stringify({ name: a.name, first_name: first, last_name: last, description: a.bio }),
        });
        if (u.ok) { updated++; note = 'exists, refreshed'; }
        else note = `exists, update failed ${u.status}`;
      }
      out.push({ username: a.username, id: existing.id, email: existing.email || a.email, name: a.name });
      console.log(`  • ${a.username.padEnd(22)} → id ${String(existing.id).padEnd(5)} (${note})`);
      continue;
    }

    if (DRY) {
      out.push({ username: a.username, id: null, email: a.email, name: a.name, wouldCreate: true });
      console.log(`  + ${a.username.padEnd(22)} → WOULD CREATE (role author, email ${a.email})`);
      continue;
    }

    const password = strongPassword();
    const c = await wp('users', {
      method: 'POST',
      body: JSON.stringify({
        username: a.username, name: a.name, first_name: first, last_name: last,
        email: a.email, roles: ['author'], password, description: a.bio,
      }),
    });
    if (c.ok) {
      created++;
      out.push({ username: a.username, id: c.body.id, email: a.email, name: a.name, generatedPassword: password });
      console.log(`  + ${a.username.padEnd(22)} → id ${String(c.body.id).padEnd(5)} (created, role author)`);
    } else {
      failed++;
      console.error(`  ✗ ${a.username.padEnd(22)} → FAILED ${c.status}: ${JSON.stringify(c.body)?.slice(0, 200)}`);
      out.push({ username: a.username, id: null, email: a.email, name: a.name, error: c.status });
    }
  }

  const outPath = join(dirname(fileURLToPath(import.meta.url)), '.create-wp-authors-output.json');
  if (!DRY) writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), site: SITE, authors: out }, null, 2));
  console.log(`\nDone. created=${created} reused=${reused} updated=${updated} failed=${failed}`);
  if (!DRY) console.log(`Resolved ids + generated passwords written to ${outPath} (SECRET — gitignored).`);
  if (failed) process.exitCode = 2;
}

main().catch(e => { console.error(e); process.exit(1); });
