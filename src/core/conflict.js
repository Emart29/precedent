// Conflict checking: does a piece of new work contradict a recorded decision?
//
// Pipeline
//   1. pick candidate decisions (all active ones on small sites, BM25 top-k otherwise)
//   2. ask the LLM for findings, each with a verbatim quote from the decision AND the work
//   3. verify every quote against the real text; findings that fail are dropped, never shown
//
// Step 3 is what keeps Precedent from inventing decisions or misquoting people: a finding is
// only reported when both quotes can be found word for word.

import { buildIndex } from './retrieval.js';
import { decisionText } from './parse.js';
import { containsQuote, clip } from './text.js';

export const RELATIONS = ['conflict', 'revisit_signal'];

/** Decisions worth checking new work against. */
export function selectCandidates(decisions, workText, { allBelow = 40, topK = 8 } = {}) {
  const live = decisions.filter((d) => d.status !== 'superseded' && d.status !== 'proposed');
  if (live.length <= allBelow) return live;
  const index = buildIndex(live);
  return index.search(workText, { limit: topK }).map((r) => r.decision);
}

const SYSTEM = `You check new work items against a team's recorded decisions.
You are strict: only report a finding when the work item, if done as written, would clearly
contradict, reverse or ignore a recorded decision ("conflict"), or when the work item states a
fact showing that one of the decision's "revisit if" conditions has now happened ("revisit_signal").
Work that merely touches the same topic, that is compatible with the decision, or that fixes something
so it follows the decision, is NOT a finding.
Every finding must include two short verbatim quotes copied exactly, character for character:
- decision_quote: from the decision text
- work_quote: from the work item text
If nothing qualifies, return {"findings": []}. Reply with JSON only, no prose.`;

/** Build the chat messages for the LLM. */
/** How a decision is shown to the model. Quotes are verified against this text too. */
export function renderDecision(d) {
  return [
    `### ${d.id}: ${d.title}`,
    `Decision: ${clip(d.decision, 900)}`,
    d.rationale ? `Why: ${clip(d.rationale, 600)}` : '',
    d.alternatives?.length ? `Alternatives rejected: ${clip(d.alternatives.join('; '), 400)}` : '',
    d.revisitIf?.length ? `Revisit if: ${clip(d.revisitIf.join('; '), 400)}` : '',
  ].filter(Boolean).join('\n');
}

/** Build the chat messages for the LLM. */
export function buildMessages(workText, candidates) {
  const decisionsBlock = candidates.map(renderDecision).join('\n\n');
  const user = `Recorded decisions:\n\n${decisionsBlock}\n\n---\nNew work item:\n${clip(workText, 3000)}\n---\n` +
    `Return JSON: {"findings":[{"id":"DEC-n","relation":"conflict"|"revisit_signal",` +
    `"decision_quote":"...","work_quote":"...","explanation":"one sentence"}]}`;
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: user },
  ];
}

/** Pull the first JSON object out of a model reply (tolerates code fences and stray prose). */
export function parseJson(reply) {
  const text = Array.isArray(reply) ? reply.map((p) => p.text || '').join('') : String(reply || '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Keep only findings whose quotes are real.
 * @returns {{ findings: object[], rejected: object[] }}
 */
export function verifyFindings(raw, workText, candidates) {
  const byId = new Map(candidates.map((d) => [d.id, d]));
  const findings = [];
  const rejected = [];
  const seen = new Set();
  for (const f of raw?.findings || []) {
    const d = byId.get(String(f.id || '').trim());
    let reason = null;
    if (!d) reason = 'unknown decision id';
    else if (!RELATIONS.includes(f.relation)) reason = 'unknown relation';
    else if (!containsQuote(`${decisionText(d)}\n${renderDecision(d)}`, f.decision_quote)) reason = 'decision quote not found in decision';
    else if (!containsQuote(workText, f.work_quote)) reason = 'work quote not found in work item';
    else if (seen.has(d.id)) reason = 'duplicate';
    if (reason) {
      rejected.push({ ...f, reason });
      continue;
    }
    seen.add(d.id);
    findings.push({
      id: d.id,
      relation: f.relation,
      decisionQuote: String(f.decision_quote).trim().replace(/^(revisit if|decision|why|alternatives rejected):\s*/i, ''),
      workQuote: String(f.work_quote).trim(),
      explanation: clip(f.explanation || '', 300),
    });
  }
  return { findings, rejected };
}

/**
 * Full check. `chat` is injected (Forge LLM in production, a stub in tests).
 * @param {string} workText summary + description of the new work
 * @param {object[]} decisions all decision records
 * @param {(messages) => Promise<string|Array>} chat
 */
export async function checkWork(workText, decisions, chat) {
  const candidates = selectCandidates(decisions, workText);
  if (!candidates.length || !String(workText || '').trim()) {
    return { findings: [], rejected: [], candidates: 0 };
  }
  const reply = await chat(buildMessages(workText, candidates));
  const parsed = parseJson(reply);
  if (!parsed) return { findings: [], rejected: [{ reason: 'unparseable model reply' }], candidates: candidates.length };
  return { ...verifyFindings(parsed, workText, candidates), candidates: candidates.length };
}
