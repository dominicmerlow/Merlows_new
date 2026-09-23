// lib/automation/handlers/backfill-missing-heroes.js
// One-off operational endpoint: backfill hero images for ALREADY-PUBLISHED
// articles that missed their hero (any category). Built for the 2026-07-10→14
// OpenRouter-402 outage, where ~4 days of posts published without heroes.
//
// Unlike backfill-heroes.js (BlitzSpirit pending_review items, publishes via
// approve), this targets content records that are already published: it
// generates the hero (same heroPromptFor() as the runner), uploads it to the
// WP media library, PATCHes the existing WP post's featured_media, and stamps
// heroImageUrl/heroImageType/heroMediaId on the KV record (hosted URL only,
// NEVER base64).
//
// Gated by the KV REST token in the x-backfill-auth header (same pattern as
// backfill-heroes.js). Query params:
//   since=ISO      only items created at/after this timestamp (default 2026-07-10T11:30:00Z)
//   limit=N        max items to process this call (default 5, cap 20)
//   dryRun=1       list what would be done, no generation/writes
//   scan=N         how many recent content ids to scan (default 120, cap 400)
// REMOVE this handler + its dispatch branch once the backfill is complete.
import { kv } from '../../kv.js';
import { generateImageFast } from '../../social/media.js';
import { uploadImageToWp } from '../../wp-media.js';
import { heroPromptFor } from './run.js';

function wpAuthHeader() {
  const credentials = Buffer.from(
    `${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`
  ).toString('base64');
  return `Basic ${credentials}`;
}

export default async function handler(req, res) {
  const auth = req.headers['x-backfill-auth'];
  if (!process.env.KV_REST_API_TOKEN || auth !== process.env.KV_REST_API_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const since  = String(req.query.since || '2026-07-10T11:30:00Z');
  const limit  = Math.min(Number(req.query.limit) || 5, 20);
  const scan   = Math.min(Number(req.query.scan) || 120, 400);
  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';

  const siteUrl = (process.env.WP_SITE_URL ?? '').trim().replace(/\/$/, '');
  if (!siteUrl) return res.status(500).json({ error: 'WP_SITE_URL not configured' });

  let heroCfg = null;
  try { heroCfg = await kv.get('vance:hero-prompts'); } catch (_) {}

  const ids = await kv.lrange('content:index', 0, scan - 1);
  const results = [];
  let processed = 0;

  for (const id of ids) {
    if (processed >= limit) break;
    const content = await kv.get(`content:${id}`);
    if (!content) continue;
    if ((content.createdAt || '') < since) continue;
    if (content.status !== 'published') continue;
    const hasHero = typeof content.heroImageUrl === 'string' && content.heroImageUrl.startsWith('http');
    if (hasHero) continue;
    if (!content.wpPostId) { results.push({ contentId: id, skip: 'no wpPostId' }); continue; }

    const r = { contentId: id, wpPostId: content.wpPostId, title: (content.title || '').slice(0, 70) };
    if (dryRun) { r.hero = 'would-generate'; results.push(r); processed++; continue; }

    try {
      const img = await generateImageFast(content.title, '16:9', heroPromptFor(content.category, content.subCategory, heroCfg));
      if (!img?.url) { r.error = 'image-gen-failed'; results.push(r); processed++; continue; }
      const wp = await uploadImageToWp(img.url, content.title);
      if (!wp?.url) { r.error = 'wp-upload-failed'; results.push(r); processed++; continue; }

      const patchResp = await fetch(`${siteUrl}/wp-json/wp/v2/posts/${content.wpPostId}`, {
        method: 'POST',
        headers: { 'Authorization': wpAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ featured_media: wp.id }),
      });
      if (!patchResp.ok) {
        const err = await patchResp.text().catch(() => '');
        r.error = `featured-media patch failed ${patchResp.status}: ${err.slice(0, 150)}`;
        results.push(r); processed++; continue;
      }

      await kv.set(`content:${id}`, {
        ...content, heroImageUrl: wp.url, heroImageType: 'ai', heroMediaId: wp.id,
        updatedAt: new Date().toISOString(),
      });
      r.hero = wp.url; r.heroMediaId = wp.id; r.model = img.model;
    } catch (e) {
      r.error = e.message;
    }
    results.push(r);
    processed++;
  }

  return res.status(200).json({ dryRun, since, scanned: ids.length, processed, results });
}
