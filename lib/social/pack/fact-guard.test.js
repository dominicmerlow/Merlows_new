// lib/social/pack/fact-guard.js — the editorial safety net for the social autopilot.
// This is a pure deterministic module (no kv, no network), so every test here is a plain
// input/output check. Priority module: a fabricated figure or an invented name reaching a
// published video is the worst failure this pipeline can make.
//
// Rewritten after the security/code review pass: properNounsIn no longer drops each
// sentence's first word (an invented name opening the hook used to pass for free), figure
// matching is exact (a substring test let "5" and "2026" in an article validate a caption's
// 50, 500, 1500 or 15000), headlines are name-checked too, the whole quote must be verbatim
// (not just a 6-word prefix), and igCaption/tiktokCaption/outro/hashtags are checked — they
// are the text that actually gets posted.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spokenNumbersIn, properNounsIn, nameSupported, checkPack } from './fact-guard.js';

describe('spokenNumbersIn', () => {
  it('parses "one hundred and thirty thousand" as 130000', () => {
    assert.deepEqual(spokenNumbersIn('one hundred and thirty thousand'), ['130000']);
  });

  it('parses "sixty seven per cent" as 67', () => {
    assert.deepEqual(spokenNumbersIn('sixty seven per cent'), ['67']);
  });

  it('parses "twenty twenty two" as a year pair, 2022, not 42', () => {
    assert.deepEqual(spokenNumbersIn('twenty twenty two'), ['2022']);
  });

  it('parses "four point two billion" as both 4.2 and 4200000000', () => {
    // Both written forms of the SAME number; order is not significant, because the guard
    // groups them and requires one to match (which is what replaced the old power-of-ten
    // tolerance that let 'five thousand' ride on an article saying '5').
    assert.deepEqual([...spokenNumbersIn('four point two billion')].sort(), ['4.2', '4200000000'].sort());
  });

  it('parses "nineteen forty" as the year 1940', () => {
    assert.deepEqual(spokenNumbersIn('nineteen forty'), ['1940']);
  });

  it('parses "two thousand and twenty six" as 2026', () => {
    assert.deepEqual(spokenNumbersIn('two thousand and twenty six'), ['2026']);
  });

  it('treats "a hundred families" as vague, not a figure', () => {
    assert.deepEqual(spokenNumbersIn('a hundred families'), []);
  });

  it('returns an empty array for text with no numbers at all', () => {
    assert.deepEqual(spokenNumbersIn('officials met in Geneva today'), []);
  });
});

describe('properNounsIn', () => {
  it('keeps an invented name that opens a sentence — the exact hole this fix closes', () => {
    // Before the fix, dropping every sentence's first word let "Erdogan walked out of the
    // room." pass against an article that never mentions him.
    assert.deepEqual(properNounsIn('Erdogan walked out of the room.'), ['Erdogan']);
  });

  it('still drops an ordinary sentence-opening word via the common-word list', () => {
    assert.deepEqual(properNounsIn('Meanwhile, officials met in Geneva.'), ['Geneva']);
  });

  it('drops an adverb that opens a line', () => {
    assert.deepEqual(properNounsIn('Quietly, the deal collapsed.'), []);
  });

  it('splits a hyphenated compound name into its parts', () => {
    assert.deepEqual(properNounsIn('Paris Saint-Germain won today.'), ['Paris', 'Saint', 'Germain']);
  });

  it('ignores a capitalised number word, wherever it sits', () => {
    assert.deepEqual(properNounsIn('Twenty Ministers met today.'), ['Ministers']);
  });

  it('ignores a plural-inflected number word (Thousands)', () => {
    assert.deepEqual(properNounsIn('Thousands were displaced.'), []);
  });
});

describe('nameSupported', () => {
  it('matches an exact name present in the article', () => {
    assert.equal(nameSupported('Gaza', 'the situation in gaza escalated overnight'), true);
  });

  it('matches "Middle Eastern" via a 4+ character stem of "Middle East"', () => {
    assert.equal(nameSupported('Eastern', 'the middle east crisis deepened'), true);
  });

  it('rejects an invented name not present anywhere in the article', () => {
    assert.equal(nameSupported('Bhutan', 'the situation in gaza escalated overnight'), false);
  });
});

