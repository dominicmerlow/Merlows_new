// lib/social/pack/build-pack.js — writes the social pack via OpenRouter, then runs it
// through the fact guard. Every test here injects `fetchFn`, so no real network call is
// ever made; a stub that throws on an unexpected call proves the point where relevant.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { validateDraft, toPack, isSensitive, buildPack, buildUserPrompt, BODY_MAX_CHARS } from './build-pack.js';

const noFetch = async () => { throw new Error('fetchFn should not have been called'); };

describe('buildUserPrompt', () => {
  it('fences the article between matching markers and labels it untrusted data', () => {
    const prompt = buildUserPrompt({ title: 'T', category: 'diplomatic-analysis', source: 'Reuters', body: 'Some article text.' });
    assert.match(prompt, /untrusted source text/);
    const fenceMatches = prompt.match(/<<<[0-9a-f-]{36}>>>/g);
    assert.equal(fenceMatches?.length, 2);
    assert.equal(fenceMatches[0], fenceMatches[1]); // same fence opens and closes
  });

  it('caps the article body at BODY_MAX_CHARS, since the body is attacker-influenceable', () => {
    // '~' does not appear anywhere in the template itself, so a run of them can only have
    // come from the body — unlike 'x', which also turns up in the template's own prose
    // ("untrusted source text").
    const body = '~'.repeat(BODY_MAX_CHARS + 5000);
    const prompt = buildUserPrompt({ title: 'T', category: 'c', source: 's', body });
    const runOfTilde = prompt.match(/~+/)[0];
    assert.equal(runOfTilde.length, BODY_MAX_CHARS);
  });

  it('uses a fresh fence each call by default, so a crafted body cannot predict and forge it', () => {
    const a = buildUserPrompt({ title: 'T', category: 'c', source: 's', body: 'b' });
    const b = buildUserPrompt({ title: 'T', category: 'c', source: 's', body: 'b' });
    assert.notEqual(a, b);
  });
});

describe('validateDraft', () => {
  it('is ok for a well-shaped draft', () => {
    const draft = {
      hooks: ['A short hook.'],
      points: [{ caption: 'One' }, { caption: 'Two' }, { caption: 'Three' }],
    };
    assert.deepEqual(validateDraft(draft), { ok: true, problems: [] });
  });

  it('flags no hooks at all', () => {
    const result = validateDraft({ hooks: [], points: [{ caption: 'a' }, { caption: 'b' }, { caption: 'c' }] });
    assert.equal(result.ok, false);
    assert.equal(result.problems.includes('no hooks'), true);
  });

  it('flags when every hook is longer than 90 characters', () => {
    const longHook = 'x'.repeat(91);
    const result = validateDraft({ hooks: [longHook], points: [{ caption: 'a' }, { caption: 'b' }, { caption: 'c' }] });
    assert.equal(result.problems.includes('every hook is longer than 90 characters'), true);
  });

  it('does not flag hook length when at least one hook is 90 characters or fewer', () => {
    const okHook = 'x'.repeat(90);
    const longHook = 'x'.repeat(91);
    const result = validateDraft({ hooks: [longHook, okHook], points: [{ caption: 'a' }, { caption: 'b' }, { caption: 'c' }] });
    assert.equal(result.problems.includes('every hook is longer than 90 characters'), false);
  });

  it('flags fewer than 3 points', () => {
    const result = validateDraft({ hooks: ['h'], points: [{ caption: 'a' }, { caption: 'b' }] });
    assert.equal(result.problems.includes('fewer than 3 points'), true);
  });

  it('flags a point with no caption', () => {
    const result = validateDraft({ hooks: ['h'], points: [{}, { caption: 'b' }, { caption: 'c' }] });
    assert.equal(result.problems.includes('point 1 has no caption'), true);
  });

  it('flags a point caption longer than 120 characters', () => {
    const long = 'y'.repeat(121);
    const result = validateDraft({ hooks: ['h'], points: [{ caption: long }, { caption: 'b' }, { caption: 'c' }] });
    assert.equal(result.problems.includes('point 1 caption is too long'), true);
  });

  it('flags a midHook longer than 90 characters', () => {
    const result = validateDraft({
      hooks: ['h'],
      midHook: 'z'.repeat(91),
      points: [{ caption: 'a' }, { caption: 'b' }, { caption: 'c' }],
    });
    assert.equal(result.problems.includes('midHook is longer than 90 characters'), true);
  });
});

