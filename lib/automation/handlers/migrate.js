// lib/automation/handlers/migrate.js
// GET /api/automation/migrate?action=fix-calendar-source
// GET /api/automation/migrate?action=import-master-prompt&fileId=DRIVE_FILE_ID
// One-time idempotent data migrations. Safe to call multiple times.
import { kv } from '../../kv.js';
import { getValidGoogleToken } from './auth.js';

const CALENDAR_PROMPT = `You are a writer for Merlows — an independent digital news portal covering Israel-Iran relations, the Cyrus Accord, Abraham Accords, and Middle East diplomacy.

Your task is to write a complete article for merlows.com using ONLY the source material provided.

IMPORTANT RULES:
- Use the TITLE exactly as it appears after "SOURCE FILE:" — do not reword, shorten, or modify it in any way. It must appear verbatim as the article headline.
- Generate the article strictly from the PAGE CONTENT and source URL provided. Do not invent facts not present in the source.
- Match tone and depth to the content: journalistic for news, analytical for diplomatic coverage, persuasive for op-eds.

STRUCTURE
1. Headline — copy EXACTLY from the provided title (do not rewrite)
2. Subtitle (~8–12 words) — a sharp, one-line framing of the piece
3. Introduction (75–120 words) — context and why this matters now
4. Main Body (300–500 words) — key points from the source, with sub-headers where helpful
5. Conclusion (75–100 words) — implications, outlook, or call to reflection
6. Source attribution line

OUTPUT FORMAT
Output in markdown. First line: "# " + the exact title as provided. Next non-empty line: "## {{CATEGORY_PREFIX}}:" + subtitle. All other headers use "## ".
Total length: 500–800 words. UK British English. Do not reproduce verbatim text from the source.`;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { action } = req.query;

  if (action === 'fix-calendar-source') {
    const ruleId = 'rule_70b23733-7884-4a1d-9a98-d027f7e8d371';
    const rule = await kv.get(`automation:rule:${ruleId}`);
    if (!rule) return res.status(404).json({ error: 'Rule not found' });

    // Idempotent: skip if already fixed
    const alreadyFixed = rule.sources?.every(s => s.type !== 'upload');
    if (alreadyFixed) {
      return res.status(200).json({ ok: true, skipped: true, message: 'Already fixed — source type is not "upload"' });
    }

    const updated = {
      ...rule,
      sources: [{
        type: 'google_sheets',
        sheetId: '1o-8tBu2TQYeFJeVd55RN4dlUGv1D0hGC',
        sheetName: 'Sheet1',
      }],
      generation: {
        ...rule.generation,
        prompt: CALENDAR_PROMPT,
      },
      updatedAt: new Date().toISOString(),
    };

    await kv.set(`automation:rule:${ruleId}`, updated);
    return res.status(200).json({
      ok: true,
      message: 'Mixed Content Calendar rule updated',
      sources: updated.sources,
      promptPreview: updated.generation.prompt.slice(0, 120) + '…',
    });
  }

  if (action === 'import-master-prompt') {
    const fileId = req.query.fileId || '1gEKtzYQJ81paHdvf_51i3aikNelTksuZ';
    let accessToken;
    try {
      accessToken = await getValidGoogleToken();
    } catch (err) {
      return res.status(400).json({ error: 'Google account not connected. Reconnect in Settings → Google Connections.', detail: err.message });
    }

    // Download file content from Google Drive (works for .md files uploaded to Drive)
    const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!driveRes.ok) {
      const body = await driveRes.text();
      return res.status(400).json({ error: `Drive fetch failed: HTTP ${driveRes.status}`, detail: body.slice(0, 300) });
    }
    const content = (await driveRes.text()).trim();
    if (!content) return res.status(400).json({ error: 'File is empty' });

    await kv.set('settings:masterPrompt', content);
    return res.status(200).json({
      ok: true,
      message: 'Master prompt imported from Google Drive and saved',
      chars: content.length,
      preview: content.slice(0, 200) + (content.length > 200 ? '…' : ''),
    });
  }

  return res.status(400).json({ error: 'Unknown action. Supported: fix-calendar-source, import-master-prompt' });
}
