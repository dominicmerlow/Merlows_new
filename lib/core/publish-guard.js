import { countBodyWords } from '../word-count.js';

// Publish-time guard. The generator publishes whatever the model returned, which
// once put AI refusals ("I cannot fulfil this request...") and prompt leaks live
// on merlows.com. This runs on the stored content record just before the WP POST
// and returns every reason the article must not go out, so a rejection can be logged.

const DEFAULT_MIN_WORDS = 150;
// Refusals open the reply, so only the start of the body is checked — a quoted
// "I cannot..." deep inside real reporting must not trip it.
const REFUSAL_WINDOW = 400;
// Longest line the guard analyses. A real paragraph is a few hundred words, so this
// leaves the stub-word count untouched for genuine articles. The published body is not cut.
const MAX_LINE = 5000;

// Each pattern needs the object of the refusal ("fulfil THIS request"), so ordinary
// first-person prose ("I can't help but think of 1940") is left alone.
const REFUSAL_RES = [
  /\bI\s+(?:cannot|can(?:'|’)t|can\s+not|won(?:'|’)t|will\s+not)\s+(?:fulfil|fulfill|help|assist|comply|write|provide|create|generate|produce|complete)\s+(?:with\s+)?(?:this|that|your|the|any|a|an)\b(?!\s+off\b)/i,
  /\bI(?:\s+am|(?:'|’)m)\s+unable\s+to\b/i,
  /\bI(?:'|’)m\s+sorry,?\s+(?:but\s+)?I\b/i,
  /\bI\s+apologi[sz]e,?\s+but\b/i,
  /\bas\s+an\s+ai(?:\s+(?:language\s+model|assistant)\b|\s*,\s*I\b)/i,
  /\bas\s+a\s+(?:large\s+)?language\s+model\b/i,
];

const SOURCE_HEADING_RE = /^#{1,6}\s*\W*(?:sources?|references?|bibliography|further reading)\b/i;
const SOURCE_LINE_RE = /^\W*(?:sources?|references?)\b/i;
// A bare label line ("Source References:", "**Sources**") opens a source section even
// without a "#". A sentence that merely starts with "Sources" ("Sources said so.") does not.
const SOURCE_LABEL_RE = /^\W*(?:sources?|references?)(?:\s+[A-Za-z]+){0,2}\s*:\s*$|^\W*(?:sources?|references?)\s*$/i;
// The model addressing its own instructions in reader-facing text. Possessive or a
// following instruction noun only, so "the prompt response" stays legal.
const PROMPT_LEAK_RE = /\b(?:the|this|your|my)\s+prompt(?:'|’)s\b|\b(?:the|this|your)\s+prompt\s+(?:source|material|text|instructions?|input|says|states|provided|supplied|given)\b|\b(?:supplied|provided|given)\s+prompt\b/i;
// Placeholder admissions inside a source note. A line that carries a real link is a source.
const SOURCE_LEAK_RE = /\bsource\s+material|\bno\s+(?:specific\s+)?url\b|\burl\s+(?:is\s+)?(?:not\s+)?(?:available|provided)\b/i;
const HAS_URL_RE = /https?:\/\//i;

function stripEmphasis(line) {
  return line.replace(/^[\s*_>]+|[\s*_]+$/g, '').trim();
}

export function minWords() {
  const raw = String(process.env.PUBLISH_MIN_WORDS ?? '').trim();
  return /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : DEFAULT_MIN_WORDS;
}

// Returns { ok, reasons: string[] }. Never throws on odd input.
export function checkPublishable(item, { min = minWords() } = {}) {
  const reasons = [];
  // Cap each line before any regex runs: a stored body with a huge run of spaces or
  // asterisks makes the emphasis-stripping regexes (here and in countBodyWords) go quadratic.
  const body = String(item?.body ?? '').split('\n').map(l => (l.length > MAX_LINE ? l.slice(0, MAX_LINE) : l)).join('\n');
  const title = String(item?.title ?? '').slice(0, MAX_LINE);

  if (!body.trim()) {
    return { ok: false, reasons: ['body is empty'] };
  }

  const opening = body.replace(/^[\s#*_>]+/, '').slice(0, REFUSAL_WINDOW);
  for (const re of REFUSAL_RES) {
    if (re.test(opening) || re.test(title)) {
      reasons.push(`looks like an AI refusal (matched ${re})`);
      break;
    }
  }

  let inSources = false;
  let bareHashes = 0;
  const leaks = [];
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (/^#{1,6}\s*$/.test(line)) { bareHashes++; continue; }
    const isHeading = /^#{1,6}\s/.test(line);
    if (isHeading) inSources = SOURCE_HEADING_RE.test(line);
    else if (SOURCE_LABEL_RE.test(stripEmphasis(line))) inSources = true;
    const isSourceLine = inSources || SOURCE_LINE_RE.test(stripEmphasis(line));
    const sourceLeak = isSourceLine && !HAS_URL_RE.test(line) && SOURCE_LEAK_RE.test(line);
    if (sourceLeak || PROMPT_LEAK_RE.test(line)) leaks.push(line.slice(0, 80));
  }
  if (bareHashes) reasons.push(`${bareHashes} line(s) containing only "#" characters`);
  if (leaks.length) reasons.push(`source note leaks prompt/placeholder text: "${leaks[0]}"`);

  const words = countBodyWords(body);
  if (words < min) reasons.push(`only ${words} body words (minimum ${min})`);

  return { ok: reasons.length === 0, reasons };
}
