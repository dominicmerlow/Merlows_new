// lib/automation/handlers/bibliography.js
import { randomUUID } from 'crypto';
import { kv } from '../../kv.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function bibKey(id) { return `bibliography:${id}`; }
function paperKey(id) { return `bibliography:paper:${id}`; }
function papersListKey(bibId) { return `bibliography:papers:${bibId}`; }
const INDEX_KEY = 'bibliography:index';

function buildBibliography(data) {
  if (!data.name) throw new Error('name is required');
  const now = new Date().toISOString();
  return {
    id: `bib_${randomUUID()}`,
    name: data.name,
    description: data.description ?? '',
    indication: data.indication ?? 'Middle East Diplomacy',
    bibliographyType: data.bibliographyType ?? 'policy-analysis',
    createdAt: now,
    updatedAt: now,
    paperCount: 0,
    stats: { automationsCreated: 0, articlesGenerated: 0 },
  };
}

function buildPaper(data, bibId) {
  const now = new Date().toISOString();
  return {
    id: `paper_${randomUUID()}`,
    bibId,
    title: data.title ?? '',
    authors: Array.isArray(data.authors) ? data.authors : (data.authors ?? '').split(',').map(a => a.trim()).filter(Boolean),
    journal: data.journal ?? '',
    year: data.year ? Number(data.year) : null,
    doi: data.doi ?? '',
    url: data.url ?? '',
    abstract: data.abstract ?? '',
    source: data.source ?? 'manual',
    addedAt: now,
    processed: false,
    note: data.note ?? '',
  };
}

// ── Semantic Scholar search ──────────────────────────────────────────────────

async function searchSemanticScholar(query, maxResults = 20) {
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${maxResults}&fields=title,authors,journal,year,externalIds,url,abstract,citationCount`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Merlows/1.0' } });
  if (!res.ok) throw new Error(`Semantic Scholar search failed: ${res.status}`);
  const data = await res.json();
  return (data.data ?? []).map(paper => {
    const doi = paper.externalIds?.DOI ?? '';
    return {
      paperId: paper.paperId,
      title: paper.title ?? '',
      authors: (paper.authors ?? []).map(a => a.name),
      journal: paper.journal?.name ?? '',
      year: paper.year ?? null,
      doi,
      url: doi ? `https://doi.org/${doi}` : paper.url ?? '',
      abstract: paper.abstract ?? '',
      citationCount: paper.citationCount ?? 0,
      source: 'semantic_scholar',
    };
  });
}

// ── ReliefWeb search (UN humanitarian/policy reports) ────────────────────────

async function searchReliefWeb(query, maxResults = 20) {
  const params = new URLSearchParams({
    appname: 'merlows',
    'query[value]': query,
    limit: String(maxResults),
    'sort[]': 'date:desc',
  });
  ['title', 'body', 'source', 'date', 'url', 'country'].forEach(f =>
    params.append('fields[include][]', f)
  );
  const res = await fetch(`https://api.reliefweb.int/v1/reports?${params}`);
  if (!res.ok) throw new Error(`ReliefWeb search failed: ${res.status}`);
  const json = await res.json();
  return (json.data ?? []).map(item => {
    const f = item.fields ?? {};
    const sourceName = (f.source ?? []).map(s => s.name).join(', ') || '';
    const countries = (f.country ?? []).map(c => c.name).join(', ') || '';
    const dateStr = f.date?.original ?? '';
    const year = dateStr ? new Date(dateStr).getFullYear() : null;
    const body = f.body ?? '';
    return {
      title: f.title ?? '',
      authors: sourceName ? [sourceName] : [],
      journal: sourceName,
      year,
      doi: '',
      url: f.url ?? '',
      abstract: body.length > 500 ? body.slice(0, 500) + '...' : body,
      country: countries,
      source: 'reliefweb',
    };
  });
}

// ── Congress.gov search (CRS reports) ────────────────────────────────────────