describe('checkPack — names', () => {
  it('catches an invented name mid-sentence', () => {
    const article = 'Diplomats gathered in Geneva to discuss the ceasefire.';
    const pack = { hook: 'Everyone watched as Bhutan intervened decisively.' };
    const result = checkPack(pack, article);
    assert.equal(result.ok, false);
    assert.equal(result.problems.some((p) => p.includes('Bhutan')), true);
  });

  it('catches an invented name that OPENS the hook (used to pass for free)', () => {
    const article = 'Diplomats gathered in Geneva to discuss the ceasefire.';
    const pack = { hook: 'Bhutan intervened decisively in the talks today.' };
    const result = checkPack(pack, article);
    assert.equal(result.ok, false);
    assert.equal(result.problems.some((p) => p.includes('Bhutan')), true);
  });

  it('now checks the headline for invented names too', () => {
    const article = 'Diplomats met in Geneva to discuss a truce.';
    const pack = { headline: 'Ceasefire Talks Resume In Cairo' };
    const result = checkPack(pack, article);
    assert.equal(result.ok, false);
    assert.equal(result.problems.some((p) => p.startsWith('headline:') && p.includes('Cairo')), true);
  });
});

describe('checkPack — figures', () => {
  it('catches an invented figure not present in the article', () => {
    const article = 'Diplomats gathered in Geneva to discuss the ceasefire. Talks continue next week.';
    const pack = { hook: 'Officials say thirty people died in the strike.' };
    const result = checkPack(pack, article);
    assert.equal(result.ok, false);
    assert.equal(result.problems.some((p) => p.includes('30')), true);
  });

  it('no longer lets a fabricated 50 ride on an unrelated "5" and "2026" in the article', () => {
    // This is the exact bypass the old substring check had: '50'.includes('5') was true, so
    // an article mentioning 5 injuries and the year 2026 used to validate a caption claiming
    // fifty. Matching is now exact (plus a strict power-of-ten tolerance), so this must fail.
    const article = 'Five people were hurt when a device exploded near the market in 2026.';
    const pack = { hook: 'Fifty were reported hurt in the blast.' };
    const result = checkPack(pack, article);
    assert.equal(result.ok, false);
    assert.equal(result.problems.some((p) => p.includes('50')), true);
  });

  it('still allows a mantissa/scale pairing across an exact power of ten', () => {
    const article = 'Officials confirmed the rebuilding fund reached 4,200,000,000 dollars this year.';
    const pack = { hook: 'Officials confirmed four point two billion in rebuilding funds today.' };
    const result = checkPack(pack, article);
    assert.deepEqual(result, { ok: true, problems: [] });
  });

  it("treats the article's own spelled-out numbers as supporting a caption that says the digit", () => {
    const article = 'Over three nights, drones flew over the base and residents were kept awake.';
    const pack = { hook: 'Drones struck for 3 nights running.' };
    const result = checkPack(pack, article);
    assert.deepEqual(result, { ok: true, problems: [] });
  });
});

