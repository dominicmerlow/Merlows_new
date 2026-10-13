import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { checkPublishable, minWords } from './publish-guard.js';

// publish-guard blocks AI refusals, prompt leaks in source notes, bare "#" lines and
// stub bodies before the WordPress POST. Most cases below are modelled on defective
// bodies that were found live (HANDOVER-2026-10-01.md items 1 and 2).
//
// Tests marked `todo` pin guard BUGS found while writing this file: they describe the
// correct behaviour and currently fail. node:test reports them as TODO without failing
// the run; remove the `todo` option once the guard is fixed.

const WORDS_149 = 'lorem '.repeat(149).trim();
const WORDS_150 = 'lorem '.repeat(150).trim();
const WORDS_200 = 'lorem '.repeat(200).trim();

const REFUSAL_REASON = /^looks like an AI refusal/;

afterEach(() => {
  delete process.env.PUBLISH_MIN_WORDS;
});

function assertRefusalOnly(result) {
  assert.equal(result.ok, false);
  assert.equal(result.reasons.length, 1);
  assert.match(result.reasons[0], REFUSAL_REASON);
}

// ---------------------------------------------------------------- minWords

test('minWords defaults to 150 when PUBLISH_MIN_WORDS is unset', () => {
  assert.equal(minWords(), 150);
});

test('minWords uses PUBLISH_MIN_WORDS when it is a valid integer', () => {
  process.env.PUBLISH_MIN_WORDS = '40';
  assert.equal(minWords(), 40);
});

test('minWords accepts 0 so the stub check can be switched off', () => {
  process.env.PUBLISH_MIN_WORDS = '0';
  assert.equal(minWords(), 0);
});

test('minWords falls back to 150 when PUBLISH_MIN_WORDS is not a number', () => {
  process.env.PUBLISH_MIN_WORDS = 'abc';
  assert.equal(minWords(), 150);
});

test('minWords falls back to 150 when PUBLISH_MIN_WORDS is negative', () => {
  process.env.PUBLISH_MIN_WORDS = '-5';
  assert.equal(minWords(), 150);
});

test('minWords falls back to 150 when PUBLISH_MIN_WORDS is an empty string', () => {
  process.env.PUBLISH_MIN_WORDS = '';
  assert.equal(minWords(), 150);
});

test('minWords falls back to 150 when PUBLISH_MIN_WORDS is NaN text', () => {
  process.env.PUBLISH_MIN_WORDS = 'NaN';
  assert.equal(minWords(), 150);
});

test('minWords falls back to the default for a decimal PUBLISH_MIN_WORDS', () => {
  process.env.PUBLISH_MIN_WORDS = '12.7';
  assert.equal(minWords(), 150);
});

test('minWords falls back to the default for hex and exponent PUBLISH_MIN_WORDS', () => {
  process.env.PUBLISH_MIN_WORDS = '0x10';
  assert.equal(minWords(), 150);
  process.env.PUBLISH_MIN_WORDS = '1e3';
  assert.equal(minWords(), 150);
});

// ------------------------------------------------------------ normal case

test('passes a clean 200-word article with a normal Sources section', () => {
  const body = `# Gulf trade talks resume\n\n${WORDS_200}\n\n## Sources\n\n- BBC News, https://www.bbc.co.uk/news/world-1\n- Reuters, https://www.reuters.com/world/2`;

  const result = checkPublishable({ title: 'Gulf trade talks resume', body });

  assert.deepEqual(result, { ok: true, reasons: [] });
});

test('passes a clean article whose Sources label is a plain line with no "#"', () => {
  const body = `${WORDS_200}\n\nSources:\n- BBC News\n- Reuters`;

  const result = checkPublishable({ body });

  assert.deepEqual(result, { ok: true, reasons: [] });
});

