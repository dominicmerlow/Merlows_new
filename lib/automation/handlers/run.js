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
  'clinical-reviews': 'Clinical Review',
  'industry-news':    'Industry News',
  'op-eds':           'Op-Ed',
  'white-papers':     'White Paper',
  'infographics':     'Infographic',
  'ibd-living':       'IBD Living',
};

const DEFAULT_PROMPT = `You are a medical writer creating a curated clinical paper review for publication on an IBD content hub website (ibdhealthhub.com). a structured, objective summary of a single published clinical trial intended for a physician audience. Your role is purely curatorial: you present what the paper reports, nothing more. You do not add clinical commentary, personal opinion, practice recommendations, or conclusions beyond those stated by the authors.

TONE & STYLE
Write in clear, precise clinical language appropriate for a practicing physician. Use correct medical and pharmacological terminology throughout. The tone is neutral, factual, and authoritative — like a well-written abstract expanded into a readable narrative. Avoid advocacy language, hedging phrases like "interestingly" or "remarkably," and any framing that implies editorial judgment. Use bullet points rarely in the body of the article. Write in continuous prose with section headers. Active voice is preferred where natural.

STRUCTURE
1. Title (~5–12 words): a concise, descriptive version of the paper title — no category prefix.
2. Subtitle (~5–12 words): a statement related to the conclusion of the source document.
3. Background & Rationale (~100–150 words)
4. Study Design (~100–150 words)
5. Patient Population (~75–100 words)
6. Key Findings (~150–250 words) — avoid CIs, ORs, p-values; use plain numerical values
7. Discussion (150–200 words) — real world implications + safety/tolerability
8. Authors' Conclusions (~75–100 words) — attributed to the study authors
9. Reference — full citation in Vancouver format

OUTPUT FORMAT
Output the article in markdown. The very first line MUST be the title prefixed with "# " — NO category prefix in the title (e.g. "# Fish Oil Supplementation in Active Crohn's Disease"). The very next non-empty line MUST be the subtitle prefixed with "## " starting with "{{CATEGORY_PREFIX}}:" (e.g. "## {{CATEGORY_PREFIX}}: Enteric-coated fish oil reduced relapse rates at one year"). All other section headers (Background & Rationale, Study Design, etc.) MUST use "## ".

Total length: 800–1000 words. Do not exceed 1000 words. Do not pad. UK British English. All data points must match the paper exactly. Do not reproduce verbatim text from the source.`;

const DEFAULT_PROMPT_INDUSTRY_NEWS = `You are a medical journalist writing for IBD Health Hub — a UK-based IBD and gastrointestinal health digital research platform. Transform the source material into a clear, engaging Industry News article for ibdhealthhub.com.

TONE & STYLE
Clear, engaging journalistic prose — authoritative but accessible. Correct clinical terminology with brief context. Active voice. Avoid sensationalism.

STRUCTURE
1. Headline (~10 words) — clear, informative, no clickbait.
2. Lead Paragraph (50–75 words) — what happened, why it matters, who it affects.
3. Background Context (75–125 words) — relevant disease or treatment context.
4. Key Findings (150–200 words) — most important results, plain numerical values, attributed to authors.
5. Clinical Relevance (75–125 words) — why this matters for IBD patients or clinicians.
6. Reference — full citation in Vancouver format.

OUTPUT FORMAT
Output in markdown. First line: "# " + headline. Next non-empty line: "## IBD Industry News:" + subtitle. All other headers use "## ".
Total length: 450–600 words. UK British English. Add disclaimer: This article is a journalistic summary for informational purposes only. It does not constitute clinical advice.`;

