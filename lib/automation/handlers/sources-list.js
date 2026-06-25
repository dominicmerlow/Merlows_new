// lib/automation/handlers/sources-list.js
// POST /api/automation/sources-list  body: { ruleId } | { source }
// Returns the list of files visible in a Google Drive / Dropbox source folder
// without running OCR or generating articles. Used by the UI to show files in
// a "click to view sources" popup with checkboxes for selective re-processing.
import { kv } from '../../kv.js';
import { getTokens, getCredentials, refreshGoogleToken, refreshDropboxToken, saveTokens } from '../../auth/oauth.js';

async function listGoogleDriveFiles(source) {
  let tokens = await getTokens('google');
  if (!tokens?.accessToken) throw new Error('Google Drive not connected');
  if (tokens.expiresAt && Date.now() > tokens.expiresAt - 300_000 && tokens.refreshToken) {
    const creds = await getCredentials('google');
    if (creds) {
      const r = await refreshGoogleToken(tokens.refreshToken, creds.clientId, creds.clientSecret, fetch);
      tokens = { ...tokens, accessToken: r.access_token, expiresAt: Date.now() + r.expires_in * 1000 };
      await saveTokens('google', tokens);
    }
  }
  const q = `'${source.folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`;
  // corpora=allDrives required for Shared Drive traversal — see cloud-drives.js
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,webViewLink,modifiedTime,size)&pageSize=100&orderBy=modifiedTime%20desc&corpora=allDrives&includeItemsFromAllDrives=true&supportsAllDrives=true`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
  if (!r.ok) throw new Error(`Drive API ${r.status}: ${await r.text()}`);
  const { files = [] } = await r.json();
  return files.map(f => ({
    name: f.name,
    id: f.id,
    url: f.webViewLink,
    modified: f.modifiedTime,
    mimeType: f.mimeType,
  }));
}

// Upload sources don't fetch from an external service — the "files" are already
// stored on the rule. Shapes (mirrors fetchUploadUrls in fetch.js):
//   • Multi-column xlsx: one entry per parsed row in source.rows[]
//     ({title, subCategory, tags, notes}). This is the primary per-row path; the
//     consumedTitles set drives the "Processed" chip. Per-row metadata is
//     surfaced so the modal can show what the spreadsheet held.
//   • Hyperlinked Column-A cells: source.urls[] (consumedUrls flag).
//   • Legacy plain-title cells: source.titlesOnly[] (skipped when already a row).
//   • Merlows inline upload: a single file's text in source.rawText (+ filename).
function listUploadFiles(source) {
  const consumedU = new Set(Array.isArray(source.consumedUrls)   ? source.consumedUrls   : []);
  const consumedT = new Set(Array.isArray(source.consumedTitles) ? source.consumedTitles : []);
  const out = [];

  // Structured rows win — emit one entry per row with its per-row metadata.
  const rows = Array.isArray(source.rows)
    ? source.rows.filter(r => r && String(r.title || '').trim())
    : [];
  const rowTitles = new Set(rows.map(r => r.title));
  for (const r of rows) {
    out.push({
      name: r.title, id: r.title, url: r.url || null, modified: null,
      mimeType: 'upload/row', processed: consumedT.has(r.title),
      subCategory: r.subCategory || null,
      tags: Array.isArray(r.tags) ? r.tags.join(', ') : (r.tags || null),
      notes: r.notes || r.rowNotes || null,
    });
  }

  // Hyperlinked Column-A cells.
  for (const u of (Array.isArray(source.urls) ? source.urls.filter(Boolean) : [])) {
    out.push({ name: u, id: u, url: u, modified: null, mimeType: 'upload/url', processed: consumedU.has(u) });
  }

  // Legacy plain-title cells — skip any already represented as a row.
  for (const t of (Array.isArray(source.titlesOnly) ? source.titlesOnly.filter(Boolean) : [])) {
    if (rowTitles.has(t)) continue;
    out.push({ name: t, id: t, url: null, modified: null, mimeType: 'upload/title', processed: consumedT.has(t) });
  }

  if (out.length) return out;

  // Inline single-file upload (Merlows).
  if (!source.rawText) return [];
  const name = source.filename || source.url || 'Uploaded file';
  return [{ name, id: name, url: source.url || null, modified: null, mimeType: 'upload/file', processed: false }];
}

// Bibliography sources have no folder to list — instead surface the papers
// stored in KV so the user can pick which ones to (re-)process. Marks the
// processed flag so the UI can render a "Already processed" hint.
async function listBibliographyPapers(source) {
  const { bibId } = source;
  if (!bibId) return [];
  const paperIds = await kv.lrange(`bibliography:papers:${bibId}`, 0, -1);
  if (!paperIds.length) return [];
  const papers = (await Promise.all(paperIds.map(id => kv.get(`bibliography:paper:${id}`)))).filter(Boolean);
  return papers.map(p => ({
    name:      p.title || 'Untitled paper',
    id:        p.id,
    url:       p.url || (p.doi ? `https://doi.org/${p.doi}` : null),
    modified:  p.addedAt,
    mimeType:  'bibliography/paper',
    processed: !!p.processed,
  }));
}

