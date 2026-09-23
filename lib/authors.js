// lib/authors.js
//
// Single source of truth for the Merlows author team. Every article gets a
// human byline instead of the single WP_USERNAME account: one EXCLUSIVE author
// per sub-category, plus one FLOATER per parent category who takes a random
// ~10% of that category's articles.
//
// • Author identity lives here (name + WP username). The numeric WP user id is
//   resolved lazily at publish time (publish.js resolveWpAuthorId, cached in KV),
//   so creating/renaming WP users does NOT require a redeploy of this file.
// • Sub-category slugs MUST match CATEGORY_SUBCATEGORIES in
//   lib/core/handlers/publish.js (and index.html) exactly — that's how a content
//   record's `subCategory` binds to the right dedicated author.
// • The app category id is the internal id (e.g. 'op-eds' for BlitzSpirit,
//   'cyrus-accord'), NOT the WP parent slug.

import { slugify } from './wp-taxonomy.js';

// Share of a parent category's articles routed to its floater (the rest go to
// the sub-category's dedicated author). Override per-process via AUTHOR_FLOATER_SHARE.
export const FLOATER_SHARE = (() => {
  const n = Number(process.env.AUTHOR_FLOATER_SHARE);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.10;
})();

// Email-alias domain for the WP author accounts (bylines only — no real mailbox
// required, WP just needs a unique string). Override via AUTHOR_EMAIL_DOMAIN.
export const AUTHOR_EMAIL_DOMAIN = (process.env.AUTHOR_EMAIL_DOMAIN || 'authors.merlows.com').trim();

// category id → { subcats: { slug: {name, username, bio} }, floater: {...}, default: slug }
export const AUTHOR_REGISTRY = {
  'breaking-news': {
    default: 'trade-economy',
    subcats: {
      'trade-economy':   { name: 'Adi Rosen',         username: 'adi-rosen',        bio: 'Tel Aviv–based markets writer covering regional trade, energy and the economics of normalisation.' },
      'peace-diplomacy': { name: 'Layla Mansour',      username: 'layla-mansour',    bio: 'Levant diplomatic correspondent tracking ceasefires, back-channels and summitry.' },
      'antisemitism':    { name: 'Daniel Roth',        username: 'daniel-roth',      bio: 'Diaspora-affairs reporter monitoring antisemitism, extremism and community security.' },
      'culture-war':     { name: 'Marcus Whitfield',   username: 'marcus-whitfield', bio: 'Cultural-politics columnist on free speech, the campus and the West’s identity debates.' },
      'nationalism':     { name: 'Yael Bar-On',        username: 'yael-bar-on',      bio: 'Israeli politics writer covering sovereignty, identity and the nationalist current.' },
    },
    floater:             { name: 'Tomer Avidan',       username: 'tomer-avidan',     bio: 'General-assignment desk reporter; jumps to whatever’s breaking.' },
  },
  'op-eds': { // BlitzSpirit
    default: 'original-spirit',
    subcats: {
      'original-spirit': { name: 'Edith Caldwell',     username: 'edith-caldwell',   bio: 'Essayist on the wartime “keep calm and carry on” ethos and its living legacy.' },
      'explainers':      { name: 'Jonathan Pearce',    username: 'jonathan-pearce',  bio: 'Explainer writer turning tangled history into plain, sourced narrative.' },
      'blitz-echoes':    { name: 'Margaret Ellison',   username: 'margaret-ellison', bio: 'Social historian drawing lines from the home front to the present day.' },
      'spirit-today':    { name: 'Henry Ashworth',     username: 'henry-ashworth',   bio: 'Reporter on contemporary resilience, civic courage and quiet heroism.' },
      'carry-on':        { name: 'Clara Bennett',      username: 'clara-bennett',    bio: 'Culture and morale columnist; the lighter, defiant register.' },
    },
    floater:             { name: 'Reuben Stein',       username: 'reuben-stein',     bio: 'Roving guest essayist across the BlitzSpirit beat.' },
  },
  'cyrus-accord': {
    default: 'the-cyrus-vision',
    subcats: {
      'the-cyrus-vision':        { name: 'Darius Kohan',   username: 'darius-kohan',   bio: 'Writer on the Cyrus ideal — tolerance, pluralism and the accord’s founding vision.' },
      'persian-jewish-heritage': { name: 'Shirin Hakimi',  username: 'shirin-hakimi',  bio: 'Cultural historian of Persian-Jewish life, memory and diaspora.' },
      'conflict-diplomacy':      { name: 'Cyrus Nazarian', username: 'cyrus-nazarian', bio: 'Iran analyst covering the regime, the opposition and regional diplomacy.' },
    },
    floater:                     { name: 'Esther Yaghoubi', username: 'esther-yaghoubi', bio: 'Guest contributor across the Cyrus Accords beat.' },
  },
  'abraham-accords': {
    default: 'normalisation-diplomacy',
    subcats: {
      'normalisation-diplomacy': { name: 'Khalid Al-Mansoori', username: 'khalid-al-mansoori', bio: 'Gulf diplomacy writer charting the widening circle of normalisation.' },
      'regional-security':       { name: 'Noa Friedman',       username: 'noa-friedman',       bio: 'Israeli security analyst on defence cooperation and deterrence.' },
      'trade-connectivity':      { name: 'Faisal Al-Rashid',   username: 'faisal-al-rashid',   bio: 'Gulf business correspondent on trade corridors, ports and investment.' },
    },
    floater:                     { name: 'Rana Haddad',        username: 'rana-haddad',        bio: 'Guest contributor across the Abraham Accords beat.' },
  },
  'diplomatic-analysis': {
    default: 'great-power-politics',
    subcats: {
      'great-power-politics':  { name: 'Gregory Halloran', username: 'gregory-halloran', bio: 'Geopolitics analyst on US–China–Russia competition and the Middle East.' },
      'security-strategy':     { name: 'Avner Cohen',      username: 'avner-cohen',      bio: 'Strategic-studies writer on deterrence, force posture and escalation.' },
      'treaties-institutions': { name: 'Amira Suleiman',   username: 'amira-suleiman',   bio: 'International-law writer on treaties, the UN system and institutions.' },
    },
    floater:                   { name: 'Daniel Okonkwo',   username: 'daniel-okonkwo',   bio: 'Guest analyst across the Diplomatic Analysis beat.' },
  },
  'regional-voices': {
    default: 'gulf-perspectives',
    subcats: {
      'gulf-perspectives':  { name: 'Mariam Al-Sabah', username: 'mariam-al-sabah', bio: 'Gulf columnist on how the region sees the accords from the inside.' },
      'israeli-society':    { name: 'Itai Ben-David',   username: 'itai-ben-david',   bio: 'Writer on Israeli society — the street, the kibbutz, the start-up floor.' },
      'diaspora-dialogues': { name: 'Rachel Goldstein', username: 'rachel-goldstein', bio: 'Diaspora columnist on identity, belonging and the bond with Israel.' },
    },
    floater:                { name: 'Samir Khoury',     username: 'samir-khoury',     bio: 'Guest Levantine voice across the Regional Voices beat.' },
  },
};

