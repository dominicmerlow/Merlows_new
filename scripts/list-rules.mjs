// scripts/list-rules.mjs — read-only. Lists every automation rule with its
// trigger, so you can spot rules that depended on the deleted 5-minute pinger.
//
// After 2026-08-19 the only scheduler is the Vercel cron `0 7-12 * * *`, which
// evaluates rules at 07:00-12:00 UTC. A rule whose own cron needs a finer tick
// than hourly can no longer fire on time. Writes nothing.
//
//   node scripts/list-rules.mjs
import { kv } from '../lib/kv.js';

if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
  console.error('KV_REST_API_URL / KV_REST_API_TOKEN are not set.');
  process.exit(1);
}
const ids = (await kv.lrange('automation:rules:index', 0, -1)) || [];
const rules = (await Promise.all(ids.map(id => kv.get(`automation:rule:${id}`)))).filter(Boolean);
console.log(`${rules.length} rule(s), ${ids.length} id(s) in index\n`);

const atRisk = [];
for (const r of rules) {
  const cron = r.trigger?.cron ?? '-';
  // Minute-field granularity finer than "on the hour" cannot be honoured by a
  // scheduler that only ticks hourly between 07:00 and 12:00 UTC.
  const subHourly = /^(\*|\*\/\d+|[\d,]+-[\d,]+|\d+,\d+)/.test(String(cron).split(' ')[0] ?? '');
  if (r.enabled && r.trigger?.type === 'schedule' && subHourly) atRisk.push(r);
  console.log(`  ${r.enabled ? '[on] ' : '[off]'} ${r.name}`);
  console.log(`        trigger=${r.trigger?.type}  cron="${cron}"  lastRunAt=${r.lastRunAt ?? 'never'}`);
  console.log(`        review.required=${r.review?.required}  publish.auto=${r.publish?.auto}  maxArticlesPerRun=${r.generation?.maxArticlesPerRun ?? '-'}`);
  console.log('');
}
if (atRisk.length) {
  console.log(`WARNING — ${atRisk.length} enabled rule(s) want a sub-hourly tick and can no longer get one:`);
  for (const r of atRisk) console.log(`  - ${r.name}  cron="${r.trigger.cron}"`);
} else {
  console.log('No enabled rule depends on a sub-hourly tick.');
}
