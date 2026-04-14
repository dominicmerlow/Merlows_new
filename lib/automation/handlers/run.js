// lib/automation/handlers/run.js
import { kv } from '../../kv.js';
import cronParser from 'cron-parser';
const { CronExpressionParser } = cronParser;
import { fetchSources } from '../fetch.js';
import { writeSheetGenerationNote, writeSheetPublishNote } from '../../sources/google-sheets.js';
import { buildJob } from '../job-schema.js';
import { sendNotifications } from '../notify.js';
import { generateImageFast } from '../../social/media.js';
import { writeLog } from '../log.js';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const TERMINAL_STATUSES = ['approved', 'rejected', 'published', 'timed_out', 'auto_published'];
const DEFAULT_MODEL = 'google/gemma-3-27b-it:free';

// Maps rule.category → subtitle prefix used in generated articles
const CATEGORY_SUBTITLE_PREFIX = {
  'breaking-news':       'Breaking News',
  'diplomatic-analysis': 'Diplomatic Analysis',
  'op-eds':              'Op-Ed',
  'cyrus-accord':        'Cyrus Accord',
  'abraham-accords':     'Abraham Accords',
  'regional-voices':     'Regional Voices',
};

const DEFAULT_PROMPT_BREAKING_NEWS = `You are a journalist writing breaking news for Merlows — an independent digital news portal covering Israel-Iran relations, the Cyrus Accord, and the Abraham Accords. Transform the source material into a concise, urgent, factual news report for merlows.com.

TONE & STYLE
Urgent, factual, direct. Journalistic wire-service style. Active voice. No editorialising, no speculation beyond what is confirmed. Lead with the most important fact.

STRUCTURE
1. Headline (~8–12 words) — factual, no clickbait.
2. Lede (40–60 words) — the 5 Ws: who, what, where, when, why.
3. Background (75–100 words) — essential context a general reader needs.
4. Latest Developments (150–200 words) — key facts from the source in chronological or order-of-importance sequence.
5. What's Next (50–75 words) — expected next steps, upcoming events, or open questions.
6. Source attribution line.

OUTPUT FORMAT
Output in markdown. First line: "# " + headline. Next non-empty line: "## {{CATEGORY_PREFIX}}:" + one-line summary. All other headers use "## ".
Total length: 350–500 words. UK British English. Do not reproduce verbatim text from the source.`;

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

const DEFAULT_PROMPT_OP_EDS = `You are a commentator writing an opinion piece for Merlows — a news portal dedicated to fostering understanding between Israel and Iran and supporting the vision of the Cyrus Accord. Write for an engaged, globally-minded readership.

TONE & STYLE
Persuasive, thoughtful, constructive. Grounded in facts and history. Hopeful but not naive. You may argue a position — but acknowledge counterarguments fairly. Accessible to a general reader.

STRUCTURE
1. Title (5–10 words)
2. Subtitle starting with "Op-Ed:" — the core argument in one line (5–10 words)
3. Introduction (100–150 words) — the issue and why it matters now
4. The Case (200–250 words) — evidence and reasoning for your position
5. The Counterargument (100–150 words) — steelman the other side, then rebut it
6. The Path Forward (150–200 words) — constructive, realistic recommendation
7. Closing (75–100 words) — call to thought or action

OUTPUT FORMAT
Output in markdown. First line: "# " + title. Next non-empty line: "## {{CATEGORY_PREFIX}}:" + subtitle. All other headers use "## ".
Total length: 700–900 words. UK British English.`;

const DEFAULT_PROMPT_CYRUS_ACCORD = `You are a policy analyst writing for Merlows — an independent news portal covering the Cyrus Accord and its role in reshaping Israel-Iran relations. Produce a comprehensive, authoritative report for merlows.com.

TONE & STYLE
Formal, authoritative, policy-focused. Correct diplomatic and geopolitical terminology. Continuous prose with section headers. Balanced treatment of all parties. Active voice where natural.

STRUCTURE
1. Title Block — full title, subtitle, prepared for Merlows, date.
2. Executive Summary (100–150 words)
3. Background (150–200 words) — the Cyrus Accord's origins and objectives
4. Current Status (200–300 words) — where things stand as of the source material
5. Key Provisions or Developments (250–350 words) — the substance of what the source covers
6. Regional Impact (150–200 words) — how this affects the broader Middle East
7. Outlook (100–150 words)
8. Source references.

OUTPUT FORMAT
Output in markdown. First line: "# " + title. Next non-empty line: "## {{CATEGORY_PREFIX}}:" + subtitle. All other headers use "## ".
Total length: 1,000–1,400 words. UK British English. Add note: This report is for informational purposes. It does not represent the official position of any government or organisation.`;

