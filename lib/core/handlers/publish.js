import { kv } from '../../kv.js';
import { resolveOrCreateWpCategory, resolveOrCreateWpTags, parseTagList, slugify } from '../../wp-taxonomy.js';

// Map app category IDs → WordPress category slugs. Mirrors BUILTIN_CATEGORY_META in index.html.
// Acts as the *parent* category when a content item arrives with a sub-category
// (i.e. a per-row category name like "Diplomatic Analysis" from the bulk-upload
// spreadsheet). The sub-category becomes the assigned category; the entry below
// only tells us which parent to nest a freshly auto-created sub-category under.
const CATEGORY_SLUG_MAP = {
  'breaking-news':       'breaking-news',
  'diplomatic-analysis': 'diplomatic-analysis',
  'op-eds':              'blitzspirit',
  'cyrus-accord':        'cyrus-accords',
  'abraham-accords':     'abraham-accords',
  'regional-voices':     'regional-voices',
};

// Canonical WP sub-categories per app category. Mirror of CATEGORY_SUBCATEGORIES
// in index.html — keep both in sync. A category listed here has a FIXED set: an
// incoming sub-category that matches none of these is NOT auto-created (it posts
// under the parent only). Categories absent here keep the legacy free-text
// behaviour (resolve-or-create whatever name arrives). Matching is by slug, so
// the spreadsheet may use the slug, the display name, or a case/spacing variant.
const CATEGORY_SUBCATEGORIES = {
  'op-eds': [ // BlitzSpirit — internal id stays 'op-eds'; WP parent slug 'blitzspirit'
    { slug: 'original-spirit', name: 'Original Spirit' },
    { slug: 'explainers',      name: 'Explainers' },
    { slug: 'blitz-echoes',    name: 'Blitz Echoes' },
    { slug: 'spirit-today',    name: 'Spirit Today' },
    { slug: 'carry-on',        name: 'Carry On' },
  ],
  'abraham-accords': [ // WP parent slug 'abraham-accords'
    { slug: 'normalisation-diplomacy', name: 'Normalisation & Diplomacy' },
    { slug: 'regional-security',       name: 'Regional Security' },
    { slug: 'trade-connectivity',      name: 'Trade & Connectivity' },
  ],
  'cyrus-accord': [ // WP parent slug 'cyrus-accords'
    { slug: 'the-cyrus-vision',        name: 'The Cyrus Vision' },
    { slug: 'persian-jewish-heritage', name: 'Persian-Jewish Heritage' },
    { slug: 'conflict-diplomacy',      name: 'Conflict & Diplomacy' },
  ],
};

// Match a free-text sub-category value (slug, display name, or case/spacing
// variant) to the canonical entry for a category. Returns { slug, name } or null.
// Categories without a fixed set pass the trimmed value through as a free name.
function normalizeSubCategory(categoryId, raw) {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const set = CATEGORY_SUBCATEGORIES[categoryId];
  if (!set) return { slug: slugify(value), name: value };
  const key = slugify(value);
  return set.find(s => s.slug === key) || null;
}

// Resolve a WP category slug to its numeric ID via the REST API.
// Returns the ID on success, or null if not found / on error.
async function resolveWpCategoryId(slug, siteUrl, authHeader) {
  try {
    const resp = await fetch(
      `${siteUrl}/wp-json/wp/v2/categories?slug=${encodeURIComponent(slug)}&per_page=1`,
      { headers: { Authorization: authHeader } }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return Array.isArray(data) && data.length > 0 ? data[0].id : null;
  } catch {
    return null;
  }
}

/**
 * Download an external image URL and upload it to the WordPress media library.
 * Returns the WP media object ID, or null on failure.
 */
async function uploadHeroImageToWp(imageUrl, postTitle, siteUrl, authHeader) {
  try {
    // Fetch the image binary from the external URL
    const imgResp = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MerlowsBot/1.0; +https://merlows.com)',
        'Accept': 'image/*',
      },
      redirect: 'follow',
    });
    if (!imgResp.ok) {
      console.warn(`[publish] Hero image fetch failed ${imgResp.status}: ${imageUrl}`);
      return null;
    }

    const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      console.warn(`[publish] Hero image URL returned non-image content-type: ${contentType}`);
      return null;
    }

    const buffer = Buffer.from(await imgResp.arrayBuffer());
    const ext    = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const slug   = (postTitle || 'hero').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const filename = `${slug}-hero.${ext}`;

    const mediaResp = await fetch(`${siteUrl}/wp-json/wp/v2/media`, {
      method: 'POST',
      headers: {
        'Authorization':        authHeader,
        'Content-Type':         contentType,
        'Content-Disposition':  `attachment; filename="${filename}"`,
      },
      body: buffer,
    });

    if (!mediaResp.ok) {
      const err = await mediaResp.text();
      console.warn(`[publish] WP media upload failed ${mediaResp.status}: ${err}`);
      return null;
    }

    const media = await mediaResp.json();
    return media.id ?? null;
  } catch (err) {
    console.warn(`[publish] Hero image upload error: ${err.message}`);
    return null;
  }
}

