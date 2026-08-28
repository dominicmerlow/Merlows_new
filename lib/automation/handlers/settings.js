// lib/automation/handlers/settings.js
// GET  /api/automation/settings  — return server-side settings (e.g. master prompt)
// POST /api/automation/settings  — save server-side settings
import { kv } from '../../kv.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const masterPrompt = (await kv.get('settings:masterPrompt')) ?? '';
      return res.status(200).json({ masterPrompt });
    }
    if (req.method === 'POST') {
      const { masterPrompt = '' } = req.body || {};
      await kv.set('settings:masterPrompt', String(masterPrompt).trim());
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
