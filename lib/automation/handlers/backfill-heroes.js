// lib/automation/handlers/backfill-heroes.js
// One-off operational endpoint: backfill missing hero images for pending
// BlitzSpirit (category 'op-eds') articles, then publish them.
//
// Why an endpoint and not a local script: OpenRouter + WP credentials are marked
// "Sensitive" in Vercel, so `vercel env pull` returns them blank — only the
// deployed functions hold the real values. So hero generation (OpenRouter) and
// WP media upload must run server-side.
//
// Per article: generate the BlitzSpirit hero (same heroPromptFor() the runner
// uses) → upload to WP media → store the hosted URL + heroMediaId on the content
// record (NEVER base64) → approve+publish via the existing approve handler path.
//
// Gated by the KV REST token (an existing server secret) in the x-backfill-auth
// header to avoid an unauthenticated "spend money + publish" route. REMOVE this
// handler + its dispatch branch once the backfill is complete.
import { kv } from '../../kv.js';
import { generateImageFast } from '../../social/media.js';
import { uploadImageToWp } from '../../wp-media.js';
import { heroPromptFor } from './run.js';
import { internalAuthHeaders } from '../../cron-auth.js';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export default async function handler(req, res) {
  const auth = req.headers['x-backfill-auth'];
  if (!process.env.KV_REST_API_TOKEN || auth !== process.env.KV_REST_API_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const limit    = Math.min(Number(req.query.limit) || 5, 20);
  const onlyIds  = String(req.query.ids || '').split(',').filter(Boolean);
  const doPublish = req.query.publish !== 'false';
  const dryRun   = req.query.dryRun === '1' || req.query.dryRun === 'true';

  let heroCfg = null;
  try { heroCfg = await kv.get('vance:hero-prompts'); } catch (_) {}

  const jobIds = await kv.lrange('automation:jobs:index', 0, -1);
  const results = [];

  for (const jid of jobIds) {
    if (results.length >= limit) break;
    const job = await kv.get(`automation:job:${jid}`);
    if (!job || job.status !== 'pending_review') continue;
    if (onlyIds.length && !onlyIds.includes(job.contentId)) continue;
    const content = await kv.get(`content:${job.contentId}`);
    if (!content) continue;
    if (content.category !== 'op-eds') continue; // scope: BlitzSpirit archive only

    const hasHero = typeof content.heroImageUrl === 'string' && content.heroImageUrl.startsWith('http');
    if (!onlyIds.length && hasHero) continue; // batch mode targets heroless items

    const r = { contentId: job.contentId, jobId: jid, title: (content.title || '').slice(0, 70) };
    try {
      if (!hasHero) {
        if (dryRun) { r.hero = 'would-generate'; results.push(r); continue; }
        const img = await generateImageFast(content.title, '16:9', heroPromptFor('op-eds', content.subCategory, heroCfg));
        if (!img?.url) { r.error = 'image-gen-failed'; results.push(r); continue; }
        const wp = await uploadImageToWp(img.url, content.title);
        if (!wp?.url) { r.error = 'wp-upload-failed'; results.push(r); continue; }
        await kv.set(`content:${job.contentId}`, {
          ...content, heroImageUrl: wp.url, heroImageType: 'ai', heroMediaId: wp.id,
          updatedAt: new Date().toISOString(),
        });
        r.hero = wp.url; r.heroMediaId = wp.id;
      } else {
        r.hero = 'existing';
      }

      if (doPublish && !dryRun) {
        const pr = await fetch(`${APP_URL}/api/automation/approve`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...internalAuthHeaders() },
          body: JSON.stringify({ jobId: jid, action: 'approve', channel: 'manual' }),
        });
        const pd = await pr.json().catch(() => ({}));
        r.publish = pr.ok ? (pd.status || 'ok') : `err ${pr.status}: ${pd.error || ''}`;
      }
    } catch (e) {
      r.error = e.message;
    }
    results.push(r);
  }

  return res.status(200).json({ processed: results.length, limit, doPublish, dryRun, results });
}
