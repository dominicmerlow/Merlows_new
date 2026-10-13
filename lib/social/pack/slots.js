// lib/social/pack/slots.js
// The posting grid, and which story fills each slot.
//
// Deliberately PURE: no KV, no clock of its own, no network. Everything comes in as
// arguments and the plan comes out as data. This is the module that decides what the brand
// says in public and when, so it has to be exhaustively testable without a live account —
// and a posting mistake cannot be undone through either platform's API.

/**
 * The daily grid, in Europe/London wall-clock time.
 *
 * Times are the plan's, chosen around UK commuting and evening peaks. `perDay` is the FULL
 * grid; the launch ramp (below) holds it lower for the first fortnight, because a quiet
 * account that suddenly posts six times a day through an API gets flagged.
 */
export const GRID = {
  tiktok: { perDay: 6, times: ['08:00', '11:00', '13:30', '16:30', '19:00', '21:30'] },
  reel: { perDay: 3, times: ['12:30', '18:00', '20:30'] },
  carousel: { perDay: 2, times: ['09:00', '17:00'] },
  story: { perDay: 6, times: ['10:00', '14:00', '15:00', '16:00', '19:30', '21:00'] },
};

/** Which asset each format needs. A pack missing it cannot fill that slot. */
export const FORMAT_ASSET = {
  tiktok: (pack) => pack?.renders?.videos?.tiktok?.url,
  reel: (pack) => pack?.renders?.videos?.reel?.url,
  carousel: (pack) => pack?.renders?.stills?.cover,
  story: (pack) => pack?.renders?.stills?.story,
};

/**
 * Launch ramp. Week 1 posts TikTok twice a day and Instagram at its minimums; week 2 doubles
 * TikTok; week 3 is the full grid. Stated as data so the UI can show which week it is in and
 * so a test can prove week 1 never exceeds week 1.
 */
export const RAMP = [
  { week: 1, tiktok: 2, reel: 3, carousel: 2, story: 2 },
  { week: 2, tiktok: 4, reel: 3, carousel: 2, story: 4 },
  { week: 3, tiktok: 6, reel: 3, carousel: 2, story: 6 },
];

/** Default category weights; the UI can override them. Ranking is weight x recency. */
export const CATEGORY_WEIGHTS = {
  'breaking-news': 1.0,
  'diplomatic-analysis': 0.8,
  'regional-voices': 0.7,
  'abraham-accords': 0.6,
  'cyrus-accord': 0.6,
  'op-eds': 0.5, // BlitzSpirit reuses the op-eds id; see CLAUDE.md
};

/** A story older than this is not worth a slot. */
export const POOL_MS = 24 * 60 * 60_000;

/**
 * How many of each format today, given how long the account has been ramping.
 *
 * `weeksLive` is whole weeks since the first post. Past the table, the full grid applies.
 */
export function capsFor(weeksLive) {
  const stage = RAMP[Math.min(Math.max(0, Math.floor(weeksLive)), RAMP.length - 1)];
  return { tiktok: stage.tiktok, reel: stage.reel, carousel: stage.carousel, story: stage.story };
}

/**
 * Rank the pool: category weight x recency, most deserving first.
 *
 * Recency decays linearly across the pool window rather than exponentially — the difference
 * between a two-hour-old story and a four-hour-old one should not swamp the editorial weight
 * of Breaking News over BlitzSpirit.
 */
export function rankPacks(packs, { now = Date.now(), weights = CATEGORY_WEIGHTS } = {}) {
  return packs
    .map((pack) => {
      const at = Date.parse(pack.renderedAt ?? pack.createdAt ?? '');
      const ageMs = Number.isFinite(at) ? now - at : POOL_MS;
      const recency = Math.max(0, 1 - ageMs / POOL_MS);
      const weight = weights[pack.categoryId] ?? 0.5;
      return { pack, score: weight * recency, ageMs };
    })
    .filter((entry) => entry.ageMs <= POOL_MS)
    .sort((a, b) => b.score - a.score || a.ageMs - b.ageMs)
    .map((entry) => entry.pack);
}

