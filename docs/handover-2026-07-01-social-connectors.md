# Handover — Social Connectors, Multi-Account (Composio) & Media Models

**Date:** 2026-07-01
**Applies to:** any duplicate of the Merlows/Vance content-generator (same
`lib/social/*` + `api/social/[...slug].js` architecture). Paths below are
relative to the content-generator root. Where a sibling project differs
(deploy team, Hobby vs Pro), it's called out.

---

## 0. TL;DR

This session did three things to the **social distribution** module. The
kit→queue→cron→scheduler architecture was **not** changed — only the *posting
layer* and *media-model selection*:

1. **Video model is now env-swappable** (was hard-coded to fal.ai Kling).
2. **Multi-account posting via Composio** — new backend, deployed but **dormant**
   (safe: falls back to the existing single-account env-var adapters until a
   valid Composio key + connected accounts exist).
3. **Cron retry loop capped** (was retry-forever).

All verified: `node --check` on every changed file, `@composio/core` installs +
imports, test suite unchanged at its baseline, prod smoke-tested.

---

## 1. Context you need first

- **Single-file UI:** the whole front end is `index.html` (inline JS/CSS), no build step.
- **No local dev server** — verify by deploying (`npx vercel --prod --yes`).
- **Routing:** `api/social/[...slug].js` is ONE Vercel function that dispatches to
  handlers in `lib/social/handlers/` (handlers outside `api/` don't count toward
  the function cap). Add routes there, never as new `api/*.js` files.
- **Persistence:** `@vercel/kv`. Social keys: `social:kit:*`, `social:queue`
  (sorted set), `social:postref:*`, `social:posted:index`, `social:accounts` (NEW).
- **Posting flow:** `generate` builds a Content Kit → user approves per platform →
  `deploy` writes approved posts to `social:queue` → 5-min cron drains due posts →
  `platforms/index.js` `dispatch()` calls the platform adapter.

---

## 2. Change A — Video model env switch (`lib/social/media.js`)

**Why:** the fal.ai text-to-video endpoint was hard-coded to Kling v2.1; no way to
A/B a cheaper model without a code edit (images already had `SOCIAL_IMAGE_MODELS`).

**What changed:** `FAL_BASE`/`FAL_STATUS_BASE` are now derived from a
`SOCIAL_VIDEO_MODEL` env var (default = the old Kling slug → **byte-identical
default**). Per-model request params live in a `VIDEO_PARAMS` map via
`videoParamsFor()`; unknown models fall back to Kling's `{duration:'10',
aspect_ratio:'9:16'}`. `startVideoGeneration()` now also returns `model`.

**To use a cheaper model** — set env + redeploy (verify first clip; param schemas differ):
- `fal-ai/veo3/fast` — Google Veo 3 fast, ~8s **with audio**, best value
- `fal-ai/minimax/hailuo-02/standard/text-to-video` — budget
- `fal-ai/wan/v2.2-5b/text-to-video` — mid-tier

**Images** were left on `google/gemini-2.5-flash-image` (already cheap +
overridable via `SOCIAL_IMAGE_MODELS`). Imagen 4 Fast (~$0.02) is cheaper but
isn't exposed through the OpenRouter chat-image pipeline — not worth re-plumbing.

---

## 3. Change B — Multi-account posting via Composio

**Why:** the original design posts via **single-account env-var tokens** per
platform (`TWITTER_ACCESS_TOKEN`, `FACEBOOK_PAGE_ID`, …). Multi-account was
architecturally blocked. Composio's per-userID **connected-accounts** model
(stores + refreshes each account's OAuth tokens; multi-account by default) solves
this and collapses 5 platform integrations into 1.

**Confirmed:** all 5 platforms are natively covered by Composio toolkits — X,
LinkedIn (incl. organization), Facebook Pages, Instagram (image + Reels), TikTok
(video). No hybrid fallback needed.

### File manifest (NEW)
| File | Purpose |
|---|---|
| `lib/social/composio.js` | Lazy-loaded `@composio/core` wrapper: `linkAccount(platform)` (hosted OAuth `link()`), `listConnections()`, `executeTool(slug,{connectedAccountId,arguments})`. Reads `COMPOSIO_API_KEY`, `COMPOSIO_USER_ID` (default `merlows`), `COMPOSIO_AUTHCONFIG_<PLATFORM>`. |
| `lib/social/platforms/composio.js` | `postViaComposio(platform,data,account)` — per-platform tool slugs + arg builders. **Slugs/args are `// VERIFY` best-guesses — must be confirmed live.** |
| `lib/social/accounts.js` | KV `social:accounts` registry: `listAccounts`, `addAccount`, `removeAccount`, `setDefaultAccount`, `resolveAccount(platform,accountId)`. |
| `lib/social/handlers/accounts.js` | `/api/social/accounts*` — GET list, POST `/link`, POST register, PATCH set-default, DELETE. |

### Edits (existing files)
| File | Edit |
|---|---|
| `lib/social/platforms/index.js` | `dispatch(platform,data,account)` routes to Composio when `account.provider==='composio'`, else legacy adapter. |
| `api/social/[...slug].js` | Registered `accounts` route (imports `accountsHandler`, passes `slug.slice(1).join('/')`). |
| `lib/social/handlers/post.js` | Resolves account via `resolveAccount(platform, platformData.accountId)`, passes to dispatch. |
| `lib/social/handlers/cron.js` | Same account resolution + **retry cap** `SOCIAL_MAX_RETRIES` (default 5) → status `failed` instead of infinite re-queue. |
| `package.json` | Added `@composio/core` `^0.13.1`. |

