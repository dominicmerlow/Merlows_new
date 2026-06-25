# MERLOWS Content Generator — Claude Context

## Architecture
- **Single-file app**: entire UI lives in `index.html` (inline JS/CSS). No build step.
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
