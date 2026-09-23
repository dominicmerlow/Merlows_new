#!/usr/bin/env node
// scripts/build-writers-page.js
//
// Builds the "Our Writers" page and wires it under the ABOUT menu.
//   1. Generates branded HTML (writer-cards grouped by category) from
//      writers-data.js — the single source of truth.
//   2. Creates/updates the WP page (slug `our-writers`) via REST, content wrapped
//      in a wp:html block so it renders verbatim (no wpautop mangling).
//   3. Adds it as a child of the ABOUT menu item (id 43, Main Menu id 19) if absent.
//   4. Writes wordpress-theme/merlows/page-our-writers.php — a full-bleed template
//      mirroring page-our-heritage.php, with the same cards baked in (optional
//      upgrade: deploy via cPanel, then select the "Our Writers" template).
//
// Requires admin WP creds: WP_SITE_URL, WP_USERNAME, WP_APP_PASSWORD
// Usage: node scripts/build-writers-page.js [--dry-run]

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { WRITER_GROUPS, SITE_URL, initials } from './writers-data.js';

const DRY = process.argv.includes('--dry-run');
const SITE = (process.env.WP_SITE_URL || SITE_URL).replace(/\/$/, '');
const USER = process.env.WP_USERNAME ?? '';
const PASS = process.env.WP_APP_PASSWORD ?? '';
const MENU_ID = 19;      // Main Menu
const ABOUT_ITEM_ID = 43; // "ABOUT" dropdown
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── Markup (shared by the REST page and the PHP template) ───────────────────
function renderCard(w) {
  const beatClass = w.floater ? 'mlws-wcard__beat mlws-wcard__beat--guest' : 'mlws-wcard__beat';
  return `      <article class="mlws-wcard" data-reveal>
        <div class="mlws-wcard__head">
          <span class="mlws-wcard__avatar" aria-hidden="true">${esc(initials(w.name))}</span>
          <div class="mlws-wcard__id">
            <h3 class="mlws-wcard__name">${esc(w.name)}</h3>
            <span class="${beatClass}">${esc(w.beat)}</span>
          </div>
        </div>
        <dl class="mlws-wcard__meta">
          <div class="mlws-wcard__row"><dt>Age</dt><dd>${esc(w.age)}</dd></div>
          <div class="mlws-wcard__row"><dt>Location</dt><dd>${esc(w.location)}</dd></div>
          <div class="mlws-wcard__row"><dt>Experience</dt><dd>${esc(w.experience)}</dd></div>
        </dl>
        <p class="mlws-wcard__interests"><span>Writing interests</span>${esc(w.interests)}</p>
        <a class="mlws-wcard__link" href="${SITE}/author/${w.slug}/">Read articles &rarr;</a>
      </article>`;
}

function renderGroups() {
  return WRITER_GROUPS.map((g, i) => `    <section class="mlws-group" aria-labelledby="grp-${g.key}">
      <header class="mlws-group__header" data-reveal>
        <span class="mlws-group__num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
        <h2 class="mlws-group__title" id="grp-${g.key}">${esc(g.label)}</h2>
        <p class="mlws-group__blurb">${esc(g.blurb)}</p>
      </header>
      <div class="mlws-wgrid">
${g.writers.map(renderCard).join('\n')}
      </div>
    </section>`).join('\n\n');
}