async function listDropboxFiles(source) {
  const tokens = await getTokens('dropbox');
  if (!tokens?.accessToken) throw new Error('Dropbox not connected');
  let accessToken = tokens.accessToken;
  if (tokens.refreshToken) {
    const creds = await getCredentials('dropbox');
    if (creds?.clientId && creds?.clientSecret) {
      try {
        const r = await refreshDropboxToken(tokens.refreshToken, creds.clientId, creds.clientSecret, fetch);
        accessToken = r.access_token;
        await saveTokens('dropbox', { accessToken: r.access_token, refreshToken: tokens.refreshToken, expiresAt: Date.now() + (r.expires_in || 14400) * 1000 });
      } catch {}
    }
  }
  let folderPath = (source.folderPath || '').trim();
  if (folderPath && !folderPath.startsWith('/')) folderPath = '/' + folderPath;
  const r = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: folderPath || '', recursive: false }),
  });
  if (!r.ok) throw new Error(`Dropbox ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return (data.entries || [])
    .filter(e => e['.tag'] === 'file')
    .map(e => ({
      name: e.name,
      id: e.id || e.path_lower,
      url: `https://www.dropbox.com/home${e.path_display}`,
      modified: e.server_modified,
      mimeType: null,
    }));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let { source, ruleId } = req.body || {};
    if (!source && ruleId) {
      const rule = await kv.get(`automation:rule:${ruleId}`);
      if (!rule) return res.status(404).json({ error: 'Rule not found' });
      // Return files for ALL sources on this rule, grouped
      const groups = [];
      for (const s of (rule.sources || [])) {
        try {
          let files = [];
          if (s.type === 'google_drive')      files = await listGoogleDriveFiles(s);
          else if (s.type === 'dropbox')      files = await listDropboxFiles(s);
          else if (s.type === 'bibliography') files = await listBibliographyPapers(s);
          else if (s.type === 'upload')       files = listUploadFiles(s);
          else                                 files = [];
          groups.push({ source: s, files, error: null });
        } catch (err) {
          groups.push({ source: s, files: [], error: err.message });
        }
      }
      return res.status(200).json({ groups });
    }
    if (!source) return res.status(400).json({ error: 'source or ruleId required' });
    let files = [];
    if (source.type === 'google_drive')      files = await listGoogleDriveFiles(source);
    else if (source.type === 'dropbox')      files = await listDropboxFiles(source);
    else if (source.type === 'bibliography') files = await listBibliographyPapers(source);
    else if (source.type === 'upload')       files = listUploadFiles(source);
    return res.status(200).json({ files });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
