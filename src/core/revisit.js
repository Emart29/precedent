// "Is this decision still valid?" Each decision can list "revisit if" conditions.
// Given recent work items (evidence), ask the LLM whether any condition has now happened,
// and keep only answers whose quotes check out against the condition and the evidence.

import { containsQuote, clip, tokenize } from './text.js';
import { parseJson } from './conflict.js';

/** Search words for finding evidence about a decision's revisit conditions. */
export function evidenceTerms(decision) {
  const counts = new Map();
  for (const t of tokenize((decision.revisitIf || []).join(' '))) counts.set(t, (counts.get(t) || 0) + 1);
  // Prefer distinctive words: longer first, then by frequency.
  return [...counts.keys()].sort((a, b) => b.length - a.length).slice(0, 5);
}

export function buildRevisitMessages(decision, evidence) {
  const items = evidence.map((e) => `### ${e.key}\n${clip(e.text, 800)}`).join('\n\n');
  return [
    {
      role: 'system',
      content: 'You check whether a team decision should be revisited. A decision lists "revisit if" conditions. ' +
        'Report a condition only when an evidence item states, as a fact, that the condition has happened. ' +
        'Plans, questions and guesses do not count. Quote the condition and the evidence verbatim. Reply with JSON only.',
    },
    {
      role: 'user',
      content: `Decision ${decision.id}: ${decision.title}\n${decision.decision}\nRevisit if:\n- ${(decision.revisitIf || []).join('\n- ')}\n\n` +
        `Evidence:\n\n${items}\n\nReturn JSON: {"met":[{"evidence":"ISSUE-KEY","condition_quote":"...","evidence_quote":"...","explanation":"one sentence"}]}`,
    },
  ];
}

export function verifyRevisit(raw, decision, evidence) {
  const byKey = new Map(evidence.map((e) => [e.key, e]));
  const conditions = (decision.revisitIf || []).join('\n');
  return (raw?.met || []).filter((m) => {
    const e = byKey.get(m.evidence);
    return e && containsQuote(conditions, m.condition_quote) && containsQuote(e.text, m.evidence_quote);
  }).map((m) => ({
    evidence: m.evidence,
    conditionQuote: m.condition_quote,
    evidenceQuote: m.evidence_quote,
    explanation: clip(m.explanation || '', 240),
  }));
}

export async function reviewDecision(decision, evidence, chat) {
  if (!decision.revisitIf?.length || !evidence.length) return [];
  const reply = await chat(buildRevisitMessages(decision, evidence));
  return verifyRevisit(parseJson(reply), decision, evidence);
}
