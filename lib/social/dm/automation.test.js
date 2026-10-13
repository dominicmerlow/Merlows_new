// lib/social/dm/automation.js — the comment-to-DM payload and the rules that stop a bad one.
// Pure functions: no network, no KV.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DM_KEYWORD, DM_MATCH_MODE, CAPTION_CTA, DISCLOSURE, PUBLIC_REPLY_VARIANTS, DM_MAX_CHARS,
  articleLink, buildDmMessage, buildAutomation, validateAutomation, assertValidAutomation,
} from './automation.js';

const ENV_KEYS = ['BRAND_SITE_HOST', 'BRAND_SOCIAL_HANDLE'];
let savedEnv;
beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

const ARTICLE = 'https://merlows.com/gulf-states-reopen-talks/';
const base = { profileId: 'prof1', accountId: 'acct1', headline: 'Gulf states reopen talks', articleUrl: ARTICLE };
const valid = (overrides = {}) => ({ ...buildAutomation({ ...base, platformPostId: 'ig123' }), ...overrides });
const problemsOf = (payload, options) => validateAutomation(payload, options);
const hasProblem = (payload, pattern, options) => problemsOf(payload, options).some((p) => pattern.test(p));

describe('constants — what readers are told to do', () => {
  it('the caption line is exactly what was agreed', () => {
    assert.equal(CAPTION_CTA, "Comment VOICES and we'll DM you the full story 📩");
  });

  it('matches on whole words, never substrings', () => {
    assert.equal(DM_KEYWORD, 'VOICES');
    assert.equal(DM_MATCH_MODE, 'word');
  });

  it('no public-reply variant contains the keyword', () => {
    for (const reply of PUBLIC_REPLY_VARIANTS) assert.equal(reply.toLowerCase().includes('voices'), false, reply);
  });
});

describe('articleLink', () => {
  it('adds campaign tags keyed on the slug', () => {
    const url = new URL(articleLink(ARTICLE));
    assert.equal(url.searchParams.get('utm_source'), 'instagram');
    assert.equal(url.searchParams.get('utm_medium'), 'dm');
    assert.equal(url.searchParams.get('utm_campaign'), 'comment-link');
    assert.equal(url.searchParams.get('utm_content'), 'gulf-states-reopen-talks');
    assert.equal(url.hostname, 'merlows.com');
  });

  it('keeps an existing query, replaces stale utm values and drops the fragment', () => {
    const url = new URL(articleLink('https://merlows.com/a/b/story/?ref=x&utm_source=old#comments'));
    assert.equal(url.searchParams.get('ref'), 'x');
    assert.equal(url.searchParams.get('utm_source'), 'instagram');
    assert.equal(url.searchParams.getAll('utm_source').length, 1);
    assert.equal(url.hash, '');
    assert.equal(url.searchParams.get('utm_content'), 'story');
  });

  it('accepts the www host', () => {
    assert.equal(new URL(articleLink('https://www.merlows.com/x/')).hostname, 'www.merlows.com');
  });

  it('follows BRAND_SITE_HOST', () => {
    process.env.BRAND_SITE_HOST = 'example-news.co.uk';
    assert.equal(new URL(articleLink('https://example-news.co.uk/x/')).hostname, 'example-news.co.uk');
    assert.throws(() => articleLink(ARTICLE), /not on example-news\.co\.uk/);
  });

  for (const [label, url, pattern] of [
    ['plain http', 'http://merlows.com/x/', /not https/],
    ['another site', 'https://evil.com/x/', /not on merlows\.com/],
    ['a lookalike that ends with the brand host', 'https://merlows.com.evil.com/x/', /not on merlows\.com/],
    ['a lookalike that starts with it', 'https://evilmerlows.com/x/', /not on merlows\.com/],
    ['credentials in the URL', 'https://user:pw@merlows.com/x/', /credentials/],
    ['an explicit port', 'https://merlows.com:8443/x/', /port/],
    ['not a URL at all', 'merlows.com/x', /not a valid URL/],
    ['nothing', undefined, /not a valid URL/],
  ]) {
    it(`refuses ${label}`, () => assert.throws(() => articleLink(url), pattern));
  }
});

