// Atlassian Document Format (ADF) helpers.
// Confluence pages and Jira descriptions/comments are ADF JSON trees.
// We flatten them into "blocks" (headings, paragraphs, list items, decision items)
// which the decision parser then groups into sections.

/** Concatenate all text inside an ADF node (mentions, emoji, dates and status lozenges included). */
export function nodeText(node) {
  if (!node) return '';
  if (node.type === 'text') return node.text || '';
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'mention') return node.attrs?.text || '';
  if (node.type === 'emoji') return node.attrs?.text || node.attrs?.shortName || '';
  if (node.type === 'date' && node.attrs?.timestamp) {
    return new Date(Number(node.attrs.timestamp)).toISOString().slice(0, 10);
  }
  if (node.type === 'status') return node.attrs?.text || '';
  if (node.type === 'inlineCard') return node.attrs?.url || '';
  return (node.content || []).map(nodeText).join('');
}

/** Account IDs mentioned anywhere inside a node. */
export function mentions(node, acc = []) {
  if (!node) return acc;
  if (node.type === 'mention' && node.attrs?.id) acc.push(node.attrs.id);
  (node.content || []).forEach((c) => mentions(c, acc));
  return acc;
}

/**
 * Flatten an ADF document into ordered blocks:
 *   { kind: 'heading', level, text }
 *   { kind: 'text', text }              paragraphs, list items, table cells, panels
 *   { kind: 'decision', text, decided } Confluence decision items (the "Decision" macro)
 */
export function toBlocks(doc) {
  const blocks = [];
  const walk = (node) => {
    if (!node) return;
    switch (node.type) {
      case 'heading':
        blocks.push({ kind: 'heading', level: node.attrs?.level || 1, text: nodeText(node).trim() });
        return;
      case 'paragraph':
      case 'codeBlock': {
        const text = nodeText(node).trim();
        if (text) blocks.push({ kind: 'text', text, mentions: mentions(node) });
        return;
      }
      case 'decisionItem': {
        const text = nodeText(node).trim();
        if (text) blocks.push({ kind: 'decision', text, decided: node.attrs?.state !== 'UNDECIDED', mentions: mentions(node) });
        return;
      }
      case 'listItem': {
        // A list item's own paragraphs become one block; nested lists are walked separately.
        const own = (node.content || []).filter((c) => c.type === 'paragraph').map(nodeText).join(' ').trim();
        if (own) blocks.push({ kind: 'text', text: own, mentions: mentions({ content: (node.content || []).filter((c) => c.type === 'paragraph') }) });
        (node.content || []).filter((c) => c.type !== 'paragraph').forEach(walk);
        return;
      }
      default:
        (node.content || []).forEach(walk);
    }
  };
  walk(typeof doc === 'string' ? JSON.parse(doc) : doc);
  return blocks;
}

/** Plain text of a whole ADF document, one block per line. */
export function adfToText(doc) {
  if (!doc) return '';
  return toBlocks(doc).map((b) => b.text).join('\n');
}
