// scripts/zernio-dm-spike.mjs — step Z1 of ../../tasks/comment-to-dm-plan.md.
//
// WHAT THE SPIKE FOUND (run 3, 2026-09-23; ../../tasks/comment-to-dm-plan.md §5 Z1): Zernio's
// create endpoint IGNORES isActive. Every comment automation is LIVE from the moment it is
// created, answering matching comments with real DMs until it is paused (PATCH isActive:false)
// or deleted. Run 3 sent isActive:false with an account-wide target and got back an ACTIVE
// automation covering the whole @merlows.news account; it was deleted < 0.4 s later.
//
// So by default this script only READS: which profiles and accounts the key can see, the
// automations that already exist, the Instagram posts Zernio knows about, and (with --logs) one
// existing automation's logs. It creates nothing.
//
// Creating a test automation needs BOTH an explicit post (--platform-post-id or --post-id) AND
// --live. It is scoped to that one post: this script never creates an account-wide automation.
// While it exists, a VOICES comment on that post gets a real DM. It is deleted in a `finally`,
// found by its unique name as well as its id, so a create call that errored after Zernio stored
// the automation still gets cleaned up. If the delete fails, the script says so loudly and
// prints the id: remove it by hand at once, because it is live until you do.
//
// Run from content-generator with ZERNIO_API_KEY in the environment (never pass it as an
// argument, never write it to a file):
//   node scripts/zernio-dm-spike.mjs                                          # read-only (the default)
//   node scripts/zernio-dm-spike.mjs --logs AUTOMATION_ID                     # read-only, plus that automation's logs
//   node scripts/zernio-dm-spike.mjs --dry                                    # build and validate only, no network
//   node scripts/zernio-dm-spike.mjs --platform-post-id IG_MEDIA_ID --live    # LIVE on that Instagram post, then deleted
//   node scripts/zernio-dm-spike.mjs --post-id ZERNIO_POST_ID --live          # LIVE on that Zernio post, then deleted
//
// Writes every raw response (no headers, so never the key) to scripts/.zernio-dm-spike-output.json,
// replacing the previous run's report.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  listCommentAutomations, createCommentAutomation, deleteCommentAutomation, getCommentAutomationLogs,
} from '../lib/social/platforms/zernio.js';
import { buildAutomation, validateAutomation } from '../lib/social/dm/automation.js';

const API = process.env.ZERNIO_API_URL || 'https://zernio.com/api/v1';
// Not secrets: recorded in content-generator/CLAUDE.md ("Social Autopilot Phase 0"). The first
// live run (2026-09-23) got 404 "Profile not found or access denied" for this profile id, so
// step 0 below asks Zernio which profiles and accounts the key can actually see.
const RECORDED_PROFILE_ID = '6ab2985ea77a696ba3a9610f';
let PROFILE_ID = process.env.ZERNIO_PROFILE_ID || RECORDED_PROFILE_ID;
let IG_ACCOUNT_ID = process.env.ZERNIO_INSTAGRAM_ACCOUNT_ID || '6ab29cf68d284ffb212e1818';
const IG_HANDLE = 'merlows.news';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '.zernio-dm-spike-output.json');

// Unique per run, so the clean-up can find this run's automation by name even when the create
// call errored and returned no id.
const RUN_ID = `merlows-dm-z1-spike-${Date.now()}`;
const SPIKE_NAME = `merlows-dm Z1 SPIKE LIVE ${RUN_ID.slice(-13)} - delete me`;
const DRY_PLACEHOLDER_POST = 'DRY-RUN-NO-POST';

function usage(message) {
  console.error(`Usage error: ${message}\nNothing was sent.`);
  process.exit(2);
}

/**
 * Every argument is checked before anything touches the network, and anything unrecognised
 * stops the run: a mistyped option must never be read as permission to create.
 */
