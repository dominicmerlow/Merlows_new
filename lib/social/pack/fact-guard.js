// lib/social/pack/fact-guard.js
// Deterministic check that a social pack says nothing the article did not.
//
// This is code, not a second LLM pass, on purpose: a model asked "is this supported?"
// answers "yes" to its own output far too often, and a check that cannot fail is
// decoration. Here a fabricated figure or an invented name fails, every time.
//
// Scope, stated honestly: this proves the CLIP matches the ARTICLE. It cannot prove the
// article is true. A short video makes any claim look more certain than a hedged article
// does, which is why the sensitive categories also go through the review gate.

/** Words that look like proper nouns but are just sentence-initial or common. */
const COMMON_CAPITALISED = new Set([
  'A', 'An', 'And', 'As', 'At', 'But', 'By', 'For', 'From', 'He', 'How', 'I', 'If', 'In',
  'It', 'Its', 'Just', 'No', 'Not', 'Of', 'On', 'One', 'Or', 'She', 'So', 'That', 'The',
  'Their', 'They', 'This', 'To', 'We', 'What', 'When', 'Where', 'Which', 'While', 'Who',
  'Why', 'With', 'Yes', 'You', 'Nobody', 'Everyone', 'Every', 'Now', 'Then', 'There',
  'These', 'Those', 'Full', 'Story', 'Source', 'Merlows', 'Read', 'More', 'Link', 'Bio',
  // Frequent sentence openers. Since the first word of a sentence is now checked (an
  // invented name usually opens the hook), ordinary words that open sentences have to be
  // listed here or every other hook trips the guard.
  'After', 'Against', 'All', 'Along', 'Already', 'Also', 'Although', 'Always', 'Among',
  'Another', 'Any', 'Because', 'Before', 'Behind', 'Both', 'Can', 'Could', 'Despite', 'Did',
  'Does', 'During', 'Each', 'Either', 'Even', 'Ever', 'Few', 'First', 'Following', 'Given',
  'Here', 'However', 'Inside', 'Instead', 'Into', 'Last', 'Later', 'Less', 'Like', 'Many',
  'May', 'Meanwhile', 'Might', 'Most', 'Much', 'Must', 'Near', 'Neither', 'Never', 'Next',
  'Once', 'Only', 'Other', 'Others', 'Our', 'Out', 'Over', 'Perhaps', 'Rather', 'Same',
  'Second', 'Several', 'Should', 'Since', 'Some', 'Soon', 'Still', 'Such', 'Than', 'Them',
  'Third', 'Though', 'Through', 'Thus', 'Today', 'Together', 'Tomorrow', 'Too', 'Under',
  'Until', 'Upon', 'Very', 'Was', 'Were', 'Whether', 'Will', 'Within', 'Without', 'Would',
  'Yet', 'Your', 'Nothing', 'Something', 'Everything', 'Anyone', 'Someone',
]);

/** Adverbs are never names, and they open editorial lines constantly ("Quietly, …"). */
const looksLikeAdverb = (word) => /ly$/i.test(word) && word.length > 4;

/** Spoken numbers the script writes out in words (Fish Audio misreads digits). */
const WORD_NUMBERS = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7',
  eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12', thirteen: '13',
  fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18',
  nineteen: '19', twenty: '20', thirty: '30', forty: '40', fifty: '50', sixty: '60',
  seventy: '70', eighty: '80', ninety: '90', hundred: '100', thousand: '1000',
  million: '1000000', billion: '1000000000',
};