// Convert raw markdown/LLM output to clean WordPress HTML
function markdownToWpHtml(text) {
  if (!text) return '';
  const lines = text.split('\n');
  const html = [];
  let subtitleDone = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { html.push(''); continue; }

    // Drop the "Reading Time" meta line — it's an editorial label, not published body.
    // Matches "Reading Time: 6 minutes" with optional ** bold wrappers.
    if (/^\**\s*reading time\b/i.test(trimmed)) continue;

    // Drop LLM-generated title-block metadata so it never ends up in the body:
    // the publish date is the WP post date, not body text. Removes "Prepared for…",
    // "By …"/"Author:"/"Date:" lines, and any line that is ONLY a date (e.g.
    // "26 October 2023", "October 26, 2023", "2025-06-23"). Whole-line matches
    // only, so dates inside prose or reference lines are untouched.
    const meta = trimmed.replace(/^\*+|\*+$/g, '').trim();
    if (/^(prepared for|published(?: on)?|publication date|date|by|author|byline)\s*[:\-–]/i.test(meta)) continue;
    if (/^(prepared for|prepared exclusively for)\b/i.test(meta)) continue;
    if (/^\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{4}$/.test(meta)) continue;           // 26 October 2023
    if (/^[A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}$/.test(meta)) continue; // October 26, 2023
    if (/^\d{4}-\d{2}-\d{2}$/.test(meta)) continue;                            // 2025-06-23
    if (/^\d{1,2}[\/.]\d{1,2}[\/.]\d{4}$/.test(meta)) continue;                // 23/06/2025

    // Strip ** wrappers from standalone heading lines (e.g. "**Background & Rationale**")
    const boldOnly = trimmed.match(/^\*\*(.+?)\*\*$/);

    // Markdown headings → <h2>; first body "# " is the subtitle and becomes <h1>
    if (trimmed.startsWith('### '))     { html.push(`<h2>${trimmed.slice(4).replace(/\*\*/g, '')}</h2>`); continue; }
    if (trimmed.startsWith('## '))      { html.push(`<h2>${trimmed.slice(3).replace(/\*\*/g, '')}</h2>`); continue; }
    if (trimmed.startsWith('# '))       {
      const txt = trimmed.slice(2).replace(/\*\*/g, '');
      if (!subtitleDone) { subtitleDone = true; html.push(`<h1>${txt}</h1>`); continue; }
      html.push(`<h2>${txt}</h2>`); continue;
    }

    // Bold-only lines that look like section headers → <h2>
    if (boldOnly) {
      const inner = boldOnly[1].trim();
      const isHeader = /^(Background|Study Design|Patient Population|Key Findings|Discussion|Safety|Authors|Reference|Clinical Relevance|Conclusions|Disclaimer)/i.test(inner);
      if (isHeader) { html.push(`<h2>${inner}</h2>`); continue; }
    }

    // Inline bold: **text** → <strong>text</strong>
    let p = trimmed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Inline italic: *text* → <em>text</em> (but not inside tags)
    p = p.replace(/(?<!\w)\*([^*]+?)\*(?!\w)/g, '<em>$1</em>');
    // (Source: URL) → (Source link)  — must run before bare-URL pass
    p = p.replace(
      /\(Source:\s*(https?:\/\/[^\s)]+)\)/gi,
      '(<a href="$1" target="_blank" rel="noopener noreferrer">Source</a>)'
    );
    // Any remaining bare URLs not already inside href="..." → clickable link
    p = p.replace(
      /(?<!['"=])(https?:\/\/[^\s<>"')]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    html.push(`<p>${p}</p>`);
  }

  return html.filter(l => l !== '').join('\n');
}