// Flat list of every distinct author (for the WP user-creation script / UI dropdowns).
export function listAuthors() {
  const out = [];
  for (const [category, cat] of Object.entries(AUTHOR_REGISTRY)) {
    for (const [subSlug, a] of Object.entries(cat.subcats)) {
      out.push({ ...a, category, subSlug, role: 'dedicated', email: emailFor(a.username) });
    }
    out.push({ ...cat.floater, category, subSlug: null, role: 'floater', email: emailFor(cat.floater.username) });
  }
  return out;
}

export function emailFor(username) {
  return `${username}@${AUTHOR_EMAIL_DOMAIN}`;
}

/**
 * Choose the author for an article.
 *
 * Rolls once: with probability FLOATER_SHARE (~10%) the parent category's floater
 * is returned; otherwise the dedicated author for the article's sub-category.
 * Unknown / empty sub-categories fall back to the category's `default` dedicated
 * author. The roll is meant to be done ONCE per article and persisted on the
 * content record so re-edits / re-publishes never change an existing byline.
 *
 * @param {string} category    app category id (e.g. 'op-eds', 'breaking-news')
 * @param {string} subCategory sub-category slug or display name (matched by slug)
 * @param {object} [opts]      { rand } injectable [0,1) roll for deterministic tests
 * @returns {{username,name,bio,role,category,subSlug}|null} null if category unknown
 */
export function pickAuthor(category, subCategory, opts = {}) {
  const cat = AUTHOR_REGISTRY[category];
  if (!cat) return null;
  const rand = typeof opts.rand === 'number' ? opts.rand : Math.random();
  if (rand < FLOATER_SHARE) {
    return { ...cat.floater, role: 'floater', category, subSlug: null };
  }
  const slug = slugify(String(subCategory ?? ''));
  const dedicated = cat.subcats[slug];
  if (dedicated) return { ...dedicated, role: 'dedicated', category, subSlug: slug };
  return { ...cat.subcats[cat.default], role: 'dedicated', category, subSlug: cat.default };
}