describe('buildDmMessage', () => {
  const link = 'https://merlows.com/x/?utm_source=instagram';

  it('opens with the disclosure and puts the link on its own line', () => {
    const lines = buildDmMessage({ headline: 'Title', link }).split('\n');
    assert.equal(lines[0], DISCLOSURE);
    assert.ok(lines.includes(link));
    assert.ok(lines.includes('Follow @merlows.news for more like this.'));
  });

  it('turns a WordPress-rendered title into plain text on one line', () => {
    const dm = buildDmMessage({ headline: 'Britain&#8217;s <em>quiet</em>\n role &amp; the\tGulf', link });
    assert.match(dm, /Here's the full story: Britain’s quiet role & the Gulf\n/);
  });

  it('caps a very long headline so the DM stays inside the limit', () => {
    const dm = buildDmMessage({ headline: 'word '.repeat(300), link });
    assert.ok(dm.length <= DM_MAX_CHARS, `${dm.length} chars`);
    assert.match(dm, /…\n/);
  });

  it('still reads sensibly with no headline', () => {
    assert.match(buildDmMessage({ headline: '', link }), /Here's the full story:\nhttps:/);
  });
});

describe('buildAutomation', () => {
  // Z1 spike (2026-09-23): Zernio's create ignores isActive, so every automation is live the
  // moment it exists. Sending the field would only suggest otherwise to whoever reads the payload.
  it('sends no isActive, because Zernio ignores it on create and every automation starts live', () => {
    assert.equal(Object.hasOwn(buildAutomation({ ...base, platformPostId: 'ig1' }), 'isActive'), false);
    assert.equal(Object.hasOwn(buildAutomation({ ...base, postId: 'z1' }), 'isActive'), false);
    assert.equal(Object.hasOwn(buildAutomation({ ...base, accountWide: true }), 'isActive'), false);
  });

  // Refused rather than silently dropped: `isActive: false` is exactly what the spike passed
  // believing it made a paused automation. Dropping it quietly would keep that belief alive in
  // any caller that still passes it; a throw ends it at the first run.
  it('refuses an isActive argument instead of letting a caller think it built a paused automation', () => {
    for (const isActive of [false, true]) {
      assert.throws(
        () => buildAutomation({ ...base, platformPostId: 'ig1', isActive }),
        /isActive cannot be set on create: Zernio ignores it/,
        `isActive: ${isActive}`,
      );
    }
  });

  // Object.hasOwn, not a truthiness check on the value: an explicit `isActive: undefined` is
  // still an own property a caller set on purpose, and the same false belief (isActive:false
  // built a paused automation) is just as easy to reach that way as with isActive:false itself.
  it('refuses even an explicit isActive: undefined, because the property was still set on purpose', () => {
    assert.throws(
      () => buildAutomation({ ...base, platformPostId: 'ig1', isActive: undefined }),
      /isActive cannot be set on create: Zernio ignores it/,
    );
  });

  it('builds the agreed shape: VOICES, whole-word, no fuzzing, no DM matching, no buttons', () => {
    const a = buildAutomation({ ...base, platformPostId: 'ig1' });
    assert.deepEqual(a.keywords, ['VOICES']);
    assert.equal(a.matchMode, 'word');
    assert.equal(a.typoTolerance, false);
    assert.equal(a.alsoMatchInDms, false);
    assert.equal(a.trigger, 'comment');
    assert.equal(a.buttons, undefined);
    assert.equal(a.platformPostId, 'ig1');
    assert.equal(a.postId, undefined);
    assert.deepEqual(a.commentReplyVariations, [...PUBLIC_REPLY_VARIANTS]);
    assert.match(a.dmMessage, /utm_content=gulf-states-reopen-talks/);
  });

  it('can scope by Zernio post id instead, for a post that is not live yet', () => {
    const a = buildAutomation({ ...base, postId: '6ab29cf68d284ffb212e1818' });
    assert.equal(a.postId, '6ab29cf68d284ffb212e1818');
    assert.equal(a.platformPostId, undefined);
  });

  it('builds an account-wide automation only when asked for explicitly', () => {
    const a = buildAutomation({ ...base, accountWide: true });
    assert.equal(a.platformPostId, undefined);
    assert.equal(a.postId, undefined);
    assert.throws(() => buildAutomation({ ...base }), /needs platformPostId, postId, or an explicit accountWide/);
  });

  it('refuses contradictory scopes', () => {
    assert.throws(() => buildAutomation({ ...base, platformPostId: 'a', postId: 'b' }), /not both/);
    assert.throws(() => buildAutomation({ ...base, platformPostId: 'a', accountWide: true }), /cannot also name a post/);
  });

  it('refuses an article that is not on the brand site, before anything is built', () => {
    assert.throws(() => buildAutomation({ ...base, platformPostId: 'a', articleUrl: 'https://evil.com/x' }), /not on merlows\.com/);
  });

  it('produces a payload the validator accepts', () => {
    assert.deepEqual(problemsOf(valid()), []);
  });

  it('accepts a headline that itself contains the keyword, because a DM cannot trigger a comment automation', () => {
    const a = buildAutomation({ ...base, platformPostId: 'ig9', headline: 'Regional Voices: a Gulf diary' });
    assert.deepEqual(problemsOf(a), []);
  });
});

describe('validateAutomation — each rule fires on the mistake it exists for', () => {
  const cases = [
    ['missing profileId', { profileId: '' }, /profileId is missing/],
    ['missing accountId', { accountId: undefined }, /accountId is missing/],
    ['no keywords, which would DM every commenter', { keywords: [] }, /every comment would trigger/],
    ['whitespace-only keywords', { keywords: ['  '] }, /every comment would trigger/],
    ['substring matching', { matchMode: 'contains' }, /matchMode must be word or exact/],
    ['no match mode, which Zernio defaults to contains', { matchMode: undefined }, /matchMode must be word or exact/],
    ['typo tolerance', { typoTolerance: true }, /typoTolerance is on/],
    ['story replies before v1.1', { trigger: 'story_reply' }, /story replies are v1\.1/],
    ['an empty DM', { dmMessage: '   ' }, /dmMessage is empty/],
    ['a DM over the limit', { dmMessage: `${DISCLOSURE}\n${ARTICLE}\n${'x'.repeat(DM_MAX_CHARS)}` }, /over 640/],
    ['no disclosure', { dmMessage: `Here it is\n${ARTICLE}` }, /disclosure/],
    ['an unfilled template', { dmMessage: `${DISCLOSURE}\n{headline}\n${ARTICLE}` }, /placeholder/],
    ['a placeholder host', { dmMessage: `${DISCLOSURE}\nhttps://example.com/x` }, /not on merlows\.com: example\.com/],
    ['a leftover tag', { dmMessage: `${DISCLOSURE}\n<b>story</b>\n${ARTICLE}` }, /placeholder/],
    ['a blank keyword next to the real one', { keywords: ['VOICES', ''] }, /keywords must be exactly \["VOICES"\]/],
    ['a different keyword', { keywords: ['LINK'] }, /keywords must be exactly/],
    ['reply variations that are not a list', { commentReplyVariations: 'Your VOICES link is in your DMs' }, /must be a list/],
    ['no link at all', { dmMessage: `${DISCLOSURE}\nNothing here.` }, /no link/],
    ['an http link', { dmMessage: `${DISCLOSURE}\nhttp://merlows.com/x/` }, /not https/],
    ['a link to another site', { dmMessage: `${DISCLOSURE}\nhttps://merlows.com/x/ and https://evil.com/y` }, /not on merlows\.com: evil\.com/],
    ['a bare domain Instagram would linkify', { dmMessage: `${DISCLOSURE}\n${ARTICLE}\nsee evil.co too` }, /domain Instagram would turn into a link/],
    ['buttons', { buttons: [{ type: 'web_url', title: 'Read', url: ARTICLE }] }, /buttons are not allowed/],
    ['a non-array buttons value', { buttons: {} }, /buttons are not allowed/],
    ['a template card', { template: { title: 'x' } }, /templates are not allowed/],
    ['unchecked DM variations', { dmMessageVariations: ['http://evil.com'] }, /dmMessageVariations/],
    ['a public reply containing the keyword', { commentReply: 'Your VOICES link is in your DMs' }, /contains the keyword VOICES/],
    ['a reply variant containing it in another case', { commentReplyVariations: ['sent', 'our voices matter'] }, /contains the keyword VOICES/],
    ['too many reply variants', { commentReplyVariations: ['a', 'b', 'c', 'd', 'e', 'f'] }, /over Zernio's 5/],
    ['an empty reply variant', { commentReplyVariations: ['sent', ''] }, /variant is empty/],
    ['DM matching when the DM contains the keyword', {
      alsoMatchInDms: true,
      dmMessage: `${DISCLOSURE}\nRegional Voices: story\n${ARTICLE}`,
    }, /alsoMatchInDms is on/],
  ];

  for (const [label, overrides, pattern] of cases) {
    it(`rejects ${label}`, () => {
      const problems = problemsOf(valid(overrides));
      assert.ok(problems.some((p) => pattern.test(p)), `expected ${pattern} in ${JSON.stringify(problems)}`);
    });
  }

  it('lets the brand handle through even though it looks like a domain', () => {
    assert.equal(hasProblem(valid(), /domain Instagram/), false);
  });

  it('rejects a payload that is not an object at all, rather than throwing', () => {
    assert.ok(problemsOf(null).length > 0);
    assert.ok(problemsOf(undefined).length > 0);
  });
});

describe('validateAutomation — two live automations must not answer the same comment', () => {
  const other = (overrides) => ({ id: 'other', isActive: true, platformPostId: 'ig123', postId: null, keywords: ['voices'], ...overrides });

  it('rejects a second active automation on the same post and keyword', () => {
    assert.ok(hasProblem(valid(), /already active on the same scope for VOICES/, { existing: [other()] }));
  });

  it('rejects a second active account-wide automation on the same keyword', () => {
    const payload = { ...buildAutomation({ ...base, accountWide: true }) };
    assert.ok(hasProblem(payload, /already active/, { existing: [other({ platformPostId: null })] }));
  });

  it('allows it when the other one is paused, on another post, on another keyword, or is this one', () => {
    for (const existing of [
      other({ isActive: false }),
      other({ platformPostId: 'ig999' }),
      other({ keywords: ['LINK'] }),
      other({ platformPostId: null }), // account-wide fallback: per-post precedence is checked in the Z1 spike
    ]) {
      assert.deepEqual(problemsOf(valid(), { existing: [existing] }), [], JSON.stringify(existing));
    }
    assert.deepEqual(problemsOf(valid({ id: 'same' }), { existing: [other({ id: 'same' })] }), []);
  });

  it('checks collisions for a create payload, which has no isActive and is live the moment it exists', () => {
    const payload = valid();
    assert.equal(Object.hasOwn(payload, 'isActive'), false, 'precondition: a create payload carries no isActive');
    assert.ok(hasProblem(payload, /already active on the same scope for VOICES/, { existing: [other()] }));
  });

  it('checks collisions for an explicit isActive: true (resuming a paused automation)', () => {
    assert.ok(hasProblem(valid({ isActive: true }), /already active on the same scope for VOICES/, { existing: [other()] }));
  });

  it('skips the collision check only for an explicit pause (isActive: false, as a PATCH would set)', () => {
    assert.deepEqual(problemsOf(valid({ isActive: false }), { existing: [other()] }), []);
  });

  // The gate is `p.isActive !== false`, a strict comparison — not `!p.isActive`. Values that are
  // merely falsy (0, '', null) must still run the check: only the literal `false` a pause PATCH
  // sends is allowed to skip it, so a payload with a falsy-but-wrong isActive cannot accidentally
  // slip a live collision through.
  it('still runs the collision check for a falsy isActive that is not literally false', () => {
    for (const isActive of [0, '', null, 'false']) {
      assert.ok(
        hasProblem(valid({ isActive }), /already active on the same scope for VOICES/, { existing: [other()] }),
        `isActive: ${JSON.stringify(isActive)}`,
      );
    }
  });
});

describe('headlines never decide whether an automation exists (review 2026-09-23)', () => {
  const build = (headline, articleUrl = ARTICLE) =>
    buildAutomation({ ...base, headline, articleUrl, platformPostId: 'ig1' });

  for (const headline of [
    'Is your site safe?',
    'Placeholder budget row',
    '£3.5bn deal agreed',
    'U.S.-Iran talks resume',
    'No.10 responds',
    'Ph.D. students protest',
    'Talks start at 9.30am',
    'Iran’s reply',
  ]) {
    it(`keeps an ordinary headline: ${headline}`, () => {
      const a = build(headline);
      assert.deepEqual(problemsOf(a), []);
      assert.ok(a.dmMessage.includes(headline), a.dmMessage);
    });
  }

  it('keeps text between < and > that is not a tag, and decodes &lt; &gt;', () => {
    for (const headline of ['Costs < forecast but profit > expectations', 'Costs &lt; forecast but profit &gt; expectations']) {
      const a = build(headline);
      assert.deepEqual(problemsOf(a), []);
      assert.ok(a.dmMessage.includes('Costs < forecast but profit > expectations'), a.dmMessage);
    }
  });

  it('does not treat the article slug as a placeholder', () => {
    assert.deepEqual(problemsOf(build('Security check', 'https://merlows.com/is-your-site-safe-from-hackers/')), []);
  });

  for (const [label, headline, marker] of [
    ['a plain domain', 'Petition on gov.uk passes 100,000', 'gov'],
    ['a short domain', 'Musk says x.com will stay', 'x.com'],
    ['a capitalised domain', 'Change.org petition hits 1m', 'Change'],
    ['the brand domain as text', 'Merlows.com exclusive', 'exclusive'],
    ['a dotted product name', 'Node.js flaw', 'Node'],
    ['an accented lookalike', 'Verify at merlowś.com/login', 'login'],
    ['a Cyrillic lookalike', 'Verify at мерлоус.com/login', 'мерлоус'],
    ['a bare IP address', 'Claim at 185.199.108.153/claim now', '185'],
    ['a non-Latin TLD', 'evil.рф', 'evil'],
    ['an ideographic dot', 'evil。com', 'evil'],
    ['a fullwidth dot', 'evil．com', 'evil'],
    ['a zero-width space inside a domain', 'evil​.com', 'evil'],
    ['an encoded zero-width space', 'evil&#8203;.com', 'evil'],
    ['a domain glued to our own link', 'see https://merlows.com/x|evil.com', 'evil'],
    ['www with no TLD', 'www.evil', 'evil'],
    ['an encoded tag', '&#60;b&#62;bold&#60;/b&#62;', 'bold'],
    ['an unfilled template', '{headline}', '{'],
    ['a template constant', 'YOUR_HEADLINE', 'YOUR_'],
  ]) {
    it(`drops the headline but still builds a valid automation for ${label}`, () => {
      const a = build(headline);
      assert.deepEqual(problemsOf(a), []);
      assert.match(a.dmMessage, /Here's the full story:\nhttps:\/\/merlows\.com\//);
      assert.equal(a.dmMessage.includes(marker), false, a.dmMessage);
      assert.equal(a.postTitle, undefined);
    });
  }

  it('strips bidi overrides, NUL and lone surrogates rather than sending them', () => {
    const a = build('&#8238;Hello &#0;there &#xD800;now');
    assert.deepEqual(problemsOf(a), []);
    assert.ok(a.dmMessage.includes('Here\'s the full story: Hello there now'), a.dmMessage);
    // `u` flag: without it the range also matches both halves of the 🤖 in the disclosure line.
    assert.equal(/[‮\u0000\uD800-\uDFFF]/u.test(a.dmMessage), false);
  });

  it('cleans the headline once, so the DM and postTitle agree', () => {
    const a = build('Profits &amp;#60;b&amp;#62; up');
    assert.ok(a.dmMessage.includes(a.postTitle), `${a.postTitle} / ${a.dmMessage}`);
  });
});

describe('the handle is exempt from the domain check only when it is a real @mention', () => {
  it('refuses to build with a handle that is a bare domain', () => {
    process.env.BRAND_SOCIAL_HANDLE = 'merlows.news';
    assert.throws(() => buildAutomation({ ...base, platformPostId: 'ig1' }), /social handle must look like @name/);
    assert.throws(() => buildDmMessage({ headline: 'x', link: ARTICLE }), /social handle must look like @name/);
  });

  it('flags a hand-built DM that names the handle without the @', () => {
    const payload = valid({ dmMessage: `${DISCLOSURE}\n${ARTICLE}\nFollow merlows.news for more.` });
    assert.ok(hasProblem(payload, /domain Instagram/, { handle: 'merlows.news' }));
  });
});

describe('assertValidAutomation', () => {
  it('returns the payload when it is valid', () => {
    const payload = valid();
    assert.equal(assertValidAutomation(payload), payload);
  });

  it('throws with every problem listed, not just the first', () => {
    assert.throws(
      () => assertValidAutomation(valid({ keywords: [], buttons: [{}] })),
      (err) => err.problems.length >= 2 && /every comment/.test(err.message) && /buttons/.test(err.message),
    );
  });
});