async function searchCongress(query, maxResults = 20) {
  const apiKey = process.env.CONGRESS_API_KEY;
  if (!apiKey) throw new Error('CONGRESS_API_KEY env var is not set. Get a free key at api.congress.gov');
  const params = new URLSearchParams({
    api_key: apiKey,
    query: query,
    limit: String(maxResults),
    sort: 'updateDate desc',
    format: 'json',
  });
  const res = await fetch(`https://api.congress.gov/v3/committee-report?${params}`);
  if (!res.ok) throw new Error(`Congress.gov search failed: ${res.status}`);
  const json = await res.json();
  const reports = json.reports ?? json.committeeReports ?? [];
  return reports.map(r => {
    const title = r.title ?? r.citation ?? '';
    const year = r.updateDate ? new Date(r.updateDate).getFullYear()
               : r.issueDate ? new Date(r.issueDate).getFullYear() : null;
    return {
      title,
      authors: r.chamber ? [r.chamber] : ['U.S. Congress'],
      journal: 'Congressional Report',
      year,
      doi: '',
      url: r.url ?? '',
      abstract: r.title ?? '',
      source: 'congress',
    };
  });
}

// ── World Bank Open Knowledge search ─────────────────────────────────────────

async function searchWorldBank(query, maxResults = 20) {
  const params = new URLSearchParams({
    format: 'json',
    qterm: query,
    rows: String(maxResults),
    os: '0',
    srt: 'docdt',
    order: 'desc',
    fl: 'display_title,authorname,docdt,url,txturl,abstracts,repnb,docty',
  });
  const res = await fetch(`https://search.worldbank.org/api/v3/wds?${params}`);
  if (!res.ok) throw new Error(`World Bank search failed: ${res.status}`);
  const json = await res.json();
  const docs = json.documents ?? {};
  return Object.values(docs).filter(d => d && d.display_title).map(d => {
    const authors = d.authorname
      ? d.authorname.split(';').map(a => a.trim()).filter(Boolean)
      : [];
    const year = d.docdt ? new Date(d.docdt).getFullYear() : null;
    const abstract = typeof d.abstracts === 'string' ? d.abstracts
      : (d.abstracts?.cdata ?? d.abstracts?.value ?? '');
    return {
      title: d.display_title ?? '',
      authors,
      journal: d.docty || 'World Bank',
      year,
      doi: '',
      url: d.txturl || d.url || '',
      abstract: abstract.length > 500 ? abstract.slice(0, 500) + '...' : abstract,
      source: 'worldbank',
    };
  });
}

// ── Route dispatcher ─────────────────────────────────────────────────────────