function parseArgs(argv) {
  const out = { dry: false, live: false };
  const OPTIONS = { '--platform-post-id': 'platformPostId', '--post-id': 'postId', '--logs': 'logsFor' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry') out.dry = true;
    else if (a === '--live') out.live = true;
    else if (a === '--account-wide') usage('--account-wide has been removed: an account-wide automation is live on every post the moment it is created');
    else if (OPTIONS[a]) {
      const value = argv[++i];
      if (!value || value.startsWith('-')) usage(`${a} needs a value`);
      if (out[OPTIONS[a]] !== undefined) usage(`${a} given twice`);
      out[OPTIONS[a]] = value;
    } else usage(`unknown argument: ${a}`);
  }
  if (out.platformPostId && out.postId) usage('give --platform-post-id or --post-id, not both');
  if (out.live && !out.platformPostId && !out.postId) {
    usage('--live needs an explicit post: --platform-post-id IG_MEDIA_ID or --post-id ZERNIO_POST_ID. This script never creates an account-wide automation.');
  }
  return out;
}

const describeTarget = (t) => (t?.platformPostId ? `Instagram media ${t.platformPostId}` : t?.postId ? `Zernio post ${t.postId}` : 'no post');

const transcript = [];

/** fetch that keeps the raw status and body of every call, and never records headers. */
async function recordingFetch(url, init = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text.slice(0, 2000); }
  const u = new URL(url);
  transcript.push({ method: init.method || 'GET', path: u.pathname + u.search, status: res.status, body });
  return { ok: res.ok, status: res.status, json: async () => (body && typeof body === 'object' ? body : {}) };
}

/** A read the adapter does not have yet. */
async function zget(path) {
  const res = await recordingFetch(`${API}${path}`, { headers: { Authorization: `Bearer ${process.env.ZERNIO_API_KEY}` } });
  return { status: res.status, body: await res.json() };
}

const line = (s = '') => console.log(s);
const summarise = (a) => `${a.id}  active=${a.isActive}  scope=${a.platformPostId || a.postId || 'account-wide'}  keywords=${a.keywords.join(',') || '(none)'}  mode=${a.matchMode}`;

// Accumulates, so the error handler's save keeps the createdId/deleteOk the `finally` recorded.
const reportFields = {};
function saveReport(extra = {}) {
  Object.assign(reportFields, extra);
  writeFileSync(OUT, JSON.stringify({ ranAt: new Date().toISOString(), profileId: PROFILE_ID, accountId: IG_ACCOUNT_ID, ...reportFields, transcript }, null, 2));
  line(`\nRaw responses written to ${OUT}`);
}

const idOf = (x) => (x && typeof x === 'object' ? x._id ?? x.id ?? null : x ?? null);
const listFrom = (body, key) => {
  const list = body?.[key] ?? body?.data ?? (Array.isArray(body) ? body : []);
  return Array.isArray(list) ? list : [];
};

/**
 * Step 0: what can this key see? Resolves PROFILE_ID and IG_ACCOUNT_ID from Zernio itself, so a
 * stale recorded id or a key from another workspace shows up as a clear message instead of a 404.
 */
async function discover() {
  const profilesRes = await zget('/profiles');
  const accountsRes = await zget('/accounts');
  const profiles = listFrom(profilesRes.body, 'profiles');
  const accounts = listFrom(accountsRes.body, 'accounts');

  line(`0. Key can see ${profiles.length} profile(s) (HTTP ${profilesRes.status}) and ${accounts.length} account(s) (HTTP ${accountsRes.status})`);
  for (const p of profiles) line(`   profile ${idOf(p)}  "${p.name ?? ''}"`);
  for (const a of accounts) {
    line(`   account ${idOf(a)}  ${a.platform ?? '?'}  @${a.username ?? a.handle ?? a.displayName ?? '?'}  profile=${idOf(a.profileId ?? a.profile)}`);
  }

  const ig = accounts.find((a) => idOf(a) === IG_ACCOUNT_ID)
    ?? accounts.find((a) => a.platform === 'instagram' && String(a.username ?? a.handle ?? '').replace(/^@/, '').toLowerCase() === IG_HANDLE);
  if (!ig) {
    throw new Error(`this key cannot see the @${IG_HANDLE} Instagram account (${IG_ACCOUNT_ID}). Is it the key from the Zernio workspace that holds @${IG_HANDLE}?`);
  }
  if (idOf(ig) !== IG_ACCOUNT_ID) line(`   note: Instagram account id is ${idOf(ig)}, not the recorded ${IG_ACCOUNT_ID}`);
  IG_ACCOUNT_ID = idOf(ig);

  const owner = idOf(ig.profileId ?? ig.profile);
  if (!process.env.ZERNIO_PROFILE_ID && owner) {
    if (owner !== PROFILE_ID) line(`   note: @${IG_HANDLE} belongs to profile ${owner}, not the recorded ${RECORDED_PROFILE_ID}`);
    PROFILE_ID = owner;
  }
  line(`   Using profile ${PROFILE_ID}, Instagram account ${IG_ACCOUNT_ID}\n`);
}