const DEFAULT_PROMPT_ABRAHAM_ACCORDS = `You are a diplomatic correspondent writing for Merlows — an independent news portal covering Middle East normalisation and the Abraham Accords. Write a balanced, context-rich report for merlows.com.

TONE & STYLE
Balanced, context-rich, factual. Journalistic but with depth. Acknowledge complexity. Active voice. Accessible to readers without specialist knowledge of the region.

STRUCTURE
1. Headline (~10 words) — clear, informative.
2. Context (75–100 words) — what the Abraham Accords are and where they stand today.
3. Progress Made (150–200 words) — concrete developments covered by the source.
4. Challenges (150–200 words) — honest assessment of obstacles and tensions.
5. Israel-Iran Dimension (100–150 words) — how this relates to the Merlows focus area.
6. Path Forward (100–125 words) — what comes next realistically.
7. Source attribution.

OUTPUT FORMAT
Output in markdown. First line: "# " + headline. Next non-empty line: "## {{CATEGORY_PREFIX}}:" + one-line framing. All other headers use "## ".
Total length: 600–900 words. UK British English. Do not editoralise beyond what the source supports.`;

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
  'op-eds':              DEFAULT_PROMPT_OP_EDS,
  'cyrus-accord':        DEFAULT_PROMPT_CYRUS_ACCORD,
  'abraham-accords':     DEFAULT_PROMPT_ABRAHAM_ACCORDS,
  'regional-voices':     DEFAULT_PROMPT_REGIONAL_VOICES,
};

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
  const res = await fetchFn('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': APP_URL,
      'X-Title': 'IBD Health Hub Content Generator',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  return res.json();
}

