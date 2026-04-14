# Gmail Automation Source + Unified Google OAuth Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Gmail as a native automation source type so rules can poll matching emails and reformat them into Industry News articles, while consolidating Drive/Gmail/Calendar into a single Google OAuth connection.

**Architecture:** Gmail fetch logic lives in `lib/sources/gmail.js` (mirroring `cloud-drives.js`). The OAuth scope in `lib/auth/oauth.js` is expanded to include `gmail.readonly` and `calendar`. Settings UI replaces three separate Google connect buttons with one unified "Connect Google" card. The rule wizard gains a "+ Gmail" source button with filter inputs.

**Tech Stack:** Vercel serverless (ESM), Gmail API v1, `@vercel/kv`, vanilla JS (index.html), existing `connectCloudService()` OAuth popup flow.

**Spec:** `docs/superpowers/specs/2026-04-09-gmail-automation-source-design.md`

---

## Chunk 1: Backend — OAuth Scope + Token Helper

### Task 1: Expand Google OAuth scope

**Files:**
- Modify: `lib/auth/oauth.js` (line 37 — scope param in `getGoogleAuthUrl`)

- [ ] **Step 1.1: Update the scope string**

In `lib/auth/oauth.js`, change the `scope` value in `getGoogleAuthUrl`:

```javascript
// BEFORE (line 37):
scope: 'https://www.googleapis.com/auth/drive',

// AFTER:
scope: [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar',
].join(' '),
```

- [ ] **Step 1.2: Verify the file looks correct**

Run: `node --input-type=module < lib/auth/oauth.js 2>&1 | head -5` (should output nothing — just verifies it parses).

- [ ] **Step 1.3: Commit**

```bash
git add lib/auth/oauth.js
git commit -m "feat: expand Google OAuth scope to include gmail.readonly and calendar"
```

---

### Task 2: Export `getValidGoogleToken` from auth handler

**Files:**
- Modify: `lib/automation/handlers/auth.js` (add exported helper + update status response)

`★ Insight ─────────────────────────────────────`
`getValidGoogleToken` already exists as internal logic scattered in cloud-drives.js. Centralising it as a named export from auth.js makes it available to gmail.js without duplicating KV read/write logic or token refresh calls.
`─────────────────────────────────────────────────`

- [ ] **Step 2.1: Add `getValidGoogleToken` as a named export**

Add this function near the top of `lib/automation/handlers/auth.js`, after the imports:

```javascript
// Exported so other source modules (gmail, etc.) can get a valid access token
// without duplicating refresh logic.
export async function getValidGoogleToken() {
  const tokens = await getTokens('google');
  if (!tokens?.accessToken) throw new Error('Google account not connected. Go to Settings → Google Connections and click Connect Google.');
  if (Date.now() < tokens.expiresAt - 300_000) return tokens.accessToken;
  // Token expires within 5 minutes — refresh it
  const creds = await getCredentials('google');
  if (!creds) throw new Error('Google credentials not found');
  const { refreshGoogleToken } = await import('../../auth/oauth.js');
  const fresh = await refreshGoogleToken(tokens.refreshToken, creds.clientId, creds.clientSecret);
  const updated = {
    accessToken: fresh.access_token,
    refreshToken: tokens.refreshToken,
    expiresAt: Date.now() + fresh.expires_in * 1000,
  };
  await saveTokens('google', updated);
  return updated.accessToken;
}
```

- [ ] **Step 2.2: Update the `/auth/status` response to add `gmailScope` hint**

In the `GET /auth/status` handler block (around line 57), update the google response object:

```javascript
// BEFORE:
google:  { credsSaved: !!gCreds, connected: !!gTokens?.accessToken },

// AFTER:
google:  {
  credsSaved: !!gCreds,
  connected: !!gTokens?.accessToken,
  // Always show Connect button so users can re-auth for new scopes
  canReconnect: !!gCreds,
},
```

- [ ] **Step 2.3: Commit**

```bash
git add lib/automation/handlers/auth.js
git commit -m "feat: export getValidGoogleToken helper from auth handler"
```

---

## Chunk 2: Backend — Gmail Source Module

### Task 3: Create `lib/sources/gmail.js`

