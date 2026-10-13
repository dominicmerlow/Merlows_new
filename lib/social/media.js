import { openRouterCharge } from './pack/cost.js';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1/chat/completions';

// ── Video model config ───────────────────────────────────────────────────────
// The fal.ai text-to-video model is env-driven so cheaper models can be A/B'd
// without a code edit (mirrors SOCIAL_IMAGE_MODELS for images). Default is the
// long-standing Kling v2.1 standard endpoint — leaving SOCIAL_VIDEO_MODEL unset
// keeps behaviour byte-identical to before this was parameterised.
//
// Cheaper fal alternatives to try via SOCIAL_VIDEO_MODEL (verify each model's
// param schema on first run — duration/aspect handling differs per model):
//   fal-ai/minimax/hailuo-02/standard/text-to-video   (budget; duration '6'|'10')
//   fal-ai/veo3/fast                                   (Google Veo 3 fast; ~8s, with audio)
//   fal-ai/wan/v2.2-5b/text-to-video                   (mid-tier)
// Per-model param quirks live in VIDEO_PARAMS below; unknown models fall back to
// the Kling-style { duration:'10', aspect_ratio:'9:16' } shape.
const DEFAULT_VIDEO_MODEL = 'fal-ai/kling-video/v2.1/standard/text-to-video';
const VIDEO_MODEL = (process.env.SOCIAL_VIDEO_MODEL || DEFAULT_VIDEO_MODEL).replace(/^\/+|\/+$/g, '');
const FAL_BASE = `https://fal.run/${VIDEO_MODEL}`;
const FAL_STATUS_BASE = `https://fal.run/${VIDEO_MODEL}/requests`;

// Per-model request params. Default (and any unlisted model) uses Kling's shape.
const VIDEO_PARAMS = {
  'fal-ai/kling-video/v2.1/standard/text-to-video': { duration: '10', aspect_ratio: '9:16' },
  'fal-ai/minimax/hailuo-02/standard/text-to-video': { duration: '10' }, // Hailuo-02 has no aspect_ratio param
  'fal-ai/veo3/fast': { aspect_ratio: '9:16' },                          // Veo 3 fast is fixed ~8s, no duration param
};
function videoParamsFor(model) {
  return VIDEO_PARAMS[model] || { duration: '10', aspect_ratio: '9:16' };
}

const OR_HEADERS = {
  'Content-Type': 'application/json',
  'HTTP-Referer': 'https://merlows.vercel.app',
  'X-Title': 'Merlows Content Generator',
};

// ── Image model config ───────────────────────────────────────────────────────
// Gemini models require ['image', 'text']; all others require ['image'] only.
// Valid OpenRouter image-output slugs (verified against the OpenRouter catalogue).
// The previously-configured slugs (`…-flash-image-preview-20260226`,
// `sourceful/riverflow-*`, `bytedance-seed/seedream-4.5`) do NOT exist on OpenRouter
// and 404'd EVERY request — which is why hero-image generation always failed.
const IMAGE_MODELS = {
  // gemini-3.1-flash-lite-image is the cheapest image-output model on OpenRouter
  // ($1.50/M out vs $2.50 for 2.5-flash-image, verified 2026-07-14), so it leads
  // the chain with 2.5-flash as the one fallback. 3.1-flash-image is still a valid slug
  // (`SOCIAL_IMAGE_MODELS` can name it) but is NOT in the default chain: a bad day should
  // cost at most one step up in price, not two.
  'google/gemini-3.1-flash-lite-image': { modalities: ['image', 'text'] },
  'google/gemini-2.5-flash-image':      { modalities: ['image', 'text'] },
};
const DEFAULT_IMAGE_MODEL = 'google/gemini-3.1-flash-lite-image';

// Primary → fallback chain. Defaults to the configured models above; overridable
// via SOCIAL_IMAGE_MODELS (comma-separated slugs, primary first) without code edits.
const IMAGE_MODEL_CHAIN = (process.env.SOCIAL_IMAGE_MODELS
  ? process.env.SOCIAL_IMAGE_MODELS.split(',').map(s => s.trim()).filter(Boolean)
  : Object.keys(IMAGE_MODELS)
);

function getModalities(model) {
  return IMAGE_MODELS[model]?.modalities || (model.startsWith('google/') ? ['image', 'text'] : ['image']);
}

