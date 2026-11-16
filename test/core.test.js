import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, containsQuote, normalize } from '../src/core/text.js';
import { toBlocks } from '../src/core/adf.js';
import { parsePage, normalizeStatus, cleanTitle } from '../src/core/parse.js';
import { buildIndex, confidentMatches } from '../src/core/retrieval.js';
import { verifyFindings, parseJson, checkWork, selectCandidates } from '../src/core/conflict.js';
import { conflictComment } from '../src/core/format.js';

const h = (text, level = 2) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] });
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const doc = (...content) => ({ type: 'doc', version: 1, content });

const adr = {
  id: '101', title: 'DEC: Stay on PayPal for merchant payouts', url: 'https://x/101', authorId: 'acc-1', createdAt: '2026-03-03T10:00:00Z',
  labels: ['decision'],
  body: doc(
    h('Status'), para('Accepted'),
    h('Decision'), para('We keep PayPal as the payout provider for all merchants in Nigeria and Ghana.'),
    h('Why'), para('PayPal supports local bank payouts in NGN; Stripe does not offer payouts to Nigerian banks.'),
    h('Alternatives considered'), { type: 'bulletList', content: [{ type: 'listItem', content: [para('Stripe Connect')] }, { type: 'listItem', content: [para('Flutterwave')] }] },
    h('Revisit if'), para('Stripe launches payouts to Nigerian bank accounts.'),
  ),
};

test('tokenize stems and drops stopwords', () => {
  assert.deepEqual(tokenize('We are migrating the payouts to Stripe'), ['migrat', 'payout', 'strip']);
  assert.deepEqual(tokenize('migrate payout'), tokenize('migrating payouts'));
});

test('containsQuote ignores case, curly quotes and outer punctuation', () => {
  assert.ok(containsQuote('We keep PayPal as the payout provider.', '“we keep paypal as the payout provider”'));
  assert.ok(!containsQuote('We keep PayPal as the payout provider.', 'we drop paypal'));
  assert.ok(!containsQuote('abc', 'ab'), 'too-short quotes are rejected');
  assert.equal(normalize('a—b'), 'a-b');
});

test('parsePage reads an ADR-style page', () => {
  const { records, needsExtraction } = parsePage(adr);
  assert.equal(needsExtraction, false);
  assert.equal(records.length, 1);
  const r = records[0];
  assert.equal(r.title, 'Stay on PayPal for merchant payouts');
  assert.match(r.decision, /keep PayPal/);
  assert.deepEqual(r.alternatives, ['Stripe Connect', 'Flutterwave']);
  assert.deepEqual(r.revisitIf, ['Stripe launches payouts to Nigerian bank accounts.']);
  assert.equal(r.status, 'active');
  assert.equal(r.decidedOn, '2026-03-03');
  assert.equal(r.ownerAccountId, 'acc-1');
});

test('parsePage reads decision items from meeting notes', () => {
  const page = { id: '7', title: 'Weekly sync', body: doc(h('Decisions'), { type: 'decisionList', content: [
    { type: 'decisionItem', attrs: { state: 'DECIDED' }, content: [{ type: 'text', text: 'Use Postgres for the ledger service' }] },
    { type: 'decisionItem', attrs: { state: 'UNDECIDED' }, content: [{ type: 'text', text: 'Maybe move to Kafka' }] },
  ] }) };
  const { records } = parsePage(page);
  assert.equal(records.length, 1);
  assert.equal(records[0].decision, 'Use Postgres for the ledger service');
});

test('unstructured decision pages are flagged for extraction', () => {
  const { records, needsExtraction } = parsePage({ id: '9', title: 'Notes', labels: ['decision'], body: doc(para('We talked about caching.')) });
  assert.equal(records.length, 0);
  assert.equal(needsExtraction, true);
});

test('status and title helpers', () => {
  assert.equal(normalizeStatus('Superseded by DEC-9'), 'superseded');
  assert.equal(normalizeStatus('Proposed'), 'proposed');
  assert.equal(normalizeStatus('Accepted'), 'active');
  assert.equal(cleanTitle('ADR-12: Use GraphQL'), 'Use GraphQL');
});