function styleBlock() {
  return `<style>${mastheadCss()}${liveOverrideCss()}
.mlws-writers{ --mlws-navy: var(--primary-color,#1B4F8A); --mlws-gold: var(--accent-color,#D4AF37); }
.mlws-writers *,.mlws-writers *::before,.mlws-writers *::after{ box-sizing:border-box; }
.mlws-writers [data-reveal]{ opacity:0; transform:translateY(24px); transition:opacity .55s ease, transform .55s ease; }
.mlws-writers [data-reveal].is-visible{ opacity:1; transform:translateY(0); }
.mlws-writers .msn-masthead{ margin-bottom:clamp(40px,6vw,64px); }
.mlws-body{ max-width:var(--container-width,1200px); margin-inline:auto; }
.mlws-group{ margin-bottom:clamp(48px,6vw,72px); }
.mlws-group__header{ position:relative; margin-bottom:28px; padding-top:20px; }
.mlws-group__num{ position:absolute; top:-14px; left:-6px; font-family:var(--font-heading); font-size:72px; font-weight:900; -webkit-text-stroke:1.5px var(--mlws-gold); color:transparent; opacity:.55; line-height:1; pointer-events:none; user-select:none; }
.mlws-group__title{ font-family:var(--font-heading); font-size:clamp(22px,2.6vw,32px); font-weight:700; color:var(--text-main,#1a1a1a); margin:0 0 8px; position:relative; }
.mlws-group__blurb{ font-family:var(--font-main); font-size:15px; line-height:1.6; color:var(--text-light,#555); margin:0; max-width:620px; }
.mlws-wgrid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(290px,1fr)); gap:22px; }
.mlws-wcard{ display:flex; flex-direction:column; padding:26px 24px; background:#fff; border:1px solid rgba(0,0,0,.09); border-top:3px solid var(--mlws-gold); border-radius:0; transition:box-shadow .25s, transform .25s; }
.mlws-wcard:hover{ box-shadow:0 14px 34px rgba(15,23,42,.10); transform:translateY(-3px); }
.mlws-wcard__head{ display:flex; align-items:center; gap:16px; margin-bottom:18px; }
.mlws-wcard__avatar{ flex-shrink:0; width:64px; height:64px; border-radius:50%; background:var(--mlws-navy); border:2px solid var(--mlws-gold); display:flex; align-items:center; justify-content:center; font-family:var(--font-heading); font-size:22px; font-weight:700; color:var(--mlws-gold); letter-spacing:.02em; }
.mlws-wcard__name{ font-family:var(--font-heading); font-size:19px; font-weight:700; color:var(--text-main,#1a1a1a); margin:0 0 4px; line-height:1.15; }
.mlws-wcard__beat{ font-family:var(--font-main); font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--mlws-navy); }
.mlws-wcard__beat--guest{ color:var(--mlws-gold); }
.mlws-wcard__meta{ margin:0 0 16px; padding:0; border-top:1px solid rgba(0,0,0,.07); }
.mlws-wcard__row{ display:flex; gap:12px; padding:8px 0; border-bottom:1px solid rgba(0,0,0,.06); }
.mlws-wcard__row dt{ flex:0 0 86px; font-family:var(--font-main); font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--text-light,#777); padding:0; }
.mlws-wcard__row dd{ margin:0; font-family:var(--font-main); font-size:14px; line-height:1.5; color:var(--text-main,#1a1a1a); }
.mlws-wcard__interests{ font-family:var(--font-main); font-size:14px; line-height:1.6; color:var(--text-light,#555); margin:0 0 18px; }
.mlws-wcard__interests span{ display:block; font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--text-light,#777); margin-bottom:4px; }
.mlws-wcard__link{ margin-top:auto; font-family:var(--font-main); font-size:13px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; text-decoration:none; color:var(--mlws-navy); transition:color .2s; }
.mlws-wcard__link:hover{ color:var(--mlws-gold); }
.mlws-writers__note{ text-align:center; font-family:var(--font-main); font-size:12px; color:var(--text-light,#888); margin-top:8px; font-style:italic; }
</style>`;
}

function revealScript() {
  return `<script>
(function(){'use strict';
  var els=document.querySelectorAll('.mlws-writers [data-reveal]');
  if(!('IntersectionObserver' in window)){els.forEach(function(e){e.classList.add('is-visible');});return;}
  var o=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){en.target.classList.add('is-visible');o.unobserve(en.target);}});},{threshold:.1,rootMargin:'0px 0px -40px 0px'});
  els.forEach(function(e){o.observe(e);});
}());
</script>`;
}

const TOTAL = WRITER_GROUPS.reduce((n, g) => n + g.writers.length, 0);

