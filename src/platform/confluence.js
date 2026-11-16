// Reads decisions out of Confluence and stores them as decision records.
//
// Which pages: pages labelled "decision" (one decision per page, ADR style) and pages
// labelled "meeting-notes" (their decision items). Everything runs as the app, so a
// scheduled sync works without a user present; what users can *see* is still checked
// on read (see access.js).

import { asApp, asUser, route } from '@forge/api';

import { parsePage } from '../core/parse.js';
import { containsQuote } from '../core/text.js';
import { parseJson } from '../core/conflict.js';
import { chat } from './llm.js';
import { upsertDecision, setMeta } from './store.js';

const api = { asApp, asUser };

const CQL = 'type = page AND label IN ("decision", "meeting-notes") ORDER BY created ASC';
const MAX_PAGES = 200;

async function json(res) {
  if (!res.ok) throw new Error(`Confluence ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Page ids matching the decision CQL, plus the site base URL (e.g. https://acme.atlassian.net/wiki). */
export async function findDecisionPages() {
  const ids = [];
  let base = null;
  for (let start = 0; start < MAX_PAGES; start += 50) {
    const body = await json(await api.asApp().requestConfluence(
      route`/wiki/rest/api/search?cql=${CQL}&limit=50&start=${start}`,
    ));
    base = base || body._links?.base || null;
    ids.push(...(body.results || []).map((r) => r.content?.id).filter(Boolean));
    if ((body.results || []).length < 50) break;
  }
  return { ids, base };
}

export async function getPage(id, base) {
  const p = await json(await api.asApp().requestConfluence(
    route`/wiki/api/v2/pages/${id}?body-format=atlas_doc_format&include-labels=true`,
  ));
  const webui = p._links?.webui || '';
  return {
    id: p.id,
    title: p.title,
    authorId: p.ownerId || p.authorId,
    createdAt: p.createdAt,
    spaceId: p.spaceId,
    labels: (p.labels?.results || []).map((l) => l.name),
    url: base ? `${base}${webui}` : webui,
    body: p.body?.atlas_doc_format?.value ? JSON.parse(p.body.atlas_doc_format.value) : { type: 'doc', content: [] },
  };
}

/**
 * For a page labelled "decision" that has no recognisable structure, ask the LLM to
 * extract the decision. The decision sentence must be quoted verbatim from the page,
 * otherwise nothing is recorded.
 */
export async function extractWithLlm(page, text) {
  const reply = await chat([
    {
      role: 'system',
      content: 'You extract a single team decision from a Confluence page. Copy the decision sentence verbatim ' +
        'from the page. If the page does not record a decision, return {"decision": null}. Reply with JSON only.',
    },
    {
      role: 'user',
      content: `Page title: ${page.title}\n---\n${text.slice(0, 6000)}\n---\nReturn JSON: {"decision": "verbatim sentence", ` +
        '"rationale": "short summary of why", "alternatives": ["..."], "revisit_if": ["..."]}',
    },
  ], { maxTokens: 600 });
  const out = parseJson(reply);
  if (!out?.decision || !containsQuote(text, out.decision)) return null;
  return {
    key: `page:${page.id}`,
    title: page.title,
    decision: out.decision,
    rationale: out.rationale || '',
    alternatives: Array.isArray(out.alternatives) ? out.alternatives : [],
    revisitIf: Array.isArray(out.revisit_if) ? out.revisit_if : [],
    consequences: '',
    status: 'active',
    statusText: 'Accepted',
    ownerAccountId: page.authorId || null,
    decidedOn: page.createdAt ? String(page.createdAt).slice(0, 10) : null,
    extractedBy: 'llm',
    source: { kind: 'confluence', pageId: String(page.id), title: page.title, url: page.url, spaceId: page.spaceId },
  };
}

/** Full sync. Returns a summary that is also stored for the register page. */
export async function syncFromConfluence() {
  const started = Date.now();
  const { ids, base } = await findDecisionPages();
  const summary = { pages: ids.length, decisions: 0, extractedByLlm: 0, skipped: 0, errors: [] };
  for (const id of ids) {
    try {
      const page = await getPage(id, base);
      const { records, needsExtraction, text } = parsePage(page);
      if (needsExtraction) {
        const rec = await extractWithLlm(page, text);
        if (rec) {
          records.push(rec);
          summary.extractedByLlm += 1;
        } else summary.skipped += 1;
      }
      for (const r of records) {
        r.source = { ...r.source, spaceId: page.spaceId };
        await upsertDecision(r);
        summary.decisions += 1;
      }
    } catch (e) {
      summary.errors.push(`${id}: ${String(e.message || e).slice(0, 160)}`);
    }
  }
  summary.at = new Date().toISOString();
  summary.ms = Date.now() - started;
  await setMeta('sync', summary);
  return summary;
}
