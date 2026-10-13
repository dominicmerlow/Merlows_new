// lib/social/dm/automation.js
// "Comment VOICES and we'll DM you the full story": builds the Zernio comment-automation
// payload for one Instagram post, and refuses to let a bad one out.
//
// Zernio's Meta app does the matching and the sending (lib/social/platforms/zernio.js). What
// goes wrong with comment-to-DM goes wrong silently, so every mistake that would otherwise be
// found by a reader who never got their link is a validation rule here instead:
//
//   - No keywords means EVERY comment triggers a DM. That is spam, sent in the brand's name.
//   - Substring or fuzzy matching fires on words that merely contain the keyword.
//   - Our own public reply is a comment. If it contains the keyword, it can trigger the
//     automation that posted it.
//   - Meta allows one private reply per comment, ever. A DM that fails because of its shape
//     (buttons to a non-follower have been reported to fail this way) has used it up.
//   - A link off the brand's own site, or an unfilled template, reaches a real reader.
//
// Plan: tasks/comment-to-dm-plan.md (§4 for the product decisions, §5 Z3 for these rules).

/** The word readers comment. Changing it means changing every caption that promises it. */
export const DM_KEYWORD = 'VOICES';

/**
 * Zernio matches `exact`, `contains` or `word`. `word` is a whole-word match; `contains` fires
 * on any substring. Whether `exact` means "the whole comment" is unconfirmed, so it is not the
 * default: the Z1 spike records how both behave on a real comment.
 */
export const DM_MATCH_MODE = 'word';

/** Caption line for posts that have an automation. Built from the keyword so the two cannot drift. */
export const CAPTION_CTA = `Comment ${DM_KEYWORD} and we'll DM you the full story 📩`;

/** Meta requires an automated chat to say so at the start of the conversation. */
export const DISCLOSURE = 'Automated message from Merlows News 🤖';

/** Rotated under the reader's comment. None may contain the keyword (see validateAutomation). */
export const PUBLIC_REPLY_VARIANTS = Object.freeze([
  'Sent, check your DMs 📩',
  "It's in your inbox 👀",
  'Just messaged you the full story 📬',
]);

/**
 * Meta's ceiling is 1,000 characters for plain text and 640 once buttons are attached. We send
 * no buttons, but hold to 640 so adding one later cannot push a live DM over the limit.
 * Counted in UTF-16 units, which is never fewer than Meta counts.
 */
export const DM_MAX_CHARS = 640;

const HEADLINE_MAX_CHARS = 200;
const MAX_REPLY_VARIANTS = 5;
const ALLOWED_MATCH_MODES = new Set(['word', 'exact']);

const siteHostFromEnv = () => (process.env.BRAND_SITE_HOST || 'merlows.com').toLowerCase();
const handleFromEnv = () => process.env.BRAND_SOCIAL_HANDLE || '@merlows.news';

// An Instagram mention. Without the "@", "merlows.news" is a bare domain Instagram would link.
const HANDLE_RE = /^@[A-Za-z0-9._]{1,30}$/;

const URL_RE = /https?:\/\/[^\s<>"']+/gi;
// A dot in any script: ASCII, ideographic (。), fullwidth (．) and halfwidth (｡).
const DOT = '[.\\u3002\\uFF0E\\uFF61]';
/**
 * Anything a reader could take for a link: a scheme, `www.`, a domain in any script
 * (merlowś.com and мерлоус.com as well as evil.com) or a bare IPv4 address. Instagram linkifies
 * bare domains in DMs. News copy like "£3.5bn", "U.S.", "No.10" and "Ph.D." does not match.
 */
const LINKISH_RE = new RegExp(
  [
    '[a-z][a-z0-9+.-]*:\\/\\/',
    `\\bwww${DOT}`,
    `[\\p{L}\\p{N}][\\p{L}\\p{N}_-]*${DOT}\\p{L}{2,}`,
    `\\b\\d{1,3}(?:${DOT}\\d{1,3}){3}\\b`,
  ].join('|'),
  'iu',
);
/**
 * Leftovers of a template or markup, not English words: `{headline}`, `YOUR_URL`, `PLACEHOLDER`,
 * `<b>`. Case-sensitive on purpose, so a headline about a "placeholder budget" is not one.
 */
const PLACEHOLDER_RE = /\{[^{}]*\}|\bYOUR_[A-Z]|\bPLACEHOLDER\b|<\/?[A-Za-z][^<>]*>/;
// Control and format characters: zero-width spaces, bidi overrides, NUL, soft hyphens.
const INVISIBLE_RE = /[\p{Cc}\p{Cf}]/gu;

/** Why `raw` may not appear in a DM, or null if it may. */
function urlProblem(raw, siteHost) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return `link is not a valid URL: ${raw.slice(0, 80)}`;
  }
  if (url.protocol !== 'https:') return `link is not https: ${raw.slice(0, 80)}`;
  if (url.username || url.password) return `link carries credentials: ${url.hostname}`;
  if (url.port) return `link names a port: ${url.host}`;
  const host = url.hostname.toLowerCase();
  if (host !== siteHost && host !== `www.${siteHost}`) return `link is not on ${siteHost}: ${host}`;
  return null;
}