test('passes a clean article whose Sources heading is bold-wrapped', () => {
  const body = `${WORDS_200}\n\n**Sources:**\n- BBC News, https://www.bbc.co.uk/news/1\n- Reuters, https://www.reuters.com/a`;

  const result = checkPublishable({ body });

  assert.deepEqual(result, { ok: true, reasons: [] });
});

// -------------------------------------------------- empty and bad input

test('rejects an empty body with the single reason "body is empty"', () => {
  const result = checkPublishable({ body: '' });

  assert.deepEqual(result, { ok: false, reasons: ['body is empty'] });
});

test('rejects a whitespace-only body as empty', () => {
  const result = checkPublishable({ body: '  \n\n \t ' });

  assert.deepEqual(result, { ok: false, reasons: ['body is empty'] });
});

test('rejects an item with no body property', () => {
  const result = checkPublishable({ title: 'No body here' });

  assert.deepEqual(result, { ok: false, reasons: ['body is empty'] });
});

test('rejects a null body', () => {
  const result = checkPublishable({ body: null });

  assert.deepEqual(result, { ok: false, reasons: ['body is empty'] });
});

test('rejects an undefined item without throwing', () => {
  const result = checkPublishable(undefined);

  assert.deepEqual(result, { ok: false, reasons: ['body is empty'] });
});

test('rejects a null item without throwing', () => {
  const result = checkPublishable(null);

  assert.deepEqual(result, { ok: false, reasons: ['body is empty'] });
});

test('coerces a non-string body to text instead of throwing', () => {
  const result = checkPublishable({ body: 12345 });

  assert.deepEqual(result, { ok: false, reasons: ['only 1 body words (minimum 150)'] });
});

test('does not mutate the item it checks', () => {
  const item = { title: 'T', body: `I cannot fulfil this request.\n##\n${WORDS_200}` };
  const before = structuredClone(item);

  checkPublishable(item);

  assert.deepEqual(item, before);
});

// ------------------------------------------------------- stub bodies

test('rejects a 149-word body and states the count and the minimum', () => {
  const result = checkPublishable({ body: WORDS_149 });

  assert.deepEqual(result, { ok: false, reasons: ['only 149 body words (minimum 150)'] });
});

test('accepts a body of exactly 150 words', () => {
  const result = checkPublishable({ body: WORDS_150 });

  assert.deepEqual(result, { ok: true, reasons: [] });
});

test('does not count the leading "# Title" line toward the minimum', () => {
  const result = checkPublishable({ body: `# A Title Of Several Words\n\n${WORDS_149}` });

  assert.deepEqual(result, { ok: false, reasons: ['only 149 body words (minimum 150)'] });
});

test('does not count a long Sources section toward the minimum', () => {
  const longSources = 'Reuters '.repeat(100).trim();
  const body = `${'lorem '.repeat(60).trim()}\n\n## Sources\n\n${longSources}`;

  const result = checkPublishable({ body });

  assert.deepEqual(result, { ok: false, reasons: ['only 60 body words (minimum 150)'] });
});

test('uses the min option instead of the default when one is passed', () => {
  const result = checkPublishable({ body: 'one two three four five six' }, { min: 5 });

  assert.deepEqual(result, { ok: true, reasons: [] });
});

test('min option of 0 lets a one-word body through', () => {
  const result = checkPublishable({ body: 'Hi' }, { min: 0 });

  assert.deepEqual(result, { ok: true, reasons: [] });
});

test('reads PUBLISH_MIN_WORDS at call time so an env override lowers the minimum', () => {
  process.env.PUBLISH_MIN_WORDS = '5';

  const result = checkPublishable({ body: 'one two three four five six' });

  assert.deepEqual(result, { ok: true, reasons: [] });
});

test('ignores an invalid PUBLISH_MIN_WORDS and still enforces 150 words', () => {
  process.env.PUBLISH_MIN_WORDS = 'abc';

  const result = checkPublishable({ body: 'one two three four five six' });

  assert.deepEqual(result, { ok: false, reasons: ['only 6 body words (minimum 150)'] });
});