**Files:**
- Create: `lib/sources/gmail.js`

- [ ] **Step 3.1: Create the file with full Gmail fetch logic**

```javascript
// lib/sources/gmail.js
// Fetch and decode emails matching a filter from Gmail API v1.
// Called by lib/automation/fetch.js when source.type === 'gmail'.
// Mirrors the pattern established by lib/sources/cloud-drives.js.

import { getValidGoogleToken } from '../automation/handlers/auth.js';

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

// Build a Gmail search query string from source filter fields.
function buildQuery(source, lastRunAt) {
  const parts = [];
  if (source.from) parts.push(`from:${source.from}`);
  if (source.subjectContains) parts.push(`subject:${source.subjectContains}`);
  if (lastRunAt) {
    parts.push(`after:${Math.floor(new Date(lastRunAt).getTime() / 1000)}`);
  } else {
    // First run: cap to last 7 days to avoid flooding on busy inboxes
    const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
    parts.push(`after:${sevenDaysAgo}`);
  }
  return parts.join(' ');
}

// Depth-first extraction of the best plain-text body from a Gmail message payload.
// Prefers text/plain; falls back to stripping HTML from text/html.
export function extractBody(payload) {
  if (!payload) return '';

  // Direct plain text part
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8').trim();
  }

  if (payload.parts?.length) {
    // Prefer a direct text/plain child
    const plainChild = payload.parts.find(p => p.mimeType === 'text/plain');
    if (plainChild?.body?.data) {
      return Buffer.from(plainChild.body.data, 'base64url').toString('utf-8').trim();
    }
    // Recurse into multipart children (handles multipart/mixed > multipart/alternative)
    for (const part of payload.parts) {
      const result = extractBody(part);
      if (result) return result;
    }
  }

  // Last resort: strip HTML tags
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    const html = Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  return '';
}

// Get the value of a specific header from a message's headers array.
function getHeader(headers, name) {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

// Fetch emails matching source filters. Returns items in the standard shape
// expected by lib/automation/fetch.js / run.js.
export async function fetchGmailMessages(source, lastRunAt, fetchFn = fetch) {
  const accessToken = await getValidGoogleToken();

  const q = buildQuery(source, lastRunAt);
  const labelIds = source.labelIds?.length ? source.labelIds : ['INBOX'];
  const maxResults = Math.min(source.maxResults ?? 5, 20);

  // Step 1: list matching message IDs
  const params = new URLSearchParams({ q, maxResults: String(maxResults) });
  for (const label of labelIds) params.append('labelIds', label);

  const listRes = await fetchFn(`${GMAIL_BASE}/messages?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (listRes.status === 403) {
    const body = await listRes.text();
    if (body.includes('insufficientPermissions') || body.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
      throw new Error(
        'Google account needs reconnection — additional permissions required. ' +
        'Go to Settings → Google Connections and click Connect Google.'
      );
    }
    throw new Error(`Gmail API 403: ${body.slice(0, 200)}`);
  }
  if (listRes.status === 429) throw new Error('Gmail API rate limited (429) — will retry on next run');
  if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status}`);

  const listData = await listRes.json();
  const messageIds = listData.messages ?? [];
  if (messageIds.length === 0) return [];

  // Step 2: fetch full message for each ID
  const items = [];
  for (const { id } of messageIds) {
    const msgRes = await fetchFn(`${GMAIL_BASE}/messages/${id}?format=full`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!msgRes.ok) {
      console.warn(`Gmail: skipping message ${id} — fetch failed ${msgRes.status}`);
      continue;
    }
    const msg = await msgRes.json();
    const headers = msg.payload?.headers ?? [];
    const subject = getHeader(headers, 'Subject') || '(no subject)';
    const rawText = extractBody(msg.payload);

    if (!rawText) {
      console.warn(`Gmail: skipping message ${id} — empty body`);
      continue;
    }

    items.push({
      title: subject,
      url: null,
      rawText,
      sourceType: 'gmail',
      pubDate: new Date(parseInt(msg.internalDate, 10)),
    });
  }

  return items;
}
```

- [ ] **Step 3.2: Quick smoke test — verify the file parses as ESM**