const decisions = [
  { id: 'DEC-1', ...parsePage(adr).records[0] },
  { id: 'DEC-2', title: 'REST only for public APIs', decision: 'Public APIs stay REST with OpenAPI specs; no GraphQL gateway.', status: 'active', alternatives: ['GraphQL federation'], revisitIf: [] },
  { id: 'DEC-3', title: 'Old logging vendor', decision: 'Use Loggly.', status: 'superseded' },
];

test('BM25 finds the right decision and skips superseded ones', () => {
  const idx = buildIndex(decisions);
  const hits = idx.search('Should we add a GraphQL gateway for the public API?');
  assert.equal(hits[0].decision.id, 'DEC-2');
  assert.equal(idx.search('loggly').length, 0);
  assert.equal(confidentMatches(idx.search('office snacks budget')).length, 0);
});

test('verifyFindings drops invented quotes and unknown ids', () => {
  const work = 'Migrate merchant payouts from PayPal to Stripe Connect next sprint.';
  const raw = { findings: [
    { id: 'DEC-1', relation: 'conflict', decision_quote: 'We keep PayPal as the payout provider', work_quote: 'Migrate merchant payouts from PayPal to Stripe Connect', explanation: 'Reverses the payout decision.' },
    { id: 'DEC-1', relation: 'conflict', decision_quote: 'PayPal is mandatory forever', work_quote: 'Migrate merchant payouts', explanation: 'x' },
    { id: 'DEC-99', relation: 'conflict', decision_quote: 'a', work_quote: 'b', explanation: 'x' },
  ] };
  const { findings, rejected } = verifyFindings(raw, work, decisions);
  assert.equal(findings.length, 1);
  assert.equal(rejected.length, 2);
  assert.equal(rejected[0].reason, 'decision quote not found in decision');
});

test('parseJson tolerates fences and Forge LLM content arrays', () => {
  assert.deepEqual(parseJson('```json\n{"findings":[]}\n```'), { findings: [] });
  assert.deepEqual(parseJson([{ type: 'text', text: '{"a":1}' }]), { a: 1 });
  assert.equal(parseJson('no json'), null);
});

test('checkWork wires candidates, model and verification', async () => {
  let seen;
  const chat = async (messages) => {
    seen = messages;
    return JSON.stringify({ findings: [{ id: 'DEC-1', relation: 'conflict', decision_quote: 'We keep PayPal as the payout provider', work_quote: 'move payouts to Stripe', explanation: 'Contradicts DEC-1.' }] });
  };
  const res = await checkWork('Proposal: move payouts to Stripe in Q3.', decisions, chat);
  assert.equal(res.findings.length, 1);
  assert.equal(res.candidates, 2, 'superseded decisions are not candidates');
  assert.match(seen[1].content, /DEC-1: Stay on PayPal/);
  assert.equal(selectCandidates(decisions, 'x', { allBelow: 0, topK: 5 }).length, 0);
});

test('conflictComment produces ADF with quotes and owner mention', () => {
  const byId = new Map(decisions.map((d) => [d.id, d]));
  const adf = conflictComment([{ id: 'DEC-1', relation: 'conflict', decisionQuote: 'We keep PayPal', workQuote: 'move payouts to Stripe', explanation: 'Reverses it.' }], byId);
  const json = JSON.stringify(adf);
  assert.match(json, /"panelType":"warning"/);
  assert.match(json, /"type":"mention","attrs":\{"id":"acc-1"\}/);
  assert.match(json, /move payouts to Stripe/);
});

test('quotes copied from the prompt rendering (with labels) are accepted', () => {
  const work = 'PayRail fees go up to 2.4% from January.';
  const d = { id: 'DEC-1', title: 'Keep PayRail', decision: 'We keep PayRail.', revisitIf: ['PayRail payout fees rise above 2% per transaction', 'Settla gets a licence'], status: 'active' };
  const raw = { findings: [{ id: 'DEC-1', relation: 'revisit_signal', decision_quote: 'Revisit if: PayRail payout fees rise above 2% per transaction; Settla', work_quote: 'PayRail fees go up to 2.4%', explanation: 'Condition met.' }] };
  assert.equal(verifyFindings(raw, work, [d]).findings.length, 1);
});
