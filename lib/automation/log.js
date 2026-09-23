// lib/automation/log.js
// Lightweight run/event log for the automation system.
// Entries are pushed to a capped Redis list ('automation:logs:index') with the
// full record stored at 'automation:log:<id>'.
import { kv, mgetBatched } from '../kv.js';

const INDEX_KEY = 'automation:logs:index';
const MAX_LOGS  = 200;
// readLogs fetches up to 200 records in one MGET, and Upstash rejects a response
// over 10 MB (bytes, after JSON escaping and the client's base64), so one oversized
// record would break the whole log view. Each record is held to MAX_RECORD_BYTES of
// serialised JSON: 200 × 16 KB ≈ 3.2 MB, ≈ 4.3 MB after base64. Real messages are a
// few KB at most; ids and names are short.
const MAX_RECORD_BYTES = 16 * 1024;
const MAX_ID_CHARS = 200;
const MAX_MESSAGE_CHARS = 4000;

const recordBytes = rec => Buffer.byteLength(JSON.stringify(rec), 'utf8');

function capString(v, max) {
  return v == null ? null : String(v).slice(0, max);
}

// Shrinks meta, then message, until the serialised record fits the byte budget.
function fitRecord(rec) {
  if (rec.meta != null) {
    let bytes;
    try { bytes = recordBytes(rec); } catch { bytes = Infinity; }
    if (bytes > MAX_RECORD_BYTES) rec.meta = { truncated: true };
  }
  while (recordBytes(rec) > MAX_RECORD_BYTES && rec.message.length > 0) {
    rec.message = rec.message.slice(0, Math.floor(rec.message.length / 2));
  }
  return rec;
}

export async function writeLog(entry) {
  try {
    const id  = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const rec = fitRecord({
      id,
      at:        new Date().toISOString(),
      ruleId:    capString(entry.ruleId    || null, MAX_ID_CHARS),
      ruleName:  capString(entry.ruleName  || null, MAX_ID_CHARS),
      level:     capString(entry.level     || 'info', MAX_ID_CHARS),     // 'info' | 'success' | 'error' | 'warn'
      message:   capString(entry.message   || '', MAX_MESSAGE_CHARS),
      jobId:     capString(entry.jobId     || null, MAX_ID_CHARS),
      contentId: capString(entry.contentId || null, MAX_ID_CHARS),
      meta:      entry.meta ?? null,
    });
    await kv.set(`automation:log:${id}`, rec);
    await kv.lpush(INDEX_KEY, id);
    // Cap the index to MAX_LOGS most recent
    await kv.ltrim(INDEX_KEY, 0, MAX_LOGS - 1);
    return rec;
  } catch (err) {
    // Logging must never throw — fall back to console
    console.error('writeLog failed:', err.message);
    return null;
  }
}

export async function readLogs(limit = 100) {
  const ids = await kv.lrange(INDEX_KEY, 0, Math.max(0, limit - 1));
  if (!ids.length) return [];
  const records = await mgetBatched(ids.map(id => `automation:log:${id}`));
  return records.filter(Boolean);
}

export async function clearLogs() {
  const ids = await kv.lrange(INDEX_KEY, 0, -1);
  await Promise.all(ids.map(id => kv.del(`automation:log:${id}`)));
  await kv.del(INDEX_KEY);
}