// Masthead — faithful copy of page-our-heritage.php's hero (msn-masthead): navy
// grid background, eyebrow, light title with gold italic, rule, subtitle, in-page
// TOC, rotating stamp, stats, gold ticker. Used by BOTH the REST page and the
// theme template so the hero matches Our Mission exactly.
function buildMasthead() {
  const toc = WRITER_GROUPS.map(g => `                    <li><a href="#grp-${g.key}">${esc(g.label)}</a></li>`).join('\n');
  return `<section class="msn-masthead" aria-label="Page masthead">
    <div class="msn-masthead__inner">
        <div class="msn-masthead__left">
            <div class="msn-eyebrow" aria-hidden="true">
                <span class="msn-eyebrow__line"></span>
                <span class="msn-eyebrow__label">THE NEWSROOM</span>
                <span class="msn-eyebrow__line"></span>
            </div>
            <h1 class="msn-masthead__title">Our<br><em>Writers</em></h1>
            <div class="msn-masthead__rule" aria-hidden="true"></div>
            <p class="msn-masthead__subtitle">Contributors spread across the region and the diaspora &mdash; each with a beat of their own, covering Middle East diplomacy with the depth it deserves.</p>
            <nav class="msn-toc" aria-label="Writer desks">
                <ol class="msn-toc__list">
${toc}
                </ol>
            </nav>
        </div>
        <div class="msn-masthead__right">
            <div class="msn-stamp" aria-hidden="true">
                <div class="msn-stamp__ring">
                    <svg class="msn-stamp__svg" viewBox="0 0 160 160" aria-hidden="true">
                        <defs><path id="mlws-stamp-path" d="M 80,80 m -60,0 a 60,60 0 1,1 120,0 a 60,60 0 1,1 -120,0" /></defs>
                        <text class="msn-stamp__text"><textPath href="#mlws-stamp-path" startOffset="0%">MERLOWS &bull; WRITERS &bull; 2024 &bull;&nbsp;</textPath></text>
                    </svg>
                    <div class="msn-stamp__inner"><span class="msn-stamp__m">M</span></div>
                </div>
            </div>
            <div class="msn-masthead__stats">
                <div class="msn-stat"><span class="msn-stat__number">${TOTAL}</span><span class="msn-stat__label">Writers</span></div>
                <div class="msn-stat"><span class="msn-stat__number">${WRITER_GROUPS.length}</span><span class="msn-stat__label">Desks</span></div>
                <div class="msn-stat"><span class="msn-stat__number">Peace</span><span class="msn-stat__label">Focused</span></div>
            </div>
        </div>
    </div>
    <div class="msn-ticker" aria-hidden="true">
        <div class="msn-ticker__track">
            <span>${TOTAL} Writers &middot; ${WRITER_GROUPS.length} Desks &middot; Across the Region &amp; Diaspora &middot; Independent &middot; Rigorous &middot;&nbsp;</span>
            <span>${TOTAL} Writers &middot; ${WRITER_GROUPS.length} Desks &middot; Across the Region &amp; Diaspora &middot; Independent &middot; Rigorous &middot;&nbsp;</span>
            <span>${TOTAL} Writers &middot; ${WRITER_GROUPS.length} Desks &middot; Across the Region &amp; Diaspora &middot; Independent &middot; Rigorous &middot;&nbsp;</span>
        </div>
    </div>
</section>`;
}