/**
 * The article URL with campaign tags, so merlows.com analytics can tell a DM click from any
 * other visit. Throws on anything that is not an https URL on the brand's site: that is a bug
 * in the caller, not something to smooth over.
 */
export function articleLink(articleUrl, { siteHost = siteHostFromEnv() } = {}) {
  const problem = urlProblem(String(articleUrl ?? ''), siteHost);
  if (problem) throw new Error(problem);
  const url = new URL(articleUrl);
  const slug = url.pathname.split('/').filter(Boolean).pop() || 'home';
  url.searchParams.set('utm_source', 'instagram');
  url.searchParams.set('utm_medium', 'dm');
  url.searchParams.set('utm_campaign', 'comment-link');
  url.searchParams.set('utm_content', slug);
  url.hash = '';
  return url.toString();
}

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
};

/** A decoded code point, or nothing for NUL/controls, lone surrogates and out-of-range values. */
const codePoint = (n) => (n >= 32 && n <= 0x10ffff && (n < 0xd800 || n > 0xdfff) ? String.fromCodePoint(n) : '');

/**
 * Plain text from a title that may have come from WordPress: `title.rendered` carries tags and
 * entities (`&#8217;`), and a DM shows them literally. Only real tags are removed, so
 * "costs < forecast but profit > expectations" survives. One pass: decoding happens after the
 * tag strip, so an encoded tag comes out as text, and cleanHeadline then drops the headline.
 */