```bash
cd "C:\Users\clift\.Claude\SLA-IBDHealthHub-generator"
node --input-type=module --eval "import('./lib/sources/gmail.js').then(m => console.log('exports:', Object.keys(m)))"
```

Expected output: `exports: [ 'extractBody', 'fetchGmailMessages' ]`

- [ ] **Step 3.3: Commit**

```bash
git add lib/sources/gmail.js
git commit -m "feat: add lib/sources/gmail.js — Gmail fetch + MIME body decode"
```

---

### Task 4: Wire gmail into `lib/automation/fetch.js`

**Files:**
- Modify: `lib/automation/fetch.js`

- [ ] **Step 4.1: Add gmail import and case**

At the top of `lib/automation/fetch.js`, add the import:

```javascript
// BEFORE (line 2):
import { fetchGoogleDrive, fetchDropbox } from '../sources/cloud-drives.js';

// AFTER:
import { fetchGoogleDrive, fetchDropbox } from '../sources/cloud-drives.js';
import { fetchGmailMessages } from '../sources/gmail.js';
```

In the `fetchSources` switch statement, add the gmail case after the dropbox case:

```javascript
// BEFORE:
case 'dropbox':      items.push(...await fetchDropbox(source, lastRunAt, fetchFn)); break;
default:             console.warn(`Unsupported source type: ${source.type}`);

// AFTER:
case 'dropbox':      items.push(...await fetchDropbox(source, lastRunAt, fetchFn)); break;
case 'gmail':        items.push(...await fetchGmailMessages(source, lastRunAt, fetchFn)); break;
default:             console.warn(`Unsupported source type: ${source.type}`);
```

Also update the error label fallback in the catch block:

```javascript
// BEFORE:
const label = source.type + (source.url ? ` (${source.url})` : source.folderId ? ` (${source.folderId})` : source.folderPath ? ` (${source.folderPath})` : '');

// AFTER:
const label = source.type + (
  source.url        ? ` (${source.url})`        :
  source.folderId   ? ` (${source.folderId})`   :
  source.folderPath ? ` (${source.folderPath})` :
  source.from       ? ` (from:${source.from})`  :
  source.subjectContains ? ` (subject:${source.subjectContains})` : ''
);
```

- [ ] **Step 4.2: Verify the file parses correctly**

```bash
node --input-type=module --eval "import('./lib/automation/fetch.js').then(m => console.log('exports:', Object.keys(m)))"
```

Expected: `exports: [ 'parseRssItems', 'filterNewItems', 'fetchSources' ]`

- [ ] **Step 4.3: Commit**

```bash
git add lib/automation/fetch.js
git commit -m "feat: add gmail source type to fetchSources; fix error label for gmail sources"
```

---

### Task 5: Update rule schema for gmail source type

**Files:**
- Modify: `lib/automation/rule-schema.js`

- [ ] **Step 5.1: Normalise gmail source defaults in `buildRule`**

In `buildRule`, after the `sources: data.sources ?? [],` line, add source normalisation:

```javascript
// BEFORE:
sources: data.sources ?? [],

// AFTER:
sources: (data.sources ?? []).map(src => {
  if (src.type === 'gmail') {
    return {
      ...src,
      from: src.from ?? '',
      subjectContains: src.subjectContains ?? '',
      labelIds: src.labelIds?.length ? src.labelIds : ['INBOX'],
      maxResults: Math.min(src.maxResults ?? 5, 20),
    };
  }
  return src;
}),
```

- [ ] **Step 5.2: Verify rule-schema parses**

```bash
node --input-type=module --eval "
import { buildRule } from './lib/automation/rule-schema.js';
const r = buildRule({ name: 'test', category: 'industry-news', sources: [{ type: 'gmail', from: 'test@example.com' }], trigger: { type: 'schedule', cron: '0 7 * * 1' } });
console.log(JSON.stringify(r.sources[0], null, 2));
"
```

Expected output: 
```json
{
  "type": "gmail",
  "from": "test@example.com",
  "subjectContains": "",
  "labelIds": ["INBOX"],
  "maxResults": 5
}
```

- [ ] **Step 5.3: Commit**

```bash
git add lib/automation/rule-schema.js
git commit -m "feat: normalise gmail source defaults in buildRule"
```