// Masthead CSS — copied from page-our-heritage.php, scoped under .mlws-writers so
// it is self-contained (the msn-* styles are NOT global; they live per-template).
function mastheadCss() {
  return `
.mlws-writers .msn-masthead{ background:var(--primary-color,#1B4F8A); position:relative; overflow:hidden; }
.mlws-writers .msn-masthead::before{ content:""; position:absolute; inset:0; background-image:repeating-linear-gradient(0deg,rgba(255,255,255,.04) 0,rgba(255,255,255,.04) 1px,transparent 1px,transparent 48px),repeating-linear-gradient(90deg,rgba(255,255,255,.04) 0,rgba(255,255,255,.04) 1px,transparent 1px,transparent 48px); pointer-events:none; }
.mlws-writers .msn-masthead__inner{ max-width:var(--container-width,1200px); margin-inline:auto; padding:clamp(60px,8vw,100px) clamp(20px,4vw,60px) clamp(50px,6vw,80px); display:grid; grid-template-columns:1fr 340px; gap:60px; align-items:start; position:relative; z-index:1; }
@media (max-width:860px){ .mlws-writers .msn-masthead__inner{ grid-template-columns:1fr; } .mlws-writers .msn-masthead__right{ order:-1; } }
.mlws-writers .msn-eyebrow{ display:flex; align-items:center; gap:12px; margin-bottom:24px; }
.mlws-writers .msn-eyebrow__line{ flex:1; height:1px; background:var(--accent-color,#D4AF37); }
.mlws-writers .msn-eyebrow__label{ font-family:var(--font-main); font-size:11px; font-weight:700; letter-spacing:.2em; color:var(--accent-color,#D4AF37); white-space:nowrap; }
.mlws-writers .msn-masthead__title{ font-family:var(--font-heading); font-size:clamp(48px,6vw,86px); font-weight:300; line-height:1.05; color:#fff; margin:0 0 20px; }
.mlws-writers .msn-masthead__title em{ font-style:italic; color:var(--accent-color,#D4AF37); }
.mlws-writers .msn-masthead__rule{ width:100%; height:2px; background:linear-gradient(90deg,var(--accent-color,#D4AF37) 0%,transparent 100%); margin-bottom:24px; }
.mlws-writers .msn-masthead__subtitle{ font-family:var(--font-main); font-size:clamp(15px,1.4vw,18px); line-height:1.65; color:rgba(255,255,255,.78); margin:0 0 32px; max-width:520px; }
.mlws-writers .msn-toc__list{ list-style:none; margin:0; padding:0; display:flex; flex-wrap:wrap; gap:8px 20px; counter-reset:toc; }
.mlws-writers .msn-toc__list li{ counter-increment:toc; }
.mlws-writers .msn-toc__list li::before{ content:counter(toc,decimal-leading-zero) " "; color:var(--accent-color,#D4AF37); margin-right:4px; font-size:10px; font-family:var(--font-main); }
.mlws-writers .msn-toc__list a{ font-family:var(--font-main); font-size:12px; font-weight:600; letter-spacing:.08em; color:rgba(255,255,255,.55); text-decoration:none; text-transform:uppercase; transition:color .2s; }
.mlws-writers .msn-toc__list a:hover{ color:var(--accent-color,#D4AF37); }
.mlws-writers .msn-masthead__right{ display:flex; flex-direction:column; align-items:center; gap:36px; }
.mlws-writers .msn-stamp,.mlws-writers .msn-stamp__ring{ width:160px; height:160px; flex-shrink:0; }
.mlws-writers .msn-stamp__ring{ border:2px solid var(--accent-color,#D4AF37); border-radius:50%; position:relative; animation:mlws-stamp-spin 30s linear infinite; display:flex; align-items:center; justify-content:center; }
.mlws-writers .msn-stamp__svg{ position:absolute; inset:0; width:100%; height:100%; overflow:visible; }
.mlws-writers .msn-stamp__text{ font-family:var(--font-main); font-size:9px; font-weight:700; letter-spacing:.18em; fill:var(--accent-color,#D4AF37); text-transform:uppercase; }
.mlws-writers .msn-stamp__inner{ animation:mlws-stamp-counter 30s linear infinite; position:relative; z-index:1; }
.mlws-writers .msn-stamp__m{ font-family:var(--font-heading); font-size:48px; font-weight:700; color:var(--accent-color,#D4AF37); line-height:1; display:block; text-align:center; }
@keyframes mlws-stamp-spin{ to{ transform:rotate(360deg); } }
@keyframes mlws-stamp-counter{ to{ transform:rotate(-360deg); } }
.mlws-writers .msn-masthead__stats{ display:flex; gap:28px; justify-content:center; flex-wrap:wrap; }
.mlws-writers .msn-stat{ text-align:center; }
.mlws-writers .msn-stat__number{ display:block; font-family:var(--font-heading); font-size:clamp(18px,2vw,26px); font-weight:700; color:var(--accent-color,#D4AF37); line-height:1; }
.mlws-writers .msn-stat__label{ display:block; font-family:var(--font-main); font-size:11px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:rgba(255,255,255,.5); margin-top:4px; }
.mlws-writers .msn-ticker{ background:var(--accent-color,#D4AF37); overflow:hidden; height:38px; display:flex; align-items:center; position:relative; z-index:1; }
.mlws-writers .msn-ticker__track{ display:flex; white-space:nowrap; animation:mlws-ticker-scroll 28s linear infinite; }
.mlws-writers .msn-ticker__track span{ font-family:var(--font-main); font-size:11px; font-weight:700; letter-spacing:.18em; text-transform:uppercase; color:var(--primary-color,#1B4F8A); }
@keyframes mlws-ticker-scroll{ from{ transform:translateX(0); } to{ transform:translateX(-33.3333%); } }`;
}