const toPlainText = (value) =>
  String(value ?? '')
    .replace(/<\/?[a-z][^<>]*>/gi, ' ')
    .replace(/&#(\d{1,7});/g, (m, n) => codePoint(Number(n)))
    .replace(/&#x([0-9a-f]{1,6});/gi, (m, h) => codePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);

/**
 * The headline as it may appear in a DM: one line of plain text, capped. The headline is the
 * one free text in the DM and can trace back to an RSS item, so it is never allowed to decide
 * whether an automation exists: anything link-shaped or template-shaped drops the headline
 * (the DM still carries the article link) instead of rejecting the whole automation.
 */
const cleanHeadline = (headline) => {
  const text = toPlainText(headline)
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .replace(INVISIBLE_RE, '')
    .trim();
  if (LINKISH_RE.test(text) || PLACEHOLDER_RE.test(text)) return '';
  return text.length > HEADLINE_MAX_CHARS ? `${text.slice(0, HEADLINE_MAX_CHARS - 1).trimEnd()}…` : text;
};

const checkedHandle = (handle) => {
  if (!HANDLE_RE.test(String(handle ?? ''))) {
    throw new Error(`social handle must look like @name, got ${JSON.stringify(handle)} (check BRAND_SOCIAL_HANDLE)`);
  }
  return handle;
};

/** The DM itself. The link goes in the text, not a button (see the header comment). */
export function buildDmMessage({ headline, link, handle = handleFromEnv() }) {
  return composeDm(cleanHeadline(headline), link, checkedHandle(handle));
}

/** Lay out an already-clean title. Cleaning twice is how a decoded entity turns into a tag. */
function composeDm(title, link, handle) {
  return [
    DISCLOSURE,
    '',
    title ? `Here's the full story: ${title}` : "Here's the full story:",
    link,
    '',
    `Follow ${handle} for more like this.`,
  ].join('\n');
}

/**
 * The Zernio payload for one post's automation.
 *
 * Scope it with `platformPostId` (the published Instagram media id) or `postId` (Zernio's own
 * id, which works before the post is live and so leaves no gap for early commenters). With
 * neither, pass `accountWide: true` deliberately: that automation answers every post on the
 * account.
 *
 * CREATING THIS AUTOMATION SWITCHES IT ON. Zernio's create endpoint ignores `isActive`: the Z1
 * spike sent `isActive: false` and got back an automation that was live and answering comments
 * (tasks/comment-to-dm-plan.md §5 Z1). So the payload carries no `isActive` at all, and passing
 * one throws rather than letting a caller believe it built a paused automation. Only create when
 * DMs are meant to be live right now (Z4 gates this on SOCIAL_DM=on). Pausing is a separate
 * call after creation: updateCommentAutomation(id, { isActive: false }).
 */
export function buildAutomation(options) {
  if (options && Object.hasOwn(options, 'isActive')) {
    throw new Error('isActive cannot be set on create: Zernio ignores it and every new automation is live. Pause it afterwards with updateCommentAutomation(id, { isActive: false })');
  }
  const {
    profileId,
    accountId,
    platformPostId,
    postId,
    accountWide = false,
    headline,
    articleUrl,
    siteHost = siteHostFromEnv(),
    handle = handleFromEnv(),
  } = options ?? {};
  if (platformPostId && postId) throw new Error('scope by platformPostId or postId, not both');
  if (!platformPostId && !postId && !accountWide) {
    throw new Error('an automation needs platformPostId, postId, or an explicit accountWide: true');
  }
  if ((platformPostId || postId) && accountWide) throw new Error('accountWide cannot also name a post');

  const mention = checkedHandle(handle);
  const link = articleLink(articleUrl, { siteHost });
  const title = cleanHeadline(headline);
  const scope = platformPostId ? { platformPostId: String(platformPostId) } : postId ? { postId: String(postId) } : {};
  return {
    profileId,
    accountId,
    name: `merlows-dm ${platformPostId || postId || 'account-wide'}`.slice(0, 100),
    trigger: 'comment',
    ...scope,
    ...(title ? { postTitle: title.slice(0, 100) } : {}),
    keywords: [DM_KEYWORD],
    matchMode: DM_MATCH_MODE,
    excludeKeywords: [],
    typoTolerance: false,
    dmMessage: composeDm(title, link, mention),
    // ⚠ VERIFY in the Z1 spike how Zernio combines these two. Every text here is keyword-free,
    // so the worst case is an uneven rotation, never a self-trigger.
    commentReply: PUBLIC_REPLY_VARIANTS[0],
    commentReplyVariations: [...PUBLIC_REPLY_VARIANTS],
    linkTracking: true,
    alsoMatchInDms: false,
  };
}

const sameScope = (a, b) =>
  (a.platformPostId && a.platformPostId === b.platformPostId) ||
  (a.postId && a.postId === b.postId) ||
  (!a.platformPostId && !a.postId && !b.platformPostId && !b.postId);

const lowerKeywords = (list) => (Array.isArray(list) ? list : []).map((k) => String(k).trim().toLowerCase()).filter(Boolean);

/**
 * Every reason this payload must not be sent. An empty array means it may go.
 *
 * `existing` is the account's current automations (as `interpretAutomation` returns them), so
 * that two active automations cannot answer the same keyword on the same post: which one fires
 * would be an accident. The payload counts as live unless it says `isActive: false` outright,
 * because a create payload has no `isActive` and is live the moment Zernio stores it. Only an
 * explicit pause (a PATCH setting `isActive: false`) skips the check.
 */
export function validateAutomation(payload, { existing = [], siteHost = siteHostFromEnv(), handle = handleFromEnv() } = {}) {
  const problems = [];
  const p = payload ?? {};

  if (!p.profileId) problems.push('profileId is missing');
  if (!p.accountId) problems.push('accountId is missing');

  // Matching. The list is checked as it will be SENT, not after cleaning: a blank entry next to
  // VOICES is still sent, and how Zernio matches an empty keyword is not documented.
  const keywords = lowerKeywords(p.keywords);
  const sentKeywords = Array.isArray(p.keywords) ? p.keywords : [];
  if (keywords.length === 0) problems.push('no keywords: every comment would trigger a DM');
  else if (sentKeywords.length !== 1 || sentKeywords[0] !== DM_KEYWORD) {
    problems.push(`keywords must be exactly ["${DM_KEYWORD}"], got ${JSON.stringify(p.keywords).slice(0, 80)}`);
  }
  if (!ALLOWED_MATCH_MODES.has(p.matchMode)) {
    problems.push(`matchMode must be word or exact, not ${p.matchMode ?? 'unset'} (contains fires on any substring)`);
  }
  if (p.typoTolerance) problems.push('typoTolerance is on: near-misses of the keyword would trigger');
  if (p.trigger && p.trigger !== 'comment') problems.push(`trigger ${p.trigger} is not enabled yet (story replies are v1.1)`);

  // The DM
  const dm = String(p.dmMessage ?? '');
  if (!dm.trim()) problems.push('dmMessage is empty');
  if (dm.length > DM_MAX_CHARS) problems.push(`dmMessage is ${dm.length} characters, over ${DM_MAX_CHARS}`);
  if (!dm.startsWith(DISCLOSURE)) problems.push('dmMessage does not open with the automation disclosure');
  const urls = dm.match(URL_RE) ?? [];
  if (urls.length === 0) problems.push('dmMessage has no link: the reader would get nothing');
  for (const raw of urls) {
    const problem = urlProblem(raw, siteHost);
    if (problem) problems.push(problem);
  }
  // Text checks run with the links taken out: an article slug is not a placeholder, and the
  // links were checked above. The handle is exempt only when it is a real @mention.
  let prose = dm.replace(URL_RE, ' ');
  if (HANDLE_RE.test(String(handle ?? ''))) prose = prose.split(handle).join(' ');
  if (PLACEHOLDER_RE.test(prose)) problems.push('dmMessage contains a placeholder or an unfilled template');
  if (LINKISH_RE.test(prose)) problems.push('dmMessage contains a domain Instagram would turn into a link');
  if (Array.isArray(p.buttons) ? p.buttons.length > 0 : p.buttons != null) {
    problems.push('buttons are not allowed: a rejected button message uses up the one private reply');
  }
  if (p.template != null) problems.push('templates are not allowed, for the same reason as buttons');
  if (Array.isArray(p.dmMessageVariations) && p.dmMessageVariations.length > 0) {
    problems.push('dmMessageVariations are not checked by this validator, so they are not allowed');
  }

  // Self-trigger: anything we post under the reader's comment is itself a comment. Substring,
  // not whole word, on purpose: it is stricter than any mode Zernio matches with.
  const replies = [p.commentReply, ...(Array.isArray(p.commentReplyVariations) ? p.commentReplyVariations : [])]
    .filter((r) => r != null);
  if (p.commentReplyVariations != null && !Array.isArray(p.commentReplyVariations)) {
    problems.push('commentReplyVariations must be a list; anything else would be sent unchecked');
  }
  if (Array.isArray(p.commentReplyVariations) && p.commentReplyVariations.length > MAX_REPLY_VARIANTS) {
    problems.push(`${p.commentReplyVariations.length} public-reply variants, over Zernio's ${MAX_REPLY_VARIANTS}`);
  }
  for (const reply of replies) {
    const text = String(reply).toLowerCase();
    if (!text.trim()) problems.push('a public-reply variant is empty');
    for (const kw of keywords) {
      if (text.includes(kw)) problems.push(`public reply "${reply}" contains the keyword ${kw.toUpperCase()}`);
    }
  }
  if (p.alsoMatchInDms) {
    const text = dm.toLowerCase();
    for (const kw of keywords) {
      if (text.includes(kw)) problems.push(`alsoMatchInDms is on and the DM itself contains the keyword ${kw.toUpperCase()}`);
    }
  }

  // Collisions with what is already live. Not `if (p.isActive)`: a create payload carries no
  // isActive and is live anyway, so that gate skipped the check for every real create.
  if (p.isActive !== false) {
    for (const other of existing) {
      if (!other?.isActive || (p.id && other.id === p.id)) continue;
      if (!sameScope(p, other)) continue;
      const shared = lowerKeywords(other.keywords).filter((k) => keywords.includes(k));
      if (shared.length > 0) {
        problems.push(`automation ${other.id} is already active on the same scope for ${shared.join(', ').toUpperCase()}`);
      }
    }
  }

  return problems;
}

/** validateAutomation, as a throw. The error lists every problem, not just the first. */
export function assertValidAutomation(payload, options) {
  const problems = validateAutomation(payload, options);
  if (problems.length > 0) {
    throw Object.assign(new Error(`comment automation rejected: ${problems.join('; ')}`), { problems });
  }
  return payload;
}
