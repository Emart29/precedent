// Forge Key-Value Storage for decision records, check results and team responses.
//
// Keys
//   dec:<DEC-n>                 decision record
//   src:<sourceKey>             sourceKey ("page:123", "page:123:item:0", "sample:4") -> DEC-n
//   seq                         last allocated decision number
//   check:<ISSUE-KEY>           last conflict check for an issue
//   resp:<ISSUE-KEY>:<DEC-n>    how the team responded (linked / override / reopen)
//   meta:sync                   last sync summary
//   meta:stats                  running counters shown on the register page

import { kvs, WhereConditions } from '@forge/kvs';

export async function allDecisions() {
  const out = [];
  let cursor;
  do {
    let q = kvs.query().where('key', WhereConditions.beginsWith('dec:')).limit(100);
    if (cursor) q = q.cursor(cursor);
    const page = await q.getMany();
    out.push(...page.results.map((r) => r.value));
    cursor = page.nextCursor;
  } while (cursor);
  return out.sort((a, b) => Number(a.id.split('-')[1]) - Number(b.id.split('-')[1]));
}

export const getDecision = (id) => kvs.get(`dec:${String(id).toUpperCase()}`);

/** Insert or update a record identified by its source key; returns the stored record. */
export async function upsertDecision(record) {
  const srcKey = `src:${record.key}`;
  let id = await kvs.get(srcKey);
  let existing = id ? await kvs.get(`dec:${id}`) : null;
  if (!id) {
    const next = ((await kvs.get('seq')) || 0) + 1;
    await kvs.set('seq', next);
    id = `DEC-${next}`;
    await kvs.set(srcKey, id);
  }
  // Keep a manual status change (e.g. "reopened" from the issue panel) unless the source page itself changed status.
  const status = existing && existing.statusOverride ? existing.status : record.status;
  const stored = { ...existing, ...record, id, status, updatedAt: new Date().toISOString() };
  await kvs.set(`dec:${id}`, stored);
  return stored;
}

export async function setDecisionStatus(id, status, note) {
  const d = await getDecision(id);
  if (!d) return null;
  const updated = { ...d, status, statusOverride: true, statusNote: note, updatedAt: new Date().toISOString() };
  await kvs.set(`dec:${d.id}`, updated);
  return updated;
}

export const saveCheck = (issueKey, check) => kvs.set(`check:${issueKey}`, { ...check, at: new Date().toISOString() });
export const getCheck = (issueKey) => kvs.get(`check:${issueKey}`);

export const saveResponse = (issueKey, decisionId, response) =>
  kvs.set(`resp:${issueKey}:${decisionId}`, { ...response, issueKey, decisionId, at: new Date().toISOString() });

export async function responsesFor(issueKey) {
  const page = await kvs.query().where('key', WhereConditions.beginsWith(`resp:${issueKey}:`)).limit(50).getMany();
  return page.results.map((r) => r.value);
}

export async function bumpStats(delta) {
  const stats = (await kvs.get('meta:stats')) || {};
  for (const [k, v] of Object.entries(delta)) stats[k] = (stats[k] || 0) + v;
  await kvs.set('meta:stats', stats);
  return stats;
}

export const getStats = async () => (await kvs.get('meta:stats')) || {};
export const setMeta = (name, value) => kvs.set(`meta:${name}`, value);
export const getMeta = (name) => kvs.get(`meta:${name}`);

/** Delete everything Precedent stored (developer reset; not reachable from the UI). */
export async function resetAll() {
  let deleted = 0;
  for (const prefix of ['dec:', 'src:', 'check:', 'resp:', 'meta:', 'seq']) {
    let page;
    do {
      page = await kvs.query().where('key', WhereConditions.beginsWith(prefix)).limit(100).getMany();
      for (const r of page.results) {
        await kvs.delete(r.key);
        deleted += 1;
      }
    } while (page.results.length);
  }
  return { deleted };
}