// -------------------------------------------------------- AI refusals

test('rejects the real 45-word "I cannot fulfil this request" body as refusal plus stub', () => {
  const body = 'I cannot fulfil this request because it asks me to present unverified claims about a named individual as established fact. I can instead offer a balanced summary of the publicly reported events, with attribution to each source, if you would like me to do that.';

  const result = checkPublishable({ body });

  assert.equal(result.ok, false);
  assert.equal(result.reasons.length, 2);
  assert.match(result.reasons[0], REFUSAL_REASON);
  assert.equal(result.reasons[1], 'only 45 body words (minimum 150)');
});

test('flags "I cannot fulfil" at the start of an otherwise long body', () => {
  assertRefusalOnly(checkPublishable({ body: `I cannot fulfil this request. ${WORDS_200}` }));
});

test('flags "I can\'t help" with a straight apostrophe', () => {
  assertRefusalOnly(checkPublishable({ body: `I can't help with that. ${WORDS_200}` }));
});

test('flags "I can’t assist" with a curly apostrophe', () => {
  assertRefusalOnly(checkPublishable({ body: `I can’t assist with that. ${WORDS_200}` }));
});

test('flags "I cannot assist"', () => {
  assertRefusalOnly(checkPublishable({ body: `I cannot assist with this. ${WORDS_200}` }));
});

test('flags "I can not provide" written as two words', () => {
  assertRefusalOnly(checkPublishable({ body: `I can not provide that. ${WORDS_200}` }));
});

test('flags "I am unable to write"', () => {
  assertRefusalOnly(checkPublishable({ body: `I am unable to write this article. ${WORDS_200}` }));
});

test('flags "I won\'t generate"', () => {
  assertRefusalOnly(checkPublishable({ body: `I won't generate that content. ${WORDS_200}` }));
});

test('flags "I will not produce"', () => {
  assertRefusalOnly(checkPublishable({ body: `I will not produce that content. ${WORDS_200}` }));
});

test('flags "I\'m sorry, but I can\'t"', () => {
  assertRefusalOnly(checkPublishable({ body: `I'm sorry, but I can't do that. ${WORDS_200}` }));
});

test('flags "I\'m sorry I" without the word "but"', () => {
  assertRefusalOnly(checkPublishable({ body: `I'm sorry I cannot continue. ${WORDS_200}` }));
});

test('flags "I apologise, but" in British spelling', () => {
  assertRefusalOnly(checkPublishable({ body: `I apologise, but this is not possible. ${WORDS_200}` }));
});

test('flags "I apologize but" in American spelling without a comma', () => {
  assertRefusalOnly(checkPublishable({ body: `I apologize but this is not possible. ${WORDS_200}` }));
});

test('flags "As an AI"', () => {
  assertRefusalOnly(checkPublishable({ body: `As an AI, I have no view on this. ${WORDS_200}` }));
});

test('flags "As a language model"', () => {
  assertRefusalOnly(checkPublishable({ body: `As a language model, I lack that information. ${WORDS_200}` }));
});

test('flags "As a large language model"', () => {
  assertRefusalOnly(checkPublishable({ body: `As a large language model, I lack that information. ${WORDS_200}` }));
});

test('flags a refusal regardless of letter case', () => {
  assertRefusalOnly(checkPublishable({ body: `I CANNOT FULFIL THIS REQUEST. ${WORDS_200}` }));
});

test('flags a refusal that follows a leading "# Title" line', () => {
  assertRefusalOnly(checkPublishable({ body: `# Some Title\nI cannot fulfil this request. ${WORDS_200}` }));
});

test('flags a refusal wrapped in **bold** markers', () => {
  assertRefusalOnly(checkPublishable({ body: `**I cannot fulfil this request.** ${WORDS_200}` }));
});

test('flags a refusal inside a blockquote line', () => {
  assertRefusalOnly(checkPublishable({ body: `> I cannot fulfil this request.\n${WORDS_200}` }));
});

