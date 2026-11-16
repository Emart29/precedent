// Turns a Confluence page (ADF) into decision records.
//
// Two page shapes are understood without any AI:
//   1. Decision pages (ADR style): headings such as "Decision", "Why", "Alternatives considered",
//      "Revisit if", "Owner", "Status".
//   2. Any page containing Confluence decision items (the "Decision" element used in the
//      meeting-notes template). Each DECIDED item becomes its own record.
// Pages labelled "decision" that match neither shape are returned with `needsExtraction`
// so the caller can ask the LLM to extract a record (and verify it against the page text).

import { toBlocks } from './adf.js';
import { clip } from './text.js';

const SECTION_ALIASES = {
  decision: ['decision', 'the decision', 'what we decided', 'outcome', 'decision outcome', 'we decided'],
  status: ['status', 'decision status'],
  rationale: ['why', 'rationale', 'context', 'background', 'reasons', 'reasoning', 'problem', 'context and problem'],
  alternatives: ['alternatives', 'alternatives considered', 'options considered', 'options', 'rejected options', 'rejected alternatives', 'considered options'],
  revisitIf: ['revisit if', 'revisit when', 'reopen if', 'review if', 'revisit triggers', 'assumptions', 'when to revisit'],
  owner: ['owner', 'decided by', 'decision owner', 'driver', 'approver', 'approvers'],
  date: ['date', 'decided on', 'decision date', 'decided'],
  consequences: ['consequences', 'implications', 'impact'],
};

function sectionFor(heading) {
  const h = heading.toLowerCase().replace(/[:?]+$/, '').trim();
  for (const [field, aliases] of Object.entries(SECTION_ALIASES)) {
    if (aliases.includes(h)) return field;
  }
  return null;
}

/** "Superseded by DEC-4" -> 'superseded'; "Accepted" -> 'active'; "Proposed" -> 'proposed'. */
export function normalizeStatus(raw) {
  const s = String(raw || '').toLowerCase();
  if (/supersed|deprecat|revers|replaced|retired|withdrawn/.test(s)) return 'superseded';
  if (/propos|draft|open|under review|pending|rfc/.test(s)) return 'proposed';
  if (/reopen|revisit/.test(s)) return 'revisit';
  return 'active';
}

/** Strip "DEC:", "ADR-12:", "Decision -" prefixes from page titles. */
export function cleanTitle(title) {
  return String(title || '').replace(/^\s*(dec(ision)?|adr)[\s-]*\d*\s*[:\-–]\s*/i, '').trim() || String(title || '').trim();
}

function parseDate(text) {
  const m = String(text || '').match(/\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * @param {object} page { id, title, body (ADF object|string), url, spaceKey, authorId, createdAt, labels[] }
 * @returns {{ records: object[], needsExtraction: boolean, text: string }}
 */
export function parsePage(page) {
  const blocks = toBlocks(page.body);
  const text = blocks.map((b) => b.text).join('\n');
  const source = {
    kind: 'confluence',
    pageId: String(page.id),
    title: page.title,
    url: page.url,
    spaceKey: page.spaceKey || null,
  };

  // Group blocks under recognised headings.
  const sections = {};
  const sectionMentions = {};
  let current = null;
  for (const b of blocks) {
    if (b.kind === 'heading') {
      current = sectionFor(b.text);
      continue;
    }
    if (!current) continue;
    (sections[current] ||= []).push(b.text);
    (sectionMentions[current] ||= []).push(...(b.mentions || []));
  }

  const records = [];
  if (sections.decision?.length) {
    const ownerIds = sectionMentions.owner || [];
    records.push({
      key: `page:${page.id}`,
      title: cleanTitle(page.title),
      decision: sections.decision.join(' '),
      rationale: (sections.rationale || []).join(' '),
      alternatives: sections.alternatives || [],
      revisitIf: sections.revisitIf || [],
      consequences: (sections.consequences || []).join(' '),
      status: normalizeStatus((sections.status || []).join(' ')),
      statusText: (sections.status || []).join(' ') || 'Accepted',
      ownerAccountId: ownerIds[0] || page.authorId || null,
      ownerText: (sections.owner || []).join(', ') || null,
      decidedOn: parseDate((sections.date || []).join(' ')) || (page.createdAt ? String(page.createdAt).slice(0, 10) : null),
      source,
    });
  }

  // Decision items (meeting notes). Skipped when the page already produced an ADR record
  // from the same text, to avoid duplicates.
  const decisionItems = blocks.filter((b) => b.kind === 'decision' && b.decided);
  decisionItems.forEach((item, i) => {
    if (records.some((r) => r.decision.includes(item.text))) return;
    records.push({
      key: `page:${page.id}:item:${i}`,
      title: clip(item.text, 90),
      decision: item.text,
      rationale: `Recorded in "${page.title}".`,
      alternatives: [],
      revisitIf: [],
      consequences: '',
      status: 'active',
      statusText: 'Decided',
      ownerAccountId: item.mentions?.[0] || page.authorId || null,
      ownerText: null,
      decidedOn: page.createdAt ? String(page.createdAt).slice(0, 10) : null,
      source,
    });
  });

  const labelled = (page.labels || []).map((l) => String(l).toLowerCase()).includes('decision');
  return { records, needsExtraction: records.length === 0 && labelled, text };
}

/** The text a decision is judged against: everything a citation may legitimately quote. */
export function decisionText(d) {
  return [
    d.title,
    d.decision,
    d.rationale,
    ...(d.alternatives || []),
    ...(d.revisitIf || []),
    d.consequences,
  ].filter(Boolean).join('\n');
}