---

## Chunk 3: Settings UI — Unified Google Connections

### Task 6: Update Settings HTML — unify Google connect UI

**Files:**
- Modify: `index.html` (Settings section, ~lines 3826–3914)

`★ Insight ─────────────────────────────────────`
Merging three separate connect buttons into one card reduces user confusion about "which Google connection is active." The single button calls the existing `connectCloudService('google')` which hasn't changed — only the OAuth scope expanded upstream. No JS function changes needed for the connect flow itself.
`─────────────────────────────────────────────────`

- [ ] **Step 6.1: Replace the Google Calendar section (lines ~3826–3845) with a unified Google Connections card**

Find this block in `index.html`:
```html
<!-- Google Calendar -->
<div class="settings-section">
  <div class="settings-section-header">
    <h3>Google Calendar</h3>
    <p>Sync scheduled posts as calendar events</p>
  </div>
  <div class="settings-section-body">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
      <div class="settings-gcal-status disconnected" id="gcalStatus">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        Not connected
      </div>
      <button class="btn btn-outline btn-sm" onclick="connectGoogleCalendar()" id="gcalConnectBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        Connect Google Calendar
      </button>
    </div>
    <p style="font-size:0.65rem;color:var(--text-muted);margin:10px 0 0;">When connected, scheduling a post automatically creates a calendar event in your Google Calendar.</p>
  </div>
</div>
```

Replace it with:
```html
<!-- Google Connections (Drive + Gmail + Calendar) -->
<div class="settings-section">
  <div class="settings-section-header">
    <h3>Google Connections</h3>
    <p>One connection gives access to Drive, Gmail, and Calendar</p>
  </div>
  <div class="settings-section-body">
    <div id="googleConnectionStatus" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:12px;">
      <div class="settings-gcal-status disconnected" id="gcalStatus">Not connected</div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-outline btn-sm" id="googleUnifiedConnectBtn" onclick="connectCloudService('google')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        Connect Google
      </button>
      <button class="btn btn-outline btn-sm" id="googleUnifiedDisconnectBtn" onclick="disconnectCloudService('google')" style="display:none;color:#ef4444;border-color:#ef4444;">Disconnect</button>
    </div>
    <p style="font-size:0.65rem;color:var(--text-muted);margin:10px 0 0;">Connects Drive (automation sources), Gmail (email-to-article), and Calendar (schedule sync). Re-connect at any time to refresh permissions.</p>
  </div>
</div>
```

- [ ] **Step 6.2: Update the Google Drive card in Cloud Storage (lines ~3905–3914) — remove the duplicate connect/disconnect buttons and replace with a reference**

Find this block inside the Google Drive card:
```html
<div style="display:flex;gap:8px;flex-wrap:wrap;">
  <button class="btn btn-outline btn-sm" onclick="saveCloudCreds('google')">Save credentials</button>
  <button class="btn btn-outline btn-sm" id="googleConnectBtn" onclick="connectCloudService('google')" style="display:none;">Connect Drive</button>
  <button class="btn btn-outline btn-sm" id="googleDisconnectBtn" onclick="disconnectCloudService('google')" style="display:none;color:#ef4444;border-color:#ef4444;">Disconnect</button>
</div>
```

Replace with:
```html
<div style="display:flex;gap:8px;flex-wrap:wrap;">
  <button class="btn btn-outline btn-sm" onclick="saveCloudCreds('google')">Save credentials</button>
</div>
<p style="font-size:0.63rem;color:var(--text-muted);margin:8px 0 0;">After saving credentials, use the <strong>Google Connections</strong> section above to connect.</p>
```

- [ ] **Step 6.3: Update `_renderCloudStatus` / `loadCloudIntegrationStatus` to populate the unified status display**

Find the `loadCloudIntegrationStatus` function (~line 11406):
```javascript
async function loadCloudIntegrationStatus() {
  try {
    var data = await apiFetch('/api/automation/auth/status');
    _cloudStatus.google  = data.google?.connected  || false;
    _cloudStatus.dropbox = data.dropbox?.connected || false;
    _renderCloudStatus('google',  data.google);
    _renderCloudStatus('dropbox', data.dropbox);
  } catch (e) { /* non-fatal */ }
}
```

