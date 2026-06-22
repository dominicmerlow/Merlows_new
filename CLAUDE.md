# MERLOWS Content Generator — Claude Context

## Architecture
- **Single-file app**: entire UI lives in `index.html` (inline JS/CSS). No build step.
- **No local dev server**: verify by deploying — `vercel --prod --yes`. Never run preview_start for this project.
- **ES Modules**: `"type": "module"` in package.json; all imports must use `.js` extension.
- **KV persistence**: `@vercel/kv` for all data. Env vars: `KV_REST_API_URL`, `KV_REST_API_TOKEN`.

## Deployment
- GitHub auto-deploy is **disabled** (`"github": {"enabled": false}` in vercel.json).
- Always deploy manually: `vercel --prod --yes` (use `npx vercel` — CLI not installed globally).
- **Vercel Hobby plan** (project under `dominicmerlows-projects`): **12 serverless-function limit per deployment** and `maxDuration` capped at **60s**. The app sits at **11 functions** after the 2026-06-22 catch-all consolidation (see Vercel Routing) — one slot of margin. **Adding a new `api/*.js` route risks breaking the deploy**; prefer adding handlers under an existing catch-all instead. (An SLA Pharma Pro team exists if a future move to Pro is wanted; Vance/Alpha runs on Pro with the same ~26 endpoints unconsolidated.)
- Production URL: https://merlows.vercel.app

