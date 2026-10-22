# MERLOWS Content Generator — Claude Context

## Architecture
- **Single-file app**: entire UI lives in `public/index.html` (inline JS/CSS). No build step.
- **Vercel serves ONLY `public/`** (`"outputDirectory": "public"` pinned in vercel.json); `api/`
  functions are unaffected (they're built, not statically served). Never recreate a root-level
  `index.html` — it would not be served.
- **No local dev server**: verify by deploying — `vercel --prod --yes`. Never run preview_start for this project.
- **ES Modules**: `"type": "module"` in package.json; all imports must use `.js` extension.
- **KV persistence**: `@vercel/kv` for all data. Env vars: `KV_REST_API_URL`, `KV_REST_API_TOKEN`.

## Deployment
- GitHub auto-deploy is **disabled** (`"github": {"enabled": false}` in vercel.json).
- Always deploy manually: `vercel --prod --yes` (use `npx vercel` — CLI not installed globally).
- **Vercel Hobby plan** (project under `dominicmerlows-projects`): **12 serverless-function limit per deployment** and `maxDuration` capped at **60s**. The app sits at **7 serverless functions** + **2 Edge functions** (`fetch-url`, `proxy-image` — Edge functions do NOT count toward the 12 cap) after the 2026-06-22/23 consolidation — comfortable margin. **Adding a new serverless `api/*.js` route eats a slot**; prefer adding handlers under an existing catch-all, or use the Edge runtime for pure-fetch utilities. (An SLA Pharma Pro team exists if a future move to Pro is wanted; Vance/Alpha runs on Pro with the same endpoints unconsolidated.)
- Production URL: https://merlows.vercel.app

## Vercel Routing (Critical)
- **Six catch-all functions** consolidate most routes to fit the Hobby 12-fn limit:
  `api/automation/[...slug].js`, `api/social/[...slug].js`, `api/auth/[...slug].js`,
  `api/content/[...slug].js`, `api/review/[...slug].js`, and `api/core/[...slug].js`
  (handles `publish`, `reviewers`, `schedule`). Each imports handlers from
  `lib/<area>/handlers/` (outside `api/`, so they don't count as functions) and
  dispatches by slug. `vercel.json` rewrites map the friendly paths (e.g.
  `/api/publish`, `/api/reviewers`, `/api/schedule`) to `/api/core/<name>`.
- **Edge functions** `api/fetch-url.js` + `api/proxy-image.js` use
  `export const config = { runtime: 'edge' }` and the Web `Request`→`Response`
  signature (NOT Node `req,res`). They don't count toward the 12 serverless cap and
  keep their own paths (no rewrite). Only pure-fetch/no-KV-Node-API routes belong here.
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
- Two bots, one webhook each: Merlows uses its own dedicated bot, never SLA Health's
  `SLAhealth_bot` — Telegram allows only one webhook URL per bot, so pointing Merlows at that bot
  would cut off SLA Health's approvals. Approvals arrive in a private DM between the approver and
  the Merlows bot.
- Env vars, all Vercel **Production, Sensitive**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`,
  `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_APPROVER_IDS` (comma-separated Telegram user ids; when
  set, only those users may press a review button — unset allows anyone in `TELEGRAM_CHAT_ID`'s
  chat; **set but blank is read the same as unset** — a known Low, see "Telegram review loop
  hardened" below). Also `SOCIAL_REVIEW_GATE` (`on`|`sensitive`|`off`), `SOCIAL_REVIEW_HOLD_SENSITIVE`
  (added 2026-10-01: default off; exactly `on` makes sensitive packs never auto-approve; env only,
  needs a redeploy — see "Sensitive stories now auto-approve (2026-10-01)" at the end),
  `SOCIAL_REVIEW_AUTO_MINUTES`
  (an undecided pack auto-approves after this many minutes; `0` disables auto-approve; unset
  means 0/off since 2026-09-24, was 60 — read as a fallback only, see below), the board's auto-approve switch (KV
  `social:autopilot:auto-approve`, `on`|`off` + minutes, 5–1440 or 0 for off, default 120 when
  switched on — overrides `SOCIAL_REVIEW_AUTO_MINUTES` once loaded, since Vercel env vars only take
  effect on a redeploy; loaded once at the start of every autopilot tick and every digest so all
  packs in one run see the same value; a KV read failure falls back to the env var; see "Social
  Autopilot: board switch for auto-approve minutes" below), `SOCIAL_REVIEW_POLL_MS` (how often a pack waiting on review is re-checked; default 20 min),
  `SOCIAL_REVIEW_ARCHIVE_HOURS` (archive an undecided pack after this long with no decision,
  instead of holding it forever; default 72h), and `SOCIAL_TIKTOK_MIN_BUDGET_MS` (don't start a
  TikTok post with less tick time left than this — the re-upload to Zernio needs it; default 75s)
  — all read by `lib/social/pack/review.js` and `lib/social/handlers/autopilot.js`.
- Webhook: `POST https://merlows.vercel.app/api/automation/telegram`, registered by hand with
  `setWebhook` + `secret_token` — nothing in the code calls `setWebhook`. Unset
  `TELEGRAM_WEBHOOK_SECRET` → 503; a header that doesn't match → 401.
- Test endpoint: `POST /api/automation/telegram-test`, body `{ "chatId": "..." }`. Sends a plain
  "connected" message to that chat via `TELEGRAM_BOT_TOKEN` — it still carries the old SLA Health
  wording and doesn't check `getWebhookInfo`.

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
| `lib/auth.js` | Scrypt auth, JWT sessions, INITIAL_USERS, SEED_PASSWORD='2026' (removed 2026-09-23 — see 'Password-change enforcement + seed password removed') |
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
- SEED_PASSWORD: `2026` (removed 2026-09-23 — see 'Password-change enforcement + seed password removed')
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

---

## Op-Eds → BlitzSpirit category + per-row xlsx upload (2026-06-23)

Replaced the **Op-Eds** category with **BlitzSpirit** (British WWII "Blitz Spirit":
resilience / "Keep Calm and Carry On"), and wired one-article-**per-row** spreadsheet
upload. Driven by a 366-day content-calendar deliverable in `../blitzspirit-calendar/`.

### Key decision — the internal category id stays `op-eds`
BlitzSpirit **reuses the `op-eds` slot in place** rather than introducing a new id.
Everything user-facing + behavioural is now BlitzSpirit, but the internal id is still
`'op-eds'` so the coupled features keep working untouched: the tone panel
(`showTone === 'op-eds'`), `multiDocs['op-eds']`, `opedDocList`, `llm-cat-op-eds`,
`saveCategoryModel('op-eds')`, `data-cat="op-eds"`, and the `CATS` array. **When you
pick "BlitzSpirit" in the UI, the category id sent to the API is `op-eds`.**

### Changed (label/prompt/slug/image only — no id churn)
- `lib/automation/handlers/run.js`: `DEFAULT_PROMPT_OP_EDS`→`DEFAULT_PROMPT_BLITZSPIRIT`
  (new prompt); `CATEGORY_SUBTITLE_PREFIX['op-eds']` `'Op-Ed'`→`'BlitzSpirit'`;
  `ANY_CATEGORY_PREFIX_RE` adds `BlitzSpirit`; new `CATEGORY_HERO_PROMPTS` map (WWII
  home-front hero template) now **passed into `generateImageFast(title,'16:9',template)`**
  — previously automation hero images always used the clinical default.
- `lib/core/handlers/publish.js`: `CATEGORY_SLUG_MAP['op-eds']` → `'blitzspirit'` (WP slug).
- `index.html`: `CATEGORIES` label, `getCatDefaultPrompt` (+`DEFAULT_PROMPT_BLITZSPIRIT`),
  the panel-meta + `BUILTIN_CATEGORY_META` (desc/slug `blitzspirit`/icon/titleParts
  `['Blitz','Spirit']`), `CATEGORY_SVG_ICONS` (shield), category-bar buttons, LLM
  picker, both `<option>`s, the subtitle label map, and the section-header regex.
- `lib/email-content.js`: `SECTION_HEADER_RE` adds `BlitzSpirit`.

### Per-row xlsx upload (one article per row)
The rule-wizard upload previously dumped the whole sheet to `rawText` → **one** article.
Now `index.html` parses the first sheet into `rows:[{title,subCategory,tags,notes}]`:
- new `wizHandleUploadFile(el,srcId)` (detects Title / Sub-Category / Tags / Notes headers,
  Title defaults to col A); the file `<input>` `onchange` calls it; status shows row count.
- **Both** the edit-time source map (~L6890) **and** the save serializer (~L7278) now
  preserve upload fields (`rows`, `originalFilename`, `urls`, `titlesOnly`,
  `consumedTitles`) — they used to copy only `filename`/`rawText`, which would have
  dropped `rows` on save. Backend `rule-schema.js` `buildRule` + `fetch.js`
  `fetchUploadUrls` already consumed this shape. `rawText` is left empty for sheets so
  fetch.js takes the per-row path. `.csv` is parsed the same way; other files still rawText.

### BlitzSpirit sub-categories — fixed set (2026-06-24)
The 5 WP sub-categories under the `blitzspirit` parent are registered canonically as
`CATEGORY_SUBCATEGORIES`, **mirrored in `lib/core/handlers/publish.js` AND `index.html`**
(keep in sync, like `CATEGORY_SLUG_MAP`↔`BUILTIN_CATEGORY_META`): `original-spirit`
(Original Spirit), `explainers` (Explainers), `blitz-echoes` (Blitz Echoes),
`spirit-today` (Spirit Today), `carry-on` (Carry On).
- A category present in `CATEGORY_SUBCATEGORIES` is a **fixed set**. `publish.js`
  `normalizeSubCategory(category, raw)` matches the incoming `subCategory` by **slug**
  (so the spreadsheet cell may hold the slug, the display name, or a case/spacing
  variant), and an UNRECOGNIZED value is **not auto-created** — it posts under the
  parent only + logs a warning (`autoCreate: !fixedSet`). Categories absent from the
  map keep the legacy free-text resolve-or-create behaviour (diplomacy unchanged).
- `index.html` `wizHandleUploadFile` validates each uploaded row's Sub-Category against
  the rule category's set: recognized values are normalized to the canonical display
  name; unrecognized ones surface a ⚠ warning in the upload source status
  (`src.subCatWarnings`, transient — not serialized into the rule).
- Assignment is via the per-row xlsx **Sub-Category column only** (no dropdown). Flow
  unchanged downstream: content `subCategory` → `publish.js`
  `resolveOrCreateWpCategory(name, { parentSlug: 'blitzspirit' })`.

### Verification / deploy
- All edited JS + both `index.html` inline script blocks pass `node --check`.
- Test suite unchanged: same 5 pre-existing failures with and without these changes
  (verified via `git stash` A/B) — `buildWpPayload maps known category`, `fetchSources`
  (3 cases), `any rejection sets rejected`. No regressions introduced.
- **Deployed to prod 2026-06-24.** Deploy requires a **Dominic Merlows owner token** —
  the user's `slapharma` account is not on the `dominicmerlows-projects` team, so
  `npx vercel login` lands on the wrong team ("Not authorized"). Use:
  `cd content-generator && VERCEL_TOKEN=<owner-token> npx vercel --prod --yes`
  (verify scope first with `VERCEL_TOKEN=… npx vercel whoami` → `dominicmerlow`).

---

## Abraham Accords — weekly calendar + 1,200-word target + sub-categories (2026-06-24)

Companion to the BlitzSpirit calendar; deliverable in `../abraham-accords-calendar/`
(53 weekly rows, Mon 23 Jun 2025 → 22 Jun 2026, topics anchored to real Accords news of
the period). No new category — uses the built-in `abraham-accords`. Code changes:
- **Word target 600–900 → ~1,200 (1,100–1,300)** with section counts scaled proportionally —
  **journalistic tone/structure/output-format unchanged** (only the numbers). Mirrored in
  `run.js` `DEFAULT_PROMPT_ABRAHAM_ACCORDS` (automation path) and `index.html`
  `DEFAULT_PROMPT_INFOGRAPHICS` (manual generator; that const name is a legacy mislabel for
  the Abraham Accords prompt).
- **3 sub-categories registered as a fixed set** in `CATEGORY_SUBCATEGORIES` (both
  `publish.js` and `index.html`): `normalisation-diplomacy`, `regional-security`,
  `trade-connectivity`. The spreadsheet's display names slugify to these, so upload
  validation recognises them and they won't auto-create junk child terms.
- Verified: `node --check` on all touched JS + both index.html inline blocks; test suite
  unchanged (same 5 pre-existing failures, no regressions). **Needs redeploy** to take effect.

## Hero-image prompt resolution — honour the KV category prompt (2026-06-24)

Bug: automation hero images for **Abraham Accords** came out clinical/medical with the
wrong colours. Cause: `run.js` `heroPromptFor()` only handled `op-eds` (BlitzSpirit) and
returned `undefined` for every other category → `media.js` fell back to its still-clinical
`DEFAULT_HERO_PROMPT_TEMPLATE`. The per-category prompt operators edit in the UI lives in
KV (`vance:hero-prompts` → `categories[catId]`) and was **never read by the runner**. Fix:
- `heroPromptFor(category, subCategory, heroCfg)` precedence: **(1)** KV per-category
  override (the UI "category hero prompt") → **(2)** composed BlitzSpirit / Abraham Accords
  template (shared template + per-sub-category scene) → **(3)** code `CATEGORY_HERO_PROMPTS`
  → **(4)** KV global default → **(5)** undefined (media.js clinical default).
- Added `ABRAHAM_HERO_TEMPLATE` + `ABRAHAM_SUBCATEGORY_SCENES` (Middle East diplomacy,
  navy/desert-gold/teal palette, explicitly NO medical/molecular imagery) keyed by the 3
  Abraham sub-category slugs.
- `run.js` now loads `vance:hero-prompts` once per rule run (next to `getWordLimit`) and
  passes it into `heroPromptFor`.
- **media.js medical defaults neutralised site-wide (2026-06-24):** `DEFAULT_HERO_PROMPT_TEMPLATE`
  (hero fallback), `craftImagePrompt` + the `generateImage` hard suffix (social-kit two-step
  path used by `lib/social/handlers/generate.js`), and the `startVideoGeneration` style/fallback
  are now generic **news/editorial** (deep navy + slate with a restrained teal #0D9488 accent),
  with the old "no molecules → use clinical/anatomical imagery" rule flipped to a **"STRICTLY no
  clinical/medical/molecular imagery"** guard. Categories without their own template
  (breaking-news, diplomatic-analysis, cyrus-accord, regional-voices) therefore no longer default
  to a medical look. Right-weighted (60/40) composition + no-text rules preserved throughout.
- Verified `node --check` + test suite (same 5 baseline failures). **Deployed to prod 2026-06-24.**

## Cyrus Accord — weekly calendar + 1,200-word target + sub-categories + hero (2026-06-24)

Same treatment as Abraham Accords, for the built-in `cyrus-accord` category (Merlows'
Israel–Iran reconciliation theme). Deliverable in `../cyrus-accord-calendar/` (53 weekly
rows, Mon 23 Jun 2025 → 22 Jun 2026; topics anchored to real Israel–Iran events of the
period — Twelve-Day War, IAEA/snapback collapse, the 2026 Iran war, the 17 Jun 2026 Islamabad
MoU — with the "Cyrus Accord" framed editorially as Reza Pahlavi's *aspirational vision*,
not a signed accord, sceptics included for balance). Code changes:
- **Word target 1,000–1,400 → ~1,200 (1,100–1,300)** in `run.js` `DEFAULT_PROMPT_CYRUS_ACCORD`
  and `index.html` `DEFAULT_PROMPT_WHITE_PAPERS` (the Cyrus prompt mirror; legacy const name).
  Policy-analyst structure/tone unchanged — only the total-length figure.
- **3 sub-categories registered** in `CATEGORY_SUBCATEGORIES` (publish.js + index.html):
  `the-cyrus-vision`, `persian-jewish-heritage`, `conflict-diplomacy` (display names slugify
  to these).
- **Bespoke hero template** (`CYRUS_HERO_TEMPLATE` + `CYRUS_SUBCATEGORY_SCENES` + `cyrus-accord`
  branch in `heroPromptFor`): Persian-blue/turquoise + gold heritage palette, explicitly
  non-medical, with per-sub-category scenes (vision / heritage / conflict).
- Verified `node --check` (run.js, publish.js, both index.html blocks) + test suite (same 5
  baseline failures, no regressions). **Deployed to prod 2026-06-24.**

## FUNCTION_INVOCATION_TIMEOUT on /api/automation/run — time guards (2026-06-24)

`GET /api/automation/run` (cron) returned 504 / FUNCTION_INVOCATION_TIMEOUT: the `waitUntil`
background run still counts against the Hobby **60s `maxDuration`**, and the LLM + hero-image
fetches had **no timeouts** — a slow free-tier model (worsened by the new ~1,200-word prompts)
ran until the function was killed. Guards added:
- `run.js` `callLLM`: 28s `AbortController` timeout. `generateArticle` loop: per-model
  try/catch (abort → next model) + a **32s overall LLM budget** that stops starting new attempts.
- `media.js` `callImageModel`: 16s `AbortController` timeout. `generateWithFallback`: **20s
  overall image budget**.
- `run.js` `executeRun`: a `runStartedAt` wall-clock; the hero step is **skipped (→ category
  fallback URL) once >34s of the run has elapsed** (covers source-fetch + LLM + store), so the
  worst case stays well under 60s.
- Trade-off: under sustained slowness a hero may be skipped and the rule's
  `heroImageFallbackUrl` used instead. Internal `/api/content` + `/api/publish` round-trips are
  not timeout-guarded (left as-is; fast in practice). Verified `node --check` + test suite (same
  5 baseline failures). **Deployed to prod 2026-06-24.**

## Hero images failed: invalid OpenRouter image model slugs (2026-06-24)

ROOT CAUSE of "hero images failing to generate" (NOT the timeout): all four configured image
models were **missing from OpenRouter** — `google/gemini-3.1-flash-image-preview-20260226`
(bogus `-20260226` suffix; real slug has none), `sourceful/riverflow-v2-fast`,
`sourceful/riverflow-v2-pro`, `bytedance-seed/seedream-4.5`. Every image call 404'd, so heroes
ALWAYS failed (the 404 is instant — unrelated to the function timeout work above). Verified
against the public OpenRouter catalogue (`GET /api/v1/models`, filter `output_modalities`
includes `image`). Fixed to valid image-output slugs in **all** spots:
- `lib/social/media.js`: `IMAGE_MODELS` + `DEFAULT_IMAGE_MODEL` →
  `google/gemini-3.1-flash-image` (primary), `google/gemini-2.5-flash-image`,
  `google/gemini-3-pro-image`; the linkedin/facebook `generateImage` preference → `gemini-3-pro-image`.
  Also restored the image fetch timeout 14s→20s (14s was too aggressive) and `IMG_BUDGET_MS`→22s.
- `lib/social/handlers/image.js`: `ALLOWED_MODELS` + default.
- `index.html`: `heroAiModelSelect` `<option>`s + the manual hero-gen default.
- `lib/usage.js`: pricing-map keys (cost-tracking only).
- **To add/replace image models, only use slugs present in the OpenRouter catalogue with
  `image` in `output_modalities`.** Overridable at runtime via `SOCIAL_IMAGE_MODELS` env.
  Verified `node --check` (all touched JS + both index.html blocks) + test suite (same 5
  baseline failures). **Deployed to prod 2026-06-24.**

---

## Moved to Pro + concurrency/time-budget retune (2026-06-25)

The `merlows` Vercel project was transferred from the `dominicmerlows` personal account
(Hobby) into the **SLA Pharma team (`slapharma`, Pro)** — now at vercel.com/slapharma/merlows.
Pro lifts `maxDuration` from 60s → **300s**, so the time budgets that were squeezed under
the Hobby 60s ceiling were retuned. **The 12-function Hobby cap no longer applies** (Pro is
1000+), so the catch-all consolidation is no longer forced — but it's harmless, so it stays.

Two coupled symptoms this fixed: (a) only ever **1 article per run**, and (b) the **hero
image frequently not generating** (category fallback used instead). Both were Hobby-60s
workarounds:
- `vercel.json`: all four catch-all `maxDuration` 60 → **300**.
- `run.js` `executeRun`: introduced budget constants near `runStartedAt` —
  `FN_BUDGET_MS` (290000, env `RUN_FN_BUDGET_MS`), `NEW_ARTICLE_CUTOFF` (= budget − 55s),
  `HERO_RESERVE_MS` (30000). The per-rule guard and a **new per-item wall-clock guard**
  (top of the `for (const item of toProcess)` loop) use `NEW_ARTICLE_CUTOFF` to stop
  *starting* new articles near the ceiling and defer the rest to the next tick — this is
  the real timeout protection, so the article count can be high safely.
- `run.js` article cap: removed the hard `max = 1` when hero enabled. Now
  `max = min(rule.generation.maxArticlesPerRun, MAX_ARTICLES_PER_RUN_CAP)` (cap default
  **8**, env `MAX_ARTICLES_PER_RUN_CAP`). **To raise throughput, set the rule's
  `maxArticlesPerRun` in the wizard** (and/or the env cap).
- `run.js` hero guard: `heroBudgetLeft = 30000 - elapsed` → `msLeft = FN_BUDGET_MS - elapsed;
  if (heroEnabled && msLeft > HERO_RESERVE_MS)`. On 300s this rarely trips → heroes generate.
- `run.js` LLM timeouts: `callLLM` abort 28s → **60s** (env `LLM_CALL_TIMEOUT_MS`);
  `LLM_BUDGET_MS` 32s → **90s** (env `LLM_BUDGET_MS`).
- `media.js`: image abort 20s → **30s** (env `IMAGE_CALL_TIMEOUT_MS`); `IMG_BUDGET_MS`
  22s → **45s** (env `IMG_BUDGET_MS`).
- Note: the external cron-job.org pinger has a ~30s request timeout, but the run is GET-202
  + `waitUntil` background, so a longer run doesn't time out the pinger.
- Verified `node --check` (run.js, media.js) + valid `vercel.json` + `node --test`
  (94 pass / **same 5 pre-existing baseline failures**, run.test.js 7/7). **Deployed to
  prod 2026-06-25** (dpl_JEBaFYM1mCcnbkBb7cY2tZdYRL9M, aliased merlows.vercel.app) — the
  deploy succeeding with `maxDuration: 300` confirms the project is on Pro.
- **Deploy is now under the slapharma Pro team**, NOT dominicmerlows. `.vercel/project.json`
  `orgId` was updated to `team_wfWc4ILtXQU6jPvk2dgfnApj` (the old dominicmerlows org id was
  stale after transfer). Deploy with a **slapharma-scoped** token:
  `cd content-generator && VERCEL_TOKEN=<slapharma-token> npx vercel --prod --yes`
  (`npx vercel whoami --token …` → `slapharma`). The old "Dominic Merlows owner token"
  instruction elsewhere in this doc is obsolete.

---

## Frontend perf + UX: slim contentCache, polling, header/article controls (2026-06-25)

Ported VANCE-alpha frontend optimisations + UX into `index.html` (the slim backend
`?slim=1` already existed; the frontend never used it). All in `index.html`.

### Performance
- **`contentCache`** (SWR) after `contentApi`: one deduped `GET /api/content?slim=1`
  (~81 KB vs the ~38 MB full payload), signature-diffed, instant paint from cache.
  `contentApi.getAll()` left UNCHANGED (still full) so body-readers keep working;
  slim applied surgically. `withContent(render)` = cache paint + revalidate-on-change.
- **`loadPipeline`** split into `loadPipeline` + `renderPipeline(items)`, renders via
  `withContent`. `renderKanbanCard` now uses slim `item.wordCount` (body is stripped).
- **`loadAutoInbox`** (Notifications): title hydration via `contentCache.refresh()`.
  `__inboxContentCache` holds slim (title+id only); the DETAIL view
  (`openAutoInboxJob`) already refetches the full record by id, so body is intact.
- **`viewArticleFromPipeline`**: fetches the single record `/api/content/:id` instead
  of `getAll()`-then-find (no more pulling every body to read one).
- **Boot** (`DOMContentLoaded`): publishing-queue load switched `contentApi.getAll()`
  → `contentCache.refresh()` — warms the cache so first Pipeline/Notifications open is
  instant; `publishingQueue` consumers are metadata-only or refetch body by id.
- **Live-sync polling**: `initContentPolling()` (called on boot), `activeContentRender`
  (reset at top of `switchTab`, set by pipeline/inbox loaders). ~15s while visible,
  paused when hidden, immediate refresh on refocus, repaint only on sig change.

### UX
- **Logo → Home**: `.sidebar-logo` now `onclick="switchTab('dashboard')"`.
- **Hard-refresh button** in topbar (`#hardRefreshBtn` / `hardRefresh()`): clears
  caches + unregisters service workers, reloads (spin animation reuses `@keyframes spin`).
- **Back button** in article toolbar (`#articleBackBtn` / `goBackFromArticle()`):
  `__articleOrigin` captured in `viewArticleFromPipeline`, label from `TAB_TITLES`.
  Both Back + Image buttons hidden on every `switchTab`, re-shown after view-article.
- **Replace-image modal** (`#heroModal` / `openHeroModal`/`closeHeroModal`/
  `saveHeroFromModal`): relocates the live `#heroLeftCard` picker into the modal
  (reusing its search/AI-gen wiring), saves via `contentApi.update(id,{heroImageUrl,
  heroImageType})`, toasts. Button `#replaceHeroBtn` in the article Content toolbar group.

### Not migrated (deliberate)
- `contentApi.getAll()` stays full (Monitoring/Calendar/Distribution/Library/Trash/
  social `allSocialItems` still use it — some read bodies). Migrating those to slim
  would need per-caller body-refetch audits; left as a future opt-in.

### Verify / deploy
- Both inline `<script>` blocks pass a `vm.Script` syntax check.
- **Deployed to prod 2026-06-25** (dpl_54mwosWCN74UpKvDQV4QjsAt224m, aliased
  merlows.vercel.app). CLI already logged in as `slapharma`; `vercel --prod --yes`.
  Verified new markers present in served HTML + `?slim=1` → 200 (~81 KB).

## Breaking News — Telegraph prompt + 5 theme sub-categories + seed calendar (2026-06-26)

- **Category prompt rewritten** (run.js `DEFAULT_PROMPT_BREAKING_NEWS` + index.html
  `DEFAULT_PROMPT_INDUSTRY_NEWS`): Daily Telegraph hard-news register, **ABSOLUTE MAX 500 words**,
  write ONLY from supplied sources, pick the one story common to MORE THAN ONE of The Sun /
  Telegraph / Daily Mail / Fox News / Jerusalem Post, prioritise trade / peace / antisemitism /
  anti-woke / nationalism. **Hero image prompt deliberately untouched.**
- **5 sub-categories registered** in `CATEGORY_SUBCATEGORIES` (publish.js + index.html):
  `trade-economy`, `peace-diplomacy`, `antisemitism`, `culture-war` (Culture War), `nationalism`.
- **Seed calendar** in `../breaking-news-calendar/` (85 researched, dated, sourced top stories
  Jun 2025–Jun 2026; a **Notes** column carries each story's source URL). Deliberately NOT a
  fabricated 365-day back-fill (would violate the "sourced & verified" rule); day-to-day news is
  meant to come from a **live daily rule** reading the 5 outlets' RSS feeds (see setup doc).
- **Open item:** the runner generates one article per RSS item — it does NOT yet reconcile "the
  story most common across the 5 outlets" (a "combine all feeds → one prompt" mode is the missing
  piece for requirement #5). Verified `node --check` + test suite (same 5 baseline failures).
  **Deployed to prod 2026-06-26.**

## Author team — per-sub-category bylines + 10% floater (2026-06-26)

Replaced the single-`WP_USERNAME` byline (every post attributed to one account) with a
**28-author roster**: one EXCLUSIVE author per sub-category + one FLOATER per parent
category who takes a random **~10%** of that category's articles. Roster + bios approved in
`../tasks/author-team-plan.md`.

- **`lib/authors.js`** — single source of truth. `AUTHOR_REGISTRY` (category → subcats/floater,
  each `{name, username, bio}`), `pickAuthor(category, subCategory, {rand})` (rolls once: <0.10 →
  floater, else dedicated sub-cat author; unknown sub-cat → category `default`; unknown category →
  null), `listAuthors()`, `emailFor()`. `FLOATER_SHARE` (env `AUTHOR_FLOATER_SHARE`, default 0.10),
  `AUTHOR_EMAIL_DOMAIN` (env, default `authors.merlows.com`). **Sub-cat slugs MUST match
  `CATEGORY_SUBCATEGORIES`** in publish.js. Tested in `lib/authors.test.js` (9 tests incl. ~10%
  distribution).
- **Assignment chokepoint = `buildContentItem`** (`lib/content/handlers/index.js`): both manual
  and automation content flow through it. An explicit `authorUsername`/`wpAuthorId`/`authorName`
  wins (fixed-author rules, backfill re-apply); otherwise `pickAuthor(category, subCategory)`. New
  record fields: `wpAuthorId` (numeric, lazy-resolved), `authorUsername` (registry slug, canonical),
  `authorName` (display byline). Rolled ONCE here → stable across re-edits/re-publish.
- **Publish** (`lib/core/handlers/publish.js`): `resolveWpAuthorId(username)` does
  `GET /wp/v2/users?slug=` and **caches the id in KV** (`author:wpid:<slug>`), so creating/renaming
  WP authors needs **no redeploy**. `buildWpPayload(item, cats, tags, media, authorId)` adds
  `author:` only when an id resolved (else omit → falls back to WP_USERNAME, legacy behaviour).
  Resolved id snapshotted onto the content record (`wpAuthorId`).
- **Rule schema** (`rule-schema.js` generation): `authorMode` `'auto'`(default)|`'fixed'`,
  `fixedAuthorUsername`, `fixedAuthorId`. `run.js` passes the override through to `/api/content`
  only when `authorMode==='fixed'`; otherwise auto-assignment happens in buildContentItem.
- **UI** (`index.html`): rule-wizard Generation panel byline `<select id="wizAuthor">` — "Auto" or a
  pinned author. `AUTHOR_ROSTER` JS mirror of the registry (display labels; keep usernames in sync),
  `wizPopulateAuthors()` (this rule's category first), wired into open/edit/save (`authorMode`/
  `fixedAuthorUsername`).
- **Two free-text categories became FIXED sets** (added to `CATEGORY_SUBCATEGORIES` in BOTH
  publish.js and index.html): `diplomatic-analysis` → great-power-politics / security-strategy /
  treaties-institutions; `regional-voices` → gulf-perspectives / israeli-society /
  diaspora-dialogues. Consequence: an incoming sub-cat outside these now posts under the parent
  only (no more free-text auto-create for these two).
- **Scripts** (`scripts/`, run locally with WP admin creds — NOT Vercel functions):
  `create-wp-authors.js` (idempotent; creates role-`author` WP users from the roster, `--dry-run`,
  writes secret `.create-wp-authors-output.json` with generated passwords) and
  `backfill-authors.js` (pages published+future posts, classifies by sub-cat/parent term, assigns
  via `pickAuthor` with a **persisted per-post roll** in `.backfill-authors-state.json` for
  idempotent ~10%, PATCHes only changed posts, `--dry-run` writes a CSV report). Secret/state/report
  files are gitignored.
- **EXECUTED 2026-06-26.** Deployed to prod (dpl_62MSVKDFRigKV7fW7tYDxC6WE9GB, aliased
  merlows.vercel.app). Ran `create-wp-authors.js` live as admin **MikeHemmings** (the publishing
  account IS an administrator) → 28 WP users created, **ids 10–37**. Ran `backfill-authors.js` live
  → **545 published+future posts reassigned**, 0 failed/unclassified; re-run is idempotent
  (changed=0). Per-category floater share landed 8.8–19.5% (overall ~12.5% — independent per-post
  rolls, "~10%" is expectation not quota). Generated author passwords in gitignored
  `scripts/.create-wp-authors-output.json`.
- **Parent-only archive fix:** all 77 Abraham-Accords posts were published before sub-cats existed
  (no sub-cat term). `backfill-authors.js` spreads such parent-only posts EVENLY across the
  category's dedicated authors by `post.id % nSubcats` (deterministic/idempotent) instead of dumping
  them all on the default author. This lives ONLY in the backfill script; the forward-path
  `pickAuthor` still maps unknown sub-cat → category default (forward posts carry a real sub-cat).
- WP creds are **Sensitive** Vercel vars (`vercel env pull` returns them blank) — must be supplied
  out-of-band to re-run the scripts. `WP_SITE_URL=https://merlows.com`.
- Verified: `node --check` all touched JS + both index.html inline blocks (vm.Script) pass; suite
  **103 pass / same 5 pre-existing baseline failures** (added 9 authors.test.js, run 7/7,
  content 3/3).

## "Our Writers" page (2026-06-26)

Public bios page for the 28-author team, under the **ABOUT** nav dropdown.
- **Source of truth:** `scripts/writers-data.js` (`WRITER_GROUPS` — each writer's name, WP
  slug, beat, age, location, experience, interests, grouped by parent category). Mirrors the
  byline roster in `lib/authors.js`; keep in sync.
- **Builder:** `scripts/build-writers-page.js` (needs admin WP creds) renders writer-cards once
  and (1) creates/updates WP **page id 1774** `/our-writers/` via REST, content wrapped in a
  `<!-- wp:html -->` block, (2) adds a child menu item under ABOUT (Main Menu id **19**, ABOUT
  item id **43**), (3) writes the `wordpress-theme/merlows/page-our-writers.php` template.
- **Hero matches Our Mission:** renders a self-contained copy of page-our-heritage.php's
  `msn-masthead` (navy grid, gold rotating stamp, ticker, TOC, stats), CSS copied + scoped under
  `.mlws-writers` (the `msn-*` styles are NOT global). On the live page the builder **hides
  `page.php`'s `.hero` + `.inner-cat-nav-wrapper`, zeroes the container top padding, and breaks the
  masthead out to full width** — all scoped to `body.page-id-1774.page-template-default`, so the
  overrides auto-disable if the custom template (no `page-template-default` class) is deployed.
- **Two render paths:** the LIVE page uses the **default `page.php`** (hero + container), so its
  self-contained content must survive `the_content` filters — the builder **minifies the
  `<style>`/`<script>` to single lines and strips blank lines** so wpautop/wptexturize can't
  inject `<br>`/`<p>` into the CSS/JS (verified: 28 cards, no mangling). The committed
  `page-our-writers.php` is a full-bleed template mirroring `page-our-heritage.php` (msn-masthead)
  — optional upgrade: deploy via cPanel, then select the "Our Writers" template on the page (the
  template's baked-in cards then replace the_content). Card markup/`<style>` are shared between
  both paths, so they stay identical.
- Cards: monogram placeholder avatar (initials, navy disc + gold ring), name, beat (gold for
  guest/floaters), Age/Location/Experience meta, Writing interests, and a link to the author
  archive `/author/<slug>/`. Re-run the builder to update after editing `writers-data.js`.

## BlitzSpirit → current-affairs reboot (2026-06-26)

BlitzSpirit pivoted from an evergreen-history calendar to **reading recent/current events
through the Blitz-spirit lens**.
- **Prompt rewritten** (run.js `DEFAULT_PROMPT_BLITZSPIRIT` + index.html mirror): lead from the
  supplied RECENT story, show the resilience/community/defiance on show, then an honest "Echoes
  of 1940" parallel; work ONLY from the source (no fabrication); 700–1,000 words. Hero prompt
  untouched. **Deployed to prod 2026-06-26**; same 5-baseline test failures (no regressions).
- **New seed calendar** `../blitzspirit-calendar/BlitzSpirit-Current-Calendar.xlsx` (+ generator
  `generate_blitzspirit_current.py`): 32 real, dated, sourced recent stories (Jul 2025–Mar 2026)
  with source URLs in a Notes column, across the 5 existing sub-categories (Spirit Today /
  Original Spirit / Carry On / Blitz Echoes / Explainers). **Supersedes the old evergreen
  `BlitzSpirit-Content-Calendar.xlsx`.** No sub-category code change (the 5 were already
  registered). Day-to-day "current" relevance is meant to come from a live daily UK-news RSS rule
  → this prompt (see BlitzSpirit-Current-Setup.md). Explainers is genuinely thin (research finding).

---

## Composio multi-account social posting + media-model env switch (2026-06-30)

Two changes to the **social distribution** module (kit→queue→cron→scheduler
architecture UNCHANGED; only the posting layer + media model selection touched).

### Media model now env-driven (`lib/social/media.js`)
- The fal.ai text-to-video endpoint was hard-coded to Kling v2.1. It's now built
  from `SOCIAL_VIDEO_MODEL` (default `fal-ai/kling-video/v2.1/standard/text-to-video`
  → **byte-identical default behaviour**). Per-model request params live in
  `VIDEO_PARAMS` (`videoParamsFor()`); unknown models fall back to Kling's
  `{duration:'10', aspect_ratio:'9:16'}`. Cheaper options to A/B via the env var:
  `fal-ai/minimax/hailuo-02/standard/text-to-video`, `fal-ai/veo3/fast`,
  `fal-ai/wan/v2.2-5b/text-to-video` (verify each model's duration/aspect schema).
  `startVideoGeneration` now also returns `model`. Images were left on
  `gemini-2.5-flash-image` (already cheap + env-overridable via `SOCIAL_IMAGE_MODELS`).

### Composio multi-account adapter (NEW)
Adds "connect multiple accounts to post to" via Composio's per-userID
connected-accounts model. **All five platforms are natively covered** by Composio
toolkits (X, LinkedIn incl. org, Facebook Pages, Instagram image+Reels, TikTok video)
— no hybrid fallback needed, but the legacy env-var adapters remain as the default
when no Composio account is configured.
- `lib/social/composio.js` — lazy-loaded SDK wrapper (`@composio/core` ^0.13.1).
  `linkAccount(platform)` (hosted OAuth `link()`), `listConnections()`,
  `executeTool(slug,{connectedAccountId,arguments})`. Env: `COMPOSIO_API_KEY`,
  `COMPOSIO_USER_ID` (default `merlows`), `COMPOSIO_AUTHCONFIG_<PLATFORM>` (ac_… ids).
- `lib/social/platforms/composio.js` — `postViaComposio(platform,data,account)`;
  per-platform tool slugs + arg builders. **⚠️ slugs/args are marked `// VERIFY`
  — confirm against the live toolkit schema on first real post.**
- `lib/social/accounts.js` — KV `social:accounts` registry (`resolveAccount`,
  add/remove/setDefault). Kit `platforms[x].accountId` selects the account;
  null → legacy env-var path.
- `lib/social/platforms/index.js` — `dispatch(platform,data,account)` routes to
  Composio when `account.provider==='composio'`, else legacy adapter.
- `lib/social/handlers/accounts.js` — `/api/social/accounts*` CRUD + `/link`.
  Registered in the `api/social/[...slug].js` catch-all.
- `post.js`/`cron.js` resolve the account and pass it to dispatch. **cron retry is
  now capped** at `SOCIAL_MAX_RETRIES` (default 5) → status `failed` instead of
  re-queuing forever.

### Still TODO (not done this pass)
- **Live-verify the `// VERIFY` tool slugs + argument field names** in
  `platforms/composio.js` (Composio dashboard → toolkit → Tools, or `composio generate`).
- **UI** (`index.html`): Connections sub-tab account-manager (list/+connect via the
  `/accounts/link` popup/remove/set-default) and a per-platform **account dropdown**
  in Kit Builder writing `platformData.accountId`. Backend API is ready.
- Optional **X $0.20/URL-post guard**.
- Verified: `node --check` all changed JS; `@composio/core` installs+imports;
  suite **103 pass / same 5 baseline failures**. NOT yet deployed/live-tested.

---

## Scheduled runs produced nothing: connection surge in processTimeouts (2026-09-23)

From roughly 2026-08-19 to 2026-09-22, scheduled automation produced **no articles**
for BlitzSpirit, Cyrus Accord, Abraham Accords, Regional Voices, or Diplomatic
Analysis, and Breaking News only landed on ~60% of days. Manual runs from the UI
(forced `ruleId`) kept working the whole time, which is why it went unnoticed.

### Root cause
`processTimeouts` (`lib/automation/handlers/run.js`) runs on every **scheduled**
cron tick only — `executeRun` skips it when `forcedRuleId` is set (manual/UI run).
It used to `Promise.all` a `kv.get` over every `automation:job:*` id — **1,138**
jobs by the time this was diagnosed. `@upstash/redis` 1.25.1 doesn't pipeline, so
each `get` opens its own socket: measured **1,139 simultaneous connections** for
one tick, blowing past Vercel's ~1,024 file-descriptor ceiling (first crossed when
job #1024 was created on 2026-08-03). While those sockets lingered, every *new*
outbound fetch — OpenRouter LLM calls, RSS source fetches — failed instantly with
`"fetch failed"`; KV calls kept working because they reused already-pooled sockets.
Breaking News runs last in the rule evaluation order, so it sometimes finished
before the descriptor pool was exhausted, which is why it partially survived and
the others didn't.

This was masked before 2026-08-19 by an external cron-job.org pinger hitting the
run endpoint every 5 minutes — on 2026-08-18 that produced 6 LLM successes against
1,650 failures, i.e. it was already broken, just retried into occasional success.
Once the pinger was removed, only the 6 scheduled ticks/day (07:00–12:00 UTC) were
left, and none of them succeeded. `CRON_SECRET` and the Vercel cron registration
were both fine throughout — the cron hit `/api/automation/run` and got a 202 every
hour, 07:00–12:00 UTC; the failure was entirely inside the background `waitUntil`
work.

### Fix
`lib/kv.js` gained two batched readers:
- **`mgetBatched(keys, store = kv, batchSize = 200)`** — sequential batched MGET.
  For small records only (Upstash caps a single response at 10 MB). `processTimeouts`
  now uses this: 1,138 jobs → 6 requests, 1 connection, ~0.97s (was ~6.5s and 1,139
  connections).
- **`getLimited(keys, store = kv, concurrency = 10)`** — bounded-parallel `get`,
  at most `concurrency` sockets open at once. `api/cron/publish.js` uses this, **not**
  `mget`, because content records reach 2.58 MB each and a 200-key MGET batch would
  exceed Upstash's 10 MB response limit (`ERR max request size exceeded`).

Error visibility was also fixed: `err.cause?.code` is now included in LLM error
messages (`run.js` `generateArticle`, `fetch.js` source fetches), and scheduled-path
LLM failures are `console.error`'d — previously they were pushed onto the `results`
object only, which cron runs discard, so the failures were silently invisible in logs.

**Rule for future code: never `Promise.all(ids.map(id => kv.get(...)))` over an
index that can grow unbounded.** Use `mgetBatched` for small records or `getLimited`
for large ones — see the warning comments on both in `lib/kv.js`.

### Not fixed — same pattern elsewhere (separate work)
These open the same style of unbounded parallel-get during a *scheduled* tick and
could reproduce the failure on a shared Fluid instance: `lib/content/handlers/index.js`
(lines ~107, ~209, ~451), `lib/automation/handlers/jobs-index.js:9`,
`lib/automation/log.js:39`. A `pending_review`-only job index would also cut
`processTimeouts` from reading all 1,138 jobs every tick, most of which aren't
pending review at all.

Also noted but not fixed: `run.js` calls `recordLlmFailure({ ..., reason: '...' })`,
but `lib/usage.js`'s `recordLlmFailure` signature takes `failureReason`, not `reason`
— the failure reason is silently dropped on every call (the failure *count* still
records correctly).

### Verification
New tests: `lib/kv-batch.test.js`, `api/cron/publish.test.js`, plus a 250-job
boundary case added to `run-timeouts.test.js`. Full suite: 221 tests, 216 pass, same
5 pre-existing baseline failures as before this change.

**Deployed to prod 2026-09-23 ~06:4x UTC** (`dpl_9AZCY2jcTFfJoejZLLFcncxVcPaL`).
**Verified on the real scheduled path:** 07:00 tick — Breaking News generated + published,
cron→"Cron tick" gap 1.1 s (was ~10 s). For the 08:00 tick the five other rules' crons were
temporarily set to `56 7 * * *` so all were due: BlitzSpirit, Cyrus Accord, Abraham Accords and
Regional Voices all generated + auto-published (08:01–08:04), no `fetch failed`; Diplomatic
Analysis (5th in rule order) was deferred by the run's own `NEW_ARTICLE_CUTOFF` budget (~249 s
elapsed), not a failure — expected when 5 rules share one tick; it ran at the 09:00 tick.
Original crons restored 12:10 UTC the same day and read back: Breaking News 0 7, Diplomatic
Analysis 0 8, Regional Voices 0 9, BlitzSpirit 0 10, Abraham Accords 0 11, Cyrus Accord 0 12.

## Composio LLM tool-calling helper (Vercel AI SDK) (2026-07-01)

Added a **general-purpose** Composio helper so agents/features can let an LLM drive
connectors (Gmail, Slack, Notion, GitHub, …). This is SEPARATE from the social path:
`lib/social/composio.js` executes fixed tool slugs for multi-account posting; this new
module hands an LLM a live tool set shaped for the **Vercel AI SDK**.

- **`lib/composio/tools.js`** (NEW) — static-imports `@composio/core` + `@composio/vercel`
  (NOT the `ai` package, so it stays light in any Vercel function bundle). Exports:
  `getComposio()` (cached client wired to `new VercelProvider()`), `getTools({toolkits|tools,
  limit, userId})` → AI-SDK tools for `generateText({ tools })`, `connectToolkit(toolkit)`
  (hosted OAuth → `{redirectUrl, id, waitForConnection}`), `listConnections({activeOnly})`,
  `isComposioConfigured()`, `COMPOSIO_USER_ID`. Reuses the same env vars as the social module
  (`COMPOSIO_API_KEY`, `COMPOSIO_USER_ID` default `merlows`).
- **`scripts/composio-agent-example.mjs`** (NEW, local-run) — `list` / `connect <toolkit>` /
  `run "<prompt>" [toolkit]`. Consumes the tools via `ai` v7 `generateText` +
  `stopWhen: stepCountIs(5)`, model = OpenRouter through `@ai-sdk/openai` `createOpenAI`
  (env `COMPOSIO_AGENT_MODEL`, default `openai/gpt-4o-mini` — must be tool-calling-capable).
- **Deps added**: `@composio/vercel@^0.11.0`, `ai@7`, `@ai-sdk/openai@4`. No `api/*` route added
  (no Vercel function-count impact); no existing file changed.
- **Verified**: `node --check` both files, import smoke test (exports load, `getComposio()`
  throws without key as designed), full suite **103 pass / same 5 baseline failures**.
  Not deployed (helper/example are inert until called). **Same gate as the social path: a valid
  `COMPOSIO_API_KEY` — the old one 401s.** For LLM tool-calling to work end-to-end you must also
  `connectToolkit(...)` the relevant toolkit once (OAuth) so a connection exists for the user.
- Composio CLI is macOS/Linux only (no Windows build); on Windows everything is done through
  this SDK, not the CLI.

### Follow-up — keys, connect flow, social slug verification (2026-07-01)
- **Two different Composio credentials.** MCP-connect key `ck_…` (Bearer) authenticates the
  universal MCP endpoint `https://connect.composio.dev/mcp` ONLY — it 401s the platform API.
  The **platform** key `ak_…` (app.composio.dev → Settings → API Keys) is what the SDK +
  social backend need in `COMPOSIO_API_KEY`. Verified `ak_REDACTED-rotate-this-key` works (auth +
  `tools.get`); it must go into **Vercel env** (`vercel env add COMPOSIO_API_KEY production`,
  slapharma token) — rotate after sharing.
- **Connect flow corrected.** `toolkits.authorize` and `connectedAccounts.initiate` are
  DEPRECATED (both 400 "no longer supported"). Current flow = `authConfigs.create(toolkit,
  {type:'use_composio_managed_auth'})` (reuse if one exists) → `connectedAccounts.link(userId,
  authConfigId)` → `{redirectUrl, waitForConnection}`. `lib/composio/tools.js` `connectToolkit`
  was rewritten to this (added `findAuthConfig`). NB: the social module's `linkAccount`
  already used `link()` (correct). Gmail managed auth config created live: `ac_78QOa6ZBGB76`.
- **Social tool slugs VERIFIED against live schema** (`GET /api/v3/tools?toolkit_slug=<x>` —
  note singular `toolkit_slug`) and `lib/social/platforms/composio.js` corrected:
  Twitter `TWITTER_CREATION_OF_A_POST` (reply arg → `reply__in__reply__to__tweet__id`);
  LinkedIn `LINKEDIN_CREATE_LINKED_IN_POST` (req `author` URN + `commentary`, no media);
  Facebook `FACEBOOK_CREATE_POST`/`FACEBOOK_CREATE_PHOTO_POST` (was `..._PAGE_POST`; req
  `page_id`); Instagram `INSTAGRAM_CREATE_MEDIA_CONTAINER`→`INSTAGRAM_CREATE_POST` (was
  `..._IG_USER_MEDIA`; req `ig_user_id`); TikTok `TIKTOK_UPLOAD_VIDEO` (arg `file_to_upload`
  not `video_url`, `publish:true`).
- **Remaining social blocker (non-slug):** LinkedIn/Facebook/Instagram tools require an
  account-scoped id (`author` URN / `page_id` / `ig_user_id`) known only after a real
  connection. The adapter now reads `acct.authorUrn/pageId/igUserId` and throws clearly if
  absent — these must be captured into the `social:accounts` record (lib/social/accounts.js)
  at connect time, and per-platform auth configs created (only Gmail managed-auth exists so
  far; social platforms had no default auth config). Verified `node --check` + suite 103/5
  (same baseline). NOT deployed.

## DEPLOYED + KV-isolation finding + login fix (2026-08-19 ~14:11 UTC)

**Deploy:** `dpl_6AmSYxDB6BU2F4SAHdwQsqHPzdb2` → merlows.vercel.app (CLI as
cliftonflack; note `vercel whoami` errors on this CLI version even when auth is
fine — probe with `vercel teams ls`. Git-Bash deploy uploads are flaky
(`fetch failed`) — retry, or use PowerShell). Ships: CRON_SECRET gates
(automation/run 401, social/cron 401 — was 404), processTimeouts convergence,
Composio multi-account UI/backend, `COMPOSIO_AUTHCONFIG_{LINKEDIN,FACEBOOK,
INSTAGRAM}` prod env vars (verified end-to-end: all 3 `/accounts/link` return
live Composio redirect URLs).

**KV isolation — correcting HANDOVER-2026-08-19 §4:** `KV_PREFIX="merlows"` has
been set (all envs, byte-clean) and live for months. Prod reads Merlows' own
namespace (rules endpoint returns Merlows' 10 rules, no Vance data). The
handover concluded "(none)" because its `scripts/*.mjs` hit the store via raw
REST at the ROOT namespace — which is Vance's data — bypassing `lib/kv.js`.
**LANDMINE: `scripts/{list-users,list-rules,reset-password,change-user-email}.mjs`
read/WRITE Vance's production data. Never run them without adding the
`merlows:` prefix.** Upstash DB is still shared; token rotation (P1) still due.

**Login fix:** `merlows:users` already held 5 valid users (cflack@slapharma.com
is admin). Added `cliftonflack@gmail.com` (admin, seed password, forced change)
via a prefix-respecting upsert through lib/users.js. Verified: POST
/api/auth/login → 200.

**Verify tomorrow (2026-08-20):** the 4 Vercel crons must pass the new gates
(Vercel auto-injects `Authorization: Bearer $CRON_SECRET`; unproven until a
tick lands — if articles stop, check runtime logs for 401s on the cron paths);
P4 full-day pinger-gone check; P9 `/api/cron/publish` at 08:00 UTC.

---

## processTimeouts convergence + /api/social/cron fix (2026-08-19 PM)

Working `../HANDOVER-2026-08-19.md` (P3 + P8). LOCAL, NOT DEPLOYED — **do not deploy
before the P0 KV isolation env change**: processTimeouts writes would land in Vance's
shared store (marking Vance's 103 stuck jobs terminal is the data owner's call, P5).

- **P3 (`lib/automation/handlers/run.js` `processTimeouts`)** — the approve/reject
  timeout branch fired `/api/automation/approve` and ignored the result; a failing
  approve re-processed the same job every tick forever. Now: response checked
  (thrown fetch = failure), failures counted in `job.timeoutAttempts`, terminal
  `status:'timeout_failed'` at `TIMEOUT_APPROVE_MAX_ATTEMPTS` (env, default 3);
  a job whose rule was deleted → terminal `status:'orphaned'` (was: silent
  `continue`, retried forever). `processTimeouts(now, fetchFn, kvStore)` is now
  exported with an injectable kv for tests — `run-timeouts.test.js`, 7 tests.
- **P8 (`api/social/[...slug].js` + `lib/social/handlers/cron.js`)** — the daily
  09:00 UTC `/api/social/cron` 404'd because **Vercel cron sends GET** and the
  branch was POST-only. Branch now GET|POST behind `verifyCronSecret` (same gate
  as automation/run); the handler's weaker inline auth was removed (its
  `x-vercel-cron: 1` check was client-spoofable, and with CRON_SECRET unset it
  matched `Bearer undefined` — verifyCronSecret 503s instead of falling open).
- Suite: **122 tests / 117 pass / same 5 pre-existing baseline failures.**
- P4 partial verify: 0 hits on `/api/automation/run` in the 55 min ending 13:51 UTC
  (project-wide log count via Vercel MCP) — the deleted cron-job.org pinger would
  have produced ~11. Full-day + `/api/cron/publish` (P9) re-check due after the
  next 08:00 UTC tick.

---

## Composio go-live: config capture, connect/kit UI, auth configs (2026-08-19)

Finished the remaining handover work (docs/handover-2026-07-01-social-connectors.md §6).

### Environment discovery (UPDATES STALE DOCS)
- **The merlows Vercel project moved AGAIN: slapharma → `CliftonAiTeam`**
  (`team_2OpDi6isFOmWWFqujeyuMZNY`, matches `.vercel/project.json`). Every doc
  saying "deploy under slapharma" is stale for THIS project. Latest prod deploy
  2026-08-15, healthy.
- **Prod already runs the Composio backend** (a mid-Aug session deployed the
  2026-07-01 work): `/api/social/accounts` live, **`COMPOSIO_API_KEY` set in prod**
  (returns live Gmail connections), July Connections UI in served HTML.
- The platform key `ak_REDACTED-rotate-this-key` still authenticates (tested 200).
- **Vercel CLI is logged in as `slapharma`, which cannot see merlows** (CliftonAiTeam).
  `vercel whoami` errors "Not authorized" but `vercel teams ls` works and shows the
  slapharma scope. Fix: `npx vercel login` as **cliftonflack@gmail.com**. (See
  `../HANDOVER-2026-08-19.md` §2 — that handover supersedes assumptions here.)

### Code (this session)
- `lib/social/accounts.js`: accounts now persist `config` (`authorUrn`/`pageId`/
  `igUserId`); new `updateAccount(id,{label,config})` (shallow-merge).
- `lib/social/handlers/accounts.js`: POST accepts `config`; PATCH accepts
  `label`/`config` alongside `isDefault`.
- `lib/social/platforms/composio.js`: `postViaComposio` flattens `account.config`
  onto the account so routers read `acct.pageId` etc. regardless of shape.
- `index.html`: Connections pane gains **+ Connect <platform>** bar
  (`connectComposioAccount`: POST /accounts/link → popup → register with label +
  optional platform id) and **Edit ID** per account (`editComposioAccountId`,
  PATCH config; warning line when the required id is missing). Kit Builder head
  gains a **per-platform account dropdown** (`renderKitAccountSelect`/
  `onKitAccountChange`, writes `platformData.accountId` via kit PATCH — deep-merge
  confirmed in `kits-id.js`). Accounts cached in `_socialAcctsByPlat`
  (`ensureSocialAccountsCache`), invalidated on connect/remove.
- Verified: `node --check` all touched JS, vm.Script both index.html blocks,
  suite **110 pass / same 5 pre-existing baseline failures** (count grew from 103
  as tests were added; failure set identical).

### Composio auth configs (created live this session)
- linkedin `ac_E5Z2cD2f77dr` (pre-existing, managed) · facebook `ac_5dHQuQU-qj5L`
  (created, managed) · instagram `ac_HKLkOLyOm-sd` (created, managed).
- **Twitter + TikTok have NO Composio-managed auth** — connecting them requires
  creating auth configs from the user's own X/TikTok developer-app credentials.

### Remaining (blocked on Vercel auth — user must `npx vercel login` first)
1. `vercel env add` COMPOSIO_AUTHCONFIG_LINKEDIN / _FACEBOOK / _INSTAGRAM
   (production) with the ac_ ids above (or add via dashboard).
2. Deploy this session's changes: `npx vercel --prod --yes` from content-generator.
3. After connect: LinkedIn needs `authorUrn`, Facebook `pageId`, Instagram
   `igUserId` — enter via the new Edit ID button (values from each platform's
   settings, or Composio dashboard → connected account).

---

### Connections UI — Composio account manager, ported from Vance (2026-07-01)
- **Bug:** the social-distribution **Connections tab was blank** — `socialPane-connections`
  was an empty `<div>`, yet `switchSocialTab('connections')` called `renderSocialConnections()`
  which writes to `#socialConnList` (an element that lives only on the Settings page).
- **Fix = port Vance's Composio account manager** (`VANCE-Content-Generator/index.html`),
  adapting `--vance-dark`→`--sla-navy`, plain same-origin `fetch` (session cookie):
  - Connections pane now holds `#socialComposioList`; `switchSocialTab` connections branch →
    `renderComposioAccounts()`. Lists `/api/social/accounts` grouped by platform with status
    dot, Default badge, Set-default (PATCH) and Remove (DELETE) buttons.
  - Settings → Social Media Connections: added `#socialComposioSummary` (read-only,
    `renderComposioSummary()` from `loadSettings()`); legacy localStorage forms (`#socialConnList`,
    still `renderSocialConnections()`) demoted into a `<details>`.
  - New JS: `COMPOSIO_PLAT_META`, `composioStatusColor`, `renderComposioAccounts`,
    `setComposioDefault`, `removeComposioAccount`, `renderComposioSummary`.
- Account record has no `config` field yet, so the per-account id line renders empty until
  capture is added — matches Vance (read-only display). Verified both inline `<script>` blocks
  pass `vm.Script`, single IDs (no dupes). NOT yet deployed.

---

## Social Autopilot Phase 0: social auth gate, OpenRouter key out of the page, Zernio health (2026-09-22)

Groundwork for the Instagram + TikTok autopilot (plan: `../tasks/social-media-automation-plan.md`).
Edited IN PLACE on the dirty `ContentGenerator` tree. **Production is deployed from uncommitted work, so
never deploy from a worktree or a fresh checkout; it would roll prod back.** No code had changed since
the 2026-08-19 deploy before this session.

- **`/api/social/*` is now gated** (`api/social/[...slug].js`). `cron` and `connections/check` accept
  GET|POST behind `verifyCronSecret`. `POST image` needs any signed-in session, because the
  Generator's hero card is open to every role. Every other route needs `requireRole(me,'admin','content')`,
  the same roles the UI shows the Social tab to. Previously every social route was public, including
  post, deploy and accounts/link. `connections.js` lost its inline check auth, which trusted a spoofable
  `x-vercel-cron` header and fell open with no CRON_SECRET.
- **Hardcoded OpenRouter key removed from `index.html`.** It was served publicly: key `sk-or-v1-694e...063a`.
  **Revoke it at OpenRouter**, because old immutable deployments still serve it. The browser now calls
  `POST /api/content/llm-proxy` (`lib/content/handlers/llm-proxy.js`, content catch-all NAMED route):
  - It requires a session (any role) and uses the server `OPENROUTER_API_KEY`.
  - It forwards only `model, messages, stream, max_tokens, temperature, top_p`, and streams the body through.
  - An upstream 401/403 becomes a 502 naming the server key.
  - Errors use the shape `{error:{message}}`.

  `llmFetch(payload, title, apiKey)` in index.html calls OpenRouter directly only when the user saved
  their own key.
- **Zernio health check**: `connections.js` platform `zernio` (env `ZERNIO_API_KEY`). It checks
  `GET /v1/accounts/health` plus TikTok `creator-info`, and fails unless Instagram and TikTok can both
  post and TikTok offers `PUBLIC_TO_EVERYONE`. It runs in the daily 06:00 check with a Telegram alert.
  The Telegram alert now escapes Markdown `_ * `` ` `` [` (an unmatched `_` made Telegram reject the
  whole alert silently) and logs rejected sends. `testOpenRouter` now shows the OpenRouter key label.
- **Live Zernio accounts (2026-09-22):**
  - Instagram `@merlows.news`, id `6ab29cf68d284ffb212e1818`. Its token expires 2026-11-21.
  - TikTok `@merlows.news`, id `6ab29cb58d284ffb212e1733`, public posting OK. (Queried on
    2026-09-24 because a similar handle `@merlowsnews` also exists; Clifton confirmed the
    DOTTED one above is correct for both platforms. Recorded so the question is not reopened.)
  - Profile `6ab2985ea77a696ba3a9610f`.
- **`.vercelignore` now excludes `CLAUDE.md`, `scripts/`, `_drive.*`, `.superpowers/`, `.env.local`.**
  The project has no output directory, so Vercel served every uploaded file. `/CLAUDE.md` exposed the
  Composio `ak_` key (now redacted here; **rotate it**), and `/scripts/.create-wp-authors-output.json`
  exposed all 28 WordPress author passwords (**rotate them**). `/lib/*.js` is still served (it holds the
  seed emails and password); that is a separate task, which is to move static files into `public/`.
- Tests: `lib/social/handlers/social-router.test.js`, `lib/social/handlers/connections.test.js`,
  `lib/content/handlers/llm-proxy.test.js`. The suite gives **164 tests / 159 pass / the same 5 baseline failures**.
- Open (Medium/Worth-knowing, not fixed):
  - The proxy has no model allowlist or `max_tokens` cap, and doesn't abort upstream when the client closes.
  - The Generator retries all fallback models on a proxy 401/503.
  - `testZernio` calls creator-info even when TikTok needs a reconnect.

## GitHub data sync moved server-side: /api/content/gh-data (2026-09-23)

Root cause of the UI's "Sync failed — using cache" status: index.html shipped a GitHub PAT
(disguised as a `String.fromCharCode` list) so the page could call the GitHub Contents API
directly. index.html is public, so the token was readable by anyone, and GitHub had revoked
it (401 Bad credentials).

The prompt library, archive (reviews), reports (comparisons) and custom categories all live
as JSON files in the **public** repo `dominicmerlow/Merlows_new`, branch `ContentGenerator`,
at `data/<cat>/{reviews,prompts,comparisons}.json` and `data/config/custom-categories.json`.

- **New handler** `lib/content/handlers/gh-data.js`, registered as the NAMED route `gh-data`
  in the existing content catch-all (`api/content/[...slug].js`) — no new serverless function.
  - `GET /api/content/gh-data?path=…` → `{content, sha}`; a missing file (GitHub 404) →
    `{content: [], sha: null}` (200), not an error.
  - `PUT /api/content/gh-data` with `{path, content, sha?, message?}` → `{sha}`.
  - Requires a signed-in session. Any role may read and may write reviews/comparisons (the
    Generator saves the archive for every role). PUT to `prompts.json` or
    `custom-categories.json` needs admin|content (`needsContentRole`), matching the UI.
  - PUT content must be an array of objects whose `id` matches `^[A-Za-z0-9_-]{1,80}$`
    (`isValidContent`): index.html interpolates ids into innerHTML/onclick unescaped, so this
    stops a low-role write from becoming stored XSS in an admin's session. Two non-id sinks
    were escaped too (renderArchive `wordCount` → `Number()`, loadReport `model` → `escapeHtml`).
  - Slugs allow `_` because custom category ids are `cat_<timestamp>`.
  - Uses env `GITHUB_TOKEN` server-side only. Unset → 503. GitHub 401/403 → 502 naming
    `GITHUB_TOKEN` (a raw 401 pass-through would read in the browser as "you're signed out",
    this route's own 401).
  - `GH_DATA_REPO` / `GH_DATA_BRANCH` env overrides, defaulting to
    `dominicmerlow/Merlows_new` / `ContentGenerator`.
  - Strict path allowlist (`isAllowedPath`) — only the exact `data/<cat>/{reviews,prompts,
    comparisons}.json` and `data/config/custom-categories.json` shapes are reachable; nothing
    else in the repo is.
- **index.html**: `ghGetFile`/`ghPutFile` now call this proxy instead of GitHub directly.
  New `loadGhData()` runs at boot, and again after `submitLogin()` — the boot-time load is
  refused (401) before sign-in, since the route requires a session.
- `saveGenPrompt()` returns early with a toast for non-admin/content users (the Generator's
  custom-prompt Save row is visible to every role).
- Tests: `lib/content/handlers/gh-data.test.js`. Suite: **201 tests / 196 pass /
  same 5 pre-existing baseline failures.**
- `GITHUB_TOKEN` was added to Vercel prod by the user on 2026-09-23. It should be a
  fine-grained PAT scoped to Contents read/write on `Merlows_new` only. Note `GITHUB_TOKEN`
  is also read by `lib/automation/fetch.js` for source-document fetching — same env var,
  unrelated use.
- **Remaining exposure**: the revoked token string is still present in the public repo's
  index.html history (harmless now that it's revoked, but visible to anyone who checks out
  an old commit). Recommend making `dominicmerlow/Merlows_new` private.
- **Deployed to prod 2026-09-23** (dpl_ALxQJN3fnEHyn9HjbUi62vFyWeXD, aliased merlows.vercel.app).
  Verified live: old token absent from the served page, `loadGhData` present, and
  `/api/content/gh-data` answers 401 signed-out (was 404 before the deploy).

---

## Social Autopilot Phase 2: the pipeline (2026-09-23)

Every article published to merlows.com becomes Instagram/TikTok assets, one stage per
10-minute cron tick. Plan: `../tasks/social-media-automation-plan.md`.

**Shape.** `publish.js` → `enqueuePack` (idempotent; a re-publish cannot double-post, and
neither platform allows deleting a post through the API) → `/api/social/autopilot` tick:
`queued → scripted → voiced → imaged → rendering → rendered` → (Phase 3) `slotted → done`.

- **`lib/social/pack/store.js`** — KV record, queue, state machine. `claim` is a LEASE
  (`zrem`, then re-`zadd` at `now + LEASE_MS`, with `leaseUntil` on the record and the
  record — not the queue entry — deciding the winner). A tick killed mid-stage therefore
  loses nothing; `leaseAttempts` caps a pack that reliably crashes the function. `hold()`
  parks a pack whose stage has no runner yet instead of dropping it.
- **`lib/social/pack/build-pack.js`** — one OpenRouter JSON call, three candidate hooks, the
  first that passes the guard wins, plus ONE repair round that feeds the guard's complaints
  back. The article is FENCED in `<<<uuid>>>` markers and labelled untrusted: bodies arrive
  from RSS and from a content route that (as of today) needs no auth.
- **`lib/social/pack/fact-guard.js`** — deterministic, never a second LLM pass. Checks names,
  figures (including numbers spelled out in words), the pull quote verbatim, and the caption
  text that actually ships. **Scope, honestly:** it proves a clip matches its ARTICLE; it
  cannot prove the article is true, and whoever can write the article controls both sides.
- **`lib/social/pack/voice.js`** — three British voices (Colin/Sophia/Richard), rotated per
  story by hash and pinned for the whole pack; clips to Blob under the CONTENT id.
- **`lib/social/pack/images.js`** — 2 stills per story from the script's image briefs.
- **`lib/social/pack/render.js`** — client for the render service. Videos are detached: start,
  then poll on later ticks. A render in progress makes the pack STAY at its stage rather than
  counting a failure.

**Rendering lives in `merlows-studio`, not here.** `renderMediaOnVercel` pushes the Remotion
bundle into the sandbox from the CALLING function's filesystem, so the caller needs a build
step — and this app deliberately has none. The studio is a separate Vercel project with
`api/render.ts` behind `RENDER_API_SECRET`; set `RENDER_SERVICE_URL` here to point at it.
Route chosen over AWS Lambda because we are already on Vercel Pro (~$14/month at 400
renders); `@remotion/vercel` is marked experimental, so the call sits behind a thin interface.

**Controls.** `SOCIAL_AUTOPILOT=off` (env, applies at deploy) or the KV flag
`social:autopilot:paused` via `POST /api/social/autopilot/pause` (applies next tick — Vercel
env vars only change on deploy, which is no use mid-incident). Board:
`GET /api/social/autopilot/packs`. Manual re-queue: `POST /api/social/autopilot/retry`
(failed packs only, resumes at the stage that failed, capped at 3).

**New env vars:** `SOCIAL_TTS_API_KEY` (voice runs on its OWN OpenRouter key so a runaway
voice job cannot drain the article budget), `BLOB_READ_WRITE_TOKEN`, `SOCIAL_PACK_MODEL`,
`SOCIAL_AUTOPILOT`, `SOCIAL_STILLS_PER_PACK`, `BRAND_SITE_HOST`, `RENDER_SERVICE_URL`,
`RENDER_API_SECRET`.

**Tests:** 432 total / 427 pass / the same 5 long-standing failures.

**Known limits, not fixed:**
- Per-render QA checks that a real video of a sane size exists; it does NOT re-examine frames.
  The seamless loop is structural (static hook frame + crossfade tail) and verified
  frame-by-frame only by `merlows-studio/scripts/check_video.py` during template work.
- `sensitive` is computed and shown but gates nothing yet; Phase 3's review gate is the
  control that makes posting safe, so it is load-bearing rather than belt-and-braces.
- Nothing posts yet. `STAGE_RUNNERS` stops at `rendering`; a rendered pack is held.

---

## Dashboard list reads batched (2026-09-23)

Two separate batching mechanisms guard against the KV failure modes in the section above
(1,024-fd ceiling from unbounded parallel `kv.get`, and Upstash's 10 MB response cap on MGET).

- **Content records** (`lib/content/handlers/index.js`) can reach ~2.5 MB each (inline
  base64 hero images), so list/slim/summary/review-tasks reads never MGET them. `readContent(ids)`
  = `getLimited(ids.map(id => \`content:${id}\`), kv, 25)` — 25 `kv.get` calls in flight at once,
  not one MGET and not 1,000+ parallel. `?slim=1` additionally strips `body`, `versions`,
  `auditLog`, and inline `data:` hero URLs before the response is sent.
- **Automation logs and jobs** are small enough to MGET, but still bounded: `lib/automation/log.js`
  `readLogs(limit)` and `lib/automation/handlers/jobs-index.js` both use `mgetBatched` from
  `lib/kv.js` on the id list.
- `readLogs` always pulls up to 200 records (`MAX_LOGS`) in one MGET, so `lib/automation/log.js`
  `writeLog` caps every record's serialised JSON to `MAX_RECORD_BYTES` (16 KB) via `fitRecord`:
  `ruleId`/`ruleName`/`jobId`/`contentId`/`level` are capped at 200 chars, `message` at 4,000 chars
  and then halved repeatedly if still over budget, and `meta` is replaced with `{truncated: true}`
  if it alone pushes the record over budget. 200 records × 16 KB ≈ 3.2 MB (~4.3 MB after Upstash's
  base64), safely under the 10 MB response cap.
- Tests: `lib/content/handlers/index.test.js`, `lib/automation/handlers/jobs-index.test.js`,
  `lib/automation/log.test.js`.

## API auth gates + JWT_SECRET (2026-09-23)

**Before this pass**, nearly every API route was unauthenticated — anonymous callers could
create → approve → publish an article to WordPress, rewrite rules/reviewers/OAuth config, and
stuff votes into the JSON approve endpoint via `body.channel`. `JWT_SECRET` was unset in prod, so
every session and review-token was signed with a public fallback string — `lib/` is served
statically, so that fallback was readable by anyone.

**Now:**

- **`lib/route-auth.js`** defines `LEVEL` (`PUBLIC`, `SELF`, `CRON`, `SESSION`, `CONTENT`, `ADMIN`)
  and `resolveAuth`/`authorize`/`enforce`/`parseSlug`. Each catch-all —
  `api/{core,content,automation,review}/[...slug].js` — exports its own `(method, slug, query)`
  policy function and calls `enforce(req, res, policy(...))` before dispatch. Any `(method, route)`
  pair the policy function doesn't explicitly return a level for falls through to
  `DEFAULT_LEVEL = LEVEL.ADMIN` — a newly added route is closed by default.
  Policy tables, read from source:
  - **`core`** (`corePolicy`): `POST publish` and `POST schedule` → CONTENT; `GET reviewers` →
    SESSION, all other `reviewers` methods → ADMIN.
  - **`content`** (`contentPolicy`): bare `/api/content` `GET`/`POST` → SESSION, except
    `?action=email-diagnostic` or `?action=backfill-review-sync` → ADMIN. Named config routes
    (`ab-config`, `article-prompts`, `hero-prompts`, `master-prompt`, `usage-record`,
    `usage-summary`, `word-limits`, `llm-proxy`, `gh-data`) → SESSION at the gate (finer role
    checks live inside each handler). `/api/content/:id` `GET`/`PUT`/`DELETE` → SESSION (a PUT
    that moves status into `approved`/`scheduled`/`published` needs CONTENT — enforced inside
    `item.js`, which knows the current status). `:id/ai-revise`, `:id/apply-revision`,
    `:id/comment` → CONTENT.
  - **`automation`** (`automationPolicy`): `GET approve?token=` and `POST approve?token=` →
    PUBLIC (the JWT in the token is the credential); `POST approve` with no token → CONTENT.
    `POST telegram` → SELF (secret header checked in the handler). `backfill-heroes` and
    `backfill-missing-heroes` → SELF (`x-backfill-auth`, checked in the handler). `GET run` →
    CRON (Vercel cron tick); `POST run` → CONTENT ("Run now" from the UI). `telegram-test` and
    `sources-list` → CONTENT. `logs`, `rules`, `bibliography` → CONTENT. `GET jobs` → SESSION.
    `auth/{google,dropbox}/callback` `GET` → PUBLIC (OAuth redirect target); `GET auth/status` →
    CONTENT; every other `auth/*` route → ADMIN.
  - **`review`** (`reviewPolicy`): `POST send` → CONTENT; `/api/review/<token>` → PUBLIC (the
    signed JWT in the path is the credential).
- **Internal server-to-server calls** send `Authorization: Bearer $CRON_SECRET` via
  `lib/cron-auth.js` `internalAuthHeaders()`. `isInternalRequest(req)` (true iff `CRON_SECRET` is
  set AND the bearer matches) and `verifyCronSecret(req)` use `safeEqual` — a `timingSafeEqual`
  wrapper that returns `false` (not a throw) on length mismatch. An unset `CRON_SECRET` returns
  **503** (misconfigured), never 401 and never fail-open. Callers that send this header: `run.js`
  (→ `/api/content`, `/api/publish`, `/api/schedule`), `approve.js` (→ `/api/publish`),
  `telegram.js` (→ `/api/publish`), `backfill-heroes.js` (→ `/api/automation/approve`),
  `api/cron/publish.js` (→ `/api/publish`). **`CRON_SECRET` is therefore required for automation
  to ever publish.** `NEXT_PUBLIC_APP_URL` must be the app's own prod URL
  (`https://merlows.vercel.app`) since that's where the bearer is sent.
- **`lib/auth.js`**: `JWT_SECRET` is read lazily via `getSessionSecret()`, never at import — no
  fallback string. `isJwtSecretConfigured()` gates session verification (missing → every token
  treated as invalid); signing with no secret throws `JwtSecretError` (`status: 503`), consumed by
  login, review send/token, and automation notify/approve. `JWT_SECRET` was set in Vercel
  Production on 2026-09-23 (this invalidates all outstanding sessions and review links once).
- **`lib/automation/handlers/telegram.js`**: fails closed with **503** when
  `TELEGRAM_WEBHOOK_SECRET` is unset (previously an unset secret let requests without the header
  through via `undefined === undefined`); a set-but-mismatched header → 401 via `safeEqual`
  against `x-telegram-bot-api-secret-token`. When enabling Telegram, set the secret and
  re-register the webhook with `secret_token`.
- **`lib/content/handlers/item.js`** `sanitizeUpdates(updates, item, auth)`: browser callers can
  never set `id`, `createdAt`, `auditLog`, `versions` (`SERVER_OWNED_FIELDS`). A basic `user`
  (not admin/content) additionally can't set `approvals`, `rejections`, `rejectionComments`,
  `reviewers`, `reviewerIds`, `requireAllApprovals`, `scheduledAt`, `approvedAt`, `publishedAt`,
  `sentForReviewAt`, `gcalEventId`, `wpPostId`, `wpPostUrl`, `wpAuthorId`, `authorUsername`,
  `authorName`, `automationRuleId`, `publishedChannels`, `socialSchedule`, `heroMediaId`,
  `wpCategorySlug`, `publishDate` (`CONTENT_PLUS_FIELDS`), and gets a 403 on any `PUT` to an item
  whose current status is `in_review`, `approved`, `scheduled`, or `published`
  (`USER_LOCKED_STATUSES`). A `PUT` that moves `status` into `approved`/`scheduled`/`published`
  needs CONTENT (checked separately, via `requireRole`).
- **JSON approve** (no-token flavour) records the voter as the authenticated user's id, or
  `'internal'` when the internal bearer called it with no session.
- **`lib/automation/handlers/auth.js`** `oauthDonePage(message, success)` now runs `message`
  through `escapeHtml` before interpolating into the response HTML (reflected-XSS fix — the page
  echoes the OAuth provider's `error` query param).
- **`index.html`**: `requireContentPlusAction(what)` guards pipeline action buttons (approve,
  publish, schedule, send-for-review); those buttons are only rendered for content+ roles; the
  Bibliography tab is content+ only. A global fetch wrapper's `onUnauthorized()` shows the login
  overlay on a same-origin `/api/` 401 (but not `/api/auth/*`), only when the same user was
  already signed in when the request started. `loadPublishingQueue()` and `loadGhData()` re-run
  after `submitLogin()`.
- **Tests**: `lib/route-auth.test.js` — a generated dispatch simulation over
  `MATRIX` (68 routes across the four catch-alls) × `WHO` (`anon`, `user`, `content`, `admin`,
  `internal`) = 340 combinations, 3 skipped as not safely exercisable (would start a real
  automation run), plus a handful of standalone assertions (Telegram secret-header behaviour, the
  `req.query.slug` rewrite path gated the same as `req.query['...slug']`). Also
  `lib/content/handlers/item-sanitize.test.js`, `lib/automation/handlers/auth-page.test.js`, and
  updated telegram/run-timeouts/notify/index/cron-publish tests.
- **Deployed 2026-09-23** as dpl_EMRyx1E3GkUPNdR2XYZJPwAPT4Do, with `SOCIAL_AUTOPILOT=off` (the
  concurrent social-autopilot work from the section above shipped dormant in the same deploy).
  Verified live signed-out: gated routes return 401, Telegram webhook returns 503, the OAuth
  callback page escapes its message. End-to-end proof of the internal bearer is pending the next
  scheduled automation publish.
- **Open / deferred** (separate work, not done this pass): static files should move to `public/`
  so `lib/` stops being served (the seed password `'2026'` is visible in `lib/auth.js` source);
  `mustChangePassword` isn't enforced server-side (done 2026-09-23 — see 'Password-change
  enforcement + seed password removed'); no login rate limiting; OAuth callbacks have no
  state-based CSRF check; a basic user can still `DELETE /api/content/:id` (hard delete — the
  route's SESSION-level policy allows any signed-in user); `api/proxy-image.js` serves
  `image/svg+xml` from the app's own origin (XSS vector), and `fetch-url`/`proxy-image` are open
  server-side proxies; the backfill routes use `KV_REST_API_TOKEN` as an HTTP password; the UI
  still renders edit buttons that basic users can't successfully use.

## Social Autopilot Phase 2 — review pass: what the reviews changed (2026-09-23)

The pipeline in the section above was reviewed by `code-reviewer` (render/image stages) and
`security-auditor` (the new public render endpoint), then re-reviewed as confirmation runs. Both
found defects that would have stopped it working, and the second round found three more that the
first round's fixes introduced. What follows is the corrected behaviour, because the section above
describes the version that did not work.

**Four ways a pack could never reach a finished video:**
- `leaseAttempts` counted every claim, not every crash. Four claims are spent just reaching
  `rendering`, so a render taking longer than about two minutes — the normal case — failed the
  pack. Any outcome now resets it (`clearLease` in `store.js`, applied by `advance`, `fail`,
  `hold`, the stay path and `/retry`). A wall clock on the handle bounds a render that never
  terminates instead.
- A cut whose render failed had its handle deleted and was never restarted; the next tick found
  nothing to poll and advanced the pack to `rendered` with the video missing. `stagePollRenders`
  now iterates the CUTS, not the handle keys, and a cut with neither handle nor video sends the
  pack back to `imaged` — the one place that starts renders — bounded by `cutAttempts`
  (`MAX_CUT_ATTEMPTS`, default 2) and then by the stage attempt cap.
- `stageStartRenders` had no time budget and saved nothing when it crashed: six to eight stills
  plus two renders do not fit in what remains of a 300s tick. It now has its own clock, stays when
  the stills are unfinished, and carries paid-for stills and started handles on the thrown error.
- The snapshot id was written to `.vercel/.env.production.local`, which is a Vercel CLI artefact
  that never becomes a deployed function's env. Every render would have paid the full cold cost and
  timed out. It is now `.remotion/snapshot-id.txt`, which ships via `includeFiles`, read once at
  module load with a log line either way.

**The deadline mismatch, found only by the confirmation run:** the render service capped its
detached sandbox at 8 minutes while the caller polls on a 10-minute cron, so a correct, uploaded
video was always reported `expired` and re-rendered until the pack died. Render deadlines must
exceed the POLL LATENCY, not the render time: the sandbox extension is 25 minutes (and it is an
extension, added to the platform default, not a total), and `SOCIAL_RENDER_MAX_MS` is 40 minutes so
the service's own `expired` is what reports a dead render. `stagePollRenders` also polls BEFORE
applying its deadline — checking the clock first threw away answers that were sitting there.

**Four High security findings on the render endpoint:**
- The caller chose the storage key and got no random suffix, so `social/<id>/reel.mp4` was
  derivable: one leaked URL gave up every other asset for that story, including cuts that failed
  QA and everything that exists before a human has seen the pack. The body now carries
  `storyId` and `name`, each `[A-Za-z0-9_-]{1,64}`, and the service builds the key with a random
  suffix — matching what the voice and image steps already did.
- The video path leaked a sandbox on every error and pinned it to Remotion's 30-minute default.
- `images[].src` and every audio field were unconstrained URLs fetched by Chrome inside a sandbox
  with full outbound access: an arbitrary-GET proxy, and the still path returns the rendered JPEG,
  so it had a readback channel. `assetRef` in the templates' schema now allows only a bundled asset
  name or an https URL on the brand site or our own Blob, and the sandbox gets a host allowlist.
  The allowlist MUST include `vercel.com` — `@vercel/blob` v2 posts there, inside the sandbox, so
  omitting it fails every render at upload and the documented remedy is to switch the lock off.
- `point.seconds` had no ceiling: a 400-byte request could ask for a 24-hour render. Bounded at 30s
  per slide, 120s per timeline, 12 images, and a 256 KB request body.

A hero image that the schema would reject is now dropped in `stageScript` rather than sent to the
renderer, because a rejected hero fails the whole pack at composition selection — losing both cuts
and every still over one image. The usual source is a rule's `heroImageFallbackUrl`, which an
operator can set to any host.

**Tests:** 806 total, 801 pass, the same 5 long-standing baseline failures. The silent-drop guard,
the lease reset and the poll-before-deadline order were each broken on purpose and observed failing
before being restored.

**Reported, deliberately not fixed:** no rate limit or concurrency ceiling on the render endpoint
(every route is behind the shared secret and the only caller is the cron-gated autopilot, so this is
hardening for the day the secret leaks); `imageBrief` is the one LLM-written field the fact guard
never inspects, and it is piped into a second model's prompt; Blob uploads still refuse overwrites,
so a re-render of the same key would fail if the key were not now random; the bearer secret is
compared with `===` rather than a constant-time comparison.

**Before this can run:** deploy `merlows-studio` as its own Vercel project, set `RENDER_SERVICE_URL`
and a shared `RENDER_API_SECRET` in both projects, and `BLOB_READ_WRITE_TOKEN` in the studio. The
network allowlist has not been proved against a real render — `tsc` cannot see it and no test covers
it, so the first live still and the first live video are the check.

**Host allowlists must be changed in TWO places.** `ASSET_HOSTS` in `merlows-studio/src/schema.ts`
and `isRenderableAsset` in `lib/social/pack/render.js` are the same list, deliberately hardcoded in
both. The caller's copy does NOT read `BRAND_SITE_HOST`, even though the fact guard does: the
studio's copy runs inside the render sandbox, where that variable does not exist, so an env override
would only teach the caller to pass assets the renderer still refuses — which costs the whole pack.
Every asset URL entering a pack goes through the caller's copy: the hero in `stageScript`, and a
model-hosted image URL in `image-client.js` (which now throws rather than passing one through).

## merlows-studio deployed as its own Vercel project (2026-09-23)

The render service is live at **https://merlows-studio.vercel.app**, project `merlows-studio`
under **CliftonAiTeam** (`team_2OpDi6isFOmWWFqujeyuMZNY`, Pro — Hobby's 60s cap cannot run a
300s render). Deploy with `npx vercel --prod --yes` from `C:\dev\merlows-studio`; the Drive copy
is a mirror and cannot `npm install`.

**Blob store `merlows-social`** (`store_KPse4AedYZkqBX9l`, iad1, access public) was created for
this and its token is set in BOTH projects — the studio uploads renders, the Content Generator
uploads voice clips and generated stills. Public access is required: Zernio fetches the finished
files over plain HTTPS, which is why the random suffix on every key matters.

**Env now set in production:** studio has `RENDER_API_SECRET` and `BLOB_READ_WRITE_TOKEN`; merlows
has `RENDER_API_SECRET` (same value), `BLOB_READ_WRITE_TOKEN` (same store) and
`RENDER_SERVICE_URL`. **The secret is stored Sensitive, so `vercel env pull` returns
`[SENSITIVE]` and it cannot be read back.** To rotate it, generate once and write it to both
projects in a single shell invocation, then redeploy the studio — a mismatch is a silent 401 on
every render.

**Two build/runtime defects fixed to get the first deploy working**, both diagnosed by `debugger`
with a negative control:
- `addBundleToSandbox` in @remotion/vercel 4.0.527 never creates its own sandbox-side root, and
  `sandbox.mkDir` is not recursive — so the bundle upload dies on the first subdirectory. A flat
  bundle never notices; ours carries `public/`. `ensureSandboxBundleRoot()` runs `mkdir -p` first,
  in `scripts/create-snapshot.mjs` and in `api/render.ts`'s cold path. Upstream bug, worth
  reporting; the workaround is idempotent so an upgrade will not break it.
- `package.json` needed `"type": "module"`. `tsconfig.json` has `"module": "Preserve"`, so the
  function is emitted as ESM, and without the type field Node loaded it as CommonJS and every
  invocation was `FUNCTION_INVOCATION_FAILED`. It did not reproduce locally because Node 24
  auto-detects ESM and the deployed Node does not. Do NOT switch tsconfig to CommonJS to "fix"
  this: `@remotion/vercel` has no `require` export and cannot be loaded that way.

**Verified live, not assumed:** unauthenticated and wrong-bearer GETs both return
`401 {"error":"Unauthorised"}` (so no Vercel deployment protection is in the way), and a real
still render returned a 1080x1350 JPEG with the WordPress hero visibly composited in — which
proves the sandbox network allowlist reaches both `merlows.com` and the Blob API at `vercel.com`,
the one thing no test or typecheck could cover. The test blob was deleted afterwards.

**Known, not fixed:** Blob returns a `downloadUrl` (`?download=1`, `Content-Disposition:
attachment`). It serves the bytes fine, but Phase 3 should strip the query before handing a URL to
Zernio. The store is in `iad1` while functions run `fra1`, so every upload crosses the Atlantic.
The build ran the snapshot step twice in one deploy, so snapshots accumulate faster than one per
deploy — prune them occasionally.

**Nothing renders automatically yet:** `SOCIAL_AUTOPILOT=off`, and the new env vars only take
effect on the Content Generator's next deploy.

### Hero images carry baked-in text, and the pack lies about their shape (2026-09-23)

Two facts the social templates had to be taught, both originating here:

- **WordPress heroes often have the article's own title burned into the picture**, on the left,
  despite `craftImagePrompt` in `lib/social/media.js` forbidding text. The image models ignore it.
  The carousel cover now crops to the right of the frame and fades the left edge to hide whatever
  remains, and point slides no longer fall back to the hero at all. The real fix is at this end:
  until it happens, every template that shows a hero is working around it.
- **`stageScript` stamps `aspect: 16 / 9` on the hero without measuring the file**
  (`lib/social/handlers/autopilot.js`). Anything that is not 16:9 — an operator's
  `heroImageFallbackUrl`, an image replaced through the UI — is then framed as if it were. The
  still templates now measure the real dimensions in `calculateMetadata` and override the
  declared value; the VIDEO templates still trust it, so a wrong aspect still mis-frames a reel.
  Measuring once here, when the pack is built, would fix both.

## Social Autopilot: the paused-production backlog gate (2026-09-23)

`enqueuePack` runs on EVERY publish whether or not the autopilot is paused — only the worker
tick checks `isPausedNow()`. That is deliberate: the pack record is also the idempotency guard,
so skipping it during a pause would mean a story published in that window could never be queued
afterwards, and the enqueue costs one KV write. The consequence is a queue that fills while
production is off, and switching back on would have bought an LLM script, ~9 voice clips and 2
images for every article published during the outage, however stale.

**The gate is in the worker, not at the door.** A pack still at `queued` and older than
`SOCIAL_MAX_PACK_AGE_HOURS` (default 24) is retired to a new terminal status `dropped` —
deliberately NOT `failed`, because nothing went wrong and a board full of alarms trains people
to ignore it. A pack past `queued` is never dropped however old: the money is spent and posting
it is the cheapest outcome. There is no purge to run; the backlog clears itself.

**Two things that were nearly shipped broken, both found in review:**
- **The board's Retry was a trapdoor.** A script-stage failure resumes at `queued`, and
  staleness measured from `createdAt` — so retrying the next morning, which is what the board is
  for, spent one of three manual retries and had the pack retired on the very next tick, with no
  route back from `dropped`. Staleness now measures from `requeuedAt ?? createdAt`, and `/retry`
  stamps `requeuedAt`. Anything that ever revives a dropped pack must do the same.
- **A long backlog crowded out today's stories.** The queue is scored by when a pack is next
  due, and an unworked pack keeps its enqueue time, so stale packs are always a PREFIX. Reading
  the first N ids meant that once the backlog passed the window, every id the tick could see was
  stale and today's article was never claimed. `runTick` now reads the two ENDS of the queue
  (`dueContentIdsInRange`) so draining and working are independent.

**Also hardened:** `nextStage` guards `indexOf === -1` (it returned `queued` for a terminal
status, which would have restarted the whole paid chain); `MAX_PACK_AGE_MS` is floored at 1h (a
negative env value made every pack stale and would have wiped the queue irreversibly); each drop
logs, because a cron tick's response body goes nowhere — see the month of silently-missing
articles recorded above; `runTick` returns `counts` so a saturated read window is visible; and a
terminal pack found in the queue is removed rather than re-held every 6 hours forever.

**Tests:** 841 total / 836 pass / the same 5 baseline failures. The pre-existing queue stubs
return every id whatever score range they are asked for, so they CANNOT exercise the two-window
read — the new tests use a stub that honours scores. Both fixes were sabotage-checked.

**Known, reported, not fixed:** the fresh window reads exactly `PACKS_PER_TICK` ids with no
slack, so an id that does not become work costs a slot; the terminal-leftover branch sits after
`worked++` and so consumes one; the paused early return omits `counts`, so a future consumer
reading `counts.dueSeen` would throw on a paused tick; the tick-full path claims before it knows
it has no room (6 KV ops to conclude nothing); `dueContentIdsInRange` transfers the whole
matching range before slicing; and there is no route back from `dropped` short of deleting the
KV key.

---

## Static files moved to public/ (2026-09-23)

`index.html`, `logo.png`, `logo.svg` moved to `public/` (bytes verified). The project's Output
Directory setting is "public if it exists, or `.`" — before this move, `public/` didn't exist, so
Vercel served **every uploaded file in the repo root** statically. `/lib/auth.js` exposed the seed
password `'2026'`, the session cookie name, and — until `JWT_SECRET` was set earlier the same
day — the fallback JWT secret; `/lib/**` also documented internal structure. `vercel.json` now
pins `"outputDirectory": "public"` so a missing `public/` fails the deploy instead of silently
re-exposing the root. `.vercelignore`'s root-file excludes (`CLAUDE.md`, `scripts/`, `_drive.mjs`,
`_drive.log`, `.superpowers/`, `.env.local`) are kept as defence in depth (comment updated).

Deployed 2026-09-23 12:43 UTC, `dpl_GNGb1crTkxe1RXRzpG4dtyZ6qafz`. Verified live: `/lib/auth.js`,
`/lib/kv.js`, `/CLAUDE.md`, `/package.json`, `/vercel.json`, `/.env.example`, `/data/...` → 404;
`/` serves the app; `/logo.png` byte-identical.

**Still open:** the seed password `'2026'` remains valid for any account that never changed it,
and `mustChangePassword` isn't enforced server-side (both done 2026-09-23 — see 'Password-change
enforcement + seed password removed'); no login rate limiting.

## Password-change enforcement + seed password removed (2026-09-23)

Four never-used seed accounts — `jslagel`, `lslagel`, `myaniv` (@slapharma.com, `content` role) and
`dgershon` (@slapharma.com, `user` role) — still accepted the shared seed password `'2026'`, which
was publicly readable in `lib/auth.js` until the `public/` move earlier the same day. Removed from
KV `merlows:users` on Clifton's decision: records backed up locally first, and none was referenced
by any rule, notification, or pending job. Only two users remain, `cflack@slapharma.com` and
`cliftonflack@gmail.com`, both `admin`. There is no admin UI for creating users or resetting
passwords — only the scripts.

`lib/auth.js` `getCurrentUser(req, { allowPendingPasswordChange })` now returns `null` for a
`mustChangePassword` user unless the caller opts in; only `/api/auth/me` and
`/api/auth/change-password` opt in, so a pending session can do nothing else. This is enforced in
`getCurrentUser` itself, so route-auth, the social router, and every handler that calls it directly
all inherit the gate. `SEED_PASSWORD` is gone; `INITIAL_USERS` is now `cliftonflack@gmail.com`
(admin) only; a new `randomTemporaryPassword()` generates the fallback. `buildUser` (`lib/users.js`)
and `loadUsers`'s empty-store seeding path both use it when no password is supplied, so a seeded
account gets a random, unknowable password and is locked until an admin sets one out of band.

`lib/auth/handlers/change-password.js`: `MIN_PASSWORD_LENGTH` is 10. The handler writes only the
`users` KV key directly (`kv.set('users', users)`), not `saveUsers()` — `saveUsers` also regenerates
the `reviewers` list from the user list, which would silently clobber the list curated through
`/api/reviewers`. The reviewers list is separate data now.

UI (`public/index.html`): a `mustChangePassword` session sees only the forced-change dialog and no
other data loads while pending; `onUnauthorized()` is a no-op while pending
(`_currentUser.mustChangePassword` check); the page reloads after a forced change completes; both
password fields have `minlength="10"`.

Tests: `lib/auth-password-policy.test.js` (18 tests, new). Suite baseline 859 total / 854 pass / 5
long-standing failures (unchanged from before this change).

Deployed 2026-09-23 13:02 UTC, `dpl_27dSmLeVyoXedij8mWiN8uJnU9mb`. Verified live: a seed-password
login attempt returns 401; an anonymous call to `/api/auth/change-password` returns 401.

**Open (separate work, not done this pass):** no login rate limiting (Medium); login response
timing reveals whether an email exists (Low); `scryptSync` runs with Node's default cost parameter
`N=2^14` (Low); sessions are not revoked on password change — the JWT is valid for its full 30-day
TTL with no password-version claim to invalidate it early; `scripts/reset-password.mjs` still calls
`saveUsers()` (clobbers `reviewers`), allows passwords as short as 4 characters, and writes to the
root KV namespace if `KV_PREFIX` is unset in the shell it runs from; `lib/users.js` `loadUsers()`'s
empty-store path still rewrites `reviewers`.

## Comment-to-DM automations: Zernio adapter + payload builder (2026-09-23)

Two new modules for the "Comment VOICES and we'll DM you the full story" feature (steps **Z2**
and **Z3** of `../tasks/comment-to-dm-plan.md`). Zernio's own Meta app watches Instagram comments
and sends the DM; these modules only configure and validate it.

**`lib/social/platforms/zernio.js`** gained a Comment-to-DM automations section after
`retryPost`: `interpretAutomation` (normalises both stats naming schemes Zernio uses across
endpoints — `dmsSent` vs `totalSent` — deliberately drops `delivered`, because Instagram has no
delivery receipt for a DM, and reads a missing `isActive` as live, since every automation is
created active and only an explicit `false` means paused); `createCommentAutomation` (a 409 means
a second active automation on the same post, surfaced as `err.status` for the caller to decide it
means "already done"); `updateCommentAutomation` (partial patch, e.g. `{isActive:false}` to pause
one — the only way to switch one off short of deleting it); `deleteCommentAutomation`;
`listCommentAutomations` (filtered by `profileId` — omitting it lists automations across ALL
profiles on the API key); `getCommentAutomationLogs` (`status`/`limit`/`skip`, log entries passed
through unchanged because Zernio's field names for them are undocumented). Every function takes an
`apiKey` option, so comment-to-DM calls can run on `ZERNIO_DM_API_KEY` instead of the posting key.

**`lib/social/dm/automation.js`** builds the Zernio payload and refuses to let a bad one out.
Constants: `DM_KEYWORD = 'VOICES'`, `DM_MATCH_MODE = 'word'` (whole-word; `contains` fires on any
substring and is never used), `CAPTION_CTA`, `DISCLOSURE` (Meta requires an automated chat to say
so up front), `PUBLIC_REPLY_VARIANTS` (rotated under the reader's comment), and
`DM_MAX_CHARS = 640` — deliberately below Meta's 1,000-character plain-text limit, so that adding
a button later (640 is the cap once buttons are attached) can't push a live DM over the limit.
`articleLink` tags the URL with UTM params and throws on anything not an https URL on the brand's
own site (checked via `new URL()`, not a string prefix). `buildDmMessage` assembles the DM text.
`buildAutomation` scopes the automation by `platformPostId`, `postId`, or an explicit
`accountWide: true`. It sends no `isActive` field and THROWS if the caller passes one: Zernio's
create endpoint ignores `isActive` — the Z1 spike sent `isActive: false` and got back an
automation that was live and answering comments — so every automation is LIVE the moment it is
created. Pausing is a separate call afterwards, `updateCommentAutomation(id, { isActive: false })`.

`validateAutomation`/`assertValidAutomation` list every reason a payload must not be sent, not
just the first: no keywords (would DM every commenter), a match mode other than `word`/`exact`,
typo tolerance on, an empty or over-length DM, a missing disclosure, an unfilled template
placeholder, a link off the brand's site, buttons or a template card (a rejected button message
uses up Meta's one private reply per comment, ever), and — the self-trigger rule — any public
reply variant that itself contains the keyword, since our own public reply is a comment and could
retrigger the automation that posted it. A headline containing a bare domain (e.g. `gov.uk`,
`X.com`) also fails validation: conservative on purpose, because Instagram linkifies bare domains
inside DMs. It also checks the payload against `existing` automations for a same-scope keyword
collision, and that check runs for an ordinary create payload too: a create carries no `isActive`
and is live anyway, so only an explicit `isActive: false` (a pause) skips it.

**Tests:** `lib/social/platforms/zernio.test.js` and `lib/social/dm/automation.test.js`,
124/124 passing. Full suite (2026-09-23, after Z4 below): 1294 tests / 1289 pass / the same 5
long-standing baseline failures. The empty-keyword and self-trigger rules were broken on purpose,
seen failing (5 tests red), and restored byte-identical.

**Z1 spike — done** (run 3, 2026-09-23; results in `../tasks/comment-to-dm-plan.md` §5 Z1).
`scripts/zernio-dm-spike.mjs` is read-only by default (lists profiles/accounts/existing
automations/candidate posts); a LIVE test automation needs `--live` plus `--platform-post-id` or
`--post-id` — never account-wide (`--account-wide` is refused outright); the key comes only from
`ZERNIO_API_KEY` typed at a hidden prompt, never a flag; each run overwrites the git-ignored
`scripts/.zernio-dm-spike-output.json` — run 3's evidence is copied to
`../tasks/zernio-z1-spike-run3-2026-09-23.json`. Results: Zernio ignores `isActive` on create — a
payload sent `isActive: false` came back **active**, account-wide, live for < 0.4s before delete,
0 triggered / 0 sent in that window; the recorded ids are confirmed correct (profile
`6ab2985ea77a696ba3a9610f`, Instagram account `6ab29cf68d284ffb212e1818` — earlier 404s
("Profile not found or access denied") were a key from the wrong Zernio workspace, not a wrong
id); logs come back as `{logs, pagination, misses:{total, retentionDays:14, samples}}` —
`misses` keeps non-matching comments for 14 days, and a key is scoped to one Zernio workspace.
Still open, moved to **Z7** (needs real comments on a live automation): `word` vs `exact`
behaviour on "VOICES please"/"voice"/"#RegionalVoices", how `commentReply` and
`commentReplyVariations` rotate, per-post vs account-wide precedence, and what `linkTracking`
does to the visible link.

## Comment-to-DM automations: Z4 sweeper + cron (2026-09-23)

Step **Z4** (`../tasks/comment-to-dm-plan.md` §5). A sweeper, not a publish-path hook — another
session held `schedule.js`/`autopilot.js`/`review.js` at the time. Shared cross-project playbook:
`../../../.claude/comment-to-dm-playbook.md`.

**`lib/social/dm/sync.js`** `syncDmAutomations()` reads the pack board (`listPacks`) and builds
candidates via `candidatesFrom` (Instagram `reel`/`carousel` only, once per `zernioPostId`,
skipping failed posts and packs with no `url`). Per candidate: `resolveScope` decides what the
automation binds to (below); a short `nx` KV lease keyed on the Zernio post id keeps two runs off
one post; a live automation already answering for the post is **adopted**, not recreated; a failed
create is retried on later runs up to `MAX_ATTEMPTS=3`, then recorded `gave-up`; a payload
`validateAutomation` rejects is recorded once and never retried; one post's storage failure is
isolated into `errors` and does not stop the run; the run itself throws only when unconfigured or
the initial `listCommentAutomations` call fails.
**`lib/social/handlers/dm-sync.js`** wraps it: always 200 with `{ok:true, ...summary}` (a summary
reporting `rejected`/`gaveUp`/`errors` is logged via `console.error`, not turned into a failure
response); a thrown error (e.g. the 503 from unconfigured `dmConfig`) becomes that status. Wired
into the existing catch-all — no new function — as `GET|POST /api/social/dm-sync`, gated by
`CRON_SECRET` like the other cron routes; `vercel.json` schedules it `*/5 * * * *`.

**Fixed: no second automation on a retried create.** Zernio's API reference
(https://docs.zernio.com/llms-full.txt) shows nothing on Zernio's side dedupes a retried create:
`x-request-id` is honoured only by `POST /posts`, the comment-automations list response carries no
`postId`, and the documented 409 is only for a duplicate `platformPostId`. So every automation this
sweeper creates is NAMED `merlows-dm <zernioPostId>` (`nameFor`) — a name that does not change when
the post moves from scheduled to published. `liveFor(automations, zernioPostId, scope)` adopts any
live automation whose name matches that, or whose scope (`postId`/`platformPostId`) matches —
checked both before creating and again on the re-list after a `409`. This replaces the "second
automation" finding recorded here earlier today: it was under review, and is now fixed.

**Overlapping runs.** The board and any KV records are batch-read once before the loop. Once a
post's lease is held, its record is read again (`store.get`): a record that has since finished
(state outside `retry`/`waiting`) counts as `raced` and the post is skipped; a record that changed
but is still open means another run touched Zernio in between, so `listCommentAutomations` is
re-fetched before deciding create vs. adopt.

**Scope (`resolveScope`).** A post is named by Zernio's own `postId` only while it is certainly
unpublished: board status not `published`/`posted` AND its scheduled `at` not yet passed. Once
either is true, `getPost` decides — matching Zernio's docs, where `postId` is for a not-yet-
published post and "arms itself when that post publishes", and per-post automations take priority
over account-wide ones. Published with an Instagram media id reported → `{platformPostId}`; still
scheduled → `{postId}`; publishing, failed, no media id yet, or the lookup itself failing → `null`
(the caller waits rather than guessing).

**Waiting.** A `null` scope costs no create attempt: the record is saved `state: 'waiting'` with a
`since` timestamp (kept from the first time it waited, not reset each run). A post still not
nameable `WAIT_LIMIT_MS` (24h) after `since` is given up — `state: 'gave-up'`, reason `'never
nameable by its Instagram media id'` — so it stops costing a lookup every tick.

**Run bounds and order.** `SOCIAL_DM_MAX_PER_RUN` (default 5, floors to 1 on 0/negative/non-numeric)
caps *create attempts* per run — only `created`/`retrying`/`gaveUp` outcomes count against it;
`adopted`/`waiting`/`rejected` don't. At most twice that many posts are examined per run regardless
of outcome. Within a run, never-tried posts go first, then `retry` records, then `waiting` records,
so posts stuck waiting on Zernio can't crowd out new ones. None of this bounds wall-clock time: a
slow Zernio can still walk a run into the function's 300s `maxDuration`. A killed run loses
nothing — records are saved per post, a lease expires on its own, and a lost create is found again
by name on the next run.

**Env:** `SOCIAL_DM` must be exactly `"on"` (trimmed, case-insensitive) — anything else, including
unset, is off. **`SOCIAL_DM=off` stops NEW automations only; it does NOT pause automations already
created** (that kill-all is Z6). `ZERNIO_DM_API_KEY` (separate Sensitive key, no fallback to the
posting `ZERNIO_API_KEY` — missing is a 503 before any network call), `ZERNIO_PROFILE_ID`,
`ZERNIO_INSTAGRAM_ACCOUNT_ID`, `SOCIAL_DM_MAX_PER_RUN` (optional). **KV** (through `lib/kv.js`, so
`KV_PREFIX` applies): `social:dm:auto:<zernioPostId>` — the lasting record (`state`, `automationId`,
`scope`, `attempts`, `since`, `reason`; TTL 180 days, 7 days while `retry` or `waiting`) — plus
`social:dm:auto:<zernioPostId>:lease` (TTL 300s).

**Summary keys** (from `syncDmAutomations`): `enabled`, `candidates`, `pending`, `created`,
`adopted`, `rejected`, `retrying`, `gaveUp`, `waiting`, `busy`, `raced`, `deferred`, plus `errors`
when a post's own storage call fails. `waiting` and `raced` are new since the fix above.

**Tests:** `lib/social/dm/sync.test.js` (42 cases), `lib/social/handlers/dm-sync.test.js`, and the
`dm-sync` cases in `lib/social/handlers/social-router.test.js` (cron auth: no bearer → 401 before
the sweeper runs; right bearer + `SOCIAL_DM` off → 200 `{enabled:false}`, no KV/Zernio call). The
fake Zernio in `sync.test.js` is shaped from Zernio's documented responses — list and create
responses carry no `postId` (only the single-automation GET does); an earlier fake echoed it back
and hid the duplicate-automation bug from every test. Each fix above was sabotage-checked. Full
suite: 1305 tests, 1300 pass, the same 5 long-standing baseline failures (unrelated to this work).

**Reviews:** `code-reviewer` (full review plus two confirmation runs, clear to ship);
`security-auditor` (no findings reachable in this diff); `test-writer` (added edge-case coverage,
including the scope-switch-on-retry case that surfaced the bug fixed above).

**Status: NOT deployed.** Needs `ZERNIO_DM_API_KEY` (Sensitive), `ZERNIO_PROFILE_ID=6ab2985ea77a696ba3a9610f`,
and `ZERNIO_INSTAGRAM_ACCOUNT_ID` set in Vercel, then a deploy. Stays inert even after deploy until
`SOCIAL_DM=on` — turning that on is the go-live decision, step **Z7**.

## Telegram review loop hardened (2026-09-23/24)

The social-autopilot Telegram approve/reject buttons (`lib/automation/handlers/telegram.js`,
`lib/social/pack/review.js`, `lib/social/pack/store.js`, `lib/social/handlers/autopilot.js`,
`lib/social/handlers/digest.js`) had no reviewer check and a save-order race that could silently
undo a Reject. A follow-up pass the next day added an archive stage so a pack nobody answers
does not sit in the queue, or block a work slot, forever. Plan:
`../tasks/telegram-activation-plan.md`.

**Approver check, fail closed.** `isAllowedReviewer` (`telegram.js`) requires the button press to
come from `TELEGRAM_CHAT_ID`'s own chat — with `TELEGRAM_CHAT_ID` unset, nothing is allowed,
since there is then no chat the message could legitimately have been sent to. When
`TELEGRAM_APPROVER_IDS` (comma-separated Telegram user ids) is also set, `from.id` must be in
that list; left unset, anyone in the configured chat may press the button. **Known gap, not
fixed:** a variable that is *set but blank* (`TELEGRAM_APPROVER_IDS=`) splits to `['']`, which
`.filter(Boolean)` reduces to an empty list — the same list as unset — so it is read as "no
allowlist" instead of "allow nobody". Reported as a security Low; left as-is. A refused press
answers "Not authorised to review" and records nothing.

**Decisions live in their own key.** `DECISION_KEY(contentId)` = `social:pack:<id>:decision`,
written exactly once via `recordDecision` (`store.set(key, record, { nx: true })`). Before this, a
decision lived as a field on the pack record itself, and both `decide()` and the worker tick did a
read-modify-write on that whole record: whoever saved last won, so a Reject tapped while a tick
held an older copy of the pack was erased by the tick's own save — the pack then auto-approved on
schedule while Telegram still showed "Rejected — not posting", onto accounts no API can delete a
post from. `SET NX` makes the first decision final in one atomic step instead of two. On success,
`decide()` also re-queues the pack due now (`zadd`s the queue with `score: Date.now()`), so a
decision takes effect on the next tick rather than waiting out a review poll. A pack decided
before the decision key existed keeps whatever decision is on its own record — `withDecision`
layers the key over `pack.review`, and `decide()` refuses to overwrite an existing one.

**The automatic approval is recorded as late as possible, and can still be taken back.**
`stageSchedule` (`autopilot.js`) does not record "auto-approved" the moment the review window
lapses. It records it only after `claimSlots` has already won the pack a place in the day's grid,
immediately before the first `schedulePost` call — so a pack still waiting for a slot stays
rejectable, since nothing about it is public yet. It's recorded the same atomic way a person's
decision is (`recordDecision`), so a Reject pressed at that exact moment races for the same key:
if the Reject wins, the pack's just-claimed grid slots are released (`releaseSlots`) and the pack
is dropped; if the auto-approval wins, the reviewer is told it's too late rather than "not
posting" about a story that's about to go out. If the pass then posts nothing at all — every slot
ends up deferred for lack of tick time, or the first `schedulePost` call fails in a way that
certainly happened before the request could reach Zernio — the auto-approval this pass recorded
is deleted again (`kv.del(DECISION_KEY(...))`), so the pack stays rejectable until a post really
does go out. A doubtful failure keeps the approval instead (see `mayHaveReachedZernio` below). The
"auto-approved, being scheduled now" Telegram note (`announce()` → `closeReviewMessage`) is sent
only once a post has actually reached Zernio, so a kept-but-doubtful approval sends no note either
— the buttons stay live on a story a press can no longer reject (**reported, not fixed**, below).

**`mayHaveReachedZernio` decides kept vs. retracted.** A timeout, a dropped connection or a 5xx
can all arrive after Zernio has already scheduled the post, so only a failure that certainly
happened before the request could land retracts the approval; anything doubtful keeps it and
leaves the retry's own request id to dedupe. `mayHaveReachedZernio(err)` (`autopilot.js`) keeps
the approval for `err.reachedZernio === true`, `err.name` of `AbortError`, `TimeoutError` or
`TypeError`, any `status >= 500`, or a message starting `'Zernio accepted the request'` — what
`schedulePost` throws once `POST /posts` has answered 2xx, including a 2xx whose body then
stalled, dropped or came back empty, which `zernioFetch` reads as `{}` (proven against a real
socket by the security audit). **Open follow-up for the `schedule.js`/`zernio.js` owner, not
fixed here:** nothing in `schedule.js` ever sets `err.reachedZernio = true`, and `zernioFetch`
returns `{}` instead of throwing (with the status) for an unreadable 2xx on a POST — the
message-text match above is a stopgap for both.

**Known gap, not fixed: a Reject after slots were claimed on an earlier tick.** The grid slots a
pack has won live in `SLOTS_KEY`, independent of the decision key. If a pack claimed slots on one
tick, deferred every post for lack of tick time (so its auto-approval was rolled back, per above),
and a Reject is then recorded before the next tick runs, `stageSchedule` sees `reviewState(pack)
.rejected` at the very top of the function and calls `drop()` — a path that does not call
`releaseSlots`. The pack is dropped correctly; the slots it held stay marked taken in that day's
grid until the day rolls over.

**Per-post time budget.** Each `schedulePost` call is given `budgetMs` = whatever the tick has
left, minus a 10s margin (`SAVE_MARGIN_MS`) kept back for saving the pack record once the posting
loop stops. A TikTok post is not started with less than `SOCIAL_TIKTOK_MIN_BUDGET_MS` left
(default 75s): `schedulePost` reserves 30s of whatever budget it's given for the `createPost` call
that follows the media upload, so the 75s floor leaves the upload — reading the file back out of
Blob, then `PUT`-ing it into Zernio's own storage (TikTok won't fetch from our Blob domain) — 45s.
Instagram has no upload leg and floors at 10s (`POST_MIN_BUDGET_MS`) — one JSON call. A slot that
doesn't clear its format's minimum is not started; it stays `deferred` and is offered back on the
next tick under the same request id, so nothing here is retried or double-posted. The post-now
branch (`pack.review.postNow`, used when an approver asks for immediate posting instead of the
grid) applies the identical per-format guard.

**Sensitive packs never auto-approve.** *(Changed 2026-10-01 — this is now true only when
`SOCIAL_REVIEW_HOLD_SENSITIVE=on`; by default sensitive packs auto-approve like any other. See
"Sensitive stories now auto-approve (2026-10-01)" at the end.)* `reviewState` (`review.js`) returns `released: false` —
reason `"sensitive — waiting for a person, never auto-approved"` — for any pack with
`social.sensitive` true, every time the auto-approve window would otherwise release it. A human
approval still releases a sensitive pack; only the clock is blocked.

**A pack with a decision is never held on `requestedAt` alone, and never archived.**
`reviewState` (`review.js`) checks the recorded decision BEFORE `requestedAt`, so a story approved
or rejected in the app before its review message ever went out is released or dropped instead of
held forever — a decided pack skips the send step, so it would otherwise never get a
`requestedAt` for the old check to find. `stageSchedule`'s archive check mirrors this: it archives
only when `!pack.review?.decision`, so a pack someone has already ruled on is never a candidate.

**Unanswered reviews are archived, not held forever.** A pack awaiting review is re-checked every
`SOCIAL_REVIEW_POLL_MS` (default 20 min) instead of every tick; a decision still re-queues the
pack immediately, so this only bounds how soon the auto-approve window's own lapse is noticed, not
how soon a real decision takes effect. If no decision arrives within `SOCIAL_REVIEW_ARCHIVE_HOURS`
(default 72h) of the review request — or, for a request that was never delivered, of the render
finishing — `store.js`'s `archive()` parks the pack: status `'archived'`, taken out of the queue,
every asset kept, `archivedAt`/`archivedReason` recorded, and a Telegram reply via `noteArchived`
on the original message. Because the archive and the decision read are two separate steps,
`stageSchedule` re-reads the decision key right after `archive()` returns and re-queues the pack
at once if a decision raced in between — otherwise it would sit invisible, since nothing else ever
looks at an archived pack. This is Clifton's decision from 2026-09-24: never drop a paid-for pack —
script, voice, images and renders already bought — for want of an answer. A decision on an
archived pack — from the Telegram buttons (still live on the original message) or the app's
`POST /api/social/autopilot/review` route — is the only way back into the queue for it, so
`decide()` tries the re-queue `zadd` twice for an archived pack (once for any other). A second
press on a pack already decided is refused the normal way ("already approved"/"already rejected")
but still re-queues it again, in case the first press's own re-queue was the one that got lost.
`stageArchived` (`autopilot.js`) then either restores it to `rendered` (stamping `restoredAt`) or
drops it on reject; with no decision recorded when it's re-queued for some other reason,
`stageArchived` just takes it off the queue again and leaves it archived. Restoring resets the
grid-slot deadline: `stageSchedule`'s "gave up waiting for a slot" clock (`SOCIAL_UNSLOTTED_MAX_HOURS`,
default 72h — a separate knob from the review-archive one above) measures from `restoredAt` when
it's set, not from the pack's original render. **Warn:** anything that ever prunes the
`merlows-social` Blob store must exclude archived packs, or a pack approved after archiving comes
back with its media already deleted.

**Preview buttons, and the message closes after a decision.** `previewButtons` adds a row of URL
buttons under Approve/Reject: Reel, TikTok, and Carousel — whichever of
`renders.videos.reel.url`, `renders.videos.tiktok.url` and `renders.stills.cover` exist, each
stripped of Blob's `?download=1` so it plays instead of downloading. There is no Board button: the
app has no URL that opens the Autopilot tab directly (`switchTab` is client-side state, never
reflected in the page's own URL), so there is nothing a Telegram URL button could point at.
`closeReviewMessage` removes the Approve/Reject buttons (the preview links stay) and posts who
decided and from where. It runs after a Telegram button decides a pack (`telegram.js`) and after
the app's `POST /api/social/autopilot/review` route decides one (`autopilot.js`) — so the buttons
never stay live on a story that's already been ruled on, from either side.

**Legacy in-record decisions are still honoured.** `withDecision` lays the decision key over
`pack.review`, so a pack decided before the decision key existed keeps whatever decision is on its
own record — `decide()` refuses to overwrite it.

**Digest.** `buildDigest` (`digest.js`) merges every listed pack with its decision key before
counting anything, so an approved-but-unslotted pack isn't miscounted as still awaiting review.
The "waiting on your review" line says what will actually happen, not a blanket "auto-approves":
routine stories auto-approve after `autoApproveMinutes` (from `SOCIAL_REVIEW_AUTO_MINUTES`)
minutes, sensitive ones never do *(changed 2026-10-01: only while `SOCIAL_REVIEW_HOLD_SENSITIVE=on`;
otherwise the line says they all auto-approve after N min)*, and — when the timer is 0 — the line says nothing goes out
until a decision is made. A "📦 N archived without a decision" line counts every archived pack on
the board with no decision recorded, not just ones archived in the last 24h: an archived pack can
wait indefinitely, and the digest is the routine place a person hears about it. The digest handler
(`digest.js`'s default export) also catches an archived pack whose decision never made it back
into the queue: before sending, it re-`zadd`s every archived pack that already has a decision
recorded, and its problems-first line — ahead of everything else in the message — reads "🟠 N
archived stor(y has|ies have) a decision that was never acted on — re-queued now; the next
autopilot run acts on it".

**Board support is pending, not done.** `public/index.html` has no handling for `archived` packs
yet — no chip, no Approve / Approve-and-post-now / Reject actions for them. That's being added by
the concurrent social-autopilot session, not this one.

**Reviews:** `code-reviewer` (full review plus two confirmation runs, clear to ship);
`security-auditor` (full review plus two confirmation runs — the last one's remaining finding was
the `mayHaveReachedZernio` gap above, fixed after that final run and verified with its own probe
script against a real socket, which flipped all three post-headers cases from RETRACTED to KEPT).

**Tests:** `api/automation/telegram.test.js`, `lib/social/pack/review.test.js`,
`lib/social/pack/store.test.js`, `lib/social/handlers/autopilot.test.js`,
`lib/social/handlers/digest.test.js`. Full suite is green apart from the same 5 long-standing
baseline failures, unrelated to this work.

**Status: NOT deployed — and, correcting what this section said before, not because the env vars
are missing.** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET` and
`TELEGRAM_APPROVER_IDS` **are** set in Vercel Production — verified by name with `vercel env ls`
on 2026-09-23 — and `SOCIAL_REVIEW_AUTO_MINUTES` is `0` there. What's actually true: none of this
code is deployed yet, and the webhook has never been registered (`setWebhook` has not been run
against it), so the live endpoint still answers 503 to every request until the next deploy.

**Reported, not fixed, beyond the two gaps above:** a `SET NX` write that succeeds server-side but
whose response is lost in transit could be retried by the Upstash client and misread its own win
as a loss; `closeReviewMessage` and `noteArchived` call `fetch` with no timeout; `TELEGRAM_CHAT_ID`
must be the numeric chat id — an `@channelname` never matches a callback query's numeric
`chat.id`; the Telegram path passes `jobId` straight from `callback_query.data` into `decide()`
with no shape check, unlike the app's `/review` route, which requires `contentId` to match
`^[A-Za-z0-9_-]{1,80}$`; an approved auto-approval kept after a doubtful failure is never
announced in Telegram (buttons stay live; a press is refused "already approved"); post-now returns
at the first format that doesn't fit its budget instead of skipping it (can starve if
`SOCIAL_TICK_BUDGET_MS` is set below ~85s); `stageArchived`'s no-decision stop leaves the claim's
lease on the record; the digest's waiting line doesn't distinguish undelivered review requests.

---

## Zernio: two wrong API shapes, found by the first real posts (2026-09-23/24)

The first live pack posted one Reel and nothing else. Both causes were **shapes taken from
documentation and never checked against a real response**, which is the same mistake as the
Composio tool slugs and the TikTok privacy-level objects before them. Zernio makes it expensive:
`POST /posts` **silently ignores unknown keys**, so a wrong field name is not an error, it is a
post that goes out wrong. Tests written against the guess passed the whole time.

### 1. Instagram post type — `platformSpecificData.contentType`, and only for a Story

`createPost` was sending `platforms[0].instagram = { postType: 'reel'|'story'|'carousel'|'post' }`.
No such field. Verified at docs.zernio.com/platforms/instagram — Instagram infers the type from
the media and takes only the Story as an explicit flag:

| what you send | what Instagram makes |
|---|---|
| one video | Reel |
| one image | feed post |
| several media items | carousel |
| `platformSpecificData: { contentType: 'story' }` | Story |

So **only `format === 'story'` sends anything**. The consequence of the old code was that every
Story published as a PERMANENT FEED POST — the opposite of a story's whole point, and
unrecoverable, because neither platform's API can delete a post.

Other fields on that object worth knowing before reaching for one: `shareToFeed` (Reels),
`isAiGenerated` (our images are AI-generated and Instagram has a label for it — **not currently
set, worth a decision**), `firstComment` (the only place a link can go, since captions have none),
`collaborators`, `locationId`. Stories reject `isPaidPartnership` and `locationId` outright.

### 2. TikTok media must be uploaded to Zernio first (error 40002)

TikTok fetches media by `PULL_FROM_URL` and refuses any domain not verified against the calling
app, so our `*.public.blob.vercel-storage.com` URL failed every TikTok post:

    code 40002: Please review our URL ownership verification rules

We cannot verify that domain — it is not ours, and **the app is Zernio's own shared
TikTok-for-Business app**, not a Merlows-owned one, so there is no app of ours to be "in sandbox"
and nothing for us to register. The route is `rehostMedia` in `lib/social/platforms/zernio.js`:
`POST /media/presign` → `PUT` the bytes to the returned `uploadUrl` (no Authorization header; the
signature in the URL is the credential) → post the returned `publicUrl`. Instagram is unaffected
and still posts the Blob URL directly.

**A Zernio upload is deleted after 7 days** unless a post referencing it has published by then —
`UPLOAD_TTL_MS`. `schedulePost` refuses a TikTok slot further out than that. This matters more now
that a pack can be `archived`: an archived pack approved later than its upload window needs a
fresh upload, so `rehostMedia`'s returned `expiresAt` has to be re-checked wherever the upload
eventually moves to.

### What the review rounds changed, because the first version was worse than it looked

- **The deadline covered time-to-headers only.** `fetch` resolves when response headers arrive, so
  clearing the timer there left `arrayBuffer()` pulling a whole video with no clock on it. Both
  stall tests were green because their fake never resolved the fetch at all. `withDeadline(what,
  ms, fn)` now owns the entire leg. **A test whose fake never resolves the fetch cannot tell you
  anything about the body.**
- **A killed function is the double-publish path.** A stall past the platform limit is not a thrown
  error, it is a kill — so `stageSchedule` never records posts already sent to Zernio, the next
  tick re-plans the story into a different slot, `requestIdFor` changes, Zernio does not dedupe,
  and it posts twice. This is why the media legs need deadlines derived from the CALLER's
  remaining tick budget (`budgetMs` on `schedulePost` → `rehostMedia`), not a fixed constant.
  `schedulePost` reserves 30s of it for the `createPost` that follows; the caller's floor for
  starting a TikTok post must stay well above that or the two cancel out.
- **The size cap ran after `arrayBuffer()`**, so it measured an OOM rather than preventing one. Now
  refused on declared `content-length` first and enforced chunk by chunk while reading — which
  also covers an honest length on a compressed body, since `content-length` counts compressed
  bytes and undici decompresses transparently.
- **`uploadUrl` is host-allowlisted (`UPLOAD_HOSTS`) and `redirect: 'error'`**, because we send the
  whole file there unauthenticated; a redirect is followed with method and body intact.
  `publicUrl` is deliberately https-checked but NOT host-restricted — it is only handed back to
  Zernio, the host patterns have never been seen in a real presign response, and enforcing an
  unverified guess would fail 100% of TikTok posts after the upload was paid for. It warns
  instead, so the first live post reveals the real host.

### Still unverified against a live response

The presign contract itself — request `{filename, contentType, size}`, response
`{uploadUrl, publicUrl}` — is pinned only by fixtures. **Capture one real presign response
read-only before relying on it**, the way `scripts/zernio-dm-spike.mjs` does. Nothing else in this
section is a guess any more.

## Deployed, and the board learns `archived` (2026-09-24)

**Deployed 05:29 UTC as `dpl_95uSMfKeV7oEfBBGzDmTJ2fSo7iF`** (Ready, production, merlows.vercel.app
aliased to it). The first `vercel --prod` returned "Not authorized" and the retry with
`--scope clifton-ai-team` went through — the usual account drift, recorded again here because it
costs someone ten minutes every time. Proof the new build is serving: the Telegram webhook answers
**401** without a secret and with a wrong one, where it answered **503** before.

This shipped five sessions' work at once: the Zernio post-type and TikTok upload fixes above, the
Telegram/review hardening, the comment-to-DM sweeper, and the archive behaviour.

**Still unverified in production, because nothing has posted through the new build yet:**
1. **A Story must land in the story ring and NOT in the grid.** That is the only real proof of the
   post-type fix; everything else is inference.
2. **The first TikTok reveals Zernio's real presign host.** Grep the runtime logs for
   `presign public URL is on an unrecognised host` — if it appears, add the host to `UPLOAD_HOSTS`.
3. `answered HTTP NNN but its body could not be read` means a request REACHED Zernio and the reply
   was unreadable. Check Zernio's post list before retrying that pack by hand: the post may exist.

### Two follow-ups from the security audit's final run

- **`schedule.js`** throws its per-platform failure with `{ reachedZernio: true, zernioPostId }`.
  By then `POST /posts` has answered 2xx, so Zernio already holds a post, and a blind retry makes a
  second one that no platform API can delete. `mayHaveReachedZernio` reads the flag; matching the
  message text was the fragile fallback.
- **`zernioFetch`** no longer turns an unreadable 2xx body into `{}` and calls it success. For
  POST/PUT/PATCH it throws with `status` and `reachedZernio: true`; GET, HEAD and DELETE stay
  tolerant, because an empty body is legitimate there and failing them would break
  `deleteCommentAutomation`.

### The board (`public/index.html`)

`archived` is offered **Approve / Approve & post now / Reject** on the same conditions as
`rendered` (no decision yet, no posts already sent). Without it the archive is unreachable from the
only screen that shows it. **Retry stays failed-only** — the server refuses it for anything else.

Its chip is a deeper amber than "awaiting review", on a deliberate scale: **amber = a person must
act, slate = nothing more will happen, red = something broke.** It must never read as `dropped`.

`autopilotStageIndex('archived')` returns `rendered`'s index so the pips show real progress, with a
caption that says "built and kept, waiting on your decision" rather than a step number. Archiving
exists precisely because the work is finished and kept; every pip off would have said the opposite
about a pack already paid for in full.

### Watch out for

- **A flaky test is worse than a failing one.** The first version of the new timeout tests used
  millisecond-tight budgets and failed about one run in twelve. Loosened, then run ten times clean.
- **Blob retention now constrains archiving.** An archived pack is only recoverable while its
  renders are still in `merlows-social`. Nothing prunes that store today; anything that ever does
  must exclude archived packs, or the archive hands back a pack whose assets are gone.
- **Deferred, not moved: the TikTok rehost still happens at schedule time.** Moving it to render
  time (cheaper retries, reviewer preview on the same URL) needs the `expiresAt` re-check, because
  an archived pack can be approved long after the 7-day upload window closes. `rehostMedia` already
  returns `expiresAt` and nothing reads it yet.

---

## Social Autopilot: per-production cost tracking (2026-09-24)

Every pack now records what it actually cost to produce, stage by stage, so the digest and the
board can show real spend instead of a guess. `lib/social/pack/cost.js` is the single source of
the rates and the math; `lib/social/handlers/autopilot.js` calls it at each stage.

**Two kinds of figure, and the record says which is which.** OpenRouter returns `usage.cost`
(USD) on its chat completions, so the **script** and **image** calls are charged at what
OpenRouter actually billed — `estimated: false`. The speech endpoint returns audio, not a bill,
and the render sandbox reports no CPU time, so **voice** and **render** are always priced from
the rates in `cost.js` and marked `estimated: true`. A response with no usage block at all (should
not happen, but is handled) is charged nothing and still marked estimated, so a zero is never
passed off as a measured figure.

**Rates** (`rates()` in `cost.js`, re-read on every call so an env change takes effect without a
redeploy): script fallback (used only when OpenRouter omits `usage.cost`) $0.30/M input tokens and
$2.50/M output tokens (Gemini 2.5 Flash pricing), image fallback $0.03/image, voice $15/M
characters (Fish Audio S2.1 Pro's published price — a `:free` TTS model is always $0), one
rendered still (a carousel slide or story card) $0.0017 (measured 2026-09-24, ~$0.012 for seven
stills), and a video render $0.0037/minute the sandbox is alive — wall time, not CPU time, because
the sandbox bills until the next poll stops it, so a slow poll costs money (measured 2026-09-24,
~$0.035 over a ~9.5-minute-alive sandbox). Each is overridable: `SOCIAL_COST_SCRIPT_IN_PER_M`,
`SOCIAL_COST_SCRIPT_OUT_PER_M`, `SOCIAL_COST_TTS_PER_M_CHARS`, `SOCIAL_COST_IMAGE_USD`,
`SOCIAL_COST_STILL_USD`, `SOCIAL_COST_VIDEO_USD_PER_MIN`.

**Where it's written.** `addCost(cost, stage, charge)` returns a new `pack.cost` record shaped
`{ script: {usd, estimated}, voice, images, render: {usd, estimated}, totalUsd }` — `render` folds
together both the per-still and per-video-minute charges, since both happen in the render stage.
`autopilot.js` calls it after scripting (`stageScript`), after voicing (`stageVoice`), after
imaging (`stageImage`), after each still is rendered, and after each video cut's poll resolves
(charged for the whole time the sandbox was alive, whether the render succeeded, failed, or
expired). **A failed stage still keeps its spend**: `withCost(err, pack, stage)` attaches
`err.cost` to a thrown error, and the tick's catch block (`if (err?.cost) progress.cost =
err.cost`) saves it onto the pack record before marking the pack failed — money already spent
survives the failure that stopped the pack going further.

**Board.** `GET /api/social/autopilot/packs` now returns `cost` (`p.cost ?? null`) on every pack
alongside `voice`/`error`/`updatedAt` — packs produced before this shipped have no `cost` field at
all, not a zero one.

**Digest.** `buildDigest` (`lib/social/handlers/digest.js`) calls `summariseCosts(finished,
failed)` (`cost.js`) over every pack whose `renderedAt` falls in the trailing 24h window. It
returns `{ stories, untracked, totalUsd, averageUsd, byStage, failedUsd, failedStories }`:
`stories` is how many finished packs actually carry a `cost` record; `untracked` is
`finished.length - stories` — packs from before this change, which the average deliberately
excludes rather than silently treating as free; `failedUsd`/`failedStories` sum spend on packs
that failed or were dropped in the window, since money paid for a story that will never go out is
still worth seeing. `costLines()` renders the Telegram block, headed "💷 *Production cost*": total
+ per-story average, a `· script $x · voice $x · images $x · render $x` breakdown, an
"N produced before cost tracking began, not counted" line when `untracked` is nonzero, a wasted-
spend line when `failedUsd` is nonzero, and a closing note that voice/render are estimates while
script/images are OpenRouter's billed amounts. The whole block is omitted when there is nothing to
show (`!cost.stories && !cost.untracked && !cost.failedUsd`).

No new env vars beyond the six rate overrides above — see `.env.example`.

## Social Autopilot: board switch for auto-approve minutes (2026-09-24)

**Status: deployed 2026-09-24** with the cost tracking above (Vercel deployment `84idSSdrtXeQJtNB35Q1EQprEh3y`, aliased merlows.vercel.app). Verified live: the served page contains the auto-approve controls, and `GET /api/social/autopilot/auto-approve` returns 401 when signed out. The switch starts Off; production's `SOCIAL_REVIEW_AUTO_MINUTES` is 0.

A KV-backed switch on the Autopilot board lets an operator turn auto-approve on or off, and set
its window, without a redeploy — `SOCIAL_REVIEW_AUTO_MINUTES` only takes effect on deploy, which
is no use mid-incident (same reasoning as the existing pause flag).

**Storage.** `lib/social/pack/review.js`: `AUTO_APPROVE_KEY = 'social:autopilot:auto-approve'`,
written/read through `lib/kv.js`'s `kv` (so `KV_PREFIX` applies, same as every other social key).
The stored value is `{ minutes, updatedAt }`, where `0` means off. `AUTO_APPROVE_DEFAULT_MINUTES`
is 120 — used when the board switches auto-approve on without specifying minutes.
`AUTO_APPROVE_MIN_MINUTES` (5) and `AUTO_APPROVE_MAX_MINUTES` (1440, i.e. 24h) bound the window:
under 5 minutes isn't a review, and over a day is really "off".

**Precedence.** `autoApproveMs()` reads `boardMinutes ?? process.env.SOCIAL_REVIEW_AUTO_MINUTES ??
0` (the last default was 60 until 2026-09-24; with the env var unset a KV blip then turned
auto-approve ON), so once the board's value has been loaded it overrides the env var entirely (including
overriding it to a non-zero value when the env var is `0`, and vice versa). `loadAutoApprove(store
= kv)` is what loads it — called once at the start of every autopilot tick and once at the start
of building the digest, so every decision made within one run sees a single consistent value. A
KV read failure, or a stored value that fails `validMinutes` (not `0` and not a whole number in
range), falls back to the env var rather than an instance's previously-read value — and with the
env var at `0` or unset, a KV blip fails towards "a person decides," never towards posting
unreviewed. `autoApproveSetting()` reports `{enabled, minutes, source: 'env'|'board'}` for the
board's status display and the endpoint below.

**Endpoint.** `GET|POST /api/social/autopilot/auto-approve`, dispatched inside the existing
`api/social/[...slug].js` catch-all (no new function), gated the same as the rest of `/api/social`
— an admin or content session. `GET` returns `loadAutoApprove()`'s result. `POST` takes
`{ enabled: boolean, minutes?: number }`: `enabled: false` stores `0`; `enabled: true` with no
`minutes` uses the 120-minute default; a `minutes` value outside 5–1440 on an `enabled: true`
request is rejected with 400. `setAutoApprove()` (`review.js`) does the validation and the KV
write, then calls `loadAutoApprove()` again so the response reflects what was actually stored.

**Sensitive stories are still never auto-approved, whatever this switch says.** *(Changed 2026-10-01:
only while `SOCIAL_REVIEW_HOLD_SENSITIVE=on`. By default the board switch now covers sensitive
stories too; the endpoint and the board note report `holdSensitive`. See the last section.)* The board setting
only changes the *window* a routine story waits before release; `reviewState()` in `review.js`
still refuses to release a pack with `social.sensitive` true on the clock, board switch or not —
only a person can approve one of those.

**Board UI** (`public/index.html`, Autopilot tab): a button (`#autopilotAutoBtn`,
`toggleAutopilotAutoApprove()`) reading "Auto-approve: ON (120 min)" / "Auto-approve: OFF", next to
a minutes `<select>` (`#autopilotAutoMinutes` — 30/60/120/240/480, `changeAutopilotAutoMinutes()`)
and a status note (`#autopilotAutoNote`). `loadAutopilotAutoApprove()` GETs the setting on load;
`saveAutopilotAutoApprove(enabled, minutes)` POSTs a change and toasts the result. **Turning it ON
asks for confirmation first** (`window.confirm`): "Turn on auto-approve? Routine stories nobody
has decided on will post to the live Instagram and TikTok accounts N minutes after the review
request. Sensitive stories still wait for you. Posts cannot be deleted through the API." *(Changed
2026-10-01: that sentence is shown only when `holdSensitive` is on; otherwise the prompt says every
story, sensitive ones included, will post.)* Turning it
off, or just changing the minutes while it's already on, does not prompt.

No new env vars for this feature — it reuses the existing `SOCIAL_REVIEW_AUTO_MINUTES` as the
fallback (see the corrected Telegram Bot section above).

## The TikTok upload moved to render time (2026-09-24)

The video is now uploaded into Zernio's storage as soon as every cut renders, not when the post
is scheduled. A retry is then free, and Approve → published is one API call instead of a whole
file transfer across the Atlantic.

**What archiving forced.** A Zernio upload dies 7 days after it is MADE, and an archived pack can
be approved days later. So the question at schedule time is never "is this upload alive now" but
**"will it be alive when this post PUBLISHES"** — `uploadFor(pack, url, { publishesAt })` compares
against `Math.max(publishesAt, now)` plus `UPLOAD_REFRESH_MARGIN_MS` (24h), and `schedulePost`
uploads again when it will not. Storage is `pack.uploads[<source blob url>]`, one entry per pack:
`videos.tiktok.url` is written once and never re-rendered once set, so the key is stable.

Pieces: `ensureTiktokUpload` (schedule.js, called from `stagePollRenders`), `uploadFor`,
`schedulePost`'s reuse-or-refresh loop, and `takeUpload` (autopilot.js).

**The pre-upload is BEST EFFORT and must stay that way.** `stagePollRenders` catches and logs;
`schedulePost` still uploads inline if it did not happen. Throwing there would discard a finished
story — script, voice, images and both renders, all paid for — because a pre-fetch did not fit in
a tick.

### Three traps found in review, all of them the same shape

1. **"No budget given" and "given, and there is none left" are OPPOSITE instructions.** A
   `budgetMs > 0 ? budgetMs : DEFAULT` test reads a spent budget as absent and hands the FULL 90s
   default to the one caller that must not start — which is how a tick gets killed, and a killed
   tick loses the render costs just tallied. `rehostMedia` now keys on `undefined`/`null`; a
   non-positive number reaches `withDeadline` and is refused. `ensureTiktokUpload` declines early.
2. **A fresh upload must reach the CALLER.** `schedulePost` returns it as `upload`; `takeUpload`
   lifts it onto `pack.uploads` and strips it from the post record, because `pack.posts` is the
   published history and an expiring URL does not belong in it. Every patch in `stageSchedule`
   that saves `posts` must also save `uploads`, including `Object.assign(err, { posts, uploads })`
   and the tick's catch.
3. **A guard that cries wolf gets silenced.** The structural test over `stageSchedule` first
   flagged `stageConfirmPosts`, which never uploads; it is now scoped to the one function.

### Watch out for

- **Two of five sabotage checks did not go red first time**, and one of those was a `sed` that
  silently mangled on a `||` — which looks exactly like a check that passed. **Print what the
  sabotage changed, not just the test result.** The gaps that hid behind them: nothing caught the
  loops simply not calling `takeUpload`, and nothing tested `rehostMedia`'s own budget layer
  because `ensureTiktokUpload` refuses first. Both are now covered.
- `uploadFor` re-checks staleness but NOT scheme or host. Safe by construction — the only writers
  are in this file, from a `publicUrlTarget`-validated result, and no route accepts an `uploads`
  field — not safe by code. The invariant is written above the function; anything that ever merges
  into `pack.uploads` must validate.

## Sensitive stories now auto-approve (2026-10-01)

**Status: NOT deployed.** Behaviour change on Clifton's instruction. Why: the articles are checked
before they are published, so a story the script flags `social.sensitive` no longer needs a
separate permanent hold.

- **New env var `SOCIAL_REVIEW_HOLD_SENSITIVE`**, read by `holdSensitive()` in
  `lib/social/pack/review.js`. Default **off** (unset or anything else). Exactly `on` (trimmed,
  case-insensitive) restores the old hold: a sensitive pack is never released on the clock. It is
  env only, so it needs a redeploy, and **the board cannot switch it**.
- **With it off**, `reviewState` releases a sensitive pack on the same clock as a routine one: the
  board switch (KV `social:autopilot:auto-approve`) or `SOCIAL_REVIEW_AUTO_MINUTES`, once the review
  request was delivered. Reason string: `auto-approved after N min`. With it on, the reason is
  still `sensitive — waiting for a person, never auto-approved`.
- **Unchanged:** a recorded Reject always wins (checked first in `reviewState`); a human Approve
  still releases; `SOCIAL_REVIEW_GATE=sensitive` still means only flagged packs are sent for
  review; auto-approve stays off when the minutes are 0.
- **Telegram review message** (`reviewMessage`): the "Sensitive: this one waits for a person and
  never auto-approves." line appears only when the pack is sensitive AND the hold is on. Otherwise
  any pack, sensitive or not, gets "Auto-approves in N min if nobody replies." when auto-approve is
  on. The `SENSITIVE` tag next to the category stays.
- **Digest** (`digest.js`): `buildDigest` now returns `holdSensitive`. The "waiting on your review"
  line says "N sensitive never do" only when the hold is on; otherwise it says "they auto-approve
  after N min".
- **Board / endpoint:** `autoApproveSetting()` (so `GET|POST /api/social/autopilot/auto-approve`)
  now returns `{ enabled, minutes, source, holdSensitive }`. In `public/index.html` the note under
  the switch and the turn-on confirmation say "sensitive ones included" when `holdSensitive` is
  false, and keep "Sensitive stories still wait for you" when it is true.
- **Consequence to know:** with the board switch on, a sensitive story now reaches the live
  Instagram and TikTok accounts with no human decision, and neither platform's API can delete a
  post. The control is now the pre-publication article check, not this gate.
- To go live: deploy. No env change is needed for the new default; set
  `SOCIAL_REVIEW_HOLD_SENSITIVE=on` and redeploy to go back to the old behaviour.

## The posting ceiling now binds post-now too, and the ramp actually advances (2026-10-05)

Two faults found while answering "how much are we posting per day".

**1. The launch ramp never advanced.** `SOCIAL_LAUNCH_DATE` was never set, so `weeksLive()`
parsed `undefined`, got NaN and returned 0 — pinning `capsFor` to RAMP week 1 (9 posts/day)
for ever. Set in production to **2026-09-23**, the day the first social posts actually went
out. Ramp: 9/day → 13/day now, 17/day (the full grid) from **2026-10-14**. It is an env var, so
it only takes effect on a deploy.

**2. "Approve & post now" walked straight past the ceiling.** `planDay` enforced the cap by how
many grid times it considered, checking `used[format@time]` — and a post-now post has no grid
time, so it counted against NOTHING. A day could take a full grid on top of a manual batch:
production did **24 posts on 24 September and 23 on the 27th against a ceiling of 9**. The
mechanism that exists to stop a quiet account bursting through an API was being bypassed by the
normal human workflow, while the scheduled path it governs stayed throttled.

Now: post-now books into the same day record under `format@now-<n>` (a time no grid slot uses),
`planDay` counts every `format@…` key toward the cap, and `spentToday`/`claimImmediate` share
one pool with the grid. Pieces: `claimImmediate`, `spentToday`, `immediateAssignments({remaining})`
in schedule.js; the `spent`/`added` counters in `planDay`.

### Three traps, each caught by a review round the previous round's tests had endorsed

1. **A retry re-booked what the pack already held.** A post-now pass ending early is NORMAL —
   TikTok goes first and needs 75s of tick. `claimImmediate` now reads the pack's OWN bookings
   (`format@now-*` keyed to its contentId) and grants those without a ceiling check. Without it
   one story ate both of the day's two TikTok slots, and once the ceiling filled, `remaining`
   read 0 for a format the pack itself was holding — so that format was dropped and never posted.
2. **`postNow` IS NOT ON THE PACK.** It lives in the decision record, which `decide()` writes
   once with SET NX and never edits, and `stageSchedule` spreads that record over `pack.review`
   on every tick (`withDecision`). So patching `review.postNow: false` is undone immediately.
   The hand-off to the grid uses a TOP-LEVEL `postNowHandedToGrid` flag, which `withDecision`
   does not overlay and `savePack({ ...pack, ...patch })` persists. **Anything that needs to
   outlive a tick must not live under `review`.**
3. **A deferred format must be re-routed or it is lost.** Advancing after a partial post-now
   takes the pack to `slotted` and the grid never sees it. It now STAYS at `rendered` with the
   flag set, and the grid books the remainder at a real slot time.

### Watch out for

- **A test can be green against code that cannot work.** The first version of the post-now tests
  put `review: { postNow: true }` straight on the pack record with no decision key — a shape the
  real approve flow never produces — so they passed against a fix the decision record undid on
  the next tick. Rewritten to stub `DECISION_KEY` as `decide()` writes it and to run TWO ticks.
  Reverting the source to the broken version now takes the suite from 0 failures to 2; before,
  it stayed green. **Older tests at autopilot.test.js:2083 and :3639 still use the unrealistic
  shape** — harmless, but they do not prove the production path.
- **A sabotage that does not apply looks exactly like a passing check.** Two of four `sed`
  mutations silently failed here, one of them on `||` in the pattern (use a different delimiter,
  e.g. `s@...@...@`). Always print a before/after match count, not just the test result.

## Social spend cuts (2026-10-13)

Three changes to cut OpenRouter and fal spend. Plain-language reasons are in the code comments.

- **One generated still per story by default.** `STILLS_PER_PACK` in `lib/social/pack/images.js` now defaults to 1 (was 2); the other key points reuse the hero. `SOCIAL_STILLS_PER_PACK=2` restores the old behaviour (env only, needs a redeploy). `imagePack` also takes a `stills` option. With NO hero the pack depends on its stills, so one spare brief is offered: if the first image fails, the next is tried, and it stops as soon as one works.
- **Default image fallback chain is two models**: `google/gemini-3.1-flash-lite-image`, then `google/gemini-2.5-flash-image`. `google/gemini-3.1-flash-image` is no longer in the default chain (it is still a valid slug for `SOCIAL_IMAGE_MODELS`, the hero picker and `ALLOWED_MODELS` in `lib/social/handlers/image.js`). Supersedes the older notes above that call 3.1-flash-image the primary model.
- **The fal.ai Kling video path is off.** `startVideoGeneration` in `lib/social/media.js` throws unless `SOCIAL_LEGACY_VIDEO=on`. "Generate Kit" used to start two clips per click and the autopilot never posts them (it renders its own video in Remotion). `FAL_KEY` is not set in production, so those calls were failing anyway.

Not changed: the render sandbox stays alive ~9.5 minutes because the autopilot cron runs every 10 minutes and a finished render is only noticed on the next tick (about $2/month). Polling sooner means a faster cron, with overlapping ticks and faster retry exhaustion as the risk.

## Two OpenRouter keys: articles vs social media (2026-10-22)

Clifton issued separate OpenRouter keys so social spend cannot drain the article budget.

- **`OPENROUTER_API_KEY`**: articles and hero images. Covers `run.js` (article LLM), `revise.js`,
  `llm-proxy.js`, `generateImageFast` (automation and backfill heroes), `/api/social/image` (the
  Generator's hero card, despite its path), plus the social TEXT calls (`build-pack.js` scripts,
  `generate.js` captions).
- **Daily health check** (`connections.js`, 06:00 cron): `openrouter` probes `OPENROUTER_API_KEY`
  and `openrouterSocial` probes `MERLOWS_OPENROUTER_KEY`, both via `GET /api/v1/key`. A rejected
  key sends a Telegram alert. An unset key is skipped silently, like every other platform.
- **`MERLOWS_OPENROUTER_KEY`**: social images and voice-over. Covers autopilot stills
  (`image-client.js`), social-kit images (`generateImage` and its `craftImagePrompt` leg) and
  `voice.js`. Read via `socialOpenRouterKey()` in `lib/social/media.js`, which throws
  "MERLOWS_OPENROUTER_KEY is not configured". There is deliberately **no fallback** to the article
  key.
- `generateWithFallback` takes an `apiKey` option and defaults to `OPENROUTER_API_KEY`, so any new
  hero caller is billed to the article key unless it passes the social key.
- `SOCIAL_TTS_API_KEY` is retired and was deleted from Vercel.
- The WordPress theme's AI chat (`wordpress-theme/merlows/inc/ai-chat.php`) also reads a constant
  named `MERLOWS_OPENROUTER_KEY`, from `wp-config.php`. That is a separate runtime and setting:
  changing the Vercel variable does not change the chat's key.
