import { kv, getLimited } from '../../lib/kv.js';
import { verifyCronSecret, internalAuthHeaders } from '../../lib/cron-auth.js';

export default async function handler(req, res) {
  // Shared gate: 503 when CRON_SECRET is unset (the old inline compare accepted
  // `Bearer undefined` then), 401 on a mismatch, constant-time compare.
  const gate = verifyCronSecret(req);
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

  const ids = await kv.lrange('content:index', 0, -1);
  if (!ids.length) return res.json({ published: 0, failed: 0, total: 0 });

  // At most 10 reads in flight, not one kv.get per item all at once: 1,150+
  // parallel gets exhaust file descriptors, and this cron runs the same minute
  // as an automation tick. Not MGET: content records reach 2.5 MB and a batch
  // exceeds Upstash's 10 MB response limit.
  const items = await getLimited(ids.map(id => `content:${id}`));
  const now = new Date();
  const due = items.filter(item =>
    item?.status === 'scheduled' &&
    item.scheduledAt &&
    new Date(item.scheduledAt) <= now
  );

  const results = await Promise.allSettled(
    due.map(item =>
      fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...internalAuthHeaders() },
        body: JSON.stringify({ contentId: item.id }),
      })
    )
  );

  const published = results.filter(r => r.status === 'fulfilled').length;
  const failed    = results.filter(r => r.status === 'rejected').length;
  console.log(`Cron: ${published} published, ${failed} failed, ${due.length} due`);
  return res.json({ published, failed, total: due.length });
}