const DEFAULT_PROMPT_OP_EDS = `You are a doctor writing an opinion-led article for people living with IBD for an online IBD community platform. Translate clinical knowledge into practical guidance patients can apply in daily life.

TONE & STYLE
Clear, calm, authoritative. Accessible language, grounded in medical understanding. Reassuring, practical, credible. You may interpret evidence — but do not overstate findings.

STRUCTURE
1. Title (5–10 words)
2. Subtitle starting with "Op Ed:" — key clinical takeaway (5–10 words)
3. Introduction (100–150 words) — topic and why it matters for IBD patients
4. What the Evidence Shows (150–200 words) — key findings in simple terms
5. What This Means for Patients (200–300 words) — real-world context
6. Practical Advice I Give My Patients (200–300 words) — actionable guidance
7. Final Thoughts (100–150 words) — balanced clinical perspective

OUTPUT FORMAT
Output in markdown. First line: "# " + title. Next non-empty line: "## Op Ed:" + subtitle. All other headers use "## ".
Total length: 700–900 words. UK British English.`;

const DEFAULT_PROMPT_WHITE_PAPERS = `You are a scientific medical writer producing a White Paper for IBD Health Hub. Synthesise clinical evidence into a comprehensive, structured white paper on an IBD or gastrointestinal topic.

TONE & STYLE
Formal, systematic, evidence-led. Correct clinical terminology. Continuous prose. Active voice where natural.

STRUCTURE
1. Title Block — full title, subtitle, prepared for IBD Health Hub, date.
2. Executive Summary (150–200 words)
3. Background & Clinical Context (200–300 words)
4. Evidence Review (400–600 words) — summarise key evidence by theme
5. Clinical Implications (200–300 words)
6. Gaps & Future Research (100–150 words)
7. Conclusion (100–150 words)
8. References — Vancouver format

OUTPUT FORMAT
Output in markdown. First line: "# " + title. Next non-empty line: "## White Paper:" + subtitle. All other headers use "## ".
Total length: 1,400–2,000 words. UK British English. Add disclaimer.`;

const DEFAULT_PROMPT_INFOGRAPHICS = `You are a medical content designer producing infographic copy for IBD Health Hub. Transform clinical findings into structured, visually optimised copy.

OUTPUT STRUCTURE
HEADLINE (max 12 words), SUBHEADLINE (max 20 words), KEY FACTS (4–6 items as stat + brief explanation), MECHANISM OR PROCESS (3–5 steps if relevant), PATIENT TAKEAWAY (max 25 words), HCP TAKEAWAY (max 25 words), DISCLAIMER.

OUTPUT FORMAT
Output in markdown. First line: "# " + headline. Next non-empty line: "## Infographic:" + subheadline. Content blocks as plain labelled sections.
Total: 150–300 words. UK British English.`;

const DEFAULT_PROMPT_IBD_LIVING = `You are a writer creating an engaging opinion piece for people living with IBD for an online community platform. Make complex medical ideas easy to understand while offering practical, real-world insights.

TONE & STYLE
Warm, conversational, empathetic. Write as if speaking to a friend who happens to have medical expertise. Accessible language, no unnecessary jargon.

STRUCTURE
1. Title (5–10 words)
2. Subtitle starting with "IBD Living:" — main takeaway (5–10 words)
3. Introduction (100–150 words)
4. Understanding the Topic (150–200 words)
5. What This Means for You (200–300 words) — practical implications
6. Simple Steps You Can Take (200–300 words) — actionable advice
7. Final Thoughts (100–150 words)

OUTPUT FORMAT
Output in markdown. First line: "# " + title. Next non-empty line: "## IBD Living:" + subtitle. All other headers use "## ".
Total length: 700–900 words. UK British English.`;

// Category → default prompt mapping (server-side equivalent of getCatDefaultPrompt)
const CATEGORY_PROMPTS = {
  'clinical-reviews': DEFAULT_PROMPT,
  'industry-news':    DEFAULT_PROMPT_INDUSTRY_NEWS,
  'op-eds':           DEFAULT_PROMPT_OP_EDS,
  'white-papers':     DEFAULT_PROMPT_WHITE_PAPERS,
  'infographics':     DEFAULT_PROMPT_INFOGRAPHICS,
  'ibd-living':       DEFAULT_PROMPT_IBD_LIVING,
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
