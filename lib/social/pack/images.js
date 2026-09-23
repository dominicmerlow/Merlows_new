// lib/social/pack/images.js
// Vertical (9:16) stills for a social pack.
//
// The article's WordPress hero is 16:9, which the templates letterbox over a blurred fill.
// That works, but a story told over one reused photo looks like one reused photo, so each
// key point gets its own image, generated from the brief the script step wrote.
//
// Editorial rules are enforced HERE rather than trusted to the model: the briefs come from
// an LLM reading an RSS-sourced article, and the output is published as news. No photoreal
// depiction of a real event, no real person's face, no invented document.

import { generateWithFallbackPublic } from './image-client.js';

/** How many generated stills per story, on top of the hero. */
export const STILLS_PER_PACK = Number(process.env.SOCIAL_STILLS_PER_PACK) || 2;
/** Stop starting new images once a stage has run this long. */
const PACK_BUDGET_MS = Number(process.env.SOCIAL_IMAGE_BUDGET_MS) || 150_000;
const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * House style, appended to every brief.
 *
 * `craftImagePrompt` in lib/social/media.js does something similar for hero images; this is
 * deliberately separate because the rules differ: a social still is seen at arm's length on
 * a phone, under burned-in text, and is far more likely to be mistaken for footage.
 */
export const STYLE_SUFFIX = [
  'Editorial illustration for a British news brand.',
  'Deep navy and slate palette with restrained gold accents.',
  'Symbolic and atmospheric: maps, flags, skylines, silhouettes, architecture, weather.',
  'Composition weighted to the upper two thirds, lower third quiet for captions.',
  'NO text, letters, numbers, logos or watermarks anywhere in the image.',
  'NO recognisable real person, no face resembling a public figure.',
  'NOT photorealistic reportage: it must not be mistakable for a photograph of the event.',
  'No gore, no bodies, no graphic injury, no children in distress.',
].join(' ');

/** Briefs are model output, so they are sanitised before they reach an image model. */
export function briefToPrompt(brief, { headline }) {
  const cleaned = String(brief ?? '')
    // Control characters first: a brief is LLM output derived from an RSS-sourced article and
    // is about to be pasted into another model's prompt. Collapsing whitespace alone let NUL,
    // ESC and friends through, because only tab and newline are both.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[<>{}]/g, ' ')
    .trim()
    .slice(0, 300);
  const subject = cleaned || `An editorial scene illustrating: ${String(headline ?? '').slice(0, 160)}`;
  return `${subject}. ${STYLE_SUFFIX}`;
}

/**
 * Which points get their own image.
 *
 * The strongest points come first in the script, so the first N briefs are used; the rest of
 * the slides fall back to the hero, which the templates already handle.
 */
export function briefsFor(pack, count = STILLS_PER_PACK) {
  return (pack.points ?? [])
    .map((point, index) => ({ index, brief: point.imageBrief }))
    .filter((entry) => entry.brief)
    .slice(0, count);
}

/**
 * Generate the stills and store them.
 *
 * Returns the `images` array the templates read, and the per-point `image` indices. The hero
 * stays at index 0 — it is the opening frame, and it is the one image that is definitely of
 * this story.
 */
export async function imagePack(
  pack,
  {
    pathId,
    existing = {},
    startedAt = Date.now(),
    budgetMs = PACK_BUDGET_MS,
    generate = generateWithFallbackPublic,
  } = {},
) {
  if (!SAFE_SEGMENT.test(String(pathId))) {
    throw new Error(`refusing to store images under an unsafe path segment: ${String(pathId).slice(0, 40)}`);
  }

  const hero = pack.images?.[0];
  const images = hero ? [hero] : [];
  const stored = { ...existing };
  const points = (pack.points ?? []).map((point) => ({ ...point }));
  let complete = true;

  for (const { index, brief } of briefsFor(pack)) {
    const key = `p${index + 1}`;
    if (!stored[key]) {
      // Out of time: keep what was paid for and finish the rest next tick. `complete: false`
      // is what makes that happen — the stage returns a STAY rather than advancing, because
      // there is no path back to this stage once the pack has moved on.
      if (Date.now() - startedAt > Math.min(PACK_BUDGET_MS, budgetMs)) {
        complete = false;
        break;
      }
      try {
        stored[key] = await generate(briefToPrompt(brief, pack), {
          aspectRatio: '9:16',
          pathId,
          name: `still-${key}`,
        });
      } catch (err) {
        // One failed image is not worth failing the story for: that slide keeps the hero.
        console.error(`[images] ${pack.articleId} ${key}: ${String(err.message).slice(0, 160)}`);
        continue;
      }
    }
    images.push({ src: stored[key], aspect: 9 / 16, alt: points[index]?.caption ?? '' });
    points[index].image = images.length - 1;
  }

  return { images, points, stored, complete };
}

/** Merge the generated images back into the pack. */
export const applyImages = (pack, { images, points }) => ({ ...pack, images, points });