// LIVE-PAGE-ONLY overrides: hide page.php's generic hero + category nav and break
// the masthead out to full width. Scoped to this page AND the default template, so
// switching to the custom page-our-writers.php template (no page-template-default
// body class) cleanly disables them.
function liveOverrideCss() {
  return `
body.page-id-1774.page-template-default .hero,
body.page-id-1774.page-template-default .inner-cat-nav-wrapper{ display:none !important; }
body.page-id-1774.page-template-default .container{ padding-top:0 !important; }
body.page-id-1774.page-template-default article{ margin-top:0 !important; }
body.page-id-1774.page-template-default .entry-content{ margin-top:0 !important; }
body.page-id-1774.page-template-default .mlws-writers .msn-masthead{ width:100vw; margin-left:calc(50% - 50vw); margin-right:calc(50% - 50vw); }`;
}

const ctaBlock = `  <section class="mlws-cta" style="text-align:center; margin-top:clamp(20px,4vw,40px); padding:clamp(40px,6vw,64px) 0 0; border-top:1px solid rgba(0,0,0,.08);">
    <p style="font-family:var(--font-main); font-size:11px; font-weight:700; letter-spacing:.22em; color:var(--accent-color,#D4AF37); text-transform:uppercase; margin:0 0 12px;">Join Us</p>
    <h2 style="font-family:var(--font-heading); font-size:clamp(26px,3.2vw,40px); font-weight:700; color:var(--text-main,#1a1a1a); margin:0 0 14px;">Write for Merlows.</h2>
    <p style="font-family:var(--font-main); font-size:16px; line-height:1.6; color:var(--text-light,#555); max-width:460px; margin:0 auto 26px;">We are always looking for sharp, regionally grounded voices. If that sounds like you, we would like to hear from you.</p>
    <a href="${SITE}/contact-us/" style="display:inline-block; font-family:var(--font-main); font-size:14px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; text-decoration:none; padding:14px 32px; background:var(--accent-color,#D4AF37); color:var(--primary-color,#1B4F8A); border:2px solid var(--accent-color,#D4AF37);">Get in Touch</a>
  </section>`;

// REST page content — wp:html block so it renders verbatim. Even so, the_content
// still runs wpautop/wptexturize on render, which can inject <br>/<p> into a
// multi-line <style>/<script>. So for the REST page we minify CSS/JS to a single
// line and strip blank lines from the markup (no double-newlines → no stray <p>).
function buildPageContent() {
  const cssMin = styleBlock().replace(/\n\s*/g, ' ');
  const jsMin = revealScript().replace(/\n\s*/g, ' ');
  let markup = `<div class="mlws-writers">
${buildMasthead()}
<div class="mlws-body">
${renderGroups()}
${ctaBlock}
  <p class="mlws-writers__note">Writer photographs coming soon — monograms shown as placeholders.</p>
</div>
</div>`;
  markup = markup.replace(/\n{2,}/g, '\n');
  const inner = `${markup}\n${cssMin}\n${jsMin}`;
  return `<!-- wp:html -->\n${inner}\n<!-- /wp:html -->`;
}