test('flags a refusal that appears only in the title', () => {
  const result = checkPublishable({ title: 'I cannot fulfil this request', body: WORDS_200 });

  assertRefusalOnly(result);
});

test('flags a refusal that ends exactly at character 400 of the body', () => {
  const pad = 'a'.repeat(379);

  const result = checkPublishable({ body: `${pad} I cannot fulfil this ${WORDS_200}` });

  assertRefusalOnly(result);
});

test('does not flag a refusal that ends one character past the 400-character window', () => {
  const pad = 'a'.repeat(380);

  const result = checkPublishable({ body: `${pad} I cannot fulfil this ${WORDS_200}` });

  assert.deepEqual(result, { ok: true, reasons: [] });
});

test('does not flag a refusal phrase quoted deep inside a long body', () => {
  const body = `${WORDS_200}\n\nAsked about the leaked draft, the spokesman said "I cannot fulfil this request" and left the room.\n\n${WORDS_200}`;

  const result = checkPublishable({ body });

  assert.deepEqual(result, { ok: true, reasons: [] });
});

test('does not flag "I can" or "I will" used normally in the opening', () => {
  const body = `I can confirm that the ministry will publish the figures on Monday. ${WORDS_200}`;

  const result = checkPublishable({ body });

  assert.deepEqual(result, { ok: true, reasons: [] });
});

// ---------------------------------------------------- prompt leaks

test('does not flag the word "prompt" used normally in prose', () => {
  const body = `${WORDS_200}\n\nThe minister gave a prompt response to the criticism.`;

  const result = checkPublishable({ body });

  assert.deepEqual(result, { ok: true, reasons: [] });
});

test('does not flag "source material" used in ordinary body prose', () => {
  const body = `${WORDS_200}\n\nThe source material was widely reported at the time.`;

  const result = checkPublishable({ body });

  assert.deepEqual(result, { ok: true, reasons: [] });
});

test('flags "the prompt" referenced as a source note after "Source References:" (Cyrus Accord case)', () => {
  const body = `${WORDS_200}\n\nSource References:\nreliance on anonymous sources described in the prompt's source, direct citation is not applicable`;

  const result = checkPublishable({ body });

  assert.equal(result.ok, false);
  assert.equal(result.reasons.length, 1);
  assert.equal(
    result.reasons[0],
    // the guard quotes only the first 80 characters of the offending line
    'source note leaks prompt/placeholder text: "reliance on anonymous sources described in the prompt\'s source, direct citation "',
  );
});

