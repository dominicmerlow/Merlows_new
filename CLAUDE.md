# MERLOWS Content Generator — Claude Context

## Architecture
- **Single-file app**: entire UI lives in `index.html` (inline JS/CSS). No build step.
- **No local dev server**: verify by deploying — `vercel --prod --yes`. Never run preview_start for this project.
- **ES Modules**: `"type": "module"` in package.json; all imports must use `.js` extension.
- **KV persistence**: `@vercel/kv` for all data. Env vars: `KV_REST_API_URL`, `KV_REST_API_TOKEN`.

## Deployment
- GitHub auto-deploy is **disabled** (`"github": {"enabled": false}` in vercel.json).
- Always deploy manually: `vercel --prod --yes` from repo root.
- Vercel Hobby plan: **12 serverless function limit** — do not add new files under `api/`.
- Production URL: https://merlows.vercel.app

## Vercel Routing (Critical)
- All automation routes handled by `api/automation/[...slug].js` (single catch-all).
- In non-Next.js Vercel: slug key is `req.query['...slug']` (three literal dots), NOT `req.query.slug`.
- Multi-segment paths arrive as a **slash-joined string** (e.g. `'rules/abc'`), not an array — always `split('/')`.
- **Never create** subdirectory handler files (`api/automation/rules/index.js` etc.) — they intercept the catch-all even if listed in `.vercelignore`.
- Handler logic lives in `lib/automation/handlers/` (doesn't count toward function limit).

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
