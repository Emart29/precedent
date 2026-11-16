// Builds the Jira comment (ADF) Precedent posts when it finds a verified conflict.

const t = (text, marks) => (marks ? { type: 'text', text, marks } : { type: 'text', text });
const strong = { type: 'strong' };
const link = (href) => ({ type: 'link', attrs: { href } });
const p = (...content) => ({ type: 'paragraph', content });
const li = (...content) => ({ type: 'listItem', content: [p(...content)] });

function decisionLine(d) {
  const parts = [t(`${d.id} · ${d.title}`, d.source?.url ? [strong, link(d.source.url)] : [strong])];
  if (d.decidedOn) parts.push(t(` · decided ${d.decidedOn}`));
  if (d.ownerAccountId) parts.push(t(' by '), { type: 'mention', attrs: { id: d.ownerAccountId } });
  return parts;
}

/**
 * @param {object[]} findings verified findings from checkWork()
 * @param {Map<string, object>} decisionsById
 */
export function conflictComment(findings, decisionsById) {
  const conflicts = findings.filter((f) => f.relation === 'conflict');
  const signals = findings.filter((f) => f.relation === 'revisit_signal');
  const content = [];

  const intro = conflicts.length
    ? `Precedent: this issue may contradict ${conflicts.length === 1 ? 'a recorded decision' : `${conflicts.length} recorded decisions`}.`
    : 'Precedent: this issue may be a reason to revisit a recorded decision.';
  content.push({ type: 'panel', attrs: { panelType: conflicts.length ? 'warning' : 'note' }, content: [p(t(intro, [strong]))] });

  for (const f of [...conflicts, ...signals]) {
    const d = decisionsById.get(f.id);
    if (!d) continue;
    content.push(p(...(f.relation === 'revisit_signal' ? [t('Revisit signal: ', [strong])] : []), ...decisionLine(d)));
    content.push({
      type: 'bulletList',
      content: [
        li(t('The decision says: ', [strong]), t(`“${f.decisionQuote}”`)),
        li(t('This issue says: ', [strong]), t(`“${f.workQuote}”`)),
        li(t('Why it matters: ', [strong]), t(f.explanation || 'See the decision for context.')),
      ],
    });
  }

  content.push(p(t(
    'Next step: open the Precedent panel on this issue to link it to the decision, reopen the decision, ' +
    'or proceed with a recorded reason. Both quotes above were checked word for word against the decision and this issue.',
  )));
  return { version: 1, type: 'doc', content };
}

/** Plain-text version for Rovo action responses and MCP clients. */
export function findingsToText(findings, decisionsById) {
  if (!findings.length) return 'No recorded decision conflicts with this work.';
  return findings.map((f) => {
    const d = decisionsById.get(f.id) || {};
    const head = f.relation === 'conflict' ? 'CONFLICT' : 'REVISIT SIGNAL';
    return `${head} with ${f.id} "${d.title}" (${d.source?.url || 'no link'}): decision says "${f.decisionQuote}"; ` +
      `work says "${f.workQuote}". ${f.explanation}`;
  }).join('\n');
}
