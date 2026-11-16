// Forge entry points: Rovo actions (also exposed as MCP tools), the Jira trigger,
// the scheduled sync, UI resolvers and the evaluation web trigger.

import * as ResolverModule from '@forge/resolver';
import * as svc from './service.js';
import * as store from './platform/store.js';
import { syncFromConfluence } from './platform/confluence.js';
import { addAppComment, addUserComment, linkDecision } from './platform/jira.js';
import { conflictComment, findingsToText } from './core/format.js';
import { evaluate, sampleRecords } from './core/evaluate.js';
import { SAMPLE_DECISIONS, SAMPLE_MEETING } from './data/sample-decisions.js';
import { EVAL_CASES } from './data/eval-cases.js';
import { HOLDOUT_CASES } from './data/eval-holdout.js';
import { EVAL_RESULTS } from './data/eval-results.js';
import { chat } from './platform/llm.js';

// @forge/resolver is CommonJS; depending on the bundler's interop the class is the default
// export or nested one level deeper.
const Resolver = [ResolverModule.default, ResolverModule.default?.default, ResolverModule]
  .find((x) => typeof x === 'function');

const asText = (obj) => JSON.stringify(obj, null, 1);

// ---------------------------------------------------------------- Rovo actions / MCP tools

export async function findDecisionsAction(payload) {
  const query = String(payload.query || '').trim();
  if (!query) return 'Please give a topic or question to search the decision log for.';
  const matches = await svc.findDecisions(query);
  if (!matches.length) {
    return `No recorded decision found for "${query}". Say so plainly; do not guess what the team decided.`;
  }
  return asText({ query, matches });
}

export async function getDecisionAction(payload) {
  const d = await store.getDecision(payload.decisionId || '');
  const visible = d ? await svc.decisionsFor() : [];
  if (!d || !visible.some((v) => v.id === d.id)) return `No decision ${payload.decisionId} found that you can view.`;
  const people = await svc.peopleFor(d, payload.context?.cloudId);
  return asText({ ...svc.summarize(d), peopleToAsk: people });
}

export async function checkIssueAction(payload) {
  const issueKey = payload.issueKey || payload.context?.jira?.issueKey;
  if (!issueKey) return 'Which Jira issue should I check? Give an issue key such as PLAT-123.';
  const { check, decisions } = await svc.checkIssue(issueKey);
  const byId = new Map(decisions.map((d) => [d.id, d]));
  return `${issueKey}: ${findingsToText(check.findings, byId)}\n` +
    `(${check.candidates} decisions considered; ${check.rejectedCount} model findings discarded because their quotes did not check out.)`;
}

export async function checkTextAction(payload) {
  const text = String(payload.proposal || '').trim();
  if (!text) return 'Please describe the proposed work or change to check.';
  const { findings, rejected, candidates, decisions } = await svc.checkText(text);
  const byId = new Map(decisions.map((d) => [d.id, d]));
  return `${findingsToText(findings, byId)}\n(${candidates} decisions considered; ${rejected.length} unverified findings discarded.)`;
}

export async function revisitAction(payload) {
  const res = await svc.revisitCandidates({ decisionId: payload.decisionId });
  if (!res.candidates.length) return `Reviewed ${res.reviewed} decision(s): no evidence that a "revisit if" condition has happened.`;
  return asText(res);
}

export async function recordDecisionAction(payload, context) {
  const title = String(payload.title || '').trim();
  const decision = String(payload.decision || '').trim();
  if (!title || !decision) return 'A decision needs a title and the decision itself.';
  const stored = await store.upsertDecision({
    key: `rovo:${Date.now()}`,
    title,
    decision,
    rationale: String(payload.rationale || ''),
    alternatives: payload.alternatives ? String(payload.alternatives).split(/;|\n/).map((s) => s.trim()).filter(Boolean) : [],
    revisitIf: payload.revisitIf ? String(payload.revisitIf).split(/;|\n/).map((s) => s.trim()).filter(Boolean) : [],
    status: 'active',
    statusText: 'Accepted (recorded via Rovo)',
    decidedOn: new Date().toISOString().slice(0, 10),
    ownerAccountId: context?.principal?.accountId || null,
    source: { kind: 'rovo', title, url: payload.sourceUrl || null },
  });
  await store.bumpStats({ recorded: 1 });
  return `Recorded ${stored.id}: ${stored.title}. It will now be checked against new Jira issues.`;
}

export async function syncAction() {
  const s = await syncFromConfluence();
  return `Synced ${s.pages} Confluence pages into ${s.decisions} decisions (${s.extractedByLlm} extracted by AI, ${s.skipped} skipped, ${s.errors.length} errors).`;
}

// ---------------------------------------------------------------- Jira trigger and schedule

export async function onIssueCreated(event) {
  const issueKey = event?.issue?.key;
  if (!issueKey) return;
  try {
    const { check, decisions } = await svc.checkIssue(issueKey, { asApp: true });
    if (!check.findings.length) return;
    const byId = new Map(decisions.map((d) => [d.id, d]));
    await addAppComment(issueKey, conflictComment(check.findings, byId));
    await store.bumpStats({ comments: 1 });
  } catch (e) {
    console.error(`Precedent check failed for ${issueKey}: ${e.message}`);
  }
}

export async function scheduledSync() {
  const s = await syncFromConfluence();
  console.log(`Scheduled sync: ${s.decisions} decisions from ${s.pages} pages`);
}