Replace with:
```javascript
async function loadCloudIntegrationStatus() {
  try {
    var data = await apiFetch('/api/automation/auth/status');
    _cloudStatus.google  = data.google?.connected  || false;
    _cloudStatus.dropbox = data.dropbox?.connected || false;
    _renderCloudStatus('google',  data.google);
    _renderCloudStatus('dropbox', data.dropbox);
    // Update unified Google Connections card
    _renderUnifiedGoogleStatus(data.google);
  } catch (e) { /* non-fatal */ }
}

function _renderUnifiedGoogleStatus(info) {
  var connected = info?.connected || false;
  var statusEl = document.getElementById('gcalStatus');
  var connectBtn = document.getElementById('googleUnifiedConnectBtn');
  var disconnectBtn = document.getElementById('googleUnifiedDisconnectBtn');
  var driveStatusEl = document.getElementById('googleDriveStatus');
  if (statusEl) {
    statusEl.className = 'settings-gcal-status ' + (connected ? 'connected' : 'disconnected');
    statusEl.textContent = connected ? 'Drive ✓  Gmail ✓  Calendar ✓' : 'Not connected';
  }
  if (connectBtn) connectBtn.style.display = '';
  if (disconnectBtn) disconnectBtn.style.display = connected ? '' : 'none';
  if (driveStatusEl) {
    driveStatusEl.className = 'settings-gcal-status ' + (connected ? 'connected' : 'disconnected');
    driveStatusEl.textContent = connected ? 'Connected' : 'Not connected';
  }
}
```

- [ ] **Step 6.4: Remove the dead `connectGoogleCalendar` function**

Find and delete this entire function (search for `function connectGoogleCalendar`):
```javascript
function connectGoogleCalendar() {
  const popup = window.open('/api/calendar/auth', 'gcal-auth', 'width=520,height=640,menubar=no,toolbar=no');
  window.addEventListener('message', e => {
    if (e.data === 'calendar-connected') {
      popup?.close();
      checkGcalStatus();
      showAlert('generateAlert', '✓ Google Calendar connected!', 'success');
    }
  }, { once: true });
}
```

Also find and remove any `checkGcalStatus` function if it only served `connectGoogleCalendar`.

- [ ] **Step 6.5: Commit**

```bash
git add index.html
git commit -m "feat: unify Google connections UI — single Connect Google button for Drive+Gmail+Calendar"
```

---

## Chunk 4: Wizard UI — Gmail Source Type

### Task 7: Add Gmail source option to the rule wizard

**Files:**
- Modify: `index.html` (~lines 3973–3994 for source buttons, ~lines 6596–6626 for `_wizRenderSources`)

- [ ] **Step 7.1: Add the "+ Gmail" button to BOTH wizard source selection panels**

There are two wizard instances in `index.html` — one at ~line 3991 and one at ~line 12334. Both need the button.

**First instance (~line 3991):** Find:
```html
<button onclick="wizAddSource('dropbox')" style="padding:5px 12px;border:1px dashed var(--border);background:transparent;color:var(--text-muted);font-size:0.78rem;cursor:pointer;">+ Dropbox</button>
```
Add after it:
```html
<button onclick="wizAddSource('gmail')" style="padding:5px 12px;border:1px dashed var(--border);background:transparent;color:var(--text-muted);font-size:0.78rem;cursor:pointer;">+ Gmail</button>
```

**Second instance (~line 12334):** Find:
```html
<button disabled style="padding:5px 12px;border-radius:6px;border:1px dashed var(--border);background:transparent;color:var(--text-muted);font-size:0.78rem;opacity:0.4;cursor:not-allowed;" title="Coming soon">+ Dropbox</button>
```
Add after it (note: second panel uses `border-radius:6px` style):
```html
<button onclick="wizAddSource('gmail')" style="padding:5px 12px;border-radius:6px;border:1px dashed var(--border);background:transparent;color:var(--text-muted);font-size:0.78rem;cursor:pointer;">+ Gmail</button>
```

- [ ] **Step 7.2: Add Gmail to the `labelMap` in `_wizRenderSources`**

