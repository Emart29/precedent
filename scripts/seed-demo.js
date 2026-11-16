// Seeds a Confluence space with the Kestrel sample decisions as real pages, for demos.
// Each decision becomes an ADR-style page labelled "decision"; the meeting notes page is
// labelled "meeting-notes" and uses Confluence decision items.
//
//   ATLASSIAN_EMAIL=you@example.com ATLASSIAN_API_TOKEN=... SITE=your-site.atlassian.net \
//   OWNER_ACCOUNT_ID=<your account id> node scripts/seed-demo.js
//
// Uses the Confluence REST API through api.atlassian.com with an API token.

import { SAMPLE_DECISIONS, SAMPLE_MEETING } from '../src/data/sample-decisions.js';

const { ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN, SITE, OWNER_ACCOUNT_ID } = process.env;
const SPACE_KEY = process.env.SPACE_KEY || 'KES';
if (!ATLASSIAN_EMAIL || !ATLASSIAN_API_TOKEN || !SITE) {
  console.error('Set ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN and SITE.');
  process.exit(1);
}

const auth = 'Basic ' + Buffer.from(`${ATLASSIAN_EMAIL}:${ATLASSIAN_API_TOKEN}`).toString('base64');
const { cloudId } = await (await fetch(`https://${SITE}/_edge/tenant_info`)).json();
const base = `https://api.atlassian.com/ex/confluence/${cloudId}`;

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const txt = (text, marks) => (marks ? { type: 'text', text, marks } : { type: 'text', text });
const p = (...content) => ({ type: 'paragraph', content });
const h = (text) => ({ type: 'heading', attrs: { level: 2 }, content: [txt(text)] });
const ul = (items) => ({ type: 'bulletList', content: items.map((i) => ({ type: 'listItem', content: [p(txt(i))] })) });
const mention = (id) => ({ type: 'mention', attrs: { id } });

function adrBody(d) {
  const content = [
    { type: 'panel', attrs: { panelType: 'info' }, content: [p(txt('Decision record. Sample data for the fictional company Kestrel.', [{ type: 'em' }]))] },
    h('Status'), p(txt(d.statusText)),
    h('Decision'), p(txt(d.decision)),
    h('Why'), p(txt(d.rationale)),
  ];
  if (d.alternatives.length) content.push(h('Alternatives considered'), ul(d.alternatives));
  if (d.revisitIf.length) content.push(h('Revisit if'), ul(d.revisitIf));
  content.push(h('Owner'), p(OWNER_ACCOUNT_ID ? mention(OWNER_ACCOUNT_ID) : txt('Payments platform team')));
  content.push(h('Date'), p(txt(d.decidedOn)));
  return { version: 1, type: 'doc', content };
}

function meetingBody(m) {
  let n = 0;
  const item = (text, state) => ({ type: 'decisionItem', attrs: { localId: `d${++n}`, state }, content: [txt(text)] });
  return {
    version: 1, type: 'doc', content: [
      h('Attendees'), p(txt('Payments squad, Finance, Support lead')),
      h('Discussion'), ul(['Refund fraud review for Q3', 'USSD payments request from field sales']),
      h('Decisions'), { type: 'decisionList', attrs: { localId: 'dl1' }, content: [
        ...m.decided.map((t) => item(t, 'DECIDED')),
        ...m.undecided.map((t) => item(t, 'UNDECIDED')),
      ] },
    ],
  };
}

// 1. Space
let space = (await call('GET', `/wiki/api/v2/spaces?keys=${SPACE_KEY}`)).results?.[0];
if (!space) {
  await call('POST', '/wiki/rest/api/space', { key: SPACE_KEY, name: 'Kestrel Engineering', description: { plain: { value: 'Decision log for the fictional company Kestrel (sample data).', representation: 'plain' } } });
  space = (await call('GET', `/wiki/api/v2/spaces?keys=${SPACE_KEY}`)).results[0];
}
console.log(`Space ${SPACE_KEY} (${space.id})`);

// 2. Pages (skips titles that already exist)
async function upsertPage(title, body, label) {
  const existing = (await call('GET', `/wiki/api/v2/spaces/${space.id}/pages?title=${encodeURIComponent(title)}`)).results?.[0];
  if (existing) return console.log(`exists  ${title}`);
  const page = await call('POST', '/wiki/api/v2/pages', {
    spaceId: space.id, status: 'current', title,
    body: { representation: 'atlas_doc_format', value: JSON.stringify(body) },
  });
  await call('POST', `/wiki/rest/api/content/${page.id}/label`, [{ prefix: 'global', name: label }]);
  console.log(`created ${title}`);
}

for (const d of SAMPLE_DECISIONS) await upsertPage(`DEC: ${d.title}`, adrBody(d), 'decision');
await upsertPage(SAMPLE_MEETING.title, meetingBody(SAMPLE_MEETING), 'meeting-notes');
console.log('Done. Open the Precedent decision register in Jira and press "Sync from Confluence".');