// Normalise a source publish date (ISO string, Date, or common sheet formats
// like "15/06/2025" or "2025-06-15") into the local ISO 8601 form the WP REST
// API accepts for the post `date` field (e.g. "2025-06-15T00:00:00"). Returns
// null if the value can't be parsed so the payload simply omits `date` and WP
// defaults to the publish moment.
export function toWpDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value) ? null : value.toISOString().slice(0, 19);
  }
  const s = String(value).trim();
  if (!s) return null;
  // DD/MM/YYYY (UK sheet convention). Parsed by component so the calendar day
  // is preserved exactly — never shifted by the server's timezone.
  let m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T00:00:00`;
  // ISO-ish YYYY-MM-DD with optional time — keep the wall-clock value literally.
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, y, mo, d, h = '00', mi = '00', se = '00'] = m;
    return `${y}-${mo}-${d}T${h}:${mi}:${se}`;
  }
  const dt = new Date(s);
  return isNaN(dt) ? null : dt.toISOString().slice(0, 19);
}

export function buildWpPayload(item, categoryIds, tagIds = [], featuredMediaId = null) {
  const wpDate = toWpDate(item.publishDate);
  return {
    title:      item.title,
    content:    markdownToWpHtml(item.body),
    excerpt:    item.excerpt ?? '',
    status:     'publish',
    categories: Array.isArray(categoryIds) && categoryIds.length > 0 ? categoryIds : [],
    tags:       Array.isArray(tagIds) && tagIds.length > 0 ? tagIds : [],
    ...(featuredMediaId ? { featured_media: featuredMediaId } : {}),
    // Date the post to its original publication when we have a source date.
    ...(wpDate ? { date: wpDate } : {}),
  };
}

async function publishToWordPress(item, { fallbackHeroImageUrl } = {}) {
  const credentials = Buffer.from(
    `${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`
  ).toString('base64');
  const authHeader = `Basic ${credentials}`;
  const siteUrl    = (process.env.WP_SITE_URL ?? '').trim().replace(/\/$/, '');

  // ── Category resolution ─────────────────────────────────────────────────
  // Posts are assigned to BOTH the parent app-category (e.g. "Breaking News")
  // AND the per-row sub-category when a sub-category is provided. This keeps
  // category-archive pages working at both levels.
  //
  // Resolution priority:
  //   • Parent: item.wpCategorySlug → CATEGORY_SLUG_MAP[item.category]
  //   • Sub-category: item.subCategory (resolved by name/slug, auto-created
  //                    under the parent if missing)
  //
  // Both IDs land in categoryIds[]. When no sub-category is provided, only
  // the parent is assigned (legacy behaviour).
  const parentAppSlug = CATEGORY_SLUG_MAP[item.category] || null;
  const explicitSlug  = item.wpCategorySlug || parentAppSlug || null;
  const categoryIdsSet = new Set();
  let subCategoryCreated = false;
  let subCategoryResolved = null;

  // Diagnostic: what taxonomy data did the content record carry in?
  console.log(`[publish] item ${item.id} taxonomy input — category="${item.category}" wpCategorySlug="${item.wpCategorySlug || ''}" subCategory="${item.subCategory || ''}" tags=${JSON.stringify(item.tags)}`);

  // Resolve the parent category first so we always have it in the assignment.
  if (explicitSlug) {
    const parentId = await resolveWpCategoryId(explicitSlug, siteUrl, authHeader);
    if (parentId) {
      categoryIdsSet.add(parentId);
    } else {
      console.warn(`[publish] WP parent category slug "${explicitSlug}" not found — proceeding without parent`);
    }
  }

  // Resolve the sub-category and attach it alongside the parent.
  if (item.subCategory && String(item.subCategory).trim()) {
    // Normalize against the category's canonical set (e.g. BlitzSpirit) so a slug,
    // display name, or case/spacing variant all bind to the right WP term. For a
    // fixed-set category an UNRECOGNIZED value is skipped (parent only) instead of
    // auto-creating a junk child term; free-text categories pass through as before.
    const fixedSet  = CATEGORY_SUBCATEGORIES[item.category] || null;
    const canonical = normalizeSubCategory(item.category, item.subCategory);
    if (fixedSet && !canonical) {
      console.warn(`[publish] Sub-category "${item.subCategory}" is not a known ${item.category} sub-category (allowed: ${fixedSet.map(s => s.slug).join(', ')}) — posting under parent "${parentAppSlug || 'top-level'}" only`);
    } else {
      const subCatName = canonical ? canonical.name : item.subCategory;
      const resolved = await resolveOrCreateWpCategory(subCatName, {
        siteUrl,
        authHeader,
        parentSlug: parentAppSlug,
        autoCreate: !fixedSet, // fixed-set sub-categories must already exist in WP
      });
      if (resolved.id) {
        categoryIdsSet.add(resolved.id);
        subCategoryCreated = resolved.created === true;
        subCategoryResolved = resolved.term || null;
        if (subCategoryCreated) {
          console.log(`[publish] Auto-created WP sub-category "${subCatName}" (id ${resolved.id}) under parent slug "${parentAppSlug || 'top-level'}"`);
        }
      } else {
        console.warn(`[publish] Sub-category "${subCatName}" could not be resolved${fixedSet ? ' (fixed-set term missing in WP)' : ' or created'} — posting under parent only`);
      }
    }
  }

  const categoryIds = Array.from(categoryIdsSet);

  // ── Tag resolution ──────────────────────────────────────────────────────
  // item.tags can be: a comma-separated string ("Israel, Iran"), an array of
  // strings, or null/undefined. parseTagList normalises to a string array.
  let tagIds = [];
  let tagsCreated = [];
  const tagNames = parseTagList(item.tags);
  if (tagNames.length) {
    const tagResult = await resolveOrCreateWpTags(tagNames, {
      siteUrl,
      authHeader,
      autoCreate: true,
    });
    tagIds = tagResult.ids;
    tagsCreated = tagResult.created;
    if (tagsCreated.length) {
      console.log(`[publish] Auto-created WP tags: ${tagsCreated.join(', ')}`);
    }
    if (tagResult.failed?.length) {
      console.warn(`[publish] Failed to resolve/create WP tags: ${tagResult.failed.join(', ')}`);
    }
  }

  // Upload hero image and get media ID (non-fatal if it fails). Falls back to the
  // category-level hero image when the article has none.
  let featuredMediaId = null;
  const heroUrl = item.heroImageUrl || fallbackHeroImageUrl || null;
  if (heroUrl) {
    featuredMediaId = await uploadHeroImageToWp(heroUrl, item.title, siteUrl, authHeader);
    if (featuredMediaId) {
      const source = item.heroImageUrl ? 'article' : 'category fallback';
      console.log(`[publish] Hero image uploaded as WP media ID ${featuredMediaId} (${source})`);
    }
  }

  const response = await fetch(`${siteUrl}/wp-json/wp/v2/posts`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': authHeader,
    },
    body: JSON.stringify(buildWpPayload(item, categoryIds, tagIds, featuredMediaId)),
  });

  if (!response.ok) {
    const err = await response.text();
    // Include which username was attempted to aid debugging
    throw new Error(`WordPress API ${response.status} (user: ${process.env.WP_USERNAME ?? 'not set'}, site: ${process.env.WP_SITE_URL ?? 'not set'}): ${err}`);
  }
  const wpPost = await response.json();
  // Surface taxonomy outcomes so the caller (the cron handler / KV record) can
  // tell whether terms were auto-created — useful for the upload-preview UI to
  // confirm what landed in WP after a batch run.
  return {
    ...wpPost,
    _taxonomy: {
      categoryIds,
      tagIds,
      subCategoryCreated,
      subCategoryResolved,
      tagsCreated,
    },
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { contentId, id, fallbackHeroImageUrl } = req.body;
  const cid = contentId || id;
  if (!cid) return res.status(400).json({ error: 'contentId required' });

  const item = await kv.get(`content:${cid}`);
  if (!item) return res.status(404).json({ error: 'Not found' });
  if (!['approved', 'scheduled'].includes(item.status)) {
    return res.status(400).json({ error: 'Content must be approved or scheduled to publish' });
  }

  let wpPost;
  try {
    wpPost = await publishToWordPress(item, { fallbackHeroImageUrl });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }

  const updated = {
    ...item,
    status: 'published',
    publishedAt: new Date().toISOString(),
    wpPostId: wpPost.id,
    wpPostUrl: wpPost.link,
    // Snapshot taxonomy outcomes onto the content record so the dashboard /
    // logs can show what category + tags landed in WP without an extra fetch.
    wpCategoryIds: wpPost._taxonomy?.categoryIds ?? [],
    wpTagIds:      wpPost._taxonomy?.tagIds ?? [],
    wpAutoCreatedSubCategory: wpPost._taxonomy?.subCategoryCreated ?? false,
    wpAutoCreatedTags:        wpPost._taxonomy?.tagsCreated ?? [],
    updatedAt: new Date().toISOString(),
  };
  await kv.set(`content:${cid}`, updated);
  return res.json({
    wpPostId: wpPost.id,
    wpPostUrl: wpPost.link,
    taxonomy: wpPost._taxonomy ?? null,
  });
}