// ── Response parsing — three formats per SLAVATOOL handover ──────────────────
function extractImageUrl(data) {
  // Format 1: images[] array with image_url.url (dedicated image models)
  const imgObj = data.choices?.[0]?.message?.images?.[0];
  if (imgObj?.image_url?.url) return imgObj.image_url.url;
  // Also handle bare string in images array
  if (typeof imgObj === 'string' && imgObj.startsWith('data:')) return imgObj;

  // Format 2: base64 data URI in content string
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.startsWith('data:')) return content;

  // Format 3: content as array of parts (Gemini native)
  if (Array.isArray(content)) {
    const imgPart = content.find(p => p.type === 'image_url');
    if (imgPart?.image_url?.url) return imgPart.image_url.url;
  }

  return null;
}

// ── Image generation with primary → fallback chain ──────────────────────────
async function callImageModel(model, prompt, aspectRatio, onCharge) {
  // Abort a slow/hung image model after 30s — generateWithFallback moves on. The
  // automation runner keeps the whole job under the Pro 300s function ceiling.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), Number(process.env.IMAGE_CALL_TIMEOUT_MS) || 30000);
  let res;
  try {
    res = await fetch(OPENROUTER_BASE, {
      method: 'POST',
      headers: { ...OR_HEADERS, 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        modalities: getModalities(model),
        image_config: { aspect_ratio: aspectRatio },
        usage: { include: true }, // billed amount in usage.cost, for the social pack's cost record
      }),
      signal: ac.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || '';
    const e = new Error(`Image error ${res.status}: ${msg}`);
    e.status = res.status;
    throw e;
  }
  const data = await res.json();
  // Reported before the image is checked: a reply with no image in it was still billed.
  onCharge?.(openRouterCharge(data, { perImage: true }));
  const imageUrl = extractImageUrl(data);
  if (!imageUrl) {
    const msgDump = JSON.stringify(data?.choices?.[0]?.message ?? data).slice(0, 600);
    const finishReason = data?.choices?.[0]?.finish_reason || 'unknown';
    const e = new Error(`No image in response (model=${model}, finish=${finishReason}): ${msgDump}`);
    e.status = 502;
    throw e;
  }
  return imageUrl;
}

/**
 * Generate an image from an EXACT prompt, with the model fallback chain, per-call
 * timeouts and the overall budget. Exported for the social autopilot, whose per-point
 * stills need their own prompt rather than the hero-prompt template that
 * `generateImageFast` composes.
 */
export async function generateWithFallback(prompt, aspectRatio, chain = IMAGE_MODEL_CHAIN, { onCharge } = {}) {
  let lastErr;
  const startedAt = Date.now();
  const IMG_BUDGET_MS = Number(process.env.IMG_BUDGET_MS) || 45000; // bound total image attempts (Pro 300s ceiling)
  for (const model of chain) {
    if (Date.now() - startedAt > IMG_BUDGET_MS) {
      lastErr = lastErr || new Error('Image generation time budget exhausted');
      break;
    }
    try {
      const url = await callImageModel(model, prompt, aspectRatio, onCharge);
      return { url, model };
    } catch (err) {
      lastErr = err;
      // Don't fall through on auth/credit errors — those affect every model.
      if (err.status === 401 || err.status === 403) throw new Error('Image API key invalid');
      if (err.status === 402) throw new Error('OpenRouter credits exhausted — add credits at openrouter.ai');
    }
  }
  throw lastErr || new Error('All image models failed');
}

// ── Prompt building (step 1 — uses free/cheap text model) ────────────────────
async function craftImagePrompt(articleTitle, articleExcerpt, platform) {
  const instruction = `You are an expert at writing image generation prompts for news and current-affairs editorial content.

Content topic: ${articleTitle}
Context: ${articleExcerpt.slice(0, 400)}
Image type: ${platform} hero image
Base style: professional photojournalistic / editorial image relevant to the subject (real-world places, architecture, landscapes, objects or tasteful abstract editorial motifs)

CRITICAL COMPOSITION RULE: All visual elements, objects, and focal points MUST be positioned on the RIGHT SIDE of the image. The LEFT SIDE must be clean, minimal, or softly blurred — this area will have text overlaid on top of it. Think of it as a 60/40 split: left 40% is empty/subtle gradient, right 60% has the visual content.

CRITICAL NO-TEXT RULE: The generated image must contain ABSOLUTELY NO text, words, letters, numbers, labels, captions, watermarks, logos, or any form of written characters. This is non-negotiable. The prompt you write must explicitly state "no text" and must not describe any text elements.

CRITICAL NO-MEDICAL RULE: The image must contain NO clinical, medical, healthcare, molecular, chemical, atoms, DNA double-helices, ball-and-stick models, lab-glassware or any "science cliché" imagery. Do NOT describe such elements in the prompt. Use real-world editorial, documentary, or tasteful abstract imagery relevant to the topic instead.

Write a single, detailed image generation prompt (max 80 words).
Include: visual style, right-weighted composition, colours (deep navy and slate with a restrained teal accent), mood, lighting.
End the prompt with: "Absolutely no text, words, letters, or typography anywhere in the image. No clinical, medical or molecular imagery."
Return ONLY the prompt, nothing else.`;

  const res = await fetch(OPENROUTER_BASE, {
    method: 'POST',
    headers: {
      ...OR_HEADERS,
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      messages: [{ role: 'user', content: instruction }],
    }),
  });
  if (!res.ok) {
    // Non-fatal: fall back to a simple prompt
    return `Professional editorial news illustration about ${articleTitle}, visual elements positioned on right side of image, left side clean minimal gradient, deep navy and slate palette with a teal accent, modern composition, no clinical or medical or molecular imagery, no text`;
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim()
    || `Professional editorial news illustration about ${articleTitle}, visual elements positioned on right side of image, left side clean minimal gradient, deep navy and slate palette with a teal accent, modern composition`;
}

// ── Image generation (step 2 — paid model) ───────────────────────────────────

/**
 * Default hero image prompt template. The `{topic}` token is replaced with the
 * article subject at generation time. Editable per-category via the LLM page /
 * category editor (KV hero-prompts) — this is only the fallback used when nothing
 * is configured.
 */
export const DEFAULT_HERO_PROMPT_TEMPLATE =
  `Professional editorial hero image for a news and current-affairs article about: {topic}. ` +
  `Right-weighted composition: all visual elements on the RIGHT 60% of the frame; ` +
  `the LEFT 40% kept clean with a subtle dark navy gradient for text overlay. ` +
  `Style: clean modern photojournalistic / editorial aesthetic — real-world places, architecture, landscapes, objects or tasteful abstract editorial motifs relevant to the subject, ` +
  `deep navy and slate palette with a single restrained teal (#0D9488) accent and neutral tones, soft natural lighting, calm authoritative mood, no close-up identifiable faces, ` +
  `widescreen 16:9 cinematic. ` +
  `STRICTLY NO clinical, medical, healthcare, molecular, chemical, atoms, DNA helices, ball-and-stick models, lab-glassware or generic "science-y" imagery. ` +
  `Absolutely no text, words, letters, numbers, labels, captions, watermarks, logos, or typography anywhere in the image.`;

/**
 * Build a hero image prompt directly from the article title — no LLM call.
 * Used by the automation runner to skip the prompt-building round-trip.
 * An optional `template` (the category's configured prompt) overrides the
 * default; `{topic}` / `{title}` tokens are substituted, and if the template
 * carries no token the article subject is appended so the image still tracks
 * the content.
 */
function buildDirectHeroPrompt(articleTitle, template) {
  const topic = (articleTitle || 'current affairs').replace(/^(Breaking News|Diplomatic Analysis|BlitzSpirit|Cyrus Accord|Abraham Accords|Regional Voices|Op[- ]Ed):?\s*/i, '').slice(0, 120);
  const chosen = (typeof template === 'string' && template.trim()) ? template.trim() : DEFAULT_HERO_PROMPT_TEMPLATE;
  const hasToken = /\{topic\}|\{title\}/i.test(chosen);
  const filled = chosen
    .replace(/\{topic\}/gi, topic)
    .replace(/\{title\}/gi, (articleTitle || topic));
  return hasToken ? filled : `${filled} (Subject: ${topic}.)`;
}

/**
 * Fast-path image generation with NO prompt-building LLM call.
 * Use this in automation/cron contexts where a deterministic prompt is fine
 * and the LLM round-trip would be wasted. Pass `template` to apply a
 * category-specific hero prompt.
 */
export async function generateImageFast(articleTitle, aspectRatio = '16:9', template) {
  const prompt = buildDirectHeroPrompt(articleTitle, template);
  const { url, model } = await generateWithFallback(prompt, aspectRatio);
  return { url, model, prompt, aspectRatio };
}

/**
 * Generate a static image for a platform or hero use (two-step pipeline with prompt crafting).
 * @param {string} articleTitle
 * @param {string} articleExcerpt
 * @param {string} platform - 'instagram'|'tiktok'|'linkedin'|'facebook'|'hero'
 * @param {string} aspectRatio - '4:5'|'1:1'|'16:9'|'9:16'
 * @returns {{ url: string, model: string, prompt: string, aspectRatio: string }}
 */
export async function generateImage(articleTitle, articleExcerpt, platform, aspectRatio) {
  const rawPrompt = await craftImagePrompt(articleTitle, articleExcerpt, platform);
  // Enforce no-text + no-medical rules directly on the image model prompt as a hard suffix
  const prompt = rawPrompt.replace(/\.?\s*$/, '') + '. Absolutely no text, words, letters, numbers, or typography anywhere in the image. STRICTLY no clinical, medical, healthcare, molecular, chemical, DNA or lab imagery — use real-world editorial, documentary, or tasteful abstract imagery relevant to the topic instead.';

  // Choose model: Gemini for general use, Riverflow for text-heavy professional
  // platforms. The preferred model leads a fallback chain so a single-model
  // outage degrades gracefully instead of failing the request.
  const preferred = ['linkedin', 'facebook'].includes(platform)
    ? 'google/gemini-3-pro-image'
    : DEFAULT_IMAGE_MODEL;
  const chain = [preferred, ...IMAGE_MODEL_CHAIN.filter(m => m !== preferred)];

  const { url, model } = await generateWithFallback(prompt, aspectRatio, chain);
  return { url, model, prompt, aspectRatio };
}

/**
 * Start a FAL.ai video generation job. Returns the request_id for polling.
 * Caller is responsible for polling getVideoStatus().
 */
export async function startVideoGeneration(reelScript, articleTitle) {
  // Off by default. The autopilot renders its own video in Remotion; this fal.ai path bills
  // per clip (two per "Generate Kit" click) and the result is never posted. Opt in with
  // SOCIAL_LEGACY_VIDEO=on.
  if (String(process.env.SOCIAL_LEGACY_VIDEO ?? '').toLowerCase() !== 'on') {
    throw new Error('fal.ai video generation is disabled (set SOCIAL_LEGACY_VIDEO=on to enable)');
  }
  const instruction = `Write a visual scene description (max 100 words) for a 10-second social media video based on this script:
HOOK: ${reelScript.hook}
BODY: ${reelScript.body}
CTA: ${reelScript.cta}
Topic: ${articleTitle}
Style: professional, clean, editorial news aesthetic, deep navy and slate palette with a restrained teal accent.
Output ONLY the scene description.`;

  const promptRes = await fetch(OPENROUTER_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://merlows.vercel.app',
      'X-Title': 'Merlows Content Generator',
    },
    body: JSON.stringify({
      model: 'deepseek/deepseek-chat-v3-0324:free',
      messages: [{ role: 'user', content: instruction }],
    }),
  });
  const promptData = await promptRes.json();
  const videoPrompt = promptData.choices?.[0]?.message?.content?.trim() || `Professional editorial news video about ${articleTitle}`;

  const res = await fetch(FAL_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Key ${process.env.FAL_KEY}`,
    },
    body: JSON.stringify({
      prompt: videoPrompt,
      ...videoParamsFor(VIDEO_MODEL),
    }),
  });

  const data = await res.json();
  if (!data.request_id) throw new Error(`FAL.ai job start failed (model=${VIDEO_MODEL}): ${JSON.stringify(data)}`);

  return { requestId: data.request_id, prompt: videoPrompt, model: VIDEO_MODEL };
}

/**
 * Poll FAL.ai for a video job result.
 * @returns {{ status: 'COMPLETED'|'IN_PROGRESS'|'FAILED', url?: string }}
 */
export async function getVideoStatus(requestId) {
  const res = await fetch(`${FAL_STATUS_BASE}/${requestId}`, {
    headers: { 'Authorization': `Key ${process.env.FAL_KEY}` },
  });
  const data = await res.json();

  if (data.status === 'COMPLETED') {
    return { status: 'COMPLETED', url: data.output?.video?.url };
  }
  if (data.status === 'FAILED') {
    return { status: 'FAILED', error: data.error };
  }
  return { status: 'IN_PROGRESS' };
}
