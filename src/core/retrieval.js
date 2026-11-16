// BM25 keyword retrieval over decision records.
// Small and dependency-free: a site has tens to hundreds of decisions, so an in-memory
// index built per request is fast enough and needs no external search service.

import { tokenize } from './text.js';

// Field weights: a term in the title or decision counts more than one in the rationale.
const FIELDS = [
  ['title', 3],
  ['decision', 2],
  ['rationale', 1],
  ['alternatives', 1.5],
  ['revisitIf', 1],
  ['consequences', 0.5],
];

function docTerms(d) {
  const terms = [];
  for (const [field, weight] of FIELDS) {
    const value = Array.isArray(d[field]) ? d[field].join(' ') : d[field];
    for (const t of tokenize(value)) terms.push([t, weight]);
  }
  return terms;
}

/** Build an index once, then call search() any number of times. */
export function buildIndex(decisions, { k1 = 1.2, b = 0.75 } = {}) {
  const docs = decisions.map((d) => {
    const tf = new Map();
    let len = 0;
    for (const [t, w] of docTerms(d)) {
      tf.set(t, (tf.get(t) || 0) + w);
      len += w;
    }
    return { d, tf, len };
  });
  const avgLen = docs.reduce((s, x) => s + x.len, 0) / Math.max(docs.length, 1);
  const df = new Map();
  for (const { tf } of docs) for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  const N = docs.length;
  const idf = (t) => Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));

  return {
    size: N,
    /**
     * @returns {{ decision, score, matched: string[] }[]} best first, only score > 0
     */
    search(query, { limit = 5, includeSuperseded = false } = {}) {
      const q = [...new Set(tokenize(query))];
      const results = [];
      for (const { d, tf, len } of docs) {
        if (!includeSuperseded && d.status === 'superseded') continue;
        let score = 0;
        const matched = [];
        for (const t of q) {
          const f = tf.get(t);
          if (!f) continue;
          matched.push(t);
          score += idf(t) * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * len) / avgLen)));
        }
        if (score > 0) results.push({ decision: d, score: Number(score.toFixed(3)), matched });
      }
      return results.sort((a, b2) => b2.score - a.score).slice(0, limit);
    },
  };
}

/**
 * "Did we already decide X?" A match counts only if it shares at least two distinct terms
 * with the question, or one rare term (high idf, e.g. a product name such as "graphql").
 */
export function confidentMatches(results, { minScore = 2.0, minTerms = 2 } = {}) {
  return results.filter((r) => r.matched.length >= minTerms || r.score >= minScore);
}