Find (line ~6599):
```javascript
var labelMap = { rss:'RSS', url:'URL', upload:'Upload', github:'GitHub', google_drive:'Drive', dropbox:'Dropbox' };
```

Replace with:
```javascript
var labelMap = { rss:'RSS', url:'URL', upload:'Upload', github:'GitHub', google_drive:'Drive', dropbox:'Dropbox', gmail:'Gmail' };
```

- [ ] **Step 7.3: Add Gmail source card render logic in `_wizRenderSources`**

Find the `else if (s.type === 'dropbox')` block and add a new branch after it:

```javascript
// BEFORE:
} else if (s.type === 'dropbox') {
  inputHtml = '<input placeholder="Dropbox folder path e.g. /IBD Articles" ...>';
} else {

// AFTER:
} else if (s.type === 'dropbox') {
  inputHtml = '<input placeholder="Dropbox folder path e.g. /IBD Articles" oninput="(function(el){var src=_wizSources.find(function(x){return x.id===\'' + s.id + '\'});if(src)src.folderPath=el.value.trim();})(this)" value="' + escHtml(s.folderPath||'') + '" style="flex:1;padding:6px 10px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:0.82rem;">';
} else if (s.type === 'gmail') {
  inputHtml = '<div style="display:flex;flex-direction:column;gap:4px;flex:1;">'
    + '<input placeholder="From (domain or address, e.g. nejm.org)" oninput="(function(el){var src=_wizSources.find(function(x){return x.id===\'' + s.id + '\'});if(src)src.from=el.value.trim();})(this)" value="' + escHtml(s.from||'') + '" style="width:100%;box-sizing:border-box;padding:5px 10px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:0.78rem;">'
    + '<input placeholder="Subject contains (e.g. IBD, Crohn)" oninput="(function(el){var src=_wizSources.find(function(x){return x.id===\'' + s.id + '\'});if(src)src.subjectContains=el.value.trim();})(this)" value="' + escHtml(s.subjectContains||'') + '" style="width:100%;box-sizing:border-box;padding:5px 10px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:0.78rem;">'
    + '<div style="display:flex;gap:6px;">'
    + '<input placeholder="Label (default: INBOX)" oninput="(function(el){var src=_wizSources.find(function(x){return x.id===\'' + s.id + '\'});if(src)src.labelIds=[el.value.trim()||\'INBOX\'];})(this)" value="' + escHtml((s.labelIds&&s.labelIds[0])||'INBOX') + '" style="flex:1;padding:5px 10px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:0.78rem;">'
    + '<input type="number" placeholder="Max emails" min="1" max="20" oninput="(function(el){var src=_wizSources.find(function(x){return x.id===\'' + s.id + '\'});if(src)src.maxResults=Math.min(parseInt(el.value)||5,20);})(this)" value="' + (s.maxResults||5) + '" style="width:70px;padding:5px 10px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:0.78rem;">'
    + '</div></div>';
} else {
```

- [ ] **Step 7.4: Add "not connected" warning for gmail sources in `_wizRenderSources`**

Find the connect warning block (line ~6614):
```javascript
if ((s.type === 'google_drive' || s.type === 'dropbox') && !_cloudStatus[s.type === 'google_drive' ? 'google' : 'dropbox']) {
  connectWarning = '<span style="font-size:0.7rem;color:#f59e0b;white-space:nowrap;">⚠ Not connected</span>';
}
```

Replace with:
```javascript
if ((s.type === 'google_drive' || s.type === 'gmail') && !_cloudStatus.google) {
  connectWarning = '<span style="font-size:0.7rem;color:#f59e0b;white-space:nowrap;">⚠ Google not connected</span>';
} else if (s.type === 'dropbox' && !_cloudStatus.dropbox) {
  connectWarning = '<span style="font-size:0.7rem;color:#f59e0b;white-space:nowrap;">⚠ Not connected</span>';
}
```

- [ ] **Step 7.5: Pre-fill Gmail reformat prompt in wizard generation step**

Find the wizard navigation function that moves to the generation step (panel 3). Search for `wizPanel3` or the function `wizNext()` or `wizGoTo(3)`. Locate where wizPanel3 is shown and add prompt pre-fill logic after it becomes visible.

