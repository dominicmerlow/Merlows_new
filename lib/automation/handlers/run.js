// lib/automation/handlers/run.js
import { kv, mgetBatched } from '../../kv.js';
import cronParser from 'cron-parser';
const { CronExpressionParser } = cronParser;
import { fetchSources } from '../fetch.js';
import { writeSheetGenerationNote, writeSheetPublishNote } from '../../sources/google-sheets.js';
import { buildJob } from '../job-schema.js';
import { sendNotifications } from '../notify.js';
import { generateImageFast } from '../../social/media.js';
import { uploadImageToWp } from '../../wp-media.js';
import { writeLog } from '../log.js';
import { pickModelForGeneration } from '../../ab-test.js';
import { recordLlmUsage, recordLlmFailure } from '../../usage.js';
import { snapshotBody, logEvent } from '../../article-history.js';
import { countBodyWords } from '../../word-count.js';
import { waitUntil } from '@vercel/functions';
import { verifyCronSecret, internalAuthHeaders } from '../../cron-auth.js';
import { getCurrentUser, requireRole } from '../../auth.js';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const TERMINAL_STATUSES = ['approved', 'rejected', 'published', 'timed_out', 'auto_published'];
const DEFAULT_MODEL = 'google/gemma-3-27b-it:free';

// Per-category hero-image prompt templates (passed to generateImageFast). {topic}
// is substituted with the article subject at generation time. Categories not listed
// here fall back to the media.js default template. BlitzSpirit (the repurposed
// 'op-eds' slot) is handled by heroPromptFor() below, which composes a shared
// WWII-home-front template with a per-sub-category scene direction.
const CATEGORY_HERO_PROMPTS = {
  // (other categories can pin a fixed hero template here; BlitzSpirit is dynamic)
};

// Shared BlitzSpirit hero template. {topic} = article subject (substituted in
// media.js); {scene} = the sub-category-specific scene direction injected below.
const BLITZSPIRIT_HERO_TEMPLATE = `Editorial hero image for an article about: {topic}. British WWII home-front / "Blitz spirit" aesthetic reimagined as modern editorial art. {scene} Right-weighted composition: all visual elements on the RIGHT 60% of the frame; the LEFT 40% kept clean with a subtle dark-to-warm gradient for text overlay. Mood: resilient, human, hopeful-under-pressure. Warm documentary palette of charcoal, sepia, smoke-grey and warm amber with a single restrained teal accent. Soft cinematic lighting; widescreen 16:9. Avoid graphic violence; no swastikas or Nazi insignia; no gore; no modern logos. Photographic or painterly editorial illustration, not cartoonish. Absolutely no text, words, letters, numbers, captions, watermarks or typography anywhere in the image.`;

// Per-sub-category scene direction, keyed by WP sub-category slug. Articles with
// no recognised sub-category use BLITZSPIRIT_DEFAULT_SCENE.
const BLITZSPIRIT_SUBCATEGORY_SCENES = {
  'original-spirit': `Scene: the historical Blitz itself — 1940s Britain under fire, terraced rooftops and chimney pots, searchlight beams across a night sky, sandbags and Anderson-shelter doorways, period silhouettes of ordinary people carrying on; archival documentary feel.`,
  'explainers':      `Scene: a clear, explanatory composition — one well-staged home-front vignette (a wireless radio, a map, a ration book on a table, a planning scene) framed cleanly and legibly like an illustrated explainer; calm, informative, uncluttered.`,
  'blitz-echoes':    `Scene: then-and-now — a 1940s home-front scene dissolving into the same place today, a layered double-exposure of period and contemporary city, the past echoing into the present.`,
  'spirit-today':    `Scene: present-day resilience — modern people showing the same community spirit (neighbours helping, volunteers, quiet determination) in a contemporary British setting, carrying the wartime mood into now.`,
  'carry-on':        `Scene: a calm, reassuring "Keep Calm and Carry On" poster sensibility — bold, simple, steadying composition built around a single iconic motif of quiet resolve; restrained and confident.`,
};
const BLITZSPIRIT_DEFAULT_SCENE = `Scene: an evocative British WWII home-front vignette of resilience and community under pressure — terraced rooftops, searchlights, people helping one another.`;

// Shared Abraham Accords hero template — Middle East diplomacy, deliberately NOT a
// clinical/medical look (the media.js global default template is still clinical).
// {topic} = article subject (substituted in media.js); {scene} = the per-sub-category
// scene direction injected below.
const ABRAHAM_HERO_TEMPLATE = `Editorial hero image for a Middle East diplomacy news article about: {topic}. {scene} Right-weighted composition: all visual elements on the RIGHT 60% of the frame; the LEFT 40% kept clean with a subtle dark gradient for text overlay. Mood: serious, hopeful, diplomatic. Palette: deep midnight navy and warm desert gold/sand with ivory highlights and a single restrained teal accent — emphatically NOT a clinical, medical or laboratory look. Soft cinematic lighting; widescreen 16:9. Photographic or refined editorial illustration, not cartoonish; no close-up faces, no caricatured national flags, no disrespectful use of religious symbols. STRICTLY no clinical, medical, molecular, chemical, DNA, lab-glassware, healthcare or generic "science-y" imagery. Absolutely no text, words, letters, numbers, captions, watermarks, logos or typography anywhere in the image.`;

// Per-sub-category scene direction for Abraham Accords, keyed by WP sub-category slug.
const ABRAHAM_SUBCATEGORY_SCENES = {
  'normalisation-diplomacy': `Scene: diplomacy and normalisation — a dignified summit or signing-table setting, hands clasped in agreement, olive branches and doves, regional architecture and bridges symbolising connection between nations.`,
  'regional-security':       `Scene: regional security — a sober strategic composition: coastlines and shipping lanes, distant aircraft or naval silhouettes at dusk, clean abstract radar-grid and air-defence motifs; tense but controlled, never graphic or violent.`,
  'trade-connectivity':      `Scene: trade and connectivity — ports and container terminals, a corridor of rail and shipping routes across land and sea, modern Gulf skylines and energy infrastructure, a sense of goods and ideas moving between regions; bright and forward-looking.`,
};
const ABRAHAM_DEFAULT_SCENE = `Scene: an evocative Middle East diplomacy vignette — regional skylines, bridges and desert horizons, conveying a hopeful sense of connection between nations.`;

// Shared Cyrus Accord hero template — Israel-Iran reconciliation / Persian-Jewish
// heritage, deliberately NOT a clinical/medical look. {topic} = article subject;
// {scene} = the per-sub-category scene direction injected below.
const CYRUS_HERO_TEMPLATE = `Editorial hero image for an Israel-Iran reconciliation and diplomacy article about: {topic}. {scene} Right-weighted composition: all visual elements on the RIGHT 60% of the frame; the LEFT 40% kept clean with a subtle dark gradient for text overlay. Mood: dignified, reflective, hopeful-yet-sober. Palette: deep Persian blue and turquoise tilework tones with warm gold and ivory and a single restrained teal accent — emphatically NOT a clinical, medical or laboratory look. Soft cinematic lighting; widescreen 16:9. Photographic or refined editorial illustration, not cartoonish; no close-up faces, no caricatured national flags, no disrespectful or mocking use of religious or national symbols. STRICTLY no clinical, medical, molecular, chemical, DNA, lab-glassware, healthcare or generic "science-y" imagery. Absolutely no text, words, letters, numbers, captions, watermarks, logos or typography anywhere in the image.`;