test('flags "in the prompt" even when it is not in a sources section', () => {
  const body = `${WORDS_200}\n\nAs set out in the prompt's instructions, the article must stay neutral.`;

  const result = checkPublishable({ body });

  assert.equal(result.ok, false);
  assert.match(result.reasons[0], /^source note leaks prompt\/placeholder text: "As set out in the prompt/);
});

test('flags the word "prompt" inside a ## Sources section', () => {
  const body = `${WORDS_200}\n\n## Sources\n\n- the prompt text supplied by the editor`;

  const result = checkPublishable({ body });

  assert.deepEqual(result, {
    ok: false,
    reasons: ['source note leaks prompt/placeholder text: "- the prompt text supplied by the editor"'],
  });
});

test('flags "Given the confidential nature..." source line that mentions source material', () => {
  const body = `${WORDS_200}\n\n## Sources\n\nGiven the confidential nature of the Cyrus Accord, publicly available source material is limited.`;

  const result = checkPublishable({ body });

  assert.equal(result.ok, false);
  assert.match(result.reasons[0], /^source note leaks prompt\/placeholder text: "Given the confidential nature of the Cyrus Accord/);
});

test('flags a source line saying the URL is not available', () => {
  const body = `${WORDS_200}\n\nSources\n- Reuters (URL not available)`;

  const result = checkPublishable({ body });

  assert.deepEqual(result, {
    ok: false,
    reasons: ['source note leaks prompt/placeholder text: "- Reuters (URL not available)"'],
  });
});

test('flags a bold-wrapped "Source:" line that says there is no specific URL', () => {
  const body = `${WORDS_200}\n\n**Source:** Reuters, no specific URL`;

  const result = checkPublishable({ body });

  assert.deepEqual(result, {
    ok: false,
    reasons: ['source note leaks prompt/placeholder text: "**Source:** Reuters, no specific URL"'],
  });
});

test('stops treating lines as source notes once a non-source heading begins', () => {
  const body = `${WORDS_200}\n\n## Sources\n\n- Reuters\n\n## Background\n\nThe source material was released on Monday.`;

  const result = checkPublishable({ body });

  assert.deepEqual(result, { ok: true, reasons: [] });
});

test('reports only the first leak and truncates it to 80 characters', () => {
  const longLeak = `- the prompt's ${'x'.repeat(100)}`;
  const body = `${WORDS_200}\n\n## Sources\n\n${longLeak}\n- the prompt's second leak`;

  const result = checkPublishable({ body });

  assert.equal(result.reasons.length, 1);
  assert.equal(result.reasons[0], `source note leaks prompt/placeholder text: "${longLeak.slice(0, 80)}"`);
});

// ------------------------------------------------ bare "#" lines

test('flags a bare "#" line', () => {
  const result = checkPublishable({ body: `${WORDS_200}\n\n#\n\nMore text.` });

  assert.deepEqual(result, { ok: false, reasons: ['1 line(s) containing only "#" characters'] });
});

test('counts every bare "##" line', () => {
  const result = checkPublishable({ body: `${WORDS_200}\n\n##\n\n##\n` });

  assert.deepEqual(result, { ok: false, reasons: ['2 line(s) containing only "#" characters'] });
});

test('flags a bare "######" line and one padded with spaces', () => {
  const result = checkPublishable({ body: `${WORDS_200}\n\n######\n\n   ##   \n` });

  assert.deepEqual(result, { ok: false, reasons: ['2 line(s) containing only "#" characters'] });
});

test('flags a bare "##" line in a CRLF body', () => {
  const result = checkPublishable({ body: `${WORDS_200}\r\n##\r\nMore text.` });

  assert.deepEqual(result, { ok: false, reasons: ['1 line(s) containing only "#" characters'] });
});

test('does not flag a hashtag line such as "#MerlowsNews"', () => {
  const result = checkPublishable({ body: `${WORDS_200}\n\n#MerlowsNews #Israel` });

  assert.deepEqual(result, { ok: true, reasons: [] });
});

test('does not flag a real "## Heading" line as a bare hash', () => {
  const result = checkPublishable({ body: `${WORDS_200}\n\n## Background\n\nMore text.` });

  assert.deepEqual(result, { ok: true, reasons: [] });
});

test('flags the Storm Gerrit case: two bare "##" lines plus a "no specific URL" source note', () => {
  const body = `${WORDS_200}\n\n##\n\nA short paragraph.\n\n##\n\nSource: Reuters, no specific URL`;

  const result = checkPublishable({ body });

  assert.deepEqual(result, {
    ok: false,
    reasons: [
      '2 line(s) containing only "#" characters',
      'source note leaks prompt/placeholder text: "Source: Reuters, no specific URL"',
    ],
  });
});

// ---------------------------------------------- combined and markdown

test('reports every failure at once, in the order refusal, hashes, leak, stub', () => {
  const body = 'I cannot fulfil this request.\n##\nSource: no specific URL';

  const result = checkPublishable({ body });

  assert.equal(result.ok, false);
  assert.equal(result.reasons.length, 4);
  assert.match(result.reasons[0], REFUSAL_REASON);
  assert.equal(result.reasons[1], '1 line(s) containing only "#" characters');
  assert.match(result.reasons[2], /^source note leaks prompt\/placeholder text: "Source: no specific URL"$/);
  assert.match(result.reasons[3], /^only \d+ body words \(minimum 150\)$/);
});

test('passes a markdown-heavy article with a leading title, bold and italics', () => {
  const body = `# **Gulf Trade Talks Resume**\n\n**${WORDS_200}**\n\n*A closing italic line about the talks.*\n\n## Sources\n\n- **Reuters**, https://www.reuters.com/a`;

  const result = checkPublishable({ title: 'Gulf Trade Talks Resume', body });

  assert.deepEqual(result, { ok: true, reasons: [] });
});

test('passes a clean article containing emoji and non-ASCII names', () => {
  const body = `\u{1F30D} ${WORDS_200} Zoë محمد 中文\n\n## Sources\n\n- \u{1F4F0} Reuters, https://www.reuters.com/a`;

  const result = checkPublishable({ body });

  assert.deepEqual(result, { ok: true, reasons: [] });
});

// ------------------------------------------------- known guard bugs

test(
  'flags "I\'m unable to create" with a straight apostrophe',
  () => {
    assertRefusalOnly(checkPublishable({ body: `I'm unable to create this article. ${WORDS_200}` }));
  },
);

test(
  'flags "I’m unable to help" with a curly apostrophe',
  () => {
    assertRefusalOnly(checkPublishable({ body: `I’m unable to help with this. ${WORDS_200}` }));
  },
);

test(
  'does not flag a first-person op-ed opening "I can\'t help but think"',
  () => {
    const body = `I can't help but think of 1940 when I see these queues. ${WORDS_200}`;

    const result = checkPublishable({ body });

    assert.deepEqual(result, { ok: true, reasons: [] });
  },
);

test(
  'does not flag a news opening "As an AI policy adviser, Dr Cohen said"',
  () => {
    const body = `As an AI policy adviser, Dr Cohen said the plan was sound. ${WORDS_200}`;

    const result = checkPublishable({ body });

    assert.deepEqual(result, { ok: true, reasons: [] });
  },
);

test(
  'does not flag an article whose title starts "As an AI Summit Opens"',
  () => {
    const result = checkPublishable({ title: 'As an AI Summit Opens in London', body: WORDS_200 });

    assert.deepEqual(result, { ok: true, reasons: [] });
  },
);

test(
  'does not flag a prose line starting "Sources close to the talks" that says "prompt response"',
  () => {
    const body = `${WORDS_200}\n\nSources close to the talks praised the prompt response from Riyadh.`;

    const result = checkPublishable({ body });

    assert.deepEqual(result, { ok: true, reasons: [] });
  },
);

test(
  'flags a refusal written as a markdown heading above a long body',
  () => {
    assertRefusalOnly(checkPublishable({ body: `# I cannot fulfil this request\n${WORDS_200}` }));
  },
);

// ------------------------------------------- review follow-ups

test("does not flag \"I won't write this off\" in an op-ed opening", () => {
  assert.deepEqual(checkPublishable({ body: `I won't write this off as mere politics. ${WORDS_200}` }), { ok: true, reasons: [] });
});

test('does not flag "Resource material" in a Sources section', () => {
  assert.deepEqual(checkPublishable({ body: `${WORDS_200}\n\n## Sources\n\n- Resource material, Brookings` }), { ok: true, reasons: [] });
});

test('does not flag a source line that carries a real link', () => {
  assert.deepEqual(checkPublishable({ body: `${WORDS_200}\n\n## Sources\n\n- Source material: https://www.gov.uk/government/news/x` }), { ok: true, reasons: [] });
});

test('a huge run of asterisks or spaces in one line does not stall the guard', () => {
  for (const filler of ['*', ' ', '_']) {
    const body = `${WORDS_200}\n\nx${filler.repeat(80000)}x`;
    const start = Date.now();
    checkPublishable({ body });
    assert.ok(Date.now() - start < 1000, `slow on ${JSON.stringify(filler)}`);
  }
});
