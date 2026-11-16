// Text helpers shared by parsing, retrieval and citation checks.
// Pure functions only: no Forge imports, so they run in unit tests.

const STOPWORDS = new Set(`a an and are as at be been being but by can could did do does doing done
for from had has have having he her here hers him his how i if in into is it its itself just
me more most my no nor not now of off on once only or other our ours out over own same she
should so some such than that the their theirs them then there these they this those through
to too under until up very was we were what when where which while who whom why will with
would you your yours also any all each few both again further against between during before
after above below should shall may might must per via use using used new let lets get got
make makes made want wants need needs please team teams we'll we're it's i'm`.split(/\s+/));

/** Lowercase, unify quotes/dashes and collapse whitespace. Used for verbatim quote checks. */
export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Very light English stemmer: enough to match "payouts"/"payout", "migrating"/"migrate". */
export function stem(word) {
  let w = word;
  if (w.length > 5 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith('es') && !w.endsWith('ses')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}

/** Split text into stemmed, stopword-free terms. Keeps tokens such as "graphql", "k8s", "v2". */
export function tokenize(text) {
  return normalize(text)
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t) && !/^\d+$/.test(t))
    .map(stem);
}

/**
 * True when `quote` appears verbatim (after normalisation) inside `source`.
 * Leading/trailing punctuation and ellipses in the quote are ignored, since models
 * often add or drop them.
 */
export function containsQuote(source, quote, minLength = 8) {
  const q = normalize(quote).replace(/^[\s"'.,;:!?()[\]-]+|[\s"'.,;:!?()[\]-]+$/g, '').replace(/\.\.\.$/, '');
  if (q.length < minLength) return false;
  return normalize(source).includes(q);
}

/** Trim text to `max` characters on a word boundary. */
export function clip(text, max = 280) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)) + '…';
}