/**
 * Published Instagram posts Zernio knows about, printed as candidate targets. Read only: a target
 * is never picked from this list, it must be named on the command line. The posts list shape is
 * undocumented here, so read it defensively.
 */
async function listInstagramPosts() {
  const { status, body } = await zget(`/posts?profileId=${encodeURIComponent(PROFILE_ID)}&limit=20`);
  const posts = body?.posts ?? body?.data ?? (Array.isArray(body) ? body : []);
  const found = [];
  for (const post of Array.isArray(posts) ? posts : []) {
    for (const p of post.platforms ?? []) {
      const platform = p.platform ?? p.name;
      const mediaId = p.platformPostId ?? p.postId;
      if (platform === 'instagram' && mediaId && ['published', 'posted'].includes(String(p.status ?? post.status).toLowerCase())) {
        found.push({ zernioPostId: post.id ?? post._id, platformPostId: String(mediaId), url: p.url ?? p.permalink ?? p.platformPostUrl ?? null });
      }
    }
  }
  line(`2. Posts (HTTP ${status}): ${Array.isArray(posts) ? posts.length : 0} in Zernio, ${found.length} published on Instagram`);
  for (const f of found) line(`   --platform-post-id ${f.platformPostId}   (--post-id ${f.zernioPostId})${f.url ? `   ${f.url}` : ''}`);
  return found;
}

function spikePayload(target) {
  return {
    ...buildAutomation({
      profileId: PROFILE_ID,
      accountId: IG_ACCOUNT_ID,
      ...(target.platformPostId ? { platformPostId: target.platformPostId } : { postId: target.postId }),
      headline: 'Z1 spike test',
      articleUrl: 'https://merlows.com/',
    }),
    name: SPIKE_NAME,
  };
}

/**
 * Delete this run's automation, looked up by name as well as by id: a create that timed out or
 * errored after Zernio stored it hands back no id, and that automation is live. Returns true
 * only when a fresh list shows none of this run's automations left.
 */
async function removeSpikeAutomations(knownId) {
  const ours = (a) => (knownId && a.id === knownId) || a.name === SPIKE_NAME;
  const ids = new Set(knownId ? [knownId] : []);
  try {
    for (const a of await listCommentAutomations({ profileId: PROFILE_ID, fetchFn: recordingFetch })) if (ours(a)) ids.add(a.id);
  } catch (err) {
    line(`8. !! Could not list automations to find this run's: ${err.message}`);
  }
  for (const id of ids) {
    try {
      await deleteCommentAutomation(id, { fetchFn: recordingFetch });
    } catch (err) {
      line(`8. !! DELETE FAILED for ${id}: ${err.message}`);
    }
  }
  let left = [...ids];
  let confirmed = false;
  try {
    left = (await listCommentAutomations({ profileId: PROFILE_ID, fetchFn: recordingFetch })).filter(ours).map((a) => a.id);
    confirmed = true;
  } catch (err) {
    line(`8. !! Could not re-list to confirm the delete: ${err.message}`);
  }
  if (confirmed && left.length === 0) {
    line(ids.size ? `8. Deleted ${[...ids].join(', ')}; confirmed gone from the list.` : '8. The create left nothing behind; nothing to delete.');
    return true;
  }
  line(`8. !! This run's automation may still be LIVE: ${left.join(', ') || `(unknown id, name "${SPIKE_NAME}")`}`);
  line('   Delete it by hand in Zernio NOW: it answers VOICES comments with real DMs until you do.');
  return false;
}