Find where `wizPanel3` is activated (likely in `wizNext` or a step-transition function). Add this logic at the transition point:

```javascript
// Pre-fill generation prompt when all sources are gmail type
if (_wizSources.length > 0 && _wizSources.every(function(s){ return s.type === 'gmail'; })) {
  var promptEl = document.getElementById('wizPrompt');
  if (promptEl && !promptEl.value) {
    promptEl.value = 'Reformat the following email into a clean, professional IBD industry news article. Preserve all key facts, figures, and quotes. Do not add any information not present in the original email.';
  }
}
```

- [ ] **Step 7.6: Commit**

```bash
git add index.html
git commit -m "feat: add Gmail source type to rule wizard — filter inputs + prompt pre-fill"
```

---

## Chunk 5: Cleanup + Deploy

### Task 8: Delete `api/calendar/auth.js`

**Files:**
- Delete: `api/calendar/auth.js`

- [ ] **Step 8.1: Check what's in the file before deleting**

```bash
cat "C:\Users\clift\.Claude\SLA-IBDHealthHub-generator\api\calendar\auth.js" 2>/dev/null || echo "File not found or already deleted"
```

- [ ] **Step 8.2: Delete and verify function count stays ≤ 12**

```bash
cd "C:\Users\clift\.Claude\SLA-IBDHealthHub-generator"
# Delete the file
rm api/calendar/auth.js 2>/dev/null || echo "already gone"
# Count remaining api files
find api -name "*.js" | sort
```

- [ ] **Step 8.3: Commit deletion**

```bash
git rm api/calendar/auth.js
git commit -m "chore: remove api/calendar/auth.js — Calendar OAuth merged into unified Google connection"
```

---

### Task 9: Deploy to production

- [ ] **Step 9.1: Final sanity check — verify no import errors**

```bash
cd "C:\Users\clift\.Claude\SLA-IBDHealthHub-generator"
node --input-type=module --eval "
import('./lib/sources/gmail.js').then(m => console.log('gmail.js OK:', Object.keys(m)));
import('./lib/automation/fetch.js').then(m => console.log('fetch.js OK:', Object.keys(m)));
import('./lib/automation/rule-schema.js').then(m => console.log('rule-schema.js OK:', Object.keys(m)));
"
```

Expected:
```
gmail.js OK: [ 'extractBody', 'fetchGmailMessages' ]
fetch.js OK: [ 'parseRssItems', 'filterNewItems', 'fetchSources' ]
rule-schema.js OK: [ 'buildRule', 'validateRule' ]
```

- [ ] **Step 9.2: Deploy to Vercel production**

```bash
cd "C:\Users\clift\.Claude\SLA-IBDHealthHub-generator"
npx vercel --prod --yes 2>&1
```

Expected: deployment URL printed, no build errors.

- [ ] **Step 9.3: Verify production is live**

```bash
curl -s https://ibdhealthhub.vercel.app/api/automation/auth/status | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log('google:', j.google, 'dropbox:', j.dropbox)"
```

Expected: returns JSON with `google.credsSaved` and `dropbox` fields.

- [ ] **Step 9.4: Smoke test the Gmail source end-to-end**

1. Open https://ibdhealthhub.vercel.app
2. Go to Settings → Google Connections → click **Connect Google** → complete OAuth (re-auth with new scopes)
3. Verify status shows "Drive ✓  Gmail ✓  Calendar ✓"
4. Go to Automations → Create New
5. In wizard Step 1, click **+ Gmail**
6. Fill in: From = your email address, Subject contains = `test`, Max = 1
7. Set schedule, category = Industry News, review = on
8. Save the rule
9. In Vercel dashboard or via terminal, trigger a manual run:

```bash
curl -X POST https://ibdhealthhub.vercel.app/api/automation/run \
  -H "Content-Type: application/json" \
  -d '{"ruleId": "<RULE_ID_FROM_WIZARD>"}' 2>&1
```

10. Go to Library — a new draft article should appear in Industry News

- [ ] **Step 9.5: Final commit with version bump note**

```bash
cd "C:\Users\clift\.Claude\SLA-IBDHealthHub-generator"
git log --oneline -8
```