export default async function handler(req, res, slug) {
  // slug = ['bibliography'] or ['bibliography', id] or ['bibliography', id, 'papers'] etc.
  const [, second, third, fourth] = slug;

  // POST /bibliography/search — literature search proxy
  if (second === 'search' && req.method === 'POST') {
    try {
      const { query, maxResults, source } = req.body;
      if (!query) return res.status(400).json({ error: 'query is required' });
      const limit = Math.min(maxResults ?? 20, 50);
      const searchers = {
        semantic_scholar: searchSemanticScholar,
        reliefweb: searchReliefWeb,
        congress: searchCongress,
        worldbank: searchWorldBank,
      };
      const fn = searchers[source] || searchSemanticScholar;
      const results = await fn(query, limit);
      return res.status(200).json(results);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // GET /bibliography — list all
  if (!second && req.method === 'GET') {
    const ids = await kv.lrange(INDEX_KEY, 0, -1);
    if (!ids.length) return res.status(200).json([]);
    const bibs = await Promise.all(ids.map(id => kv.get(bibKey(id))));
    return res.status(200).json(bibs.filter(Boolean).reverse());
  }

  // POST /bibliography — create
  if (!second && req.method === 'POST') {
    let bib;
    try { bib = buildBibliography(req.body); }
    catch (err) { return res.status(400).json({ error: err.message }); }

    // If papers included in body, add them
    const papers = req.body.papers ?? [];
    for (const p of papers) {
      const paper = buildPaper(p, bib.id);
      await kv.set(paperKey(paper.id), paper);
      await kv.lpush(papersListKey(bib.id), paper.id);
    }
    bib.paperCount = papers.length;
    await kv.set(bibKey(bib.id), bib);
    await kv.lpush(INDEX_KEY, bib.id);
    return res.status(201).json(bib);
  }

  // Routes with an ID (bib_xxx or _ wildcard for paper-only operations)
  if (second && (second.startsWith('bib_') || second === '_')) {
    const bibId = second;

    // ── Paper sub-routes ─────────────────────────────────────────────────
    if (third === 'papers') {
      // POST /bibliography/{id}/papers — add papers
      if (!fourth && req.method === 'POST') {
        const bib = await kv.get(bibKey(bibId));
        if (!bib) return res.status(404).json({ error: 'Bibliography not found' });
        const papers = req.body.papers ?? [];
        if (!papers.length) return res.status(400).json({ error: 'papers array required' });
        const added = [];
        for (const p of papers) {
          const paper = buildPaper(p, bibId);
          await kv.set(paperKey(paper.id), paper);
          await kv.lpush(papersListKey(bibId), paper.id);
          added.push(paper);
        }
        bib.paperCount = (bib.paperCount ?? 0) + added.length;
        bib.updatedAt = new Date().toISOString();
        await kv.set(bibKey(bibId), bib);
        return res.status(201).json({ added: added.length, papers: added });
      }

      // PATCH /bibliography/{id}/papers/{paperId} — update paper fields (e.g. toggle processed)
      if (fourth && req.method === 'PATCH') {
        const paper = await kv.get(paperKey(fourth));
        if (!paper) return res.status(404).json({ error: 'Paper not found' });
        const allowed = ['processed', 'note'];
        for (const key of allowed) {
          if (req.body[key] !== undefined) paper[key] = req.body[key];
        }
        await kv.set(paperKey(fourth), paper);
        return res.status(200).json(paper);
      }

      // DELETE /bibliography/{id}/papers/{paperId}
      if (fourth && req.method === 'DELETE') {
        const bib = await kv.get(bibKey(bibId));
        if (!bib) return res.status(404).json({ error: 'Bibliography not found' });
        await kv.del(paperKey(fourth));
        await kv.lrem(papersListKey(bibId), 0, fourth);
        bib.paperCount = Math.max((bib.paperCount ?? 1) - 1, 0);
        bib.updatedAt = new Date().toISOString();
        await kv.set(bibKey(bibId), bib);
        return res.status(200).json({ ok: true });
      }

      return res.status(405).json({ error: 'Method not allowed' });
    }

    // GET /bibliography/{id} — get with papers
    if (req.method === 'GET') {
      const bib = await kv.get(bibKey(bibId));
      if (!bib) return res.status(404).json({ error: 'Bibliography not found' });
      const paperIds = await kv.lrange(papersListKey(bibId), 0, -1);
      let papers = [];
      if (paperIds.length) {
        papers = (await Promise.all(paperIds.map(id => kv.get(paperKey(id))))).filter(Boolean);
      }
      return res.status(200).json({ ...bib, papers });
    }

    // PATCH /bibliography/{id} — update metadata
    if (req.method === 'PATCH') {
      const bib = await kv.get(bibKey(bibId));
      if (!bib) return res.status(404).json({ error: 'Bibliography not found' });
      const allowed = ['name', 'description', 'indication', 'bibliographyType'];
      for (const key of allowed) {
        if (req.body[key] !== undefined) bib[key] = req.body[key];
      }
      bib.updatedAt = new Date().toISOString();
      await kv.set(bibKey(bibId), bib);
      return res.status(200).json(bib);
    }

    // DELETE /bibliography/{id} — cascade delete
    if (req.method === 'DELETE') {
      const paperIds = await kv.lrange(papersListKey(bibId), 0, -1);
      for (const pid of paperIds) await kv.del(paperKey(pid));
      await kv.del(papersListKey(bibId));
      await kv.del(bibKey(bibId));
      await kv.lrem(INDEX_KEY, 0, bibId);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(404).json({ error: 'Bibliography route not found' });
}