const logSummary = (logs) =>
  `${logs.logs.length} entr${logs.logs.length === 1 ? 'y' : 'ies'}, total=${logs.total}, misses=${JSON.stringify(logs.misses)}`;

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const target = opts.platformPostId ? { platformPostId: opts.platformPostId } : opts.postId ? { postId: opts.postId } : null;

  // --dry: build and validate with the real code, no network. Always per-post: with no target
  // given, a placeholder post id stands in, so the payload shown is the shape --live would send.
  if (opts.dry) {
    const payload = spikePayload(target ?? { platformPostId: DRY_PLACEHOLDER_POST });
    const problems = validateAutomation(payload);
    line(`Z1 spike --dry: payload for ${target ? describeTarget(target) : `placeholder post ${DRY_PLACEHOLDER_POST}`}; validator problems: ${problems.length ? problems.join('; ') : 'none'}`);
    line('--dry: nothing sent. Creating this for real needs a post target AND --live, and it is live the moment it exists.\n');
    line(JSON.stringify(payload, null, 2));
    if (problems.length) process.exitCode = 1;
    return;
  }

  if (!process.env.ZERNIO_API_KEY) {
    console.error('ZERNIO_API_KEY is not set in this shell. Set it first (see the command you were given), then re-run.');
    process.exit(2);
  }

  line(opts.live
    ? `Z1 spike: LIVE. Creates ONE automation on ${describeTarget(target)}. From the moment it exists, a VOICES comment on that post gets a real DM, until the delete at step 8.\n`
    : 'Z1 spike: read-only. Nothing is created and nothing is sent.\n');

  // 0. What the key can see; 1. what already exists; 2. candidate posts; 3. logs, if asked
  await discover();
  const existing = await listCommentAutomations({ profileId: PROFILE_ID, fetchFn: recordingFetch });
  line(`1. Existing automations on the profile: ${existing.length}`);
  for (const a of existing) line(`   ${summarise(a)}`);
  await listInstagramPosts();
  if (opts.logsFor) {
    const logs = await getCommentAutomationLogs(opts.logsFor, { fetchFn: recordingFetch });
    line(`3. Logs for ${opts.logsFor}: ${logSummary(logs)}`);
  }

  if (!opts.live) {
    if (target) line(`\n${describeTarget(target)} was named but --live was not given, so nothing was created.`);
    else line('\nRead-only: nothing was created. To create a live test automation, name a post and add --live.');
    saveReport({ mode: 'read-only', target, createdId: null });
    return;
  }

  // 4. Build and validate with the real code
  const payload = spikePayload(target);
  const problems = validateAutomation(payload, { existing });
  line(`4. Payload built for ${describeTarget(target)}; validator problems: ${problems.length ? problems.join('; ') : 'none'}`);
  if (!payload.platformPostId && !payload.postId) throw new Error('refusing to create: the payload is not scoped to one post');
  if (problems.length) throw new Error('refusing to send a payload the validator rejects');

  // 5. Create (live from here), 6. read back, 7. logs, 8. delete
  let created = null;
  let createAttempted = false;
  let deleteOk = false;
  try {
    createAttempted = true;
    created = await createCommentAutomation(payload, { requestId: RUN_ID, fetchFn: recordingFetch });
    line(`5. Created ${created.id} (isActive=${created.isActive}). It is LIVE on ${describeTarget(target)} until step 8.`);

    const readBack = await zget(`/comment-automations/${encodeURIComponent(created.id)}`);
    const a = readBack.body?.automation ?? readBack.body ?? {};
    line(`6. Read back (HTTP ${readBack.status}): isActive=${a.isActive} matchMode=${a.matchMode} typoTolerance=${a.typoTolerance} linkTracking=${a.linkTracking}`);
    line(`   commentReply=${JSON.stringify(a.commentReply)}`);
    line(`   commentReplyVariations=${JSON.stringify(a.commentReplyVariations)}`);
    line(`   platformPostId=${a.platformPostId ?? '(none)'}  postId=${a.postId ?? '(none)'}  keys: ${Object.keys(a).join(', ')}`);

    const logs = await getCommentAutomationLogs(created.id, { fetchFn: recordingFetch });
    line(`7. Logs: ${logSummary(logs)}`);
  } finally {
    if (createAttempted) deleteOk = await removeSpikeAutomations(created?.id);
    saveReport({ mode: 'live', target, createdId: created?.id ?? null, deleteOk });
  }
}

main().catch((err) => {
  console.error(`\nSpike stopped: ${err.message}`);
  if (err.data) console.error(JSON.stringify(err.data).slice(0, 1000));
  if (transcript.length) saveReport({ error: err.message });
  process.exit(1);
});