// Full-bleed theme template mirroring page-our-heritage.php (optional deploy).
function buildTemplatePhp() {
  return `<?php
/**
 * Template Name: Our Writers
 *
 * Static "Our Writers" page for Merlows. Mirrors page-our-heritage.php structure.
 * Generated by content-generator/scripts/build-writers-page.js from writers-data.js
 * — edit that source and re-run rather than hand-editing the cards here.
 */

get_header();
?>

<main id="main-content" class="msn-page mlws-writers">

${buildMasthead()}

<div class="mlws-body" style="padding:clamp(60px,8vw,90px) clamp(20px,4vw,60px) clamp(50px,7vw,80px);">
${renderGroups()}

${ctaBlock}
</div>

</main><!-- /#main-content -->

${styleBlock()}
${revealScript()}

<?php get_footer(); ?>
`;
}

// ── REST helpers ────────────────────────────────────────────────────────────
async function wp(path, init = {}) {
  const res = await fetch(`${SITE}/wp-json/wp/v2/${path}`, {
    ...init, headers: { Authorization: AUTH, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await res.text();
  let body; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
}

async function main() {
  // 1. Write the theme template (always — it's a repo artifact).
  const tplPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'wordpress-theme', 'merlows', 'page-our-writers.php');
  if (!DRY) writeFileSync(tplPath, buildTemplatePhp());
  console.log(`${DRY ? '[DRY] ' : ''}Theme template → ${tplPath}`);

  if (!USER || !PASS) { console.error('Missing WP_USERNAME / WP_APP_PASSWORD — page + menu steps skipped.'); process.exit(1); }

  const content = buildPageContent();

  // 2. Create or update the page.
  const existing = await wp('pages?slug=our-writers&status=publish,draft&_fields=id,slug');
  let pageId = Array.isArray(existing.body) && existing.body.length ? existing.body[0].id : null;
  if (DRY) {
    console.log(`[DRY] Would ${pageId ? 'UPDATE page ' + pageId : 'CREATE page our-writers'} (${content.length} bytes content)`);
  } else if (pageId) {
    const u = await wp(`pages/${pageId}`, { method: 'POST', body: JSON.stringify({ title: 'Our Writers', content, status: 'publish' }) });
    if (!u.ok) { console.error('Page update failed', u.status, JSON.stringify(u.body).slice(0, 300)); process.exit(2); }
    console.log(`Updated page ${pageId} → ${u.body.link}`);
  } else {
    const c = await wp('pages', { method: 'POST', body: JSON.stringify({ title: 'Our Writers', slug: 'our-writers', content, status: 'publish' }) });
    if (!c.ok) { console.error('Page create failed', c.status, JSON.stringify(c.body).slice(0, 300)); process.exit(2); }
    pageId = c.body.id; console.log(`Created page ${pageId} → ${c.body.link}`);
  }

  // 3. Ensure a menu item under ABOUT (id 43).
  const items = await wp(`menu-items?menus=${MENU_ID}&per_page=100&_fields=id,parent,object_id,object,type`);
  const exists = Array.isArray(items.body) && items.body.some(i => i.object === 'page' && Number(i.object_id) === Number(pageId));
  if (DRY) {
    console.log(`[DRY] Menu item under ABOUT ${exists ? 'already exists' : 'would be CREATED'} for page ${pageId}`);
  } else if (exists) {
    console.log('Menu item already present under ABOUT — skipped.');
  } else {
    const m = await wp('menu-items', { method: 'POST', body: JSON.stringify({
      title: 'Our Writers', status: 'publish', menus: MENU_ID, parent: ABOUT_ITEM_ID,
      type: 'post_type', object: 'page', object_id: pageId, menu_order: 99,
    }) });
    if (!m.ok) { console.error('Menu item create failed', m.status, JSON.stringify(m.body).slice(0, 300)); process.exit(2); }
    console.log(`Added menu item ${m.body.id} "Our Writers" under ABOUT (43).`);
  }

  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