describe('isSensitive', () => {
  it('is true for a category in the fixed sensitive set', () => {
    assert.equal(isSensitive('breaking-news', 'a routine trade agreement'), true);
    assert.equal(isSensitive('cyrus-accord', 'a routine trade agreement'), true);
  });

  it('is true when the text matches a sensitive topic regardless of category', () => {
    assert.equal(isSensitive('diplomatic-analysis', 'a story about genocide in the region'), true);
  });

  it('is false for a plain category and plain text', () => {
    assert.equal(isSensitive('diplomatic-analysis', 'a routine trade agreement was signed'), false);
  });

  it('is false for undefined text and a non-sensitive category (does not throw)', () => {
    assert.equal(isSensitive('diplomatic-analysis', undefined), false);
  });
});

describe('toPack', () => {
  it('maps a draft into the full pack shape, keeping only the first 8 hashtags', () => {
    const draft = {
      midHook: 'M',
      headline: 'H',
      points: [
        { caption: 'c1', vo: 'v1', imageBrief: 'b1' },
        { caption: 'c2' },
      ],
      quote: { text: 'Q', attribution: 'Att' },
      outro: 'O',
      igCaption: 'IG',
      tiktokCaption: 'TT',
      // Realistic model output: a stray '#', a space, and nine tags. toPack normalises
      // and keeps the first eight; single characters are dropped as unusable.
      hashtags: ['#Gaza', 'Middle East', 'UKPolitics', 'Ceasefire', 'Diplomacy',
        'Israel', 'Iran', 'Houthi', 'Dropped'],
    };
    const article = {
      wpPostId: 55,
      contentId: 'ignored-when-wpPostId-present',
      categoryId: 'diplomatic-analysis',
      title: 'Fallback Title',
      source: 'Reuters',
      body: 'Some routine body text with no sensitive words at all.',
    };
    const result = toPack(draft, article, 'Chosen hook line');

    assert.equal(result.articleId, '55');
    assert.equal(result.categoryId, 'diplomatic-analysis');
    assert.equal(result.hook, 'Chosen hook line');
    assert.equal(result.midHook, 'M');
    assert.equal(result.headline, 'H');
    assert.equal(result.source, 'Reuters');
    assert.equal(result.handle, '@merlows.news');
    assert.deepEqual(result.points, [
      { caption: 'c1', vo: 'v1', imageBrief: 'b1' },
      { caption: 'c2', vo: 'c2', imageBrief: undefined },
    ]);
    assert.deepEqual(result.quote, { text: 'Q', attribution: 'Att' });
    assert.equal(result.outro, 'O');
    assert.equal(result.igCaption, 'IG');
    assert.equal(result.tiktokCaption, 'TT');
    // Normalised, not rejected: '#' stripped, spaces removed, single characters dropped,
    // first eight kept. Rejecting these outright made the guard fail honest drafts.
    assert.deepEqual(result.hashtags, [
      'Gaza', 'MiddleEast', 'UKPolitics', 'Ceasefire', 'Diplomacy', 'Israel', 'Iran', 'Houthi',
    ]);
    assert.equal(result.sensitive, false);
  });

  it('falls back to contentId, article title, default outro and no quote when the draft is thin', () => {
    const draft = { points: [{ caption: 'only' }], hashtags: 'not-an-array' };
    const article = { contentId: 'c-77', categoryId: 'breaking-news', title: 'T2', body: 'genocide reported' };
    const result = toPack(draft, article, 'hook2');

    assert.equal(result.articleId, 'c-77');
    assert.equal(result.midHook, undefined);
    assert.equal(result.headline, 'T2');
    assert.equal(result.source, undefined);
    assert.equal(result.outro, 'Full story at merlows.com');
    assert.equal(result.quote, undefined);
    assert.deepEqual(result.hashtags, []);
    assert.equal(result.sensitive, true); // breaking-news is always sensitive
  });
});