async function generateArticle(item, rule, fetchFn = fetch) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY environment variable not set');

  // Normalize legacy / unqualified model IDs to OpenRouter-valid slugs.
  // Older rules stored short names like "claude-sonnet-4-5" which OpenRouter rejects.
  // Map legacy / retired model IDs to working OpenRouter slugs.
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
  const primaryModel = LEGACY_MODEL_MAP[rawModel] || rawModel;
  const categoryPrefix = CATEGORY_SUBTITLE_PREFIX[rule.category] || 'Clinical Review';
  const defaultForCategory = CATEGORY_PROMPTS[rule.category] || DEFAULT_PROMPT;
  const basePrompt = (rule.generation?.prompt?.trim() || defaultForCategory)
    .replace(/\{\{CATEGORY_PREFIX\}\}/g, categoryPrefix);
  const fullPrompt = `${basePrompt}\n\nSOURCE FILE: ${item.title}\n\nSOURCE MATERIAL:\n${item.rawText || '(source text not available — generate based on the filename/title only)'}`;

  const chain = buildFallbackChain(primaryModel);
  let lastError = null;

  for (const model of chain) {
    const data = await callLLM(model, fullPrompt, apiKey, fetchFn);
    const text = data.choices?.[0]?.message?.content;

    if (text) {
      const lines = text.trim().split('\n');
      let title = item.title;
      let body = text.trim();
      if (lines[0].startsWith('#')) {
        title = lines[0].replace(/^#+\s*/, '').trim();
        // Strip known category prefixes that older/fallback prompts may inject into the title
        title = title.replace(/^(Clinical Review|Op[- ]Ed|IBD Industry News|Industry News|White Paper|Infographic|IBD Living|Living with IBD)\s*:\s*/i, '').trim();
        body = lines.slice(1).join('\n').trimStart();
      }
      const usedFallback = model !== primaryModel;
      return { title, body, model: usedFallback ? `${model} (fallback from ${primaryModel})` : model };
    }

    // If rate-limited or model unavailable, try the next model in the chain
    if (isRateLimited(data)) {
      lastError = `${model}: rate-limited`;
      continue;
    }
    if (isModelUnavailable(data)) {
      lastError = `${model}: unavailable (${data.error?.message})`;
      continue;
    }

    // Other error — don't retry, just fail
    throw new Error(`LLM returned no content: ${JSON.stringify(data).slice(0, 300)}`);
  }

  throw new Error(`All models rate-limited: ${lastError}`);
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

async function processTimeouts(now, fetchFn = fetch) {
  const ids = await kv.lrange('automation:jobs:index', 0, -1);
  for (const id of ids) {
    try {
      const job = await kv.get(`automation:job:${id}`);
      if (!job || job.status !== 'pending_review') continue;
      const rule = await kv.get(`automation:rule:${job.ruleId}`);
      if (!rule) continue;
      const ageHours = (new Date(now) - new Date(job.createdAt)) / (1000 * 60 * 60);
      if (ageHours < rule.review.timeoutHours) continue;

      const onTimeout = rule.review.onTimeout ?? 'approve';
      if (onTimeout === 'approve' || onTimeout === 'reject') {
        await fetchFn(`${APP_URL}/api/automation/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: job.id, action: onTimeout, channel: 'timeout' }),
        });
      } else {
        // 'skip' — mark as timed out without actioning
        await kv.set(`automation:job:${id}`, { ...job, status: 'timed_out', updatedAt: now });
      }
    } catch (err) {
      console.error(`Timeout processing failed for job ${id}:`, err.message);
    }
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res, { fetchFn = fetch } = {}) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const now = new Date().toISOString();
  const results = { processed: 0, errors: [] };

  // 1. Process timeouts first (skip for manual single-rule runs)
  const forcedRuleId = req.method === 'POST' ? req.body?.ruleId : null;
  const forceFiles   = req.method === 'POST' ? (req.body?.forceFiles || null) : null;
  if (!forcedRuleId) await processTimeouts(now, fetchFn);

  // 2. Load rules — single forced rule or all due rules
  let dueRules;
  if (forcedRuleId) {
    const rule = await kv.get(`automation:rule:${forcedRuleId}`);
    if (!rule) return res.status(404).json({ error: 'Rule not found' });
    dueRules = [rule];
  } else {
    const ids = await kv.lrange('automation:rules:index', 0, -1);
    if (!ids.length) return res.status(200).json({ ...results, message: 'No rules configured' });
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
    try {
      // 3. Fetch sources — manual forced runs ignore lastRunAt so all existing files are eligible
      let ruleAutoPublishedCount = 0;
      let { items: sourceItems, sourceErrors } = await fetchSources(rule.sources, forcedRuleId ? null : rule.lastRunAt, fetchFn, rule.id);
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
      // Vercel Hobby has a 60s function ceiling. Each article costs ~15–20s (LLM)
      // + ~15–20s (hero image), so we clamp aggressively:
      //   - hero enabled, scheduled run:        max 2 articles
      //   - hero enabled, manual re-process:    max 1 article (tighter — user is interactive)
      //   - hero disabled:                      respect rule.maxArticlesPerRun
      const requestedMax = rule.generation.maxArticlesPerRun;
      if (!requestedMax) results.errors.push(`[debug] maxArticlesPerRun is ${requestedMax} — no items will be processed`);
      // Treat missing/undefined as true (legacy rules pre-dating the heroImage field)
      const heroEnabled = rule.generation.heroImage !== false;
      const isManualReprocess = !!(forceFiles && forceFiles.length);
      let max;
      if (heroEnabled) {
        // Hero image + LLM generation together approach the 60s Vercel function ceiling.
        // Cap at 1 article per run regardless of run type to avoid FUNCTION_INVOCATION_TIMEOUT.
        max = 1;
      } else {
        max = requestedMax || 0;
      }
      if (heroEnabled && sourceItems.length > 1) {
        results.errors.push(`[info] Limited to 1 article per run (hero image enabled). Remaining items will be picked up next run.`);
      }
      const toProcess = sourceItems.slice(0, max);
      let ruleProcessedCount = 0;
      for (const item of toProcess) {
        // 4a. Call LLM to generate the article from source text
        let generated;
        try {
          generated = await generateArticle(item, rule, fetchFn);
        } catch (llmErr) {
          results.errors.push(`LLM generation failed for "${item.title}": ${llmErr.message}`);
          continue;
        }

        // 4b. Store the generated article
        const genRes = await fetchFn(`${APP_URL}/api/content`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: generated.title,
            body: generated.body,
            model: generated.model,
            category: rule.category,
            wpCategorySlug: rule.wpCategorySlug ?? null,
            template: rule.generation.template,
            automationRuleId: rule.id,
          }),
        });

        if (!genRes.ok) {
          results.errors.push(`Content store failed: ${generated.title}`);
          continue;
        }
        const content = await genRes.json();

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

        // 4c. Generate hero image (fast path — no prompt-building LLM call)
        if (heroEnabled) {
          try {
            const imageData = await generateImageFast(generated.title, '16:9');
            if (imageData?.url) {
              const updated = { ...content, heroImageUrl: imageData.url, heroImageType: 'ai', updatedAt: now };
              await kv.set(`content:${content.id}`, updated);
              content.heroImageUrl = imageData.url;
              content.heroImageType = 'ai';
            }
          } catch (imgErr) {
            results.errors.push(`Hero image failed for "${generated.title}": ${imgErr.message}`);
            // Non-fatal — article still proceeds without image
          }
        }

        if (rule.review.required) {
          // 5a. Create job and notify
          const job = buildJob({ ruleId: rule.id, contentId: content.id });
          await kv.set(`automation:job:${job.id}`, job);
          await kv.lpush('automation:jobs:index', job.id);

          const notifyErrors = await sendNotifications({ rule, job, content, fetchFn });
          if (notifyErrors.length) results.errors.push(...notifyErrors);

          // Mark job as notified
          await kv.set(`automation:job:${job.id}`, { ...job, notifiedAt: now });
        } else {
          // 5b. Auto-publish immediately
          // Promote status to 'approved' so the publish endpoint accepts it
          // (content is created as 'draft'; publish gate requires 'approved' or 'scheduled')
          await kv.set(`content:${content.id}`, { ...content, status: 'approved', updatedAt: now });
          content.status = 'approved';

          const publishRes = await fetchFn(`${APP_URL}/api/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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

  return res.status(200).json(results);
}
