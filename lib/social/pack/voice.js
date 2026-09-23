// lib/social/pack/voice.js
// British voice-over for a social pack, through OpenRouter's speech endpoint.
//
// Three voices, chosen by ear on 2026-09-23 and rotated PER STORY (never within one — a
// voice change mid-bulletin reads as a fault). The rotation is a hash of the article id, so
// a retry or a re-render always produces the same presenter.
//
// Voice runs on its own key (SOCIAL_TTS_API_KEY) so a runaway voice job cannot drain the
// budget the daily articles depend on.

const SPEECH_URL = 'https://openrouter.ai/api/v1/audio/speech';
const CALL_TIMEOUT_MS = Number(process.env.SOCIAL_TTS_TIMEOUT_MS) || 45_000;
/** Stop starting new clips once a stage has run this long, so a tick is never killed mid-write. */
const PACK_BUDGET_MS = Number(process.env.SOCIAL_TTS_BUDGET_MS) || 150_000;
/** A storage path segment must be exactly this and nothing else. */
const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

export const VOICES = [
  { id: 'colin', name: 'Colin (British male)', model: 'deepgram/flux-tts:free', voice: 'flux-colin-en' },
  { id: 'sophia', name: 'Sophia (British female)', model: 'fish-audio/s2.1-pro', voice: '0efe38923c0b445ab09382e851ae1e30' },
  { id: 'richard', name: 'Richard (British male)', model: 'fish-audio/s2.1-pro', voice: 'fbc1029c018041d4b17f2c1e57222dff' },
];

export function voiceForArticle(articleId) {
  let hash = 0;
  for (const char of String(articleId)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return VOICES[hash % VOICES.length];
}

const otherVoices = (chosen) => VOICES.filter((v) => v.id !== chosen.id);

/** An MP3 starts with an ID3 tag or an 11-bit frame sync. Anything else is an error body. */
export function isMp3(buffer) {
  // A short clip is legitimate: the outro ("Full story at merlows dot com") is about two
  // seconds and under 4 KB, which the old floor rejected as a non-audio body.
  if (!buffer || buffer.length < 512) return false;
  const head = Buffer.from(buffer.subarray(0, 3));
  return head.toString('ascii') === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
}

async function speakWith(voice, text, { apiKey, fetchFn }) {
  if (!text || !String(text).trim()) throw new Error(`${voice.id}: nothing to speak`);
  // Without a timeout a hung provider holds the socket until Vercel kills the function —
  // and a killed tick used to lose the pack after paying for it.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
  let res;
  let buffer;
  try {
    res = await fetchFn(SPEECH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://merlows.vercel.app',
        'X-Title': 'Merlows Social Autopilot',
      },
      body: JSON.stringify({ model: voice.model, input: text, voice: voice.voice, response_format: 'mp3' }),
      signal: ctrl.signal,
    });
    buffer = Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
  // Only the status and a short, classified hint are kept: provider bodies carry request ids
  // and internal identifiers, and this string is stored in KV and shown on the board.
  if (!res.ok) throw new Error(`${voice.id}: HTTP ${res.status}`);
  // Never store a non-audio body: it would pass a size check and then be "played" as silence.
  if (!isMp3(buffer)) throw new Error(`${voice.id}: response was not MP3 audio (${buffer.length} bytes)`);
  return buffer;
}

/** The story's voice first, then the other two — one provider outage must not lose the day. */
export async function speak(voice, text, opts) {
  const errors = [];
  for (const candidate of [voice, ...otherVoices(voice)]) {
    try {
      return { buffer: await speakWith(candidate, text, opts), voice: candidate };
    } catch (err) {
      errors.push(err.message);
    }
  }
  throw new Error(`all voices failed: ${errors.join(' | ')}`);
}

/** Every spoken line in a pack, in render order. */
export function linesOf(pack) {
  const lines = [{ key: 'hook', text: pack.hook }];
  pack.points.forEach((point, i) => lines.push({ key: `p${i + 1}`, text: point.vo || point.caption }));
  if (pack.midHook) lines.push({ key: 'mid', text: pack.midHook });
  if (pack.quote?.text) lines.push({ key: 'quote', text: pack.quote.text });
  lines.push({ key: 'outro', text: (pack.outro || 'Full story at merlows.com').replace(/merlows\.com/i, 'merlows dot com') });
  return lines;
}

