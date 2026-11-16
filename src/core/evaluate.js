// Scores the conflict checker against the labelled set in src/data/eval-cases.js.
// Reported twice: with quote verification (what Precedent ships) and without it
// (every finding the model proposed), to show what verification buys.

import { checkWork } from './conflict.js';

/** Give sample decisions stable ids (DEC-1..n) the same way the app does on first load. */
export function sampleRecords(samples, meeting) {
  const records = samples.map((s, i) => ({
    ...s,
    id: `DEC-${i + 1}`,
    status: /supersed/i.test(s.statusText) ? 'superseded' : /propos/i.test(s.statusText) ? 'proposed' : 'active',
    source: { kind: 'sample', title: s.title },
  }));
  if (meeting) {
    meeting.decided.forEach((text, j) => {
      records.push({
        key: `meeting:${j}`, id: `DEC-${records.length + 1}`, title: text.slice(0, 90), decision: text,
        rationale: `Recorded in "${meeting.title}".`, alternatives: [], revisitIf: [], status: 'active',
        statusText: 'Decided', source: { kind: 'sample', title: meeting.title },
      });
    });
  }
  return records;
}

function score(cases, predictedByCase, relation) {
  let tp = 0; let fp = 0; let fn = 0;
  for (const c of cases) {
    const want = new Set(c.expect.filter((e) => e.relation === relation).map((e) => e.key));
    const got = new Set((predictedByCase.get(c.id) || []).filter((f) => f.relation === relation).map((f) => f.key));
    for (const k of got) (want.has(k) ? tp++ : fp++);
    for (const k of want) if (!got.has(k)) fn++;
  }
  const precision = tp + fp ? tp / (tp + fp) : 1;
  const recall = tp + fn ? tp / (tp + fn) : 1;
  return { tp, fp, fn, precision: round(precision), recall: round(recall) };
}

const round = (x) => Math.round(x * 1000) / 1000;

function falseAlarmRate(cases, predictedByCase) {
  const quiet = cases.filter((c) => c.expect.length === 0);
  const alarmed = quiet.filter((c) => (predictedByCase.get(c.id) || []).length > 0);
  return { cases: quiet.length, alarmed: alarmed.length, rate: round(alarmed.length / Math.max(quiet.length, 1)), ids: alarmed.map((c) => c.id) };
}

/**
 * @param {object[]} decisions records with id + key
 * @param {object[]} cases EVAL_CASES
 * @param {(messages) => Promise<string>} chat
 */
export async function evaluate(decisions, cases, chat, { onCase } = {}) {
  const keyById = new Map(decisions.map((d) => [d.id, d.key]));
  const verified = new Map();
  const unverified = new Map();
  const details = [];
  for (const c of cases) {
    const res = await checkWork(c.text, decisions, chat);
    const toKeyed = (f) => ({ key: keyById.get(f.id), relation: f.relation, id: f.id });
    verified.set(c.id, res.findings.map(toKeyed));
    const raw = [...res.findings, ...res.rejected.filter((r) => keyById.has(String(r.id)) && ['conflict', 'revisit_signal'].includes(r.relation))];
    unverified.set(c.id, raw.map(toKeyed));
    const row = {
      id: c.id, group: c.group,
      expected: c.expect.map((e) => `${e.relation}:${e.key}`),
      got: verified.get(c.id).map((f) => `${f.relation}:${f.key}`),
      raw: unverified.get(c.id).map((f) => `${f.relation}:${f.key}`),
      rejected: res.rejected.map((r) => `${r.id || '?'}: ${r.reason}`),
    };
    details.push(row);
    if (onCase) onCase(row);
  }
  return {
    cases: cases.length,
    withVerification: {
      conflict: score(cases, verified, 'conflict'),
      revisit: score(cases, verified, 'revisit_signal'),
      falseAlarms: falseAlarmRate(cases, verified),
    },
    withoutVerification: {
      conflict: score(cases, unverified, 'conflict'),
      revisit: score(cases, unverified, 'revisit_signal'),
      falseAlarms: falseAlarmRate(cases, unverified),
    },
    details,
  };
}


/**
 * Recompute metrics from per-case rows (used to merge results from several web trigger calls).
 * @param {object[]} rows evaluate().details from one or more runs
 */
export function scoreRows(rows) {
  const parse = (list) => list.map((s) => { const [relation, ...k] = s.split(':'); return { relation, key: k.join(':') }; });
  const cases = rows.map((r) => ({ id: r.id, expect: parse(r.expected) }));
  const verified = new Map(rows.map((r) => [r.id, parse(r.got)]));
  const unverified = new Map(rows.map((r) => [r.id, parse(r.raw)]));
  const byGroup = {};
  for (const r of rows) {
    const g = (byGroup[r.group] ||= { cases: 0, correct: 0 });
    g.cases += 1;
    if ([...r.expected].sort().join() === [...r.got].sort().join()) g.correct += 1;
  }
  return {
    cases: rows.length,
    withVerification: { conflict: score(cases, verified, 'conflict'), revisit: score(cases, verified, 'revisit_signal'), falseAlarms: falseAlarmRate(cases, verified) },
    withoutVerification: { conflict: score(cases, unverified, 'conflict'), revisit: score(cases, unverified, 'revisit_signal'), falseAlarms: falseAlarmRate(cases, unverified) },
    byGroup,
  };
}