describe('checkPack — the posted text (igCaption, tiktokCaption, outro, hashtags)', () => {
  it('catches an invented name in the Instagram caption', () => {
    const article = 'Diplomats gathered in Geneva to discuss the ceasefire.';
    const pack = { igCaption: 'Officials confirm Bhutan sent troops. Full story: link in bio' };
    const result = checkPack(pack, article);
    assert.equal(result.ok, false);
    assert.equal(result.problems.some((p) => p.startsWith('Instagram caption:') && p.includes('Bhutan')), true);
  });

  it('catches an invented figure in the TikTok caption', () => {
    const article = 'Diplomats gathered in Geneva to discuss the ceasefire.';
    const pack = { tiktokCaption: 'Fifty confirmed dead in the strike' };
    const result = checkPack(pack, article);
    assert.equal(result.ok, false);
    assert.equal(result.problems.some((p) => p.startsWith('TikTok caption:')), true);
  });

  it('catches an invented figure in the outro', () => {
    const article = 'Diplomats gathered in Geneva to discuss the ceasefire.';
    const pack = { outro: 'Thirty confirmed dead — full story at merlows.com' };
    const result = checkPack(pack, article);
    assert.equal(result.ok, false);
    assert.equal(result.problems.some((p) => p.startsWith('outro:')), true);
  });

  // Hashtags are topic labels, not factual assertions, and a compound like "MiddleEast"
  // never appears in an article as one word — name-checking them rejected almost every
  // honest draft. Figures in a hashtag are still checked.
  it('allows a compound topic hashtag that is not a word in the article', () => {
    const article = 'Diplomats gathered in the Middle East to discuss the ceasefire.';
    const result = checkPack({ hashtags: ['MiddleEast', 'Ceasefire'] }, article);
    assert.deepEqual(result.problems, []);
  });

  it('still catches an invented FIGURE in a hashtag', () => {
    const article = 'Diplomats gathered in Geneva to discuss the ceasefire.';
    const result = checkPack({ hashtags: ['500Dead'] }, article);
    assert.equal(result.ok, false);
    assert.equal(result.problems.some((p) => p.startsWith('hashtag 1:') && p.includes('500')), true);
  });

  it('rejects a link in any field that ships, whatever the TLD', () => {
    const article = 'Diplomats gathered in Geneva to discuss the ceasefire.';
    assert.deepEqual(
      checkPack({ tiktokCaption: 'Read more at breakingnow.news' }, article).problems,
      ['TikTok caption contains a link'],
    );
    // The Instagram caption and the outro ship too — the outro is spoken AND burned on screen.
    assert.deepEqual(
      checkPack({ igCaption: 'full story: https://merlows-news.co/breaking' }, article).problems,
      ['Instagram caption contains a link'],
    );
    assert.deepEqual(checkPack({ outro: 'go to evil.com now' }, article).problems, ['outro contains a link']);
  });

  it('allows the brand own domain, which is the whole point of the call to action', () => {
    const article = 'Diplomats gathered in Geneva to discuss the ceasefire.';
    assert.deepEqual(checkPack({ igCaption: 'Full story at merlows.com — link in bio' }, article).problems, []);
    assert.deepEqual(checkPack({ outro: 'Full story at merlows.com' }, article).problems, []);
  });

  it('rejects an Instagram caption over the 2,200 character limit', () => {
    const article = 'Diplomats gathered in Geneva to discuss the ceasefire.';
    const tooLong = { igCaption: 'x'.repeat(2201) };
    const atLimit = { igCaption: 'x'.repeat(2200) };
    assert.equal(checkPack(tooLong, article).problems.includes('Instagram caption is over the 2,200 character limit'), true);
    assert.equal(checkPack(atLimit, article).problems.includes('Instagram caption is over the 2,200 character limit'), false);
  });

  it('rejects a hashtag that is not plain alphanumeric', () => {
    const article = 'Diplomats gathered in Geneva to discuss the ceasefire.';
    const pack = { hashtags: ['good-tag'] };
    const result = checkPack(pack, article);
    assert.equal(result.problems.some((p) => p.includes('good-tag') && p.includes('not a plain alphanumeric tag')), true);
  });
});

describe('checkPack — quotes', () => {
  it('catches a quote that paraphrases rather than quotes the article verbatim', () => {
    const article = 'The minister said the deal was historic and long overdue for the region.';
    const pack = { quote: { text: 'This is a paraphrase that does not match the source at all.' } };
    const result = checkPack(pack, article);
    assert.equal(result.ok, false);
    assert.equal(result.problems.some((p) => p.startsWith('quote:')), true);
  });

  it('rejects a quote whose opening is real but whose tail is fabricated', () => {
    // The old 6-word-window check only compared the first six words, so a true opening
    // carrying an invented ending passed — the worst kind of fabrication: a true sentence
    // with a false tail, in quotation marks, attributed to a named source.
    const article = 'Officials confirmed 5 people were injured in the incident near the border.';
    const pack = { quote: { text: 'Officials confirmed 5 people were injured in a deliberate Iranian attack' } };
    const result = checkPack(pack, article);
    assert.equal(result.ok, false);
    assert.equal(result.problems.some((p) => p.startsWith('quote:')), true);
  });

  it('accepts a long quote that is verbatim in full, not just its first six words', () => {
    const article = 'The minister said: this is a moment we have waited many long years for, and it will not be wasted.';
    const pack = { quote: { text: 'this is a moment we have waited many long years for' } };
    const result = checkPack(pack, article);
    assert.deepEqual(result, { ok: true, problems: [] });
  });
});

describe('checkPack — an honestly drawn pack passes end to end', () => {
  it('passes hook, points, quote, captions, outro and hashtags all drawn from the article', () => {
    const article =
      "The ceasefire in Gaza took hold on Monday. Officials said sixty seven families returned " +
      "home. 'This is a moment we have waited years for,' said the mediator.";
    const pack = {
      hook: 'A ceasefire finally holds in Gaza.',
      points: [
        { caption: 'Sixty seven families go home', vo: 'Officials said sixty seven families returned home.' },
      ],
      quote: { text: 'This is a moment we have waited years for', attribution: 'the mediator' },
      igCaption: 'A ceasefire holds in Gaza. Full story: link in bio',
      tiktokCaption: 'A ceasefire holds in Gaza',
      outro: 'Full story at merlows.com',
      hashtags: ['gaza', 'ceasefire', 'diplomacy'],
    };
    const result = checkPack(pack, article);
    assert.deepEqual(result, { ok: true, problems: [] });
  });
});
