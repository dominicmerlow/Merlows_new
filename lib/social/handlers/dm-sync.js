// lib/social/handlers/dm-sync.js
// GET|POST /api/social/dm-sync: the cron that gives each new Instagram reel and carousel its
// "Comment VOICES" automation (lib/social/dm/sync.js). The router gates it on CRON_SECRET.
//
// A cron's response body goes nowhere, so anything that needs a person is also logged.

import { syncDmAutomations } from '../dm/sync.js';

export default async function dmSyncHandler(req, res, { sync = syncDmAutomations } = {}) {
  try {
    const summary = await sync();
    if (summary.rejected || summary.gaveUp || summary.errors) {
      console.error(`[dm-sync] needs attention: ${JSON.stringify(summary)}`);
    }
    return res.status(200).json({ ok: true, ...summary });
  } catch (err) {
    console.error(`[dm-sync] run failed: ${err.message}`);
    return res.status(err.status ?? 500).json({ ok: false, error: err.message });
  }
}
