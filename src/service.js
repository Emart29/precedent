// Application services shared by the Rovo actions, the MCP tools, the issue panel and the trigger.

import { checkWork } from './core/conflict.js';
import { buildIndex, confidentMatches } from './core/retrieval.js';
import { reviewDecision, evidenceTerms } from './core/revisit.js';
import { sampleRecords } from './core/evaluate.js';
import { SAMPLE_DECISIONS, SAMPLE_MEETING } from './data/sample-decisions.js';
import { chat } from './platform/llm.js';
import * as store from './platform/store.js';
import { visibleTo } from './platform/access.js';
import { getIssueText, searchRecentIssues } from './platform/jira.js';
import { decisionPeople } from './platform/twg.js';
import { syncFromConfluence } from './platform/confluence.js';

/**
 * All stored decisions. Each Forge installation (Jira, Confluence) has its own storage, so an
 * installation that has never synced reads Confluence on first use instead of answering from
 * an empty log. Retried at most every 10 minutes.
 */
async function loadDecisions() {
  let decisions = await store.allDecisions();
  if (decisions.length) return decisions;
  const last = await store.getMeta('sync');
  if (last && Date.now() - Date.parse(last.at) < 10 * 60 * 1000) return decisions;
  // Another request may already be syncing (several panels load at once): wait for it.
  const running = await store.getMeta('syncStarted');
  if (running && Date.now() - Date.parse(running) < 60 * 1000) {
    for (let i = 0; i < 15 && !decisions.length; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      decisions = await store.allDecisions();
    }
    return decisions;
  }
  await store.setMeta('syncStarted', new Date().toISOString());
  await syncFromConfluence();
  return store.allDecisions();
}

/** Decisions the person may see (defaults to the calling user). */
export async function decisionsFor(accountId) {
  return visibleTo(await loadDecisions(), accountId);
}

/** Compact, citation-friendly view of a decision for agents, MCP clients and the UI. */
export function summarize(d) {
  return {
    id: d.id,
    title: d.title,
    status: d.status,
    statusText: d.statusNote || d.statusText,
    decision: d.decision,
    why: d.rationale,
    alternativesRejected: d.alternatives || [],
    revisitIf: d.revisitIf || [],
    decidedOn: d.decidedOn || null,
    ownerAccountId: d.ownerAccountId || null,
    source: d.source?.url || (d.source?.kind === 'sample' ? 'sample decision (no page)' : null),
  };
}

/** "Did we already decide X?" Keyword search with a confidence floor; never guesses. */
export async function findDecisions(query, accountId) {
  const decisions = await decisionsFor(accountId);
  const index = buildIndex(decisions);
  const hits = confidentMatches(index.search(query, { limit: 5, includeSuperseded: true }));
  return hits.map((h) => ({ ...summarize(h.decision), matchedTerms: h.matched, score: h.score }));
}

/** Run a fresh conflict check on an issue. `asApp` is used by the trigger (no user present). */
export async function checkIssue(issueKey, { asApp = false, accountId } = {}) {
  const issue = await getIssueText(issueKey, asApp ? 'app' : undefined);
  const viewer = asApp ? issue.reporterId : accountId;
  const decisions = await decisionsFor(viewer);
  const result = await checkWork(issue.text, decisions, chat);
  const check = {
    issueKey,
    at: new Date().toISOString(),
    findings: result.findings,
    rejectedCount: result.rejected.length,
    candidates: result.candidates,
  };
  await store.saveCheck(issueKey, check);
  await store.bumpStats({
    checks: 1,
    conflicts: result.findings.filter((f) => f.relation === 'conflict').length,
    revisitSignals: result.findings.filter((f) => f.relation === 'revisit_signal').length,
    rejectedByVerification: result.rejected.length,
  });
  return { issue, check, decisions };
}

/** Check free text (a proposal pasted into Rovo chat, or sent by an MCP client). */
export async function checkText(text, accountId) {
  const decisions = await decisionsFor(accountId);
  const result = await checkWork(text, decisions, chat);
  await store.bumpStats({ checks: 1, rejectedByVerification: result.rejected.length });
  return { ...result, decisions };
}

/** Look for evidence that decisions' "revisit if" conditions have happened. */
export async function revisitCandidates({ decisionId, accountId, limit = 4 } = {}) {
  let decisions = (await decisionsFor(accountId)).filter((d) => d.status === 'active' && d.revisitIf?.length);
  if (decisionId) decisions = decisions.filter((d) => d.id === String(decisionId).toUpperCase());
  const out = [];
  for (const d of decisions.slice(0, decisionId ? 1 : limit)) {
    const evidence = await searchRecentIssues(evidenceTerms(d));
    const met = await reviewDecision(d, evidence, chat);
    if (met.length) out.push({ decision: summarize(d), met });
  }
  return { reviewed: Math.min(decisions.length, decisionId ? 1 : limit), candidates: out };
}

export async function peopleFor(decision, cloudId, accountId) {
  return decisionPeople(decision, cloudId, accountId);
}

/** Store the bundled Kestrel sample decisions (lets judges try the app on an empty site). */
export async function loadSamples() {
  const records = sampleRecords(SAMPLE_DECISIONS, SAMPLE_MEETING);
  for (const r of records) {
    const { id, ...rest } = r; // ids are allocated by the store
    await store.upsertDecision({ ...rest, source: { kind: 'sample', title: r.title } });
  }
  return records.length;
}