const normalise = (text) =>
  String(text ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Every spoken number in the text, flattened. Each number may have more than one written
 * form ("four point two billion" → 4.2 and 4200000000); use `spokenNumberGroups` when the
 * distinction matters, which it does when deciding whether a figure is supported.
 */
export const spokenNumbersIn = (text) => spokenNumberGroups(text).flat();

/** Digit strings, ignoring thousands separators and trailing % or currency marks. */
export const numbersIn = (text) =>
  (normalise(text).match(/\d[\d,.]*/g) ?? [])
    .map((n) => n.replace(/[,.]$/, '').replace(/,/g, ''))
    .filter((n) => n.length > 0);

/**
 * Capitalised words that are not sentence furniture — names, places, organisations.
 *
 * Hyphenated compounds are split, because "Sixty-seven" opening a spoken line is two number
 * words, not a Norwegian surname. (It was: the guard rejected its own correct script.)
 */
export const properNounsIn = (text) => {
  const names = [];
  // Every capitalised word is a candidate, INCLUDING the first of each sentence. Skipping
  // the first word let "Erdogan walked out of the room." pass against an article that never
  // mentions him — and a hook or a headline, the two lines burned biggest on screen, almost
  // always starts with its subject. Ordinary sentence-initial words ("Quietly", "Deaths")
  // are handled instead by COMMON_CAPITALISED plus the stem match in `nameSupported`, which
  // is where a real English word belongs.
  for (const word of normalise(text).match(/[\p{L}][\p{L}'’-]*/gu) ?? []) {
    if (/^[A-Z]/.test(word)) names.push(...word.split(/[-’']/));
  }
  return names.filter(
    (word) =>
      word.length > 2 &&
      !COMMON_CAPITALISED.has(word) &&
      !looksLikeAdverb(word) &&
      !(word.toLowerCase() in WORD_NUMBERS) &&
      !(word.toLowerCase().replace(/(th|s)$/, '') in WORD_NUMBERS),
  );
};

/**
 * Does the article support this name?
 *
 * Exact match first, then a stem: an article about "the Middle East" supports a caption
 * about "Middle Eastern states" — a writer may inflect a word taken from the source. The
 * stem must still be four characters or more, so an invented name cannot pass on a short
 * overlap.
 */
export const nameSupported = (name, articleLower) => {
  const word = name.toLowerCase();
  if (articleLower.includes(word)) return true;
  const stem = word.replace(/(ern|ians?|ish|ese|ans?|ing|ed|es|s)$/, '');
  return stem.length >= 4 && articleLower.includes(stem);
};

/**
 * A spoken line may write "sixty seven per cent" where the article says "67%", and may say
 * "twenty twenty two" for "2022". Rather than trying to parse English numerals, the guard
 * accepts a spoken number when its digits appear in the article in any grouping.
 */
const canonical = (value) => String(value).replace(/,/g, '').replace(/\.0+$/, '');

/**
 * Is this figure in the article?
 *
 * Exact numeric match, with NO tolerance. It began as a substring test, which let an article
 * mentioning "5 injured" and the date "2026" validate claims of 50, 500, 1500, 15000 and
 * 2026 dead. The fix added a power-of-ten tolerance so "four point two billion" could match
 * an article printing "4.2 billion" — and that tolerance in turn let "five thousand injured"
 * ride on "5 injured", a fabrication 1000x the truth. The tolerance is gone: a spoken number
 * now offers its alternative forms as a GROUP (see `spokenNumbersIn`) and one of them has to
 * match exactly.
 */
const spokenNumberSupported = (value, articleDigits) => {
  const text = canonical(value);
  if (articleDigits.has(text)) return true;
  const n = Number(text);
  if (!Number.isFinite(n) || n === 0) return false;
  for (const digits of articleDigits) {
    const m = Number(digits);
    if (Number.isFinite(m) && m === n) return true;
  }
  return false;
};

const SMALL = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const SCALES = { hundred: 100, thousand: 1000, million: 1e6, billion: 1e9, trillion: 1e12 };

/**
 * Parse numbers written as words, because every spoken line writes them out (Fish Audio
 * misreads digits) while the article uses figures.
 *
 * Handles the three forms that actually turn up in a news read:
 *   "sixty seven per cent"      → 67
 *   "twenty twenty two"         → 2022   (year pairs, not 20 + 20 + 2)
 *   "four point two billion"    → 4.2 and 4200000000
 *
 * Returns every candidate string a match could take, so "four point two billion" is
 * supported by an article that says either "4.2 billion" or "4,200,000,000".
 */
export function spokenNumberGroups(text) {
  const tokens = normalise(text).toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const found = [];
  // Standard accumulator: `current` builds the group being spoken, `total` holds groups
  // already multiplied by a scale. Without it, "one hundred and thirty thousand" came out as
  // 1, 100, 30 and 30,000 — and the guard rejected a caption whose article said 130,000.
  let current = null;
  let total = 0;
  let decimals = '';
  let inDecimal = false;
  // Alternative spellings of the SAME number ("4.2" for "four point two billion").
  let alternatives = [];

  const value = () => {
    const group = inDecimal && decimals ? Number(`${current}.${decimals}`) : (current ?? 0);
    return total + group;
  };

  const flush = () => {
    if (current !== null || total) found.push([String(value()), ...alternatives]);
    else if (alternatives.length) found.push([...alternatives]);
    current = null;
    total = 0;
    decimals = '';
    inDecimal = false;
    alternatives = [];
  };

  for (const token of tokens) {
    if (token in SMALL) {
      const n = SMALL[token];
      if (inDecimal) decimals += String(n);
      else if (current === null) current = n;
      // Year pair: "twenty twenty two" is 2022, not 42.
      else if (current >= 10 && n >= 10 && current < 100) current = current * 100 + n;
      else current += n;
      continue;
    }
    if (token in SCALES) {
      if (current === null) continue; // "a hundred families" — vague, not a figure
      const scale = SCALES[token];
      const group = inDecimal && decimals ? Number(`${current}.${decimals}`) : current;
      if (scale === 100) {
        current = group * 100; // stays in the current group: "one hundred and thirty"
      } else {
        // A decimal mantissa is worth recording as an ALTERNATIVE form of the same number:
        // an article may print "4.2 billion" rather than 4200000000. It is an alternative,
        // not a second figure — treating it as one forced a power-of-ten tolerance that let
        // "five thousand injured" ride on an article saying "5 injured".
        if (inDecimal && decimals) alternatives.push(String(group));
        total += group * scale;
        current = null;
      }
      decimals = '';
      inDecimal = false;
      continue;
    }
    if (token === 'point' && current !== null) {
      inDecimal = true;
      continue;
    }
    if (token === 'and' && (current !== null || total)) continue; // "a hundred and thirty"
    flush();
  }
  flush();
  return found;
}

/**
 * Check one pack against the article body.
 *
 * Returns `{ ok, problems }`. Hooks are checked too: a hook may be a take or a question,
 * but any NAME or FIGURE inside it still has to come from the article.
 */
export function checkPack(pack, articleText) {
  const article = normalise(articleText);
  const articleLower = article.toLowerCase();
  // The article writes numbers both ways — "Over three nights", "67%" — so the supported set
  // has to hold both. Reading only digits made the guard reject a caption for the very
  // figure its article had spelled out.
  const articleDigits = new Set(
    [...numbersIn(article), ...spokenNumbersIn(article)].map(canonical),
  );
  const problems = [];

  const check = (label, text, { names = true } = {}) => {
    if (!text) return;
    for (const name of names ? properNounsIn(text) : []) {
      if (!nameSupported(name, articleLower)) {
        problems.push(`${label}: "${name}" does not appear in the article`);
      }
    }
    // Digits are their own group of one; a spoken number brings its alternative forms, and
    // ONE of them matching is enough. Requiring all of them is what forced the old
    // power-of-ten tolerance, which in turn let a 1000x fabrication through.
    const groups = [...numbersIn(text).map((n) => [n]), ...spokenNumberGroups(text)];
    for (const group of groups) {
      if (!group.some((value) => spokenNumberSupported(value, articleDigits))) {
        problems.push(`${label}: the figure ${group[0]} does not appear in the article`);
      }
    }
  };

  check('hook', pack.hook);
  check('midHook', pack.midHook);
  check('headline', pack.headline);
  // The captions ARE the post — they go out in the brand's name — so they are checked like
  // everything else. They were not, which left the one piece of text a reader sees first
  // entirely unguarded.
  check('Instagram caption', pack.igCaption);
  check('TikTok caption', pack.tiktokCaption);
  check('outro', pack.outro);
  // Figures only, no name check: a hashtag is a topic label, not a factual assertion, and
  // "MiddleEast" will never appear in an article as one word. Same reasoning as the quote's
  // attribution.
  (pack.hashtags ?? []).forEach((tag, i) => check(`hashtag ${i + 1}`, String(tag), { names: false }));

  // Shape gates on the text that actually gets posted. The checks above ask "is this in the
  // article?"; these ask "is this even the right kind of thing?" — a model told to write a
  // caption can be talked into writing a link, and the article body reaches the prompt from
  // RSS, so it is not trusted input.
  // Any domain-shaped token, in ANY field that ships. Enumerating TLDs was the wrong shape
  // (breakingnow.news sailed through), and checking only the TikTok caption left the
  // Instagram caption and the outro — which is spoken AND burned on screen — wide open.
  const LINK_RE = /https?:\/\/|www\.|\b[a-z0-9][a-z0-9-]*\.[a-z]{2,}\b|\bdot\s+(?:com|net|org|news|co)\b/i;
  const allowedHost = new RegExp(`\\b${(process.env.BRAND_SITE_HOST || 'merlows.com').replace(/\./g, '\\.')}\\b`, 'i');
  for (const [label, text] of [
    ['TikTok caption', pack.tiktokCaption],
    ['Instagram caption', pack.igCaption],
    ['outro', pack.outro],
  ]) {
    if (!text) continue;
    // The brand's own domain is the one link that belongs here.
    const withoutBrand = String(text).replace(allowedHost, ' ').replace(/\bmerlows\s+dot\s+com\b/i, ' ');
    if (LINK_RE.test(withoutBrand)) problems.push(`${label} contains a link`);
  }
  if ((pack.igCaption ?? '').length > 2200) {
    problems.push('Instagram caption is over the 2,200 character limit');
  }
  for (const tag of pack.hashtags ?? []) {
    if (!/^[A-Za-z0-9]{2,30}$/.test(String(tag).replace(/^#/, ''))) {
      problems.push(`hashtag "${String(tag).slice(0, 24)}" is not a plain alphanumeric tag`);
    }
  }
  // Not the attribution: it names the OUTLET ("Fox News", "Reuters"), which lives in the
  // article's metadata rather than its body, so checking it flagged every honest credit.
  (pack.points ?? []).forEach((point, i) => {
    check(`point ${i + 1} caption`, point.caption);
    check(`point ${i + 1} voice-over`, point.vo);
  });

  // A pull quote must be a real line from the article, not a paraphrase of one.
  if (pack.quote?.text) {
    // The WHOLE quote must be in the article. Comparing only the first six words let a real
    // opening carry an invented ending: "Officials confirmed 5 people were injured" + "in a
    // deliberate Iranian attack" passed, which is the worst kind of fabrication — a true
    // sentence with a false tail, in quotation marks, attributed to a named source.
    const quote = normalise(pack.quote.text).replace(/^["'“”]+|["'“”.,;:]+$/g, '');
    if (!articleLower.includes(quote.toLowerCase())) {
      problems.push(`quote: "${quote.slice(0, 60)}…" is not a verbatim line from the article`);
    }
  }

  return { ok: problems.length === 0, problems };
}
