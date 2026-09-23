#!/usr/bin/env node
// scripts/backfill-authors.js
//
// Retroactively assign bylines to ALREADY-PUBLISHED (and scheduled/future) WP
// posts, applying the same rule as new content: the dedicated author for the
// post's sub-category, with a stable ~10% routed to the category floater.
//
// • Idempotent: the random floater roll for each post is drawn ONCE and stored
//   in scripts/.backfill-authors-state.json keyed by post id. Re-runs reuse the
//   stored roll, so a post never flip-flops authors and the 10% split is stable.
// • Dry-run first. The live pass only PATCHes posts whose author actually changes.
//
// Requires admin WP creds: WP_SITE_URL, WP_USERNAME, WP_APP_PASSWORD
// (the create-wp-authors.js users must already exist).
//
// Usage:
//   node scripts/backfill-authors.js --dry-run            # report only, writes CSV
//   node scripts/backfill-authors.js                      # live reassign
//   node scripts/backfill-authors.js --status=publish     # limit status (default: publish,future)
//
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { AUTHOR_REGISTRY, pickAuthor, FLOATER_SHARE } from '../lib/authors.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes('--dry-run');
const statusArg = (process.argv.find(a => a.startsWith('--status=')) || '').split('=')[1];
const STATUSES = (statusArg || 'publish,future').split(',').map(s => s.trim()).filter(Boolean);

const SITE = (process.env.WP_SITE_URL ?? '').trim().replace(/\/$/, '');
const USER = process.env.WP_USERNAME ?? '';
const PASS = process.env.WP_APP_PASSWORD ?? '';
if (!SITE || !USER || !PASS) {
  console.error('Missing WP_SITE_URL / WP_USERNAME / WP_APP_PASSWORD env vars.');
  process.exit(1);
}
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');

// WP parent category slug → app category id. Mirror of CATEGORY_SLUG_MAP in
// lib/core/handlers/publish.js — keep in sync (only differs for op-eds/cyrus).
const PARENT_SLUG_TO_CATEGORY = {
  'breaking-news': 'breaking-news',
  'diplomatic-analysis': 'diplomatic-analysis',
  'blitzspirit': 'op-eds',
  'cyrus-accords': 'cyrus-accord',
  'abraham-accords': 'abraham-accords',
  'regional-voices': 'regional-voices',
};
// sub-category slug → app category id (derived from the registry, which mirrors
// CATEGORY_SUBCATEGORIES). Lets a post be classified from its sub-cat term alone.
const SUBSLUG_TO_CATEGORY = {};
for (const [cat, c] of Object.entries(AUTHOR_REGISTRY)) {
  for (const sub of Object.keys(c.subcats)) SUBSLUG_TO_CATEGORY[sub] = cat;
}