### How dormancy/safety works
`resolveAccount` returns `null` when `social:accounts` is empty → `dispatch` uses
the legacy env-var adapter. With no `COMPOSIO_API_KEY` set and no accounts
connected, **behavior is identical to before**. The Composio path only activates
once both exist. This is why it's safe to ship half-finished.

---

## 4. Change C — Cron retry cap (`lib/social/handlers/cron.js`)

A permanently-failing post used to re-enqueue every 30 min forever. Now each
`postRef` carries `attempts`; at `SOCIAL_MAX_RETRIES` (default 5) it's marked
`status:'failed'` and left out of the queue.

---

## 5. Deploy & verify

```bash
cd content-generator
npx vercel whoami        # confirm the correct team/scope
npx vercel --prod --yes  # deploy
```

**Deploy scope differs per project:**
- **Merlows** → `slapharma` Pro team (CLI already logged in as `slapharma`).
  `.vercel/project.json` orgId = `team_wfWc4ILtXQU6jPvk2dgfnApj`. `maxDuration` 300.
- **A sibling on Hobby** → 12-function cap + `maxDuration` 60. The social module is
  ONE function, so this change doesn't add any — safe on Hobby too.
- **Vance/Alpha** → keeps endpoints unconsolidated (on Pro); port the *logic* into
  the matching files, same idea.

**Smoke test after deploy:**
```bash
curl -s https://<prod-domain>/api/social/accounts       # → {"accounts":[],"composioConnections":[]}
curl -s https://<prod-domain>/api/social/connections     # legacy path still healthy
```
Run `node --test` → expect the project's known baseline (Merlows: 103 pass / 5
pre-existing failures).

**This session's Merlows deploy:** dpl_5CUBQ8YTeZP7uqYvZdB4sKjk8EqF, aliased
merlows.vercel.app, both routes verified.

---

## 6. REMAINING WORK to make Composio live (blocked)

**Blocker:** the Composio API key provided this session
(`ck_REDACTED-rotate-this-key`) returns **401 Invalid API key**. Need a valid key
(Composio → Settings → API Keys). Then:

1. **Verify tool slugs/args.** With a valid key, introspect toolkits and correct
   every `// VERIFY` in `lib/social/platforms/composio.js`. Introspection recipe:
   ```js
   import('@composio/core').then(async m => {
     const c = new (m.Composio||m.default)({ apiKey: process.env.COMPOSIO_API_KEY });
     const tools = await c.tools.getRawComposioTools({ toolkits:['twitter'] }); // + linkedin, facebook, instagram, tiktok
     // print each tool.slug + tool.inputParameters to fix SLUGS + arg field names
   });
   ```
   (SDK surface: `c.tools.{getRawComposioTools,execute}`, `c.connectedAccounts.{link,list,initiate}`,
   `c.authConfigs.{create,list}`, `c.toolkits.{getToolkits,getAuthConfigCreationFields}`.)
2. **Auth configs.** Create one per platform (dashboard or `c.authConfigs.create`);
   set `COMPOSIO_AUTHCONFIG_TWITTER/LINKEDIN/FACEBOOK/INSTAGRAM/TIKTOK` +
   `COMPOSIO_API_KEY` in Vercel env. OAuth auth configs may need each platform's
   app credentials unless Composio-managed OAuth is available for that toolkit.
3. **UI** (`index.html`, the only missing user-facing piece; backend is ready):
   - Connections sub-tab → per-platform **account list** with "+ Connect account"
     (POST `/api/social/accounts/link {platform}` → open `redirectUrl` popup →
     on return, POST `/api/social/accounts {platform,label,connectedAccountId}`),
     set-default (PATCH), remove (DELETE).
   - Kit Builder → per-platform **account dropdown** writing
     `kit.platforms[x].accountId` (PATCH `/api/social/kits/:id`).

Optional: **X $0.20-per-URL-post guard** (X moved writes to pay-per-use in 2026).

---

## 7. Research findings (for the connector decision, if revisiting)

- **Unified posting APIs vs raw:** raw platform APIs = single-account + max
  maintenance (per-platform app review; X write tier ~$200/mo). Unified options:
  **Composio** (chosen — agent-native, connected-accounts multi-account, free tier
  20K calls/mo); **Postiz** (open-source, self-host free, has MCP); **Blotato**
  ($29/mo flat, 20 accts); **Ayrshare** (bills per profile, priciest).
- **Cheapest media (API, for automation):** truly "free" image/video APIs don't
  exist for unattended use (free tiers are watermarked UI tools). Cheapest reliable:
  images Imagen 4 Fast ~$0.02 / Gemini 2.5 Flash Image ~$0.039; video Veo 3.1
  ~$0.03/s (w/ audio), Hailuo/MiniMax budget, Wan ~$0.07/s. All hostable on fal →
  swap via `SOCIAL_VIDEO_MODEL`.
- **Supercool** ([supercool.com](https://supercool.com)): all-in-one AI create +
  distribute **UI**. **No public API / Zapier / webhooks** — can't be wired into
  the pipeline. Use it manually: make a video, download, drop the URL into a kit's
  `video.url`. It's a parallel tool, not a connector.

---

## 8. Gotchas / notes

- `@composio/core` is **lazy-imported** inside functions so the social module
  loads fine without the dep or key — don't move the import to module top.
- The invalid key was **not** set in Vercel on purpose (setting it would make
  `isComposioConfigured()` true and cause `/accounts` GET to attempt a live list;
  it's caught non-fatally, but leaving it unset keeps Composio fully dormant).
- Any secret pasted into chat should be rotated.
- Full change log is also in `content-generator/CLAUDE.md` (2026-06-30 section).