## Vercel Routing (Critical)
- **Five catch-all functions** consolidate most routes to fit the Hobby 12-fn limit:
  `api/automation/[...slug].js`, `api/social/[...slug].js`, `api/auth/[...slug].js`,
  `api/content/[...slug].js`, `api/review/[...slug].js`. Each imports handlers from
  `lib/<area>/handlers/` (outside `api/`, so they don't count as functions) and
  dispatches by slug. `vercel.json` has a `/api/<area>/:slug*` rewrite per catch-all.
- In non-Next.js Vercel: slug key is `req.query['...slug']` (three literal dots) OR
  `req.query.slug` when arriving via the rewrite — read both. Single-segment paths
  arrive as a plain string; multi-segment as a **slash-joined string** — always `split('/')`.
- **content** dispatch: empty slug → index (list/create + `?action=` diagnostics);
  `slug[0]` in the NAMED set (`ab-config`, `article-prompts`, `hero-prompts`,
  `master-prompt`, `usage-record`, `usage-summary`, `word-limits`) → that handler;
  else `slug[0]` is a content id → item handler (`?id=`), with `slug[1]` ∈
  `ai-revise`/`apply-revision`/`comment` for sub-actions.
- **Test-compat shims**: a few `api/*.js` files (`content/index.js`, `content/[id].js`,
  `review/[token].js`, `review/send.js`, plus `automation/{fetch,notify,*-schema}.js`)
  are thin re-exports of the lib handler so co-located `*.test.js` can import them.
  They are listed in `.vercelignore` so they DON'T count as functions. If you add a
  new tested handler, add its shim to `.vercelignore` too.
- **Never add a plain `api/<area>/index.js` or subdir handler** for a consolidated area —
  it becomes a separate function and can shadow the catch-all. Add a branch to the
  catch-all + a `lib/<area>/handlers/` module instead.

## UI Patterns
- Tab switching: `switchTab('tab-name')` — tab views are `<div id="view-tab-name">`.
- All tabs registered in `allTabs` array inside `switchTab()` — add new tabs there.
- Wizard: 5-step rule wizard uses shared element IDs (`wizName`, `wizPanel1`–`5` etc.) — only one instance in DOM at a time.
- `openRuleWizard(editId?)` navigates to `view-automation-new`; `closeRuleWizard()` returns to `automation-rules`.
- CSS variable `--radius: 0px` globally — all corners square by design.
- Category SVG icons: `getCatSvgIcon(catId)` — used on both dashboard and categories page. Add new categories here.

## API Patterns
- All handlers export a named function + default Vercel handler.
- Reviewer data shape: `{ id, name, email, role }` — role is `'must_approve'` | `'reference'`.
- `api/reviewers/index.js` supports GET, POST, PATCH (role update), DELETE.

## OpenRouter Models
- Free models use `:free` suffix (e.g. `google/gemma-3-27b-it:free`).
- MiniMax exception: `minimax/minimax-m1:extended` (free tier, extended context variant).
- Fallback chains: `FALLBACK_MODELS` (general) and `INFOGRAPHIC_MODELS` (structured content).

## Telegram Bot
- Token and chat ID stored as Vercel env vars: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
- Webhook secret: `TELEGRAM_WEBHOOK_SECRET`. Verified via `x-telegram-bot-api-secret-token` header.
- Test endpoint: `GET /api/automation/telegram-test`.

## Stop Hook
- The `[Preview Required]` stop hook from plugins does not apply to this project — there is no local dev server. Ignore or disable it.

---

## VANCE → Merlows Sync Record

**Synced**: 2026-06-19

### Phase 1 — New files copied verbatim (with Merlows branding)
| File | Notes |
|------|-------|
| `api/auth/change-password.js` | Password change endpoint |
| `api/auth/login.js` | Email+password login, sets session cookie |
| `api/auth/logout.js` | Clears session cookie |
| `api/auth/me.js` | Returns current user + mustChangePassword flag |
| `api/content/[id]/ai-revise.js` | LLM-based article revision |
| `api/content/[id]/apply-revision.js` | Applies revision, snapshots body, logs event |
| `api/content/ab-config.js` | GET/PUT A/B test configuration |
| `api/content/article-prompts.js` | Shared article prompt library (KV key `vance:article-prompts`) |
| `api/content/hero-prompts.js` | Hero image prompt library (KV key `vance:hero-prompts`) |
| `api/content/master-prompt.js` | Master/God prompt (KV key `vance:master-prompt`) |
| `api/content/usage-record.js` | Client-side LLM usage recording |
| `api/content/usage-summary.js` | LLM usage stats summary |
| `api/content/word-limits.js` | Per-category word ceiling config |
| `lib/ab-test.js` | A/B testing harness: pickVariant, pickModelForGeneration |
| `lib/article-history.js` | logEvent, snapshotBody, MAX_VERSIONS=10 |
| `lib/auth.js` | Scrypt auth, JWT sessions, INITIAL_USERS, SEED_PASSWORD='2026' |
| `lib/email-content.js` | Article HTML renderer for email — color #0D9488 |
| `lib/revise.js` | callRevisionLLM, buildRevisionPrompt — X-Title 'Merlows Content Revision' |
| `lib/usage.js` | LLM token usage tracking, OpenRouter live pricing + fallbacks |
| `lib/users.js` | loadUsers, saveUsers, buildUser, safe, validUser |
| `lib/word-count.js` | countBodyWords (excludes headings/refs/disclaimers) |
| `lib/wp-taxonomy.js` | WP resolve-or-create for categories and tags |
| `lib/social/handlers/connections.js` | Social platform health checks — Telegram alert → merlows.vercel.app |

### Phase 2 — Merged files (VANCE improvements + Merlows specifics preserved)
| File | Key changes |
|------|-------------|
| `api/publish/index.js` | Added wp-taxonomy imports, tag resolution, sub-category auto-creation, fallbackHeroImageUrl, taxonomy logging. Preserved Merlows CATEGORY_SLUG_MAP and MerlowsBot/1.0 User-Agent |
| `lib/automation/handlers/approve.js` | Full-featured VANCE version: inline highlight widget, multi-reviewer, confirmation pages, feedback forms. All `#006868` → `#0D9488` |
| `lib/automation/handlers/run.js` | Added A/B model picking (pickModelForGeneration), LLM usage recording, word-count enforcement, article history snapshots, in_review status sync. Preserved Merlows DEFAULT_MODEL, CATEGORY_PROMPTS, and CATEGORY_SUBTITLE_PREFIX |
| `vercel.json` | Disabled GitHub auto-deploy (`"enabled": false`). Added connections cron `0 6 * * *` |
| `.env.example` | Added 7 missing vars: WP_SITE_URL, WP_USERNAME, WP_APP_PASSWORD, OPENROUTER_API_KEY, CRON_SECRET, TELEGRAM_CHAT_ID, KV_PREFIX |

### New lib modules used by run.js / approve.js
- `lib/ab-test.js` → `pickModelForGeneration`
- `lib/usage.js` → `recordLlmUsage`, `recordLlmFailure`
- `lib/article-history.js` → `snapshotBody`, `logEvent`
- `lib/word-count.js` → `countBodyWords`
- `lib/email-content.js` → `renderArticleEmailContent`

### Merlows-specific values preserved throughout
- Brand color: `#0D9488` (teal) — never `#006868`
- User-Agent: `MerlowsBot/1.0; +https://merlows.com`
- CATEGORY_SLUG_MAP: breaking-news, diplomatic-analysis, op-eds, cyrus-accord, abraham-accords, regional-voices
- DEFAULT_MODEL: `google/gemma-3-27b-it:free`
- SEED_PASSWORD: `2026`
- App name in LLM X-Title headers: `Merlows Content Generator` / `Merlows Content Revision`

---

## VANCE → Merlows Sync — Completion to full parity

**Synced**: 2026-06-22 (benchmark: Vance HEAD `86c4c11`)

The 2026-06-19 sync above was backend-only and uncommitted. This pass committed
that work as a checkpoint, then finished full parity. Vance is the Alpha/lead.

### Backend (Phase 1) — remaining deltas ported, Merlows divergence preserved
- `api/content/index.js`: source-doc provenance fields, review-tasks/summary/
  diagnostic actions, slim GET, approvals/rejections init.
- `api/review/[token].js`: inline-highlight review widget, multi-reviewer,
  POST-gated approval, feedback page. `api/review/send.js`: urgent reminders,
  reviewerIds filtering. `api/content/[id].js`: Request-Changes is not a veto.
- `run.js`: timeout budget + parallel job loading, urgent_reminder, hero
  fallback URL, source-doc labeling, post-gen job init. **notify.js now returns
  `{errors, reviewerIds}`** (Vance contract) — run.js consumes the resolved
  recipient set; both callers updated.
- `fetch.js`, `sources-list.js`, `telegram.js`, `rule-schema.js` (onTimeout
  default → `urgent_reminder`), `job-schema.js`, `cloud-drives.js`, social
  `generate.js`/`ava-prompts.js`, `kv.js` (sorted-set helpers).
- `bibliography.js`: ported Vance title-verification subsystem; **preserved
  Merlows diplomacy sources** (ReliefWeb v2, Congress, World Bank, fetchWithRetry).
- Tests: ported notify/telegram/rule-schema updates. Suite 76 pass / 4 fail —
  the 4 are **pre-existing stale tests in Vance itself** (`buildWpPayload` +
  3 `fetchSources` cases), not Merlows regressions.

### Frontend (Phase 2) — `index.html` (the June-19 sync never touched it)
- **Auth login wall activated** (`/api/auth/*` backends + seeded team users,
  password `2026`, forced change on first login): `#loginOverlay`,
  `#changePwdModal`, sidebar `#userChip/#userMenu`, `bootAuth()`,
  `isRole/isContentPlus/isAdmin`, `applyRoleGating()`.
- AI-Config tab: Token Usage dashboard, A/B Test config, Master Prompt editor
  (additive — Global Context form kept).
- AI-revise modal + inline buttons (gated by `isContentPlus()`), source-doc
  provenance display, category-articles view. Skipped `view-archive-legacy`.

### Config
- `vercel.json`: `github.silent` added. `package-lock` name → `merlows-content-generator`.
  (NOTE: an earlier edit set `maxDuration: 300` assuming Pro — **reverted to 60** on
  2026-06-22 once a deploy proved the project is on **Hobby**, see API-consolidation note below.)

### Pre-existing items flagged (not changed — env-overridable, delivery-sensitive)
- Email from-defaults are inconsistent (`mail.ibdhealthhub.com` in
  content/review, `slapharmagroup.com` in notify) — all overridable via
  `RESEND_FROM_EMAIL`; `HTTP-Referer`/`APP_URL` defaults still `ibdhealthhub`.
  Left as-is to avoid breaking verified-sender delivery; set env vars to align.

---

## VANCE → Merlows Sync — Second pass (new Alpha fixes)

**Synced**: 2026-06-22 (benchmark: Vance HEAD `54de3da` + uncommitted fixes)

Vance advanced past `86c4c11` with 5 commits (hero-prompt library, multi-column
xlsx, prompt-name→WP sub-category routing, toolbar regroup, and a "restore
orphaned live work" commit) plus uncommitted fixes. Ported the genuinely-new
delta (much of the "restore" was already in Merlows from the first sync).

### Backend
- `api/content/[id]/comment.js`: **new** article-comment endpoint (copied, imports verified).
- `api/publish/index.js`: drop "Reading Time" meta line from published body.
  Preserved Merlows CATEGORY_SLUG_MAP + MerlowsBot UA + Source linkification.
- `run.js`: ported `categoryDefaultPrompt`, `enforceCategoryPrefix`,
  `subCategoryForRulePrompt` (PROMPT_SUBCATEGORY_MAP **empty** for diplomacy —
  scaffolding), added `isTransientServerError` (5xx) retry, consumed-source
  writeback, `forceAll`. **Skipped `migrateClearRulePromptsOnce`** (would wipe
  Merlows custom rule prompts). All 6 diplomacy prompts/word-limit/history kept.
- `fetch.js`: multi-column xlsx parsing (`fetchUploadUrls`) — Merlows inline
  `rawText` upload still wins. `rule-schema.js`/`sources-list.js`/`cloud-drives.js`:
  upload-rows + consumed-dedup + drive provenance. Merlows Dropbox path kept.
- `media.js`: ported model-fallback chain + configurable hero-prompt template;
  **preserved Merlows' newer image models** (gemini-3.1/riverflow/seedream).
- `content/index.js`, `content/[id].js`, `review/[token].js`: provenance/audit/
  optional-overall-feedback deltas. `bibliography.js`/`kv.js`/`approve.js`:
  no new Vance work — left as-is (diplomacy divergence preserved).

### Frontend (`index.html`, +496/-49)
- Hero Image Prompts library (global `view-llm` section + per-category editor
  field, wired into loadLLMPage). Prompt-name→sub-category routing mechanism
  (`subCategoryForActivePrompt`, empty map). Article comment thread UI
  (`#articleComments`, gated by isContentPlus). Article toolbar regrouped into
  Content/Export/Workflow zones (all existing buttons preserved; skipped
  inventing Vance-only buttons). Removed hero-preview overlay buttons.

### Branding cleanup (pre-existing leftovers fixed)
- `godIndustrySelect` dropdown: medical industries → diplomacy/news sectors.
- `IBDHealthHubBot` User-Agent → `MerlowsBot/1.0` in fetch-url.js, proxy-image.js,
  google-sheets.js. `auth.js` APP_URL default → merlows.vercel.app.

Tests 76 pass / 4 fail (unchanged benchmark-stale baseline). All JS + both
index.html script blocks pass `node --check`.

---

## API consolidation for Vercel Hobby (2026-06-22)

The first deploy attempt failed: `dominicmerlows-projects` is on **Hobby** (12-function
cap), and the app had ~26 functions. Rather than move to Pro, the API was consolidated
to **11 functions** using the existing automation/social catch-all pattern.

- **auth** (4→1): `api/auth/[...slug].js` → `lib/auth/handlers/{login,logout,me,change-password}.js`.
- **content** (12→1): `api/content/[...slug].js` → `lib/content/handlers/*` (index, item,
  ai-revise, apply-revision, comment, + 7 NAMED config routes). Shims: `content/index.js`
  (`buildContentItem`/`validateContentItem`), `content/[id].js` (`applyStatusTransition`).
- **review** (2→1): `api/review/[...slug].js` → `lib/review/handlers/{token,send}.js`.
  Shims: `review/[token].js` (`computeNewStatus`), `review/send.js` (`buildApprovalToken`/
  `parseApprovalToken`) — `send.test.js` imports `./send.js` via dynamic `import()`.
- `vercel.json`: added `:slug*` rewrites for auth/content/review; `maxDuration` 60 (Hobby cap);
  content catch-all at 60 for the LLM ai-revise path. `.vercelignore`: added the 4 shims.
- Verified: 11 deployed functions, full test suite 76/4 (no regressions), all catch-alls
  import-resolve, and a 20-route dispatch simulation (valid routes reach handlers, bogus → 404).
- **Divergence from Vance**: Vance keeps these as individual files (it's on Pro). When syncing
  a content/auth/review endpoint from Vance, port the logic into the matching
  `lib/<area>/handlers/` module and (if new) add a dispatch branch + shim, not a new `api/` file.