async function wp(path, init = {}) {
  const res = await fetch(`${SITE}/wp-json/wp/v2/${path}`, {
    ...init,
    headers: { Authorization: AUTH, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await res.text();
  let body; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, body, headers: res.headers };
}

async function loadAll(path) {
  const out = [];
  for (let page = 1; page < 100; page++) {
    const r = await wp(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}&context=edit`);
    if (!r.ok) { if (r.status === 400) break; throw new Error(`${path} ${r.status}: ${JSON.stringify(r.body)}`); }
    if (!Array.isArray(r.body) || r.body.length === 0) break;
    out.push(...r.body);
    if (r.body.length < 100) break;
  }
  return out;
}

function loadState() {
  const p = join(HERE, '.backfill-authors-state.json');
  if (existsSync(p)) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { /* ignore */ } }
  return {};
}
function saveState(s) {
  writeFileSync(join(HERE, '.backfill-authors-state.json'), JSON.stringify(s, null, 2));
}

async function main() {
  console.log(`${DRY ? '[DRY RUN] ' : ''}Backfilling authors at ${SITE} (statuses: ${STATUSES.join(', ')})\n`);

  // id → {slug, parent} for every WP category term, and slug → user id for authors.
  const cats = await loadAll('categories');
  const catById = new Map(cats.map(c => [c.id, { slug: c.slug, parent: c.parent }]));
  const users = await loadAll('users');
  const userIdBySlug = new Map(users.map(u => [u.slug, u.id]));

  const state = loadState();
  const rows = [];
  let scanned = 0, changed = 0, unchanged = 0, unclassified = 0, missingUser = 0, failed = 0;

  for (const status of STATUSES) {
    const posts = await loadAll(`posts?status=${encodeURIComponent(status)}`);
    for (const post of posts) {
      scanned++;
      const slugs = (post.categories || []).map(id => catById.get(id)?.slug).filter(Boolean);

      // Classify: prefer a sub-category term, else a parent term.
      let appCategory = null, subSlug = null;
      for (const s of slugs) if (SUBSLUG_TO_CATEGORY[s]) { appCategory = SUBSLUG_TO_CATEGORY[s]; subSlug = s; break; }
      if (!appCategory) for (const s of slugs) if (PARENT_SLUG_TO_CATEGORY[s]) { appCategory = PARENT_SLUG_TO_CATEGORY[s]; break; }
      if (!appCategory) { unclassified++; rows.push([post.id, post.title?.rendered || '', slugs.join('|'), '', '', 'UNCLASSIFIED']); continue; }

      // Stable roll: reuse the stored draw, else draw once and persist.
      const key = String(post.id);
      if (!state[key] || typeof state[key].rand !== 'number') state[key] = { rand: Math.random() };
      const r = state[key].rand;
      const reg = AUTHOR_REGISTRY[appCategory];
      let choice;
      if (r < FLOATER_SHARE) {
        choice = { ...reg.floater, role: 'floater', subSlug: null };
      } else if (subSlug) {
        choice = pickAuthor(appCategory, subSlug, { rand: r });
      } else {
        // Parent-only archived post (no sub-category term, e.g. published before
        // sub-cats existed): spread evenly across the category's dedicated authors
        // by post id instead of dumping every one on the default author — so each
        // byline is represented in the back-catalogue. Deterministic → idempotent.
        const subs = Object.keys(reg.subcats);
        const idx = Math.abs(parseInt(key, 10) || 0) % subs.length;
        choice = { ...reg.subcats[subs[idx]], role: 'dedicated', subSlug: subs[idx] };
      }
      state[key].username = choice.username;

      const newAuthorId = userIdBySlug.get(choice.username);
      if (!newAuthorId) { missingUser++; rows.push([post.id, post.title?.rendered || '', appCategory, subSlug || '', choice.username, 'NO_WP_USER']); continue; }

      if (post.author === newAuthorId) {
        unchanged++; rows.push([post.id, post.title?.rendered || '', appCategory, subSlug || '', choice.username, 'unchanged']);
        continue;
      }

      if (DRY) {
        changed++; rows.push([post.id, post.title?.rendered || '', appCategory, subSlug || '', choice.username, `would set ${post.author}→${newAuthorId}`]);
        continue;
      }

      const u = await wp(`posts/${post.id}`, { method: 'POST', body: JSON.stringify({ author: newAuthorId }) });
      if (u.ok) { changed++; rows.push([post.id, post.title?.rendered || '', appCategory, subSlug || '', choice.username, `set ${post.author}→${newAuthorId}`]); }
      else { failed++; rows.push([post.id, post.title?.rendered || '', appCategory, subSlug || '', choice.username, `FAILED ${u.status}`]); }
    }
  }

  saveState(state);

  // CSV report
  const csv = ['post_id,title,category,subcategory,author_username,action',
    ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
  const csvPath = join(HERE, `.backfill-authors-report${DRY ? '-dryrun' : ''}.csv`);
  writeFileSync(csvPath, csv);

  console.log(`scanned=${scanned} changed=${changed} unchanged=${unchanged} unclassified=${unclassified} missingUser=${missingUser} failed=${failed}`);
  console.log(`Report: ${csvPath}`);
  console.log(`State (idempotency): ${join(HERE, '.backfill-authors-state.json')}`);
  if (missingUser) console.log('NOTE: missingUser>0 — run create-wp-authors.js first so every byline has a WP user.');
  if (failed) process.exitCode = 2;
}

main().catch(e => { console.error(e); process.exit(1); });