/** `2026-09-23` + `08:00` → an ISO instant, via the given zone's offset for that date. */
export function slotInstant(dateISO, time, zone = 'Europe/London') {
  const [hour, minute] = time.split(':').map(Number);
  // Build the instant by asking the zone what a candidate UTC time looks like locally, then
  // correcting by the difference. Two passes settle it either side of a DST change; doing
  // this with a fixed offset would post an hour out for half the year.
  let guess = Date.UTC(...dateISO.split('-').map(Number).map((n, i) => (i === 1 ? n - 1 : n)), hour, minute);
  for (let pass = 0; pass < 2; pass++) {
    const shown = new Date(guess).toLocaleString('en-GB', {
      timeZone: zone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
    const [datePart, timePart] = shown.split(', ');
    const [d, m, y] = datePart.split('/').map(Number);
    const [hh, mm] = timePart.split(':').map(Number);
    const offsetMs = Date.UTC(y, m - 1, d, hh, mm) - guess;
    const corrected = Date.UTC(...dateISO.split('-').map(Number).map((n, i) => (i === 1 ? n - 1 : n)), hour, minute) - offsetMs;
    if (corrected === guess) break;
    guess = corrected;
  }
  return new Date(guess).toISOString();
}

/**
 * Build today's plan.
 *
 * Rules that matter, and why:
 * - A story never fills the same format twice in a day, and never two slots of any kind
 *   back to back — repetition is what makes an automated account look automated.
 * - A slot whose asset is missing is left EMPTY rather than filled with something else. A
 *   silently substituted format is how the wrong video ends up under the wrong caption.
 * - Slots already in the past are skipped: this runs on a cron, and scheduling a post for
 *   09:00 at 11:00 would either fire immediately or be rejected.
 */
export function planDay(packs, {
  dateISO,
  now = Date.now(),
  zone = 'Europe/London',
  weeksLive = 0,
  weights = CATEGORY_WEIGHTS,
  used = {},
  // Ranking a pool means dropping anything past the window. Planning for ONE pack that has
  // already been rendered is a different question — it is not competing, it is asking
  // whether a slot exists — and applying the pool filter there stranded it: demand exceeds
  // the grid from day one, so a story pushed past 24h could never be scheduled again, never
  // failed, and sat in the queue consuming a work slot on every tick for ever.
  ignorePool = false,
} = {}) {
  const caps = capsFor(weeksLive);
  const ranked = ignorePool ? [...packs] : rankPacks(packs, { now, weights });
  const plan = [];
  const perPackFormats = new Map();

  for (const format of ['tiktok', 'reel', 'carousel', 'story']) {
    const times = GRID[format].times.slice(0, caps[format]);
    let cursor = 0;

    // What today has already spent on this format, counted across the WHOLE record rather
    // than per grid time. A "post now" approval books its formats here under a time of
    // `now-<n>`, which belongs to no grid time, so checking `used[format@time]` alone could
    // never see it — and a day could take a full grid on top of a 24-post manual batch,
    // which is exactly what happened on 24 and 27 September.
    const spent = Object.keys(used).filter((key) => key.startsWith(`${format}@`)).length;
    let added = 0;

    for (const time of times) {
      if (spent + added >= caps[format]) break; // the day's ceiling for this format is reached
      const at = slotInstant(dateISO, time, zone);
      if (Date.parse(at) <= now) continue; // the moment has passed
      if (used[`${format}@${time}`]) continue; // already planned on an earlier tick

      // Walk the ranking for the first story that can fill this slot.
      let chosen = null;
      for (let i = 0; i < ranked.length; i++) {
        const candidate = ranked[(cursor + i) % ranked.length];
        const formats = perPackFormats.get(candidate.contentId) ?? new Set();
        if (formats.has(format)) continue; // one of each format per story per day
        if (!FORMAT_ASSET[format](candidate)) continue; // no asset: leave the slot empty
        chosen = candidate;
        cursor = (cursor + i + 1) % ranked.length;
        formats.add(format);
        perPackFormats.set(candidate.contentId, formats);
        break;
      }
      if (!chosen) continue;

      plan.push({ format, time, at, contentId: chosen.contentId, url: FORMAT_ASSET[format](chosen) });
      added++;
    }
  }

  return plan.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