describe('buildPack', () => {
  const article = {
    wpPostId: 1,
    contentId: 'c1',
    categoryId: 'diplomatic-analysis',
    title: 'Talks resume in Geneva',
    source: 'Reuters',
    body:
      'Diplomats gathered in Geneva to discuss a fragile truce. Officials said sixty seven families ' +
      'have already returned home under the deal. World leaders welcomed the news cautiously.',
  };

  const okResponse = (draft) => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(draft) } }] }) });

  let savedFetch;
  beforeEach(() => { savedFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = savedFetch; });

  it('throws when the article has no body', async () => {
    await assert.rejects(
      buildPack({ ...article, body: '' }, { fetchFn: noFetch, apiKey: 'k' }),
      /article body is required/,
    );
  });

  it('throws when no API key is configured, without ever calling fetch', async () => {
    const saved = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      await assert.rejects(buildPack(article, { fetchFn: noFetch }), /OPENROUTER_API_KEY is not configured/);
    } finally {
      if (saved === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = saved;
    }
  });

  it('picks the first hook that passes the fact guard, skipping an earlier invented one', async () => {
    const draft = {
      hooks: [
        'Diplomats say Vienna brokered the historic ceasefire quietly.', // invented place — must be rejected
        'Everyone claims credit. Nobody signed the deal.', // clean
      ],
      // No headline — toPack falls back to article.title, and a headline in title case would
      // otherwise trip the (now-checked) NAME guard on ordinary capitalised words.
      points: [
        { caption: 'Families return home', vo: 'Officials said sixty seven families have already returned home.' },
        { caption: 'Truce remains fragile', vo: 'The truce remains fragile but is holding for now.' },
        { caption: 'World reaction grows', vo: 'World leaders welcomed the news cautiously.' },
      ],
    };
    const fetchFn = async () => okResponse(draft);
    const result = await buildPack(article, { fetchFn, apiKey: 'k' });
    assert.equal(result.pack.hook, 'Everyone claims credit. Nobody signed the deal.');
    assert.notEqual(result.pack.hook, draft.hooks[0]);
    assert.equal(result.model !== undefined, true);
    assert.equal(result.repaired, false);
  });

  it('ignores hooks that are blank, too short, or not a string, and picks the first usable one', async () => {
    // An empty or trivial hook used to pass the guard trivially (nothing to check) and would
    // be selected first, shipping a video with no real hook.
    const draft = {
      hooks: ['', '   ', 'ok', 42, 'A fragile truce finally holds.'],
      points: [
        { caption: 'Families return home', vo: 'Officials said sixty seven families have already returned home.' },
        { caption: 'Truce remains fragile', vo: 'The truce remains fragile but is holding for now.' },
        { caption: 'World reaction grows', vo: 'World leaders welcomed the news cautiously.' },
      ],
    };
    const fetchFn = async () => okResponse(draft);
    const result = await buildPack(article, { fetchFn, apiKey: 'k' });
    assert.equal(result.pack.hook, 'A fragile truce finally holds.');
    assert.equal(result.repaired, false);
  });

  it('runs one repair round when every hook fails, feeding the guard problems back, and marks repaired: true', async () => {
    const badDraft = {
      hooks: ['Diplomats say Vienna brokered the deal quietly.', 'Sources say Vienna orchestrated everything.'],
      points: [
        { caption: 'Families return home', vo: 'Officials said sixty seven families have already returned home.' },
        { caption: 'Truce remains fragile', vo: 'The truce remains fragile but is holding for now.' },
        { caption: 'World reaction grows', vo: 'World leaders welcomed the news cautiously.' },
      ],
    };
    const goodDraft = {
      hooks: ['A fragile truce finally holds.'],
      points: badDraft.points,
    };
    let call = 0;
    let repairPromptSeenProblems = false;
    const fetchFn = async (url, opts) => {
      call += 1;
      if (call === 1) return okResponse(badDraft);
      const body = JSON.parse(opts.body);
      const repairMsg = body.messages.find((m) => m.role === 'user' && /fact checker/.test(m.content));
      repairPromptSeenProblems = Boolean(repairMsg && /Vienna/.test(repairMsg.content));
      return okResponse(goodDraft);
    };
    const result = await buildPack(article, { fetchFn, apiKey: 'k' });
    assert.equal(call, 2);
    assert.equal(repairPromptSeenProblems, true);
    assert.equal(result.repaired, true);
    assert.equal(result.pack.hook, 'A fragile truce finally holds.');
  });

  it('falls through to the fallback model when the first model call throws', async () => {
    const goodDraft = {
      hooks: ['A fragile truce finally holds.'],
      points: [
        { caption: 'Families return home', vo: 'Officials said sixty seven families have already returned home.' },
        { caption: 'Truce remains fragile', vo: 'The truce remains fragile but is holding for now.' },
        { caption: 'World reaction grows', vo: 'World leaders welcomed the news cautiously.' },
      ],
    };
    let call = 0;
    const fetchFn = async () => {
      call += 1;
      if (call === 1) throw new Error('network down');
      return okResponse(goodDraft);
    };
    const result = await buildPack(article, { fetchFn, apiKey: 'k' });
    assert.equal(call, 2);
    assert.equal(result.repaired, false);
    assert.equal(result.pack.hook, 'A fragile truce finally holds.');
  });

  it('falls through to the fallback model when the first model returns an unusable shape', async () => {
    const goodDraft = {
      hooks: ['A fragile truce finally holds.'],
      points: [
        { caption: 'Families return home', vo: 'Officials said sixty seven families have already returned home.' },
        { caption: 'Truce remains fragile', vo: 'The truce remains fragile but is holding for now.' },
        { caption: 'World reaction grows', vo: 'World leaders welcomed the news cautiously.' },
      ],
    };
    let call = 0;
    const fetchFn = async () => {
      call += 1;
      if (call === 1) return okResponse({ hooks: [], points: [] }); // fails validateDraft
      return okResponse(goodDraft);
    };
    const result = await buildPack(article, { fetchFn, apiKey: 'k' });
    assert.equal(call, 2);
    assert.equal(result.pack.hook, 'A fragile truce finally holds.');
  });

  it('throws with a readable summary naming the failure when nothing works', async () => {
    const fetchFn = async () => { throw new Error('boom'); };
    await assert.rejects(buildPack(article, { fetchFn, apiKey: 'k' }), (err) => {
      assert.match(err.message, /no usable pack/);
      assert.match(err.message, /boom/);
      return true;
    });
  });

  it('never touches the real network when fetchFn is injected', async () => {
    globalThis.fetch = async () => { throw new Error('real network was used'); };
    const draft = {
      hooks: ['A fragile truce finally holds.'],
      points: [
        { caption: 'Families return home', vo: 'Officials said sixty seven families have already returned home.' },
        { caption: 'Truce remains fragile', vo: 'The truce remains fragile but is holding for now.' },
        { caption: 'World reaction grows', vo: 'World leaders welcomed the news cautiously.' },
      ],
    };
    const fetchFn = async () => okResponse(draft);
    const result = await buildPack(article, { fetchFn, apiKey: 'k' });
    assert.equal(result.pack.hook, 'A fragile truce finally holds.');
  });
});