/**
 * Voice a whole pack and store the clips in Blob.
 *
 * Blob rather than KV because the renderer fetches these over HTTP and KV is not a file
 * store. Paths carry a random suffix: a predictable path meant anyone who learned the store
 * hostname could walk `social/<post id>/vo-hook.mp3` and listen to every pack before a human
 * had approved it — including the ones flagged sensitive.
 */
export async function voicePack(
  pack,
  {
    apiKey = process.env.SOCIAL_TTS_API_KEY || process.env.OPENROUTER_API_KEY,
    fetchFn = fetch,
    putFn,
    /** Server-generated id that owns the storage folder. Never the article's WordPress id. */
    pathId = pack.articleId,
    /** Clips already made (a resumed stage): `{ hook: url }`. These are not re-paid for. */
    existing = {},
    startedAt = Date.now(),
    budgetMs = PACK_BUDGET_MS,
    /** Presenter a previous partial run settled on; keeps a resumed pack one voice. */
    voiceId,
  } = {},
) {
  if (!apiKey) throw new Error('SOCIAL_TTS_API_KEY (or OPENROUTER_API_KEY) is not configured');
  // The storage path must never come from a field an outside caller can write. `wpPostId`
  // is settable through the content API, and a crafted value could have written audio into
  // ANOTHER story's folder — that story then narrates attacker-chosen words under its own
  // captions. Hence: a server-generated id, validated as a single safe path segment.
  if (!SAFE_SEGMENT.test(String(pathId))) {
    throw new Error(`refusing to store clips under an unsafe path segment: ${String(pathId).slice(0, 40)}`);
  }
  // Imported lazily so tests (which inject putFn) run without @vercel/blob installed —
  // npm install cannot complete on the Google Drive volume this repo lives on.
  const put = putFn ?? (await import('@vercel/blob')).put;

  // One voice for the WHOLE pack. Falling back per line produced a bulletin that changed
  // presenter halfway through — the exact fault this module exists to avoid. So the first
  // line decides, and every later line uses that voice or the pack fails.
  const preferred = voiceForArticle(pack.articleId);
  // A resume must continue with the voice the earlier clips were made in, or the
  // bulletin changes presenter mid-way — the fault this module exists to avoid.
  const pinned = voiceId ? VOICES.find((v) => v.id === voiceId) ?? null : null;
  const audio = { ...existing };
  const lines = linesOf(pack).filter((line) => !audio[line.key]);
  let used = pinned;

  // A failure must carry the clips already made, or `existing` can never be populated and
  // every retry re-pays for every line. (It could not: `advance` only persists on success.)
  const withProgress = (err) => Object.assign(err, { audio });

  for (const line of lines) {
    if (Date.now() - startedAt > budgetMs) {
      throw withProgress(
        new Error(`voice budget spent after ${Object.keys(audio).length} clips; resuming next tick`),
      );
    }
    let blob;
    try {
      const result = used
        ? { buffer: await speakWith(used, line.text, { apiKey, fetchFn }), voice: used }
        : await speak(preferred, line.text, { apiKey, fetchFn });
      used = result.voice;
      blob = await put(`social/${pathId}/vo-${line.key}.mp3`, result.buffer, {
        access: 'public',
        contentType: 'audio/mpeg',
        addRandomSuffix: true, // unguessable: clips exist before a human has approved the pack
      });
    } catch (err) {
      throw withProgress(err);
    }
    audio[line.key] = blob.url;
  }

  const voice = used ?? preferred;
  return { audio, voiceId: voice.id, voiceName: voice.name };
}

/** Merge clip URLs into the pack in the shape the Remotion templates read. */
export function applyAudio(pack, audio) {
  return {
    ...pack,
    hookAudio: audio.hook,
    midHookAudio: audio.mid,
    outroAudio: audio.outro,
    quote: pack.quote ? { ...pack.quote, audio: audio.quote } : undefined,
    points: pack.points.map((point, i) => ({ ...point, audio: audio[`p${i + 1}`] })),
  };
}
