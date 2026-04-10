# Gmail Automation Source + Unified Google OAuth — Design Spec
**Date:** 2026-04-09  
**Project:** IBDHealthHub Content Generator  
**Status:** Approved

---

## Overview

Add Gmail as a native source type in the automation rule system, allowing the app to poll matching emails and reformat them into Industry News articles. Simultaneously consolidate the three separate Google OAuth connections (Drive, Calendar, Gmail) into a single unified "Connect Google" flow that requests all required scopes at once.

---

## Goals

1. Users can create automation rules with `type: 'gmail'` sources filtered by sender, subject keyword, and/or label.
2. Matched emails are lightly reformatted by the LLM into Industry News articles and pass through the standard review → publish pipeline.
3. A single Google OAuth connection covers Drive, Gmail, and Calendar — no separate connect buttons for each service.
4. No new Vercel serverless function files added (stay within 12-function limit); one file (`api/calendar/auth.js`) removed.

---

## Non-Goals

- Real-time Gmail push notifications (Pub/Sub) — polling on schedule is sufficient.
- NotebookLM integration — no public API exists.
- Gmail *sending* — read-only access only.

---

## Architecture

### 1. Unified Google OAuth

**Scope string (updated in `lib/auth/oauth.js`):**
```
https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar
```

**Token storage:** Unchanged — `auth:google:tokens` in KV stores `{ accessToken, refreshToken, expiresAt }`. The broader scopes are transparent to the storage layer.

**Re-consent for existing users:** When the Gmail fetch function receives a `403 insufficientPermissions` error, it catches it and returns a structured error result that surfaces in the rule job as: `"Google account needs reconnection — additional permissions required. Go to Settings → Google Connections and click Connect Google."` The next time the user visits Settings, the "Connect Google" button is always shown (not hidden behind a "connected" check) if any scope may be missing — i.e., we do not persist which scopes were granted; we always allow re-auth. Clicking "Connect Google" will re-request the full scope set including `gmail.readonly` and `calendar`.

**`api/calendar/auth.js` deletion:** The current Calendar OAuth callback is `/api/calendar/auth` with redirect URI `https://<host>/api/calendar/auth/callback` (or similar). After deletion, Calendar auth flows through the existing `/api/automation/auth/google` endpoint whose redirect URI `https://ibdhealthhub.vercel.app/api/automation/auth/google/callback` is already registered in Google Cloud Console. **Required manual step after deployment:** Verify the Google Cloud Console OAuth client has only the Drive callback URI registered (it does — confirmed). No new URIs need to be added since Calendar auth was already sharing the same Google project.

**`getValidGoogleToken` helper:** This function already exists in `lib/automation/handlers/auth.js` (not in `oauth.js`) as an internal helper. It reads `auth:google:tokens` from KV, checks `expiresAt - 300_000`, and calls `refreshGoogleToken()` from `oauth.js` if needed, then writes the refreshed token back to KV. The `lib/sources/gmail.js` module will import and use this same function — it will be exported from `auth.js`.

**Affected files:**
- `lib/auth/oauth.js` — update scope constant only (no helpers added here)
- `lib/automation/handlers/auth.js` — export `getValidGoogleToken`; update status endpoint
- `lib/sources/gmail.js` — **new file** (library code, not a Vercel function — does not count toward the 12-function limit)
- `lib/automation/fetch.js` — add `gmail` case delegating to `lib/sources/gmail.js`
- `lib/automation/rule-schema.js` — add `gmail` to valid source types; normalise defaults in `buildRule`
- `api/calendar/auth.js` — **deleted**
- `index.html` — Settings UI + wizard source step + wizard prompt pre-fill

### 2. Gmail Source Type

**Source schema entry (as stored in rule JSON):**
```javascript
{
  type: 'gmail',
  from: string,            // optional sender domain or address (default: '')
  subjectContains: string, // optional subject keyword (default: '')
  labelIds: string[],      // Gmail label IDs (default: ['INBOX'])
  maxResults: number       // emails per run (default: 5, max: 20)
}
```