// Per-sub-category scene direction for the Cyrus Accord, keyed by WP sub-category slug.
const CYRUS_SUBCATEGORY_SCENES = {
  'the-cyrus-vision':         `Scene: a hopeful, forward-looking vision — a symbolic bridge or open horizon linking two ancient cities at dawn, doves, light breaking over the skyline; aspirational and dignified.`,
  'persian-jewish-heritage':  `Scene: ancient heritage — Persian blue tilework and Persepolis-style fluted columns, a cylinder-seal or scroll motif, intertwined Persian and Jewish decorative patterns rendered respectfully; scholarly, archival, timeless.`,
  'conflict-diplomacy':       `Scene: sober statecraft — a negotiating table and a map, a tense dusk over the region, a controlled contrast between conflict and diplomacy; serious and restrained, never graphic or violent.`,
};
const CYRUS_DEFAULT_SCENE = `Scene: an evocative vignette of Israel-Iran reconciliation — Persian heritage motifs and regional skylines bridged by light, conveying a hopeful but sober sense of possibility.`;

// Normalise a sub-category value (slug, display name, or case/spacing variant)
// to its slug, matching wp-taxonomy.slugify, so it keys the scene map.
function subCatSlug(s) {
  return String(s == null ? '' : s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Resolve the hero-image prompt template for an article. Precedence:
//   0. BlitzSpirit ('op-eds') ALWAYS uses its composed code template (its fixed warm
//      documentary palette) — it ignores any app/KV override so its colours stay put,
//      per request (reverts the colour change a KV override would have introduced).
//   1. Otherwise, an explicit per-category hero prompt configured in the app and
//      stored in KV (vance:hero-prompts → categories[category]) wins, so automation
//      honours the "category hero prompt" an operator edits in the UI.
//   2. A category-specific composed template (Abraham Accords / Cyrus Accord) with the
//      article's sub-category scene.
//   3. A code-pinned CATEGORY_HERO_PROMPTS entry, then the KV global default, else
//      undefined → media.js DEFAULT_HERO_PROMPT_TEMPLATE.
export function heroPromptFor(category, subCategory, heroCfg) {
  if (category === 'op-eds') {
    const scene = BLITZSPIRIT_SUBCATEGORY_SCENES[subCatSlug(subCategory)] || BLITZSPIRIT_DEFAULT_SCENE;
    return BLITZSPIRIT_HERO_TEMPLATE.replace('{scene}', scene);
  }
  const override = (heroCfg && heroCfg.categories && typeof heroCfg.categories[category] === 'string')
    ? heroCfg.categories[category].trim() : '';
  if (override) return override;
  if (category === 'abraham-accords') {
    const scene = ABRAHAM_SUBCATEGORY_SCENES[subCatSlug(subCategory)] || ABRAHAM_DEFAULT_SCENE;
    return ABRAHAM_HERO_TEMPLATE.replace('{scene}', scene);
  }
  if (category === 'cyrus-accord') {
    const scene = CYRUS_SUBCATEGORY_SCENES[subCatSlug(subCategory)] || CYRUS_DEFAULT_SCENE;
    return CYRUS_HERO_TEMPLATE.replace('{scene}', scene);
  }
  if (CATEGORY_HERO_PROMPTS[category]) return CATEGORY_HERO_PROMPTS[category];
  const dflt = (heroCfg && typeof heroCfg.default === 'string') ? heroCfg.default.trim() : '';
  return dflt || undefined;
}

// Maps rule.category → subtitle prefix used in generated articles
const CATEGORY_SUBTITLE_PREFIX = {
  'breaking-news':       'Breaking News',
  'diplomatic-analysis': 'Diplomatic Analysis',
  'op-eds':              'BlitzSpirit',
  'cyrus-accord':        'Cyrus Accords',
  'abraham-accords':     'Abraham Accords',
  'regional-voices':     'Regional Voices',
};

const DEFAULT_PROMPT_BREAKING_NEWS = `You are a senior news reporter for Merlows, writing in the hard-edged, authoritative register of The Daily Telegraph. Work ONLY from the supplied source material — real, published reporting drawn from The Sun, The Daily Telegraph, the Daily Mail, Fox News and The Jerusalem Post. Identify the single biggest story of the day that appears across MORE THAN ONE of these outlets and report THAT story. Never invent facts, quotations, figures, names or events; if the sources do not support a claim, leave it out.

EDITORIAL FOCUS
Give priority to stories about: trade and the economy; peace and diplomacy; antisemitism; the overreach of "woke" politics; and national sovereignty and pro-nation themes. Where stories compete, choose the one most widely carried across the outlets that also fits these priorities.

TONE & STYLE
Hard news in the Telegraph manner: crisp, confident, declarative and unsentimental. Active voice, short sentences, no hedging or throat-clearing. Rigorously factual — attribute every claim to the reporting. Written plainly for an intelligent British readership. UK British English throughout.

STRUCTURE
1. Headline (~8–12 words) — sharp and factual, no clickbait.
2. Standfirst: "## {{CATEGORY_PREFIX}}:" + a one-line summary of the story.
3. Lede (35–55 words) — the five Ws of the most-reported story.
4. The Story (170–230 words) — the confirmed facts, attributed to the outlets.
5. Reaction & Context (90–130 words) — key quotes or positions, and why it matters.
6. What Happens Next (35–55 words).
7. Sources line — name the outlets the report draws on.

OUTPUT FORMAT
Output in markdown. First line: "# " + headline. Next non-empty line: "## {{CATEGORY_PREFIX}}:" + summary. All other headers use "## ".
ABSOLUTE MAXIMUM 500 words — do not exceed it under any circumstances. UK British English. Report only what the sourced material verifies; attribute, and do not editorialise beyond the facts.`;

const DEFAULT_PROMPT_DIPLOMATIC_ANALYSIS = `You are a diplomatic affairs analyst writing for Merlows — an independent digital news portal focused on Israel-Iran relations, the Cyrus Accord, and Middle East diplomacy. Produce a measured, authoritative analytical piece for merlows.com.

TONE & STYLE
Analytical, measured, non-partisan. Clear language accessible to an informed general audience. Avoid advocacy. Present multiple perspectives where relevant. Active voice preferred.

STRUCTURE
1. Title (~8–14 words) — descriptive, no category prefix.
2. Subtitle (~8–14 words) — key analytical insight from the piece.
3. Overview (100–150 words) — what is being analysed and why it matters now.
4. Historical Context (150–200 words) — relevant background for understanding the current situation.
5. Key Actors & Positions (150–200 words) — who is involved and what each party seeks.
6. Analysis (200–300 words) — implications, risks, and opportunities assessed objectively.
7. Outlook (100–150 words) — realistic assessment of likely developments.
8. Source references.

OUTPUT FORMAT
Output in markdown. First line: "# " + title. Next non-empty line: "## {{CATEGORY_PREFIX}}:" + subtitle. All other headers use "## ".
Total length: 800–1,100 words. UK British English. Do not speculate beyond what the source material supports.`;

const DEFAULT_PROMPT_BLITZSPIRIT = `You are a writer for BlitzSpirit — an independent British publication that reads CURRENT events through the enduring "Blitz spirit": resilience, stoicism, community solidarity and "Keep Calm and Carry On" under pressure. Work from the supplied source material — a RECENT news story (plus any notes / source link) — and write a timely piece that uses today's story to illuminate that spirit, drawing the through-line from 1940 to now.

APPROACH
Lead with the recent story. Then show how it embodies, echoes, tests or revives the Blitz spirit — the way ordinary people, communities and services carry on, rally round and refuse to be cowed under pressure. Use the wartime parallel to add depth, never to flatten the present into nostalgia.

TONE & STYLE
Warm, vivid and accessible, but current and grounded. Celebrate genuine courage and community while being honest about hardship and about the limits of the "Blitz spirit" myth — never jingoistic, never saccharine. Active voice. Write for a curious general British reader, not an academic.

STRUCTURE
1. Title (~6–12 words) — about the CURRENT story, evocative and specific, no category label.
2. Subtitle (~8–14 words) — the hook tying today's story to the spirit.
3. Opening (70–110 words) — the recent story: who, what, where, when, drawn from the source.
4. The Spirit in Action (200–300 words, 1–2 "## " sections) — the resilience, community or defiance on show, grounded in the source.
5. Echoes of 1940 (140–200 words) — the honest historical parallel to the Blitz / home front, and where it holds or breaks down.
6. Close (60–100 words) — a reflective takeaway or a fitting call to action (support, volunteer, remember, prepare, check on a neighbour).
7. Sources line — name the outlet(s) the report draws on.

OUTPUT FORMAT
Output in markdown. First line: "# " + title. Next non-empty line: "## {{CATEGORY_PREFIX}}:" + subtitle. All other headers use "## ".
Total length: 700–1,000 words. UK British English. Work ONLY from the sourced material — do NOT invent quotations, casualty figures, names or events. If the source is thin, keep the wartime parallel general and clearly framed rather than fabricating present-day detail.`;

const DEFAULT_PROMPT_CYRUS_ACCORD = `You are a policy analyst writing for Merlows — an independent news portal covering the Cyrus Accord and its role in reshaping Israel-Iran relations. Produce a comprehensive, authoritative report for merlows.com.

TONE & STYLE
Formal, authoritative, policy-focused. Correct diplomatic and geopolitical terminology. Continuous prose with section headers. Balanced treatment of all parties. Active voice where natural.

STRUCTURE
1. Title and subtitle only — do NOT include a dateline, publication date, byline, author, or "prepared for" line anywhere in the output (the publish date is set automatically).
2. Executive Summary (100–150 words)
3. Background (150–200 words) — the Cyrus Accord's origins and objectives
4. Current Status (200–300 words) — where things stand as of the source material
5. Key Provisions or Developments (250–350 words) — the substance of what the source covers
6. Regional Impact (150–200 words) — how this affects the broader Middle East
7. Outlook (100–150 words)
8. Source references.

OUTPUT FORMAT
Output in markdown. First line: "# " + title. Next non-empty line: "## {{CATEGORY_PREFIX}}:" + subtitle. All other headers use "## ".
Total length: approximately 1,200 words (1,100–1,300). UK British English. Add note: This report is for informational purposes. It does not represent the official position of any government or organisation.`;

const DEFAULT_PROMPT_ABRAHAM_ACCORDS = `You are a diplomatic correspondent writing for Merlows — an independent news portal covering Middle East normalisation and the Abraham Accords. Write a balanced, context-rich report for merlows.com.

TONE & STYLE
Balanced, context-rich, factual. Journalistic but with depth. Acknowledge complexity. Active voice. Accessible to readers without specialist knowledge of the region.

STRUCTURE
1. Headline (~10 words) — clear, informative.
2. Context (120–160 words) — what the Abraham Accords are and where they stand today.
3. Progress Made (250–320 words) — concrete developments covered by the source.
4. Challenges (250–320 words) — honest assessment of obstacles and tensions.
5. Israel-Iran Dimension (160–220 words) — how this relates to the Merlows focus area.
6. Path Forward (160–200 words) — what comes next realistically.
7. Source attribution.

OUTPUT FORMAT
Output in markdown. First line: "# " + headline. Next non-empty line: "## {{CATEGORY_PREFIX}}:" + one-line framing. All other headers use "## ".
Total length: approximately 1,200 words (1,100–1,300). UK British English. Do not editoralise beyond what the source supports.`;

const DEFAULT_PROMPT_REGIONAL_VOICES = `You are a writer for Merlows — an independent news portal focused on Israel-Iran relations and regional peace. Write a human-interest piece that brings the regional perspective to life for an international readership.

TONE & STYLE
Human, accessible, empathetic. Write about real people, real places, real lives. No jargon. Make the reader feel they are hearing from inside the region, not reading from a distance.

STRUCTURE
1. Title (5–10 words)
2. Subtitle starting with "Regional Voices:" — the human core of the story (5–10 words)
3. The Story (150–200 words) — open with a vivid, grounded scene or person from the source
4. Local Perspective (150–200 words) — what people in the region are thinking, feeling, experiencing
5. The Bigger Picture (100–150 words) — how this connects to the larger Israel-Iran dynamic
6. A Note of Hope (75–100 words) — what this story tells us about the possibility of change
7. Source note.

OUTPUT FORMAT
Output in markdown. First line: "# " + title. Next non-empty line: "## {{CATEGORY_PREFIX}}:" + subtitle. All other headers use "## ".
Total length: 500–700 words. UK British English. Be respectful of all communities described.`;

// Category → default prompt mapping (server-side equivalent of getCatDefaultPrompt)
const CATEGORY_PROMPTS = {
  'breaking-news':       DEFAULT_PROMPT_BREAKING_NEWS,
  'diplomatic-analysis': DEFAULT_PROMPT_DIPLOMATIC_ANALYSIS,
  'op-eds':              DEFAULT_PROMPT_BLITZSPIRIT,
  'cyrus-accord':        DEFAULT_PROMPT_CYRUS_ACCORD,
  'abraham-accords':     DEFAULT_PROMPT_ABRAHAM_ACCORDS,
  'regional-voices':     DEFAULT_PROMPT_REGIONAL_VOICES,
};

// Resolve the default prompt for a category (server-side equivalent of
// getCatDefaultPrompt). Falls back to diplomatic-analysis for unknown categories.
function categoryDefaultPrompt(category) {
  return CATEGORY_PROMPTS[category] || CATEGORY_PROMPTS['diplomatic-analysis'];
}

// ── Title prefix enforcement ──────────────────────────────────────────────────
// Merlows categories carry their label in the article SUBTITLE (via the
// {{CATEGORY_PREFIX}} template), not the title — so there is no fixed title
// prefix to enforce. enforceCategoryPrefix therefore strips any stray category
// label the LLM mistakenly prepended to the H1 (older/fallback prompts sometimes
// inject e.g. "Breaking News: " into the title). Kept as a named function so the
// title-normalisation rule lives in one place.
const CATEGORY_TITLE_PREFIXES = {
  // No Merlows category uses a fixed H1 prefix — labels live in the subtitle.
};

// Strip any known Merlows category label the model wrongly prepended to the H1.
const ANY_CATEGORY_PREFIX_RE = /^(Breaking News|Diplomatic Analysis|BlitzSpirit|Op[- ]Ed|Cyrus Accords?|Abraham Accords|Regional Voices)\s*:\s*/i;

function enforceCategoryPrefix(title, category) {
  if (!title) return title;
  const expected = CATEGORY_TITLE_PREFIXES[category];
  if (expected) {
    if (title.toLowerCase().startsWith(expected.toLowerCase())) return title;
    return expected + title.replace(ANY_CATEGORY_PREFIX_RE, '').trim();
  }
  // No fixed prefix for this category — just remove a wrongly-injected label.
  return title.replace(ANY_CATEGORY_PREFIX_RE, '').trim();
}

// ── Prompt → WP sub-category routing ──────────────────────────────────────────
// Server-side mirror of the in-browser generator: a rule's selected prompt preset
// name can imply a WordPress sub-category so automation-generated articles land in
// the right child term. Keyed by app category, then by lower-cased prompt name.
// Merlows diplomacy categories have no patient/practitioner-style split today, so
// the map is empty — the mechanism is wired and extensible (add entries here to
// route a category's named prompts), and returns null (no sub-category) otherwise.
const PROMPT_SUBCATEGORY_MAP = {
  // 'category-id': { 'lower-cased prompt name': 'WP Sub-Category Display Name' },
};

// Resolve the WP sub-category implied by a rule's selected prompt preset, or null.
function subCategoryForRulePrompt(rule) {
  const catId = rule?.category;
  const name = (rule?.generation?.promptName || '').trim().toLowerCase();
  if (!name) return null;
  const map = PROMPT_SUBCATEGORY_MAP[catId];
  if (map && map[name]) return map[name];
  return null;
}

// ── LLM generation ────────────────────────────────────────────────────────────

// Paid fallback models when free-tier is rate-limited
const PAID_FALLBACKS = [
  'google/gemma-3-27b-it',
  'google/gemma-3-12b-it',
  'meta-llama/llama-3.3-70b-instruct',
];

function isRateLimited(data) {
  const code = data.error?.code;
  const msg = (data.error?.message || '').toLowerCase();
  return code === 429 || msg.includes('rate-limit') || msg.includes('rate limit');
}

function isModelUnavailable(data) {
  const code = data.error?.code;
  const msg = (data.error?.message || '').toLowerCase();
  return code === 404 || msg.includes('no endpoints found') || msg.includes('model not found');
}

// Transient upstream failure (HTTP 5xx) — worth trying the next model rather than
// failing the whole generation. Covers a case the rate-limit / unavailable checks
// above miss.
function isTransientServerError(data) {
  const code = data.error?.code;
  return typeof code === 'number' && code >= 500 && code < 600;
}

function buildFallbackChain(primaryModel) {
  const models = [primaryModel];
  // If primary is a free model, add its paid equivalent
  if (primaryModel.endsWith(':free')) {
    models.push(primaryModel.replace(/:free$/, ''));
  }
  // Add paid fallbacks (skip duplicates)
  for (const m of PAID_FALLBACKS) {
    if (!models.includes(m)) models.push(m);
  }
  return models;
}

async function callLLM(model, prompt, apiKey, fetchFn) {
  // Abort a slow/hung model after 60s so it can't monopolise the 300s function budget —
  // generateArticle falls through to the next model on abort. Env-overridable.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), Number(process.env.LLM_CALL_TIMEOUT_MS) || 60000);
  try {
    const res = await fetchFn('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': APP_URL,
        'X-Title': 'Merlows Content Generator',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: ac.signal,
    });
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function generateArticle(item, rule, fetchFn = fetch) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY environment variable not set');

  // Normalize legacy / unqualified model IDs to OpenRouter-valid slugs.
  const LEGACY_MODEL_MAP = {
    'claude-sonnet-4-5':    'anthropic/claude-sonnet-4.5',
    'claude-sonnet-4.5':    'anthropic/claude-sonnet-4.5',
    'claude-opus-4-5':      'anthropic/claude-opus-4.5',
    'claude-opus-4.5':      'anthropic/claude-opus-4.5',
    'claude-haiku-4-5':     'anthropic/claude-haiku-4.5',
    // Retired free-tier models — route to best available free alternative
    'minimax/minimax-m1:extended':   'deepseek/deepseek-r1-0528:free',
    'qwen/qwen3-235b-a22b:free':    'qwen/qwen3-30b-a3b:free',
  };
  const rawModel = rule.generation?.model || process.env.DEFAULT_LLM_MODEL || DEFAULT_MODEL;

  // A/B model selection: picks variant if an A/B config is active for this category/rule,
  // otherwise falls back to the rule-level model.
  const { model: abModel, variantId } = await pickModelForGeneration(rawModel, {
    ruleId: rule.id,
    category: rule.category,
  });
  const primaryModel = LEGACY_MODEL_MAP[abModel] || abModel;

  const categoryPrefix = CATEGORY_SUBTITLE_PREFIX[rule.category] || 'Analysis';
  const defaultForCategory = categoryDefaultPrompt(rule.category);
  const basePrompt = (rule.generation?.prompt?.trim() || defaultForCategory)
    .replace(/\{\{CATEGORY_PREFIX\}\}/g, categoryPrefix);
  const fullPrompt = `${basePrompt}\n\nSOURCE FILE: ${item.title}\n\nSOURCE MATERIAL:\n${item.rawText || '(source text not available — generate based on the filename/title only)'}`;

  const chain = buildFallbackChain(primaryModel);
  let lastError = null;
  const startedAt = Date.now();
  const LLM_BUDGET_MS = Number(process.env.LLM_BUDGET_MS) || 90000; // stop starting new model attempts past this (Pro 300s ceiling)

  for (const model of chain) {
    if (Date.now() - startedAt > LLM_BUDGET_MS) {
      lastError = `LLM time budget (${LLM_BUDGET_MS}ms) exhausted before trying ${model}`;
      break;
    }
    const modelStart = Date.now();
    let data;
    try {
      data = await callLLM(model, fullPrompt, apiKey, fetchFn);
    } catch (err) {
      lastError = `${model}: ${err?.name === 'AbortError' ? 'timed out' : (err?.message || 'fetch failed')}${err?.cause?.code ? ` (${err.cause.code})` : ''}`;
      recordLlmFailure({ model, variantId, reason: 'timeout', ruleId: rule.id, category: rule.category }).catch(() => {});
      continue;
    }
    const text = data.choices?.[0]?.message?.content;

    if (text) {
      const latencyMs = Date.now() - modelStart;
      // Record usage asynchronously — non-fatal
      const usage = data.usage ?? null;
      recordLlmUsage({
        model,
        variantId,
        promptTokens:     usage?.prompt_tokens     ?? null,
        completionTokens: usage?.completion_tokens ?? null,
        totalTokens:      usage?.total_tokens      ?? null,
        latencyMs,
        ruleId:    rule.id,
        contentId: null, // not yet assigned; caller may update
        category:  rule.category,
      }).catch(() => {});

      const lines = text.trim().split('\n');
      let title = item.title;
      let body = text.trim();
      if (lines[0].startsWith('#')) {
        title = lines[0].replace(/^#+\s*/, '').trim();
        body = lines.slice(1).join('\n').trimStart();
      }
      // Strip any category label the model wrongly prepended to the H1 (Merlows
      // categories carry their label in the subtitle, not the title).
      title = enforceCategoryPrefix(title, rule.category);
      const usedFallback = model !== primaryModel;
      return {
        title,
        body,
        model:     usedFallback ? `${model} (fallback from ${primaryModel})` : model,
        variantId: variantId || null,
      };
    }

    // If rate-limited or model unavailable, try the next model in the chain
    if (isRateLimited(data)) {
      lastError = `${model}: rate-limited`;
      recordLlmFailure({ model, variantId, reason: 'rate_limited', ruleId: rule.id, category: rule.category }).catch(() => {});
      continue;
    }
    if (isModelUnavailable(data)) {
      lastError = `${model}: unavailable (${data.error?.message})`;
      recordLlmFailure({ model, variantId, reason: 'unavailable', ruleId: rule.id, category: rule.category }).catch(() => {});
      continue;
    }
    if (isTransientServerError(data)) {
      lastError = `${model}: server error ${data.error?.code} (${data.error?.message || ''})`.trim();
      recordLlmFailure({ model, variantId, reason: 'server_error', ruleId: rule.id, category: rule.category }).catch(() => {});
      continue;
    }

    // Other error — don't retry, just fail
    throw new Error(`LLM returned no content: ${JSON.stringify(data).slice(0, 300)}`);
  }

  throw new Error(`All models rate-limited: ${lastError}`);
}

// ── Per-category word-count ceiling ──────────────────────────────────────────

async function getWordLimit(category) {
  try {
    const limits = await kv.get('vance:category-word-limits');
    if (limits && typeof limits === 'object' && limits[category]) {
      return Number(limits[category]);
    }
  } catch (_) {}
  return null; // no limit configured
}

// ── Cron evaluation helpers (exported for testing) ────────────────────────────

export function evaluateCron(cronExpression, lastRunAt, now) {
  try {
    const interval = CronExpressionParser.parse(cronExpression, {
      currentDate: new Date(now),
    });
    const prev = interval.prev();
    const iso = prev.toISOString();
    if (!iso) return false;
    const prevDate = new Date(iso);
    const sinceDate = lastRunAt ? new Date(lastRunAt) : new Date(0);
    return prevDate > sinceDate;
  } catch {
    return false;
  }
}

export function isRuleDue(rule, now) {
  if (!rule.enabled) return false;
  const { trigger, lastRunAt } = rule;

  if (trigger.type === 'schedule') {
    return evaluateCron(trigger.cron, lastRunAt, now);
  }
  if (trigger.type === 'event') {
    // Event-driven: check on every cron tick, enforcing minGapHours
    if (!lastRunAt) return true;
    const gap = (new Date(now) - new Date(lastRunAt)) / (1000 * 60 * 60);
    return gap >= (trigger.minGapHours ?? 4);
  }
  // volume: deferred — returns false for now
  return false;
}

// ── Timeout processor ─────────────────────────────────────────────────────────

// A pending_review job past its timeout must always converge to a terminal
// status. Before 2026-08-19 the approve/reject branch fired /api/automation/
// approve, ignored the response and wrote nothing — a failing approve meant the
// same job was re-processed on every cron tick, indefinitely (103 jobs were
// stuck this way for five weeks). Failed attempts are now counted on the job;
// at TIMEOUT_APPROVE_MAX_ATTEMPTS the job is marked timeout_failed. A job whose
// rule no longer exists can never resolve at all → terminal status 'orphaned'.
// (exported for testing)
export async function processTimeouts(now, fetchFn = fetch, kvStore = kv) {
  const MAX_TIMEOUT_ATTEMPTS = Number(process.env.TIMEOUT_APPROVE_MAX_ATTEMPTS || 3);
  const ids = await kvStore.lrange('automation:jobs:index', 0, -1);
  // Reserve most of the function-duration budget for the generation pass that
  // follows. If we run long here we bail and remaining jobs are picked up
  // on the next cron tick (protects against Vercel duration limits).
  const startedAt = Date.now();
  const BUDGET_MS = 60000;

  // First pass: read jobs in batched MGETs, filter to ones that need action.
  // Not one kv.get per job: 1,100+ parallel gets opened a connection each, used
  // up the function's file descriptors, and made every fetch after this point
  // fail instantly (see mgetBatched in lib/kv.js).
  const jobVals = await mgetBatched(ids.map(id => `automation:job:${id}`), kvStore);
  const jobs = ids.map((id, i) => ({ id, job: jobVals[i] }));
  const due = [];
  for (const { id, job } of jobs) {
    if (!job || job.status !== 'pending_review') continue;
    due.push({ id, job });
  }
  if (!due.length) return;

  // Group by ruleId so we fetch each rule once, not per-job.
  const ruleIds = [...new Set(due.map(({ job }) => job.ruleId))];
  const rulesById = new Map();
  await Promise.all(ruleIds.map(async rid => rulesById.set(rid, await kvStore.get(`automation:rule:${rid}`))));

  for (const { id, job } of due) {
    if (Date.now() - startedAt > BUDGET_MS) {
      console.warn(`processTimeouts: time budget exhausted after ${(Date.now() - startedAt)}ms — deferring remaining ${due.length} job(s) to next cron tick`);
      return;
    }
    try {
      const rule = rulesById.get(job.ruleId);
      if (!rule) {
        // Rule deleted → the job can never be actioned; stop re-reading it every tick.
        console.warn(`processTimeouts: job ${id} references missing rule ${job.ruleId} — marking orphaned`);
        await kvStore.set(`automation:job:${id}`, { ...job, status: 'orphaned', updatedAt: now });
        continue;
      }
      const ageHours = (new Date(now) - new Date(job.createdAt)) / (1000 * 60 * 60);
      if (ageHours < rule.review.timeoutHours) continue;

      const onTimeout = rule.review.onTimeout ?? 'approve';
      if (onTimeout === 'approve' || onTimeout === 'reject') {
        let ok = false;
        try {
          const resp = await fetchFn(`${APP_URL}/api/automation/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...internalAuthHeaders() },
            body: JSON.stringify({ jobId: job.id, action: onTimeout, channel: 'timeout' }),
          });
          ok = Boolean(resp && resp.ok);
          if (!ok) console.error(`processTimeouts: approve(${onTimeout}) returned HTTP ${resp?.status} for job ${id}`);
        } catch (err) {
          console.error(`processTimeouts: approve(${onTimeout}) call failed for job ${id}:`, err.message);
        }
        if (!ok) {
          const attempts = (job.timeoutAttempts || 0) + 1;
          const patch = { ...job, timeoutAttempts: attempts, updatedAt: now };
          if (attempts >= MAX_TIMEOUT_ATTEMPTS) {
            patch.status = 'timeout_failed';
            console.error(`processTimeouts: job ${id} failed ${attempts} timeout-approve attempts — marking timeout_failed`);
          }
          await kvStore.set(`automation:job:${id}`, patch);
        }
        // On success the approve endpoint writes the terminal status itself.
      } else if (onTimeout === 'urgent_reminder') {
        // One-shot URGENT reminder: fire another notification, then hold.
        if (!job.urgentReminderSentAt) {
          const content = await kvStore.get(`content:${job.contentId}`);
          if (content) {
            try {
              await sendNotifications({ rule, job, content, fetchFn, urgent: true });
            } catch (err) {
              console.error(`Urgent reminder send failed for job ${id}:`, err.message);
            }
          }
          await kvStore.set(`automation:job:${id}`, { ...job, urgentReminderSentAt: now, updatedAt: now });
        }
        // Subsequent cron ticks: leave the job in pending_review indefinitely.
      } else {
        // 'skip' — mark as timed out without actioning
        await kvStore.set(`automation:job:${id}`, { ...job, status: 'timed_out', updatedAt: now });
      }
    } catch (err) {
      console.error(`Timeout processing failed for job ${id}:`, err.message);
    }
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

// Public handler. Cron pings (GET) get an instant 202 and the run executes in
// the BACKGROUND via waitUntil, so the scheduler doesn't time out waiting for
// slow LLM + hero-image generation (Vercel keeps the function alive up to its
// maxDuration). Manual runs (POST, with a ruleId) and tests stay synchronous and
// receive the full results payload.
export default async function handler(req, res, { fetchFn = fetch } = {}) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // GET is the scheduler entry point. Cron secret only — no session fallback.
  // Until 2026-08-19 this was wide open, so anything on the internet could kick
  // off a full run; an external cron-job.org pinger was hitting it every 5 min
  // (~288 runs/day, ~300k billable KV reads/day). See §Cost in CLAUDE.md.
  if (req.method === 'GET') {
    const gate = verifyCronSecret(req);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
    waitUntil(
      executeRun(req, { fetchFn }).catch(err =>
        console.error('[automation/run] background run failed:', err?.message || err))
    );
    return res.status(202).json({ status: 'accepted', mode: 'background' });
  }

  // POST is the UI's "run this rule now" button, and is also used by scripts.
  // Accept either the cron secret or a signed-in content/admin user, so a
  // missing CRON_SECRET never locks the humans out of their own dashboard.
  if (!verifyCronSecret(req).ok) {
    const guard = requireRole(await getCurrentUser(req), 'content', 'admin');
    if (!guard.ok) return res.status(guard.status).json({ error: guard.error });
  }
  const out = await executeRun(req, { fetchFn });
  return res.status(out.httpStatus).json(out.body);
}

// Does the actual work. Returns { httpStatus, body } instead of touching res so
// it can run detached (background) for cron pings or awaited for manual runs.
async function executeRun(req, { fetchFn = fetch } = {}) {
  const now = new Date().toISOString();
  const runStartedAt = Date.now(); // wall-clock budget vs the function maxDuration ceiling
  // Pro plan: maxDuration is 300s (see vercel.json). These budgets keep a run comfortably
  // under that ceiling while allowing several articles + hero images per run. The per-item
  // guard below is the real protection against FUNCTION_INVOCATION_TIMEOUT — it stops
  // STARTING new articles once the run nears the budget, so leftover items defer to the
  // next cron tick. All overridable via env for tuning without a code change.
  const FN_BUDGET_MS       = Number(process.env.RUN_FN_BUDGET_MS) || 290000; // total run ceiling (< 300s maxDuration)
  const NEW_ARTICLE_CUTOFF = FN_BUDGET_MS - 55000;  // don't START another article if < ~55s remain (LLM + hero + writeback)
  const HERO_RESERVE_MS    = 30000;                 // approx time a hero image needs; skip hero only if less remains
  const results = { processed: 0, errors: [] };

  // 1. Process timeouts first (skip for manual single-rule runs)
  const forcedRuleId = req.method === 'POST' ? req.body?.ruleId : null;
  const forceFiles   = req.method === 'POST' ? (req.body?.forceFiles || null) : null;
  if (!forcedRuleId) await processTimeouts(now, fetchFn);

  // 2. Load rules — single forced rule or all due rules
  let dueRules;
  if (forcedRuleId) {
    const rule = await kv.get(`automation:rule:${forcedRuleId}`);
    if (!rule) return { httpStatus: 404, body: { error: 'Rule not found' } };
    dueRules = [rule];
  } else {
    const ids = await kv.lrange('automation:rules:index', 0, -1);
    if (!ids.length) return { httpStatus: 200, body: { ...results, message: 'No rules configured' } };
    const rules = (await Promise.all(ids.map(id => kv.get(`automation:rule:${id}`)))).filter(Boolean);
    dueRules = rules.filter(r => isRuleDue(r, now));

    // Diagnostic: log which rules were evaluated and why they were skipped
    const skipped = rules.filter(r => !dueRules.includes(r));
    if (skipped.length) {
      const skippedNames = skipped.map(r => `"${r.name}" (${r.trigger?.type}, enabled=${r.enabled}, cron=${r.trigger?.cron ?? '-'}, lastRunAt=${r.lastRunAt ?? 'null'})`).join('; ');
      await writeLog({ level: 'info', message: `Cron tick: ${rules.length} rules loaded, ${dueRules.length} due, ${skipped.length} skipped: ${skippedNames}` });
    }
  }

  for (const rule of dueRules) {
    // Whole-run wall-clock guard: if several rules are due on one tick, stop before
    // the function maxDuration ceiling and let the remaining rules run on the next tick.
    if (Date.now() - runStartedAt > NEW_ARTICLE_CUTOFF) {
      results.errors.push(`[info] Run budget reached (${Math.round((Date.now() - runStartedAt) / 1000)}s) — deferring remaining rule(s) to the next tick.`);
      break;
    }
    try {
      // 3. Fetch sources — manual forced runs ignore lastRunAt so all existing files are eligible.
      //   forceAll only fires when the user explicitly picked items via "Re-process
      //   selected" — that's the signal to bypass the consumed-row/file dedup so a
      //   re-run can revisit already-handled rows. Plain "Run now" still respects
      //   the dedup so it picks the NEXT fresh item.
      let ruleAutoPublishedCount = 0;
      const forceAll = Array.isArray(forceFiles) && forceFiles.length > 0;
      let { items: sourceItems, sourceErrors } = await fetchSources(rule.sources, forcedRuleId ? null : rule.lastRunAt, fetchFn, rule.id, { forceAll });
      if (sourceErrors.length) {
        results.errors.push(...sourceErrors);
        for (const e of sourceErrors) await writeLog({ ruleId: rule.id, ruleName: rule.name, level: 'error', message: e });
      }
      // Optional file-name filter (from "Re-process selected" UI)
      if (forceFiles && forceFiles.length) {
        const allow = new Set(forceFiles);
        sourceItems = sourceItems.filter(it => allow.has(it.title));
      }
      if (!sourceItems.length) {
        const dbg = `Rule "${rule.name}": 0 source items returned. Sources: ${JSON.stringify(rule.sources.map(s => s.type))}, lastRunAt passed: ${forcedRuleId ? 'null (manual)' : rule.lastRunAt}`;
        results.errors.push(`[debug] ${dbg}`);
        await writeLog({ ruleId: rule.id, ruleName: rule.name, level: 'warn', message: dbg });
        continue;
      }

      // 4. Generate content (up to maxArticlesPerRun)
      // Pro plan: the 300s function ceiling lets us generate several articles per run
      // (each ~30–45s: LLM + hero image). We honour the rule's configured
      // maxArticlesPerRun, bounded by a safety cap; the per-item wall-clock guard in the
      // loop below is what actually prevents a timeout, deferring any remainder to the
      // next tick. Hero images no longer force a 1-article cap (that was a Hobby-60s
      // workaround).
      const requestedMax = rule.generation.maxArticlesPerRun;
      if (!requestedMax) results.errors.push(`[debug] maxArticlesPerRun is ${requestedMax} — no items will be processed`);
      // Treat missing/undefined as true (legacy rules pre-dating the heroImage field)
      const heroEnabled = rule.generation.heroImage !== false;
      const HARD_CAP = Number(process.env.MAX_ARTICLES_PER_RUN_CAP) || 8;
      const max = Math.min(requestedMax || 0, HARD_CAP);
      if ((requestedMax || 0) > HARD_CAP) {
        results.errors.push(`[info] maxArticlesPerRun ${requestedMax} capped at ${HARD_CAP} per run; remaining items picked up next run.`);
      }
      const toProcess = sourceItems.slice(0, max);
      let ruleProcessedCount = 0;

      // Load per-category word limit once per rule run
      const wordLimit = await getWordLimit(rule.category);

      // Load the per-category hero-image prompt config (KV) once per rule run so
      // automation honours the "category hero prompt" set in the app UI.
      let heroCfg = null;
      try { heroCfg = await kv.get('vance:hero-prompts'); } catch (_) {}

      // WP sub-category implied by the rule's prompt preset (per-item upload
      // metadata still wins when present). null for Merlows categories today —
      // the routing map is empty — but the field flows so it's ready when used.
      const rulePromptSubCategory = subCategoryForRulePrompt(rule);

      for (const item of toProcess) {
        // Wall-clock guard: don't START another article unless enough of the function
        // budget remains for an LLM call + hero image + KV/publish writeback. Always
        // allow the first article through (ruleProcessedCount === 0) so a run that spent
        // time in processTimeouts still produces at least one. Remainder defers to next tick.
        if (ruleProcessedCount > 0 && Date.now() - runStartedAt > NEW_ARTICLE_CUTOFF) {
          results.errors.push(`[info] Run budget reached after ${ruleProcessedCount} article(s) for "${rule.name}" — ${toProcess.length - ruleProcessedCount} remaining item(s) deferred to the next tick.`);
          break;
        }

        // 4a. Call LLM to generate the article from source text
        let generated;
        try {
          generated = await generateArticle(item, rule, fetchFn);
        } catch (llmErr) {
          results.errors.push(`LLM generation failed for "${item.title}": ${llmErr.message}`);
          // Cron runs discard `results`, so log it or the failure is invisible.
          console.error(`[automation/run] LLM generation failed for rule "${rule.name}", item "${item.title}": ${llmErr.message}`);
          continue;
        }

        // 4a-ii. Enforce per-category word ceiling (warn but do not block publish)
        if (wordLimit) {
          const wc = countBodyWords(generated.body);
          if (wc > wordLimit) {
            await writeLog({
              ruleId: rule.id, ruleName: rule.name, level: 'warn',
              message: `Word count ${wc} exceeds category limit ${wordLimit} for category "${rule.category}" — article "${generated.title}" will still be processed`,
            });
            results.errors.push(`[warn] "${generated.title}": ${wc} words exceeds ${wordLimit}-word limit for "${rule.category}"`);
          }
        }

        // 4b. Store the generated article
        // Derive a human-readable source-doc label for the email / review page.
        // Different source types stash provenance in different fields — pick the
        // most specific one we have. Falls back to the item title for sources
        // where we don't have a URL or filename (e.g. title-only uploads).
        const { sourceDocName, sourceDocUrl } = (function () {
          const t = item.sourceType;
          if (t === 'upload') {
            // Find the originating upload in rule.sources so we can name the file.
            // Inline uploads expose source.filename; multi-column xlsx uploads store
            // entries in src.urls / src.titlesOnly / src.rows — match across all.
            const fromUpload = (rule.sources || []).find(s => s && s.type === 'upload'
              && ((Array.isArray(s.urls) && s.urls.includes(item.url))
                || (Array.isArray(s.titlesOnly) && s.titlesOnly.includes(item.title))
                || (Array.isArray(s.rows) && s.rows.some(r => r && r.title === item.title))));
            const fname = fromUpload?.originalFilename || fromUpload?.filename || null;
            const label = fname
              ? (item.url ? `${fname} — ${item.url}` : `${fname} — ${item.title}`)
              : (item.url || item.title || null);
            return { sourceDocName: label, sourceDocUrl: item.url || null };
          }
          if ((t === 'google_sheets' || t === 'google-sheets') && item._sheetMeta) {
            const sm = item._sheetMeta;
            const sheetLabel = [sm.sheetName, sm.rowIndex ? `Row ${sm.rowIndex}` : null].filter(Boolean).join(' — ') || 'Google Sheet';
            return { sourceDocName: sheetLabel, sourceDocUrl: item.url || sm.sheetUrl || null };
          }
          if (t === 'bibliography' && item._bibMeta) {
            return { sourceDocName: item.title || 'Bibliography paper', sourceDocUrl: item.url || null };
          }
          if (t === 'gmail') {
            return { sourceDocName: item.title || 'Gmail message', sourceDocUrl: item.url || null };
          }
          if (t === 'github') {
            return { sourceDocName: item.title || item.url || 'GitHub file', sourceDocUrl: item.url || null };
          }
          if (t === 'google_drive' || t === 'google-drive' || t === 'cloud-drive' || t === 'dropbox') {
            return { sourceDocName: item.title || 'Cloud file', sourceDocUrl: item.url || null };
          }
          // rss / url / unknown
          return { sourceDocName: item.url || item.title || null, sourceDocUrl: item.url || null };
        })();

        const genRes = await fetchFn(`${APP_URL}/api/content`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...internalAuthHeaders() },
          body: JSON.stringify({
            title: generated.title,
            body: generated.body,
            model: generated.model,
            variantId: generated.variantId || null,
            category: rule.category,
            wpCategorySlug: rule.wpCategorySlug ?? null,
            template: rule.generation.template,
            automationRuleId: rule.id,
            automationRuleName: rule.name,
            promptName: (rule.generation && rule.generation.promptName) || null,
            sourceDocName,
            sourceDocUrl,
            // Per-row metadata from a multi-column bulk-upload spreadsheet. The
            // publish endpoint uses subCategory + tags to resolve / auto-create WP
            // terms; rowNotes is kept as provenance. Per-row upload subCategory
            // wins; otherwise fall back to the prompt-derived sub-category.
            subCategory: item.subCategory || rulePromptSubCategory || null,
            tags: item.tags || null,
            rowNotes: item.rowNotes || null,
            // Byline override: when the rule pins a fixed author, pass it through
            // so buildContentItem uses it verbatim. Otherwise omit and let
            // buildContentItem auto-assign (dedicated sub-category author + ~10%
            // floater) from category + subCategory. See lib/authors.js.
            ...(rule.generation?.authorMode === 'fixed' && (rule.generation?.fixedAuthorUsername || rule.generation?.fixedAuthorId)
              ? {
                  authorUsername: rule.generation.fixedAuthorUsername || null,
                  wpAuthorId: Number.isInteger(rule.generation.fixedAuthorId) ? rule.generation.fixedAuthorId : null,
                }
              : {}),
            // Publish date extracted from the source spreadsheet's date column
            // (lib/sources/google-sheets.js → item.pubDate). Passed through so the
            // WP post is dated to the original publication date, not "now".
            // Normalised to an ISO 8601 string here (item.pubDate is a Date).
            publishDate: item.pubDate instanceof Date && !isNaN(item.pubDate)
              ? item.pubDate.toISOString()
              : (item.pubDate || null),
          }),
        });

        if (!genRes.ok) {
          results.errors.push(`Content store failed: ${generated.title}`);
          continue;
        }
        const content = await genRes.json();

        // 4b-0. Consumed-source writeback — mark this item as handled so the next
        // scheduled run skips it. Mutates rule.sources in-memory; the end-of-rule
        // kv.set on the rule persists it. This is what advances the xlsx/Drive
        // dedup ported into fetch.js / cloud-drives.js.
        if (item.sourceType === 'upload') {
          for (const src of rule.sources) {
            if (src.type !== 'upload') continue;
            if (item.titleOnly) {
              const inRows = Array.isArray(src.rows) && src.rows.some(r => r && r.title === item.title);
              const inTitlesOnly = Array.isArray(src.titlesOnly) && src.titlesOnly.includes(item.title);
              if (inRows || inTitlesOnly) {
                src.consumedTitles = Array.isArray(src.consumedTitles) ? src.consumedTitles : [];
                if (!src.consumedTitles.includes(item.title)) src.consumedTitles.push(item.title);
                break;
              }
            } else if (item.url) {
              if (Array.isArray(src.urls) && src.urls.includes(item.url)) {
                src.consumedUrls = Array.isArray(src.consumedUrls) ? src.consumedUrls : [];
                if (!src.consumedUrls.includes(item.url)) src.consumedUrls.push(item.url);
                break;
              }
            }
          }
        }
        if (item.sourceType === 'google_drive' && item.fileId) {
          for (const src of rule.sources) {
            if (src.type !== 'google_drive') continue;
            // When a rule has multiple Drive sources, only mark the one the file
            // came from. Items without sourceFolderId fall back to the first.
            if (item.sourceFolderId && src.folderId !== item.sourceFolderId) continue;
            src.consumedFileIds = Array.isArray(src.consumedFileIds) ? src.consumedFileIds : [];
            if (!src.consumedFileIds.includes(item.fileId)) src.consumedFileIds.push(item.fileId);
            break;
          }
        }

        // 4b-i. Snapshot initial body version and log generation event. Both
        // helpers are synchronous and mutate `content` in place (pushing onto
        // content.versions / content.auditLog), so persist afterward — the later
        // kv.set calls (sheetMeta / hero) are conditional and may not run this
        // iteration, which would otherwise drop the snapshot + audit entry.
        snapshotBody(content, { actor: 'Automation', at: now, reason: 'generated' });
        logEvent(content, {
          type: 'generated',
          actor: 'Automation',
          at: now,
          detail: {
            model: generated.model,
            variantId: generated.variantId || null,
            ruleId: rule.id,
            category: rule.category,
          },
        });
        await kv.set(`content:${content.id}`, content);

        // 4b-ii. Persist _sheetMeta on the content object so approve.js can write back the WP URL later
        if (item._sheetMeta) {
          await kv.set(`content:${content.id}`, { ...content, _sheetMeta: item._sheetMeta });
          content._sheetMeta = item._sheetMeta;
          // Write generation date + review link back to the sheet row (non-fatal)
          await writeSheetGenerationNote(item._sheetMeta, { contentId: content.id, appUrl: APP_URL }, fetchFn);
        }

        // 4b-iii. Mark bibliography paper as processed
        if (item._bibMeta && item._bibMeta.paperId) {
          try {
            const paper = await kv.get(`bibliography:paper:${item._bibMeta.paperId}`);
            if (paper) await kv.set(`bibliography:paper:${item._bibMeta.paperId}`, { ...paper, processed: true });
          } catch (bibErr) { console.error('Bibliography paper tracking error:', bibErr.message); }
        }

        // 4c. Generate hero image (fast path — no prompt-building LLM call). Skip only
        // if too little of the function budget remains (need ~HERO_RESERVE_MS) so the run
        // never times out — the category fallback URL (4d) is stamped instead. On Pro's
        // 300s ceiling this almost never trips, so heroes generate reliably (the old
        // "skip if >30s elapsed" Hobby guard was why heroes were dropped after a slow LLM).
        const msLeft = FN_BUDGET_MS - (Date.now() - runStartedAt);
        if (heroEnabled && msLeft > HERO_RESERVE_MS) {
          try {
            const imageData = await generateImageFast(generated.title, '16:9', heroPromptFor(rule.category, content.subCategory, heroCfg));
            // OpenRouter returns the image as a multi-MB base64 data: URI. NEVER
            // persist that in KV — it bloats each content record to ~1–2.5 MB and
            // eventually trips the Upstash capacity quota, which makes every write
            // (including approvals) fail. Sideload it to the WP media library now
            // and store only the small hosted URL. If the upload fails we leave
            // heroImageUrl unset so step 4d stamps the category fallback URL.
            if (imageData?.url) {
              const wpImg = await uploadImageToWp(imageData.url, generated.title);
              if (wpImg?.url) {
                const updated = { ...content, heroImageUrl: wpImg.url, heroImageType: 'ai', heroMediaId: wpImg.id, updatedAt: now };
                await kv.set(`content:${content.id}`, updated);
                content.heroImageUrl = wpImg.url;
                content.heroImageType = 'ai';
                content.heroMediaId = wpImg.id;
              } else {
                results.errors.push(`[info] Hero image generated but WP upload failed for "${generated.title}" — using the fallback image.`);
                await writeLog({ ruleId: rule.id, ruleName: rule.name, level: 'error', message: `Hero image generated but WP upload failed for "${generated.title}" — using the fallback image.`, contentId: content.id });
              }
            }
          } catch (imgErr) {
            results.errors.push(`Hero image failed for "${generated.title}": ${imgErr.message}`);
            // Non-fatal — article still proceeds without image. Surface it in the
            // automation log: results.errors only travels in the (discarded) cron
            // HTTP response, which is how a 4-day hero outage went unnoticed in
            // July 2026 (OpenRouter 402 — image calls reserve more credits than
            // text calls, so articles kept flowing while every hero failed).
            await writeLog({ ruleId: rule.id, ruleName: rule.name, level: 'error', message: `Hero image failed for "${generated.title}": ${imgErr.message}`, contentId: content.id });
          }
        } else if (heroEnabled) {
          results.errors.push(`[info] Hero image skipped for "${generated.title}" — ${Math.round((Date.now() - runStartedAt) / 1000)}s already elapsed this run; using the fallback image.`);
        }

        // 4d. If no hero image (disabled or generation failed), stamp the category-level
        // fallback URL on the content so manual publish and auto-publish reuse it.
        if (!content.heroImageUrl && rule.generation.heroImageFallbackUrl) {
          const updated = { ...content, heroImageUrl: rule.generation.heroImageFallbackUrl, heroImageType: 'category-fallback', updatedAt: now };
          await kv.set(`content:${content.id}`, updated);
          content.heroImageUrl = updated.heroImageUrl;
          content.heroImageType = updated.heroImageType;
        }

        if (rule.review.required) {
          // 5a. Create job and notify
          const job = buildJob({ ruleId: rule.id, contentId: content.id });
          await kv.set(`automation:job:${job.id}`, job);
          await kv.lpush('automation:jobs:index', job.id);

          // sendNotifications resolves the actual recipient set (users + external
          // emails) and returns their ids so the approve handler can enforce
          // review.mode === 'all' against who was really notified.
          const { errors: notifyErrors, reviewerIds } = await sendNotifications({ rule, job, content, fetchFn });
          if (notifyErrors.length) results.errors.push(...notifyErrors);

          // Mark job as notified AND stamp the resolved reviewer set. Re-read
          // first so we don't stomp a status change that landed during the
          // sendNotifications window.
          const current = await kv.get(`automation:job:${job.id}`);
          if (current && !TERMINAL_STATUSES.includes(current.status)) {
            await kv.set(`automation:job:${job.id}`, {
              ...current,
              notifiedAt: now,
              reviewerIds: Array.isArray(reviewerIds) ? reviewerIds : [],
            });
          }

          // Sync the content item into 'in_review' so the Pipeline UI shows the
          // article as awaiting review (not 'draft'), and populate reviewers /
          // requireAllApprovals so the kanban progress bar reads "0/N approved".
          // Approvals start empty; the approve.js handler appends voterIds on each
          // partial approval.
          const ids = Array.isArray(reviewerIds) ? reviewerIds : [];
          const liveContent = await kv.get(`content:${content.id}`);
          if (liveContent && liveContent.status === 'draft') {
            await kv.set(`content:${content.id}`, {
              ...liveContent,
              status: 'in_review',
              reviewers: ids,
              approvals: [],
              rejections: [],
              requireAllApprovals: (rule.review?.mode ?? 'any') === 'all',
              sentForReviewAt: now,
              updatedAt: now,
            });
          }
        } else {
          // 5b. Auto-publish immediately
          // Promote status to 'approved' so the publish endpoint accepts it
          // (content is created as 'draft'; publish gate requires 'approved' or 'scheduled')
          await kv.set(`content:${content.id}`, { ...content, status: 'approved', updatedAt: now });
          content.status = 'approved';

          const publishRes = await fetchFn(`${APP_URL}/api/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...internalAuthHeaders() },
            body: JSON.stringify({ id: content.id }),
          });
          let publishData = null;
          const finalStatus = publishRes.ok ? 'auto_published' : 'approved'; // fallback if publish fails
          if (publishRes.ok) {
            ruleAutoPublishedCount++;
            publishData = await publishRes.json();
            // Write the live WP URL back to the sheet row (non-fatal)
            if (item._sheetMeta && publishData?.wpPostUrl) {
              await writeSheetPublishNote(item._sheetMeta, publishData.wpPostUrl, fetchFn);
            }
          } else {
            const errBody = await publishRes.json().catch(() => ({}));
            results.errors.push(`Auto-publish failed for "${generated.title}" (HTTP ${publishRes.status}): ${errBody?.error || 'unknown error'}`);
            // Scheduled runs discard results.errors, so a guard rejection also goes in the log.
            await writeLog({ ruleId: rule.id, ruleName: rule.name, level: 'error', message: `Auto-publish failed for "${generated.title}" (HTTP ${publishRes.status}): ${errBody?.error || 'unknown error'}`, contentId: content.id });
          }

          const job = buildJob({ ruleId: rule.id, contentId: content.id, status: finalStatus });
          await kv.set(`automation:job:${job.id}`, { ...job, approvedBy: 'auto', approvedAt: now });
          await kv.lpush('automation:jobs:index', job.id);
        }
        ruleProcessedCount++;
        results.processed++;
        await writeLog({
          ruleId: rule.id,
          ruleName: rule.name,
          level: 'success',
          message: `Generated article: ${generated.title}`,
          contentId: content.id,
        });
      }

      // 6. Update rule.lastRunAt and stats — only if we actually processed items
      if (ruleProcessedCount > 0) {
        await kv.set(`automation:rule:${rule.id}`, {
          ...rule,
          lastRunAt: now,
          updatedAt: now,
          stats: {
            ...rule.stats,
            totalRuns: (rule.stats?.totalRuns ?? 0) + 1,
            articlesGenerated: (rule.stats?.articlesGenerated ?? 0) + ruleProcessedCount,
            articlesPublished: (rule.stats?.articlesPublished ?? 0) + ruleAutoPublishedCount,
          },
        });
      }
    } catch (err) {
      results.errors.push(`Rule ${rule.id}: ${err.message}`);
      await writeLog({ ruleId: rule.id, ruleName: rule.name, level: 'error', message: err.message });
    }
  }

  return { httpStatus: 200, body: results };
}