// ---------------------------------------------------------------- UI resolvers

const resolver = new Resolver();

resolver.define('getIssueState', async ({ payload, context }) => {
  const issueKey = payload.issueKey || context.extension?.issue?.key;
  const [check, responses, visible] = await Promise.all([
    store.getCheck(issueKey), store.responsesFor(issueKey), svc.decisionsFor(),
  ]);
  return enrich(issueKey, check, responses, visible, context.cloudId);
});

resolver.define('runIssueCheck', async ({ payload, context }) => {
  const issueKey = payload.issueKey || context.extension?.issue?.key;
  const { check, decisions } = await svc.checkIssue(issueKey, { accountId: context.accountId });
  return enrich(issueKey, check, await store.responsesFor(issueKey), decisions, context.cloudId);
});

async function enrich(issueKey, check, responses, visible, cloudId) {
  const byId = new Map(visible.map((d) => [d.id, d]));
  const findings = [];
  console.log(`enrich ${issueKey} cloudId=${cloudId ? 'set' : 'missing'}`);
  for (const f of check?.findings || []) {
    const d = byId.get(f.id);
    if (!d) continue; // the viewer cannot see this decision's page
    findings.push({ ...f, decision: svc.summarize(d), sourceUrl: d.source?.url || null, people: await svc.peopleFor(d, cloudId) });
  }
  return { issueKey, checkedAt: check?.at || (check ? 'yes' : null), candidates: check?.candidates || 0, rejectedCount: check?.rejectedCount || 0, findings, responses, decisionCount: visible.length };
}

resolver.define('respond', async ({ payload, context }) => {
  const { issueKey, decisionId, action } = payload;
  const reason = String(payload.reason || '').trim();
  const d = await store.getDecision(decisionId);
  if (!d) throw new Error('Unknown decision');
  if (action === 'link') {
    await linkDecision(issueKey, d);
  } else if (action === 'override') {
    if (reason.length < 10) throw new Error('Please give a reason of at least 10 characters.');
    await addUserComment(issueKey, `Proceeding despite ${d.id} (${d.title}). Reason: ${reason}`);
  } else if (action === 'reopen') {
    if (reason.length < 10) throw new Error('Please say why the decision should be reopened (10+ characters).');
    await store.setDecisionStatus(d.id, 'revisit', `Reopened from ${issueKey}: ${reason}`);
    await addUserComment(issueKey, `Reopening ${d.id} (${d.title}) for discussion. Reason: ${reason}`);
  } else {
    throw new Error('Unknown action');
  }
  await store.saveResponse(issueKey, d.id, { action, reason, by: context.accountId });
  await store.bumpStats({ [action]: 1 });
  return { ok: true };
});

resolver.define('getRegister', async () => {
  const [decisions, stats, sync] = await Promise.all([svc.decisionsFor(), store.getStats(), store.getMeta('sync')]);
  return { decisions: decisions.map(svc.summarize), stats, sync, evalResults: EVAL_RESULTS };
});

resolver.define('syncNow', async () => syncFromConfluence());
resolver.define('loadSamples', async () => ({ loaded: await svc.loadSamples() }));
resolver.define('reviewDecision', async ({ payload }) => svc.revisitCandidates({ decisionId: payload.decisionId }));
resolver.define('askDecisions', async ({ payload }) => svc.findDecisions(String(payload.query || '')));

export const handler = resolver.getDefinitions();

// ---------------------------------------------------------------- Evaluation web trigger
// Developer-only operations, run inside Forge because the LLM is only reachable here:
//   op=eval (default) a slice of the labelled set · op=sync · op=decisions · op=check&issue=KEY · op=people&id=DEC-n&cloud=ID&user=ACCOUNT · op=reset
// Disabled unless the EVAL_TOKEN environment variable is set: `forge variables set EVAL_TOKEN ...`.

export async function evalTrigger(request) {
  const params = request.queryParameters || {};
  const token = process.env.EVAL_TOKEN;
  if (!token || params.token?.[0] !== token) return { statusCode: 404, body: 'Not found' };
  const op = params.op?.[0] || 'eval';
  const json = (body) => ({ statusCode: 200, headers: { 'Content-Type': ['application/json'] }, body: JSON.stringify(body) });
  if (op === 'sync') return json(await syncFromConfluence());
  if (op === 'reset') return json(await store.resetAll());
  if (op === 'people') {
    const d = await store.getDecision(params.id?.[0] || 'DEC-1');
    return json(await svc.peopleFor(d, params.cloud?.[0], params.user?.[0]));
  }
  if (op === 'decisions') return json((await store.allDecisions()).map(svc.summarize));
  if (op === 'check') {
    await onIssueCreated({ issue: { key: params.issue?.[0] } });
    return json(await store.getCheck(params.issue?.[0]));
  }
  const from = Number(params.from?.[0] || 0);
  const to = Number(params.to?.[0] || from + 3);
  const decisions = sampleRecords(SAMPLE_DECISIONS, SAMPLE_MEETING);
  const cases = params.set?.[0] === 'holdout' ? HOLDOUT_CASES : EVAL_CASES;
  const report = await evaluate(decisions, cases.slice(from, to), chat);
  return { statusCode: 200, headers: { 'Content-Type': ['application/json'] }, body: JSON.stringify(report) };
}