**Defaults normalised by `buildRule` in `rule-schema.js`:**
```javascript
if (src.type === 'gmail') {
  src.from = src.from ?? '';
  src.subjectContains = src.subjectContains ?? '';
  src.labelIds = src.labelIds?.length ? src.labelIds : ['INBOX'];
  src.maxResults = Math.min(src.maxResults ?? 5, 20);
}
```

**Gmail API filtering strategy — two mechanisms used together:**
1. `labelIds` query parameter on `messages.list` — filters to messages with all specified labels (e.g. `['INBOX']`). This is the Gmail API native label filter.
2. `q` search string — combines `from:`, `subject:`, and `after:` operators for the remaining filters.

```javascript
// Query construction
const parts = [];
if (source.from) parts.push(`from:${source.from}`);
if (source.subjectContains) parts.push(`subject:${source.subjectContains}`);
if (lastRunAt) {
  parts.push(`after:${Math.floor(new Date(lastRunAt).getTime() / 1000)}`);
} else {
  // First run: cap to last 7 days to avoid flooding
  const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
  parts.push(`after:${sevenDaysAgo}`);
}
const q = parts.join(' ');
// API call: GET /gmail/v1/users/me/messages?labelIds=INBOX&q=from:...&maxResults=5
```

**`maxResults` vs `generation.maxArticlesPerRun` interaction:** The Gmail fetch function fetches up to `source.maxResults` emails. The existing run handler already enforces `generation.maxArticlesPerRun` as a cap on how many items are turned into articles — items beyond that limit are simply not processed. So `maxResults` controls API call size; `maxArticlesPerRun` controls article generation. If `maxResults: 10` and `maxArticlesPerRun: 3`, ten emails are fetched but only the first three are sent to the LLM.

**MIME body traversal — depth-first, `text/plain` preferred:**
```javascript
function extractBody(payload) {
  // Depth-first search through parts tree
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
  }
  if (payload.parts) {
    // Prefer text/plain child first
    const plain = payload.parts.find(p => p.mimeType === 'text/plain');
    if (plain?.body?.data) return Buffer.from(plain.body.data, 'base64url').toString('utf-8');
    // Recurse into multipart children
    for (const part of payload.parts) {
      const result = extractBody(part);
      if (result) return result;
    }
  }
  // Fallback: strip HTML
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    const html = Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return '';
}
```

**Fetch output per email:**
```javascript
{
  title: string,           // email subject (decoded from header)
  url: null,
  rawText: string,         // decoded plain-text body (empty string if undecodable)
  sourceType: 'gmail',
  pubDate: Date            // new Date(parseInt(message.internalDate))
}
```
Emails with empty `rawText` after extraction are skipped (not returned).

**Error label fallback in `fetch.js`:** For gmail sources, the label used in error logging is `source.from || source.subjectContains || 'gmail'` — not `source.url` (which is undefined on gmail sources).

**`lastRunAt` persistence:** The existing run handler (`lib/automation/handlers/run.js`) already writes `rule.lastRunAt = now` back to KV after each run. This is the value consumed by the `after:` filter on subsequent runs. No changes needed to this behaviour — it is called out explicitly here for testing purposes.

### 3. `lib/sources/gmail.js` (new library file)

Responsibilities:
- Export `fetchGmailMessages(source, lastRunAt, accessToken)` — builds query, calls Gmail API, returns array of decoded items
- Import and use `extractBody()` (defined in same file)
- Handle 403 `insufficientPermissions` by rethrowing with the reconnect message
- Handle 429 by throwing a retriable error

This file follows the same pattern as `lib/sources/cloud-drives.js`.

### 4. LLM Generation

When at least one source in the rule is `type: 'gmail'`, the wizard pre-fills the generation prompt with:

> "Reformat the following email into a clean, professional IBD industry news article. Preserve all key facts, figures, and quotes. Do not add any information not present in the original email."

### 5. Rule Wizard UI

**wizPanel1 — Source selection:** Add `<button onclick="wizAddSource('gmail')">+ Gmail</button>` alongside existing source buttons.

