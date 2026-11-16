// Permission checks. Decisions are synced as the app, so before showing a decision to a
// person (issue panel, Rovo agent, MCP client) we confirm that person can view the source
// page. Restricted pages never leak through Precedent.

import { asApp, asUser, route } from '@forge/api';

const api = { asApp, asUser };

/** True when `accountId` (or the calling user, if omitted) can view the Confluence page. */
async function userCanView(pageId, accountId) {
  try {
    const requester = accountId ? api.asUser(accountId) : api.asUser();
    const res = await requester.requestConfluence(route`/wiki/api/v2/pages/${pageId}`);
    return res.ok;
  } catch {
    return null; // unknown: no user token available (e.g. user has not granted access yet)
  }
}

/** True when the page carries its own read restrictions (fallback when no user token exists). */
async function hasReadRestrictions(pageId) {
  const res = await api.asApp().requestConfluence(route`/wiki/rest/api/content/${pageId}/restriction/byOperation/read`);
  if (!res.ok) return true; // fail closed
  const body = await res.json();
  const users = body.restrictions?.user?.results?.length || 0;
  const groups = body.restrictions?.group?.results?.length || 0;
  return users + groups > 0;
}

/**
 * Keep only decisions the person may see. Sample decisions (no Confluence page) are always visible.
 * @param {object[]} decisions
 * @param {string} [accountId] defaults to the calling user
 */
export async function visibleTo(decisions, accountId) {
  const cache = new Map();
  const out = [];
  for (const d of decisions) {
    const pageId = d.source?.kind === 'confluence' ? d.source.pageId : null;
    if (!pageId) {
      out.push(d);
      continue;
    }
    if (!cache.has(pageId)) {
      let ok = await userCanView(pageId, accountId);
      if (ok === null) ok = !(await hasReadRestrictions(pageId));
      cache.set(pageId, ok);
    }
    if (cache.get(pageId)) out.push(d);
  }
  return out;
}