**Source card render for `gmail` type:**
- "From (domain or address)" text input → `src.from`
- "Subject contains" text input → `src.subjectContains`
- "Label" text input (default `INBOX`) → `src.labelIds[0]`
- "Max emails per run" number input (default 5, max 20) → `src.maxResults`
- `⚠ Not connected` warning badge if `_cloudStatus.google` is falsy

**wizPanel3 — Generation prompt:** Auto-populate reformat prompt when `_wizSources.some(s => s.type === 'gmail')` AND the prompt field is currently empty or contains the default "write from scratch" placeholder.

### 6. Settings UI

**Remove:**
- Google Calendar section's "Connect Google Calendar" button and `connectGoogleCalendar()` JS function
- Cloud Storage section's standalone "Connect Drive" button

**Replace with:**
- Rename Google Calendar section to **"Google Connections"**
- Status line: `Drive ✓  Gmail ✓  Calendar ✓` when `_cloudStatus.google === true`; `Not connected` otherwise
- Single **"Connect Google"** button calling `connectCloudService('google')` (existing function)
- Single **"Disconnect"** button (existing disconnect flow)
- Cloud Storage section retains credentials inputs (Client ID / Secret) but references the Google Connections section for the connect button

---

## Data Flow

```
Cron / Manual trigger
        │
        ▼
isRuleDue(rule)  ──── true ────▶  fetchSources(rule.sources)
                                         │
                              for each source of type 'gmail':
                                         │
                                   buildGmailQuery(source, lastRunAt)
                                         │
                                   Gmail API v1/messages.list
                                   (labelIds param + q string)
                                         │
                                  Gmail API v1/messages.get
                                  (per message, format=full)
                                         │
                                  extractBody (depth-first)
                                         │
                                return [{ title, rawText, ... }]
                                         │
                                         ▼
                        items truncated to maxArticlesPerRun
                                         │
                                         ▼
                                  LLM (reformat prompt)
                                         │
                                         ▼
                              POST /api/content  (creates article)
                                         │
                                         ▼
                     rule.lastRunAt written to KV
                                         │
                                         ▼
                           Review → Approve → Publish to WordPress
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Google token expired | `getValidGoogleToken` auto-refreshes (existing logic in `auth.js`) |
| Gmail 403 insufficientPermissions | Rethrow with reconnect message; job recorded as `failed`; UI surfaces reconnect prompt |
| Gmail API rate limit (429) | Throw retriable error; log warning; skip run; retry on next scheduled trigger |
| No emails match query | Return empty array — rule logs "0 items fetched", no article created |
| Email has no decodable body | Skip that message; continue with remaining messages |
| Google not connected | `getValidGoogleToken` throws; run handler records job as `failed` with descriptive message |
| `lastRunAt` is null (first run) | `after:` filter set to 7 days ago to prevent inbox flooding |

---

## Files Changed

| File | Change |
|---|---|
| `lib/auth/oauth.js` | Update Google OAuth scope string |
| `lib/automation/handlers/auth.js` | Export `getValidGoogleToken`; update status endpoint |
| `lib/sources/gmail.js` | **New library file** — Gmail fetch + body decode logic |
| `lib/automation/fetch.js` | Add `gmail` case delegating to `lib/sources/gmail.js`; fix error label fallback |
| `lib/automation/rule-schema.js` | Add `gmail` to valid source types; normalise defaults in `buildRule` |
| `index.html` | Settings UI consolidation + wizard source step + prompt pre-fill |
| `api/calendar/auth.js` | **Deleted** |

---

## Testing

1. Create a rule with a `gmail` source (`from: test@example.com`, `subjectContains: IBD`)
2. Manually POST to `/api/automation/run` — verify a draft article appears in Library
3. Run again immediately — confirm `after:` filter skips already-processed emails (article count stays the same), verifying `lastRunAt` was persisted to KV
4. Verify Google Calendar events still appear in the app after OAuth scope expansion
5. Verify Google Drive source rules still fetch files correctly
6. Disconnect Google from Settings, re-connect — confirm all three service statuses show ✓
7. Deploy to production; create a live Gmail-sourced rule for the Industry News category; confirm end-to-end article appears in the IBDHealthHub Library
