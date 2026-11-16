// Teamwork Graph: who shaped a decision, and which teams they belong to.
//
// Precedent uses the graph to answer "who do I talk to before going against this decision?"
// For the decision's Confluence page we read its owners and contributors
// (confluencePageOwners, confluencePageContributors) and the teams of the owner
// (atlassianUserInTeams). Results are permission-filtered by the graph for the calling user.

import { asApp, asUser } from '@forge/api';
import { kvs } from '@forge/kvs';

const api = { asApp, asUser };

const PEOPLE_QUERY = `query precedent_decisionPeople($page: ID!) {
  confluencePageOwners(id: $page, first: 5) { edges { node { __typename ... on AtlassianUser { accountId name } } } }
  confluencePageContributors(id: $page, first: 10) { edges { node { __typename ... on AtlassianUser { accountId name } } } }
}`;

const TEAMS_QUERY = `query precedent_userTeams($user: ID!) {
  atlassianUserInTeams(userId: $user, first: 5) { edges { node { __typename ... on AtlassianTeam { id displayName profileUrl } } } }
}`;

const users = (conn) => (conn?.edges || []).map((e) => e.node).filter((n) => n?.accountId);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The graph sometimes answers "User is not permitted to query this organization" for a query
// that succeeds moments later, so permission-style errors are retried a few times.
async function run(query, variables, accountId) {
  const requester = accountId ? api.asUser(accountId) : api.asUser();
  const name = query.match(/query (\w+)/)[1];
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(400 * attempt);
    const res = await requester.requestTeamworkGraph(query, variables, name);
    const body = await res.json();
    if (!body.errors?.length) return body.data || {};
    lastError = body.errors[0].message;
    if (!/not permitted/i.test(lastError)) break;
  }
  console.warn(`Teamwork Graph ${name} failed: ${lastError}`);
  throw new Error(lastError);
}

/**
 * @returns {{ owners: {accountId,name}[], contributors: {accountId,name}[], teams: {id,displayName,profileUrl}[], error?: string }}
 */
export async function decisionPeople(decision, cloudId, accountId) {
  const empty = { owners: [], contributors: [], teams: [] };
  const pageId = decision?.source?.kind === 'confluence' ? decision.source.pageId : null;
  if (!pageId || !cloudId) return empty;
  const cacheKey = `twg:page:${pageId}`;
  try {
    const data = await run(PEOPLE_QUERY, { page: `ari:cloud:confluence:${cloudId}:page/${pageId}` }, accountId);
    const owners = users(data.confluencePageOwners);
    const contributors = users(data.confluencePageContributors).filter((c) => !owners.some((o) => o.accountId === c.accountId));
    const lead = owners[0] || contributors[0];
    let teams = [];
    if (lead) {
      const t = await run(TEAMS_QUERY, { user: `ari:cloud:identity::user/${lead.accountId}` }, accountId);
      teams = (t.atlassianUserInTeams?.edges || []).map((e) => e.node).filter((n) => n?.displayName);
    }
    const people = { owners, contributors, teams, at: new Date().toISOString() };
    await kvs.set(cacheKey, people);
    return people;
  } catch (e) {
    // Fall back to the last good answer (kept for a day) so the panel stays useful.
    const cached = await kvs.get(cacheKey);
    if (cached && Date.now() - Date.parse(cached.at) < 24 * 3600 * 1000) return { ...cached, cached: true };
    return { ...empty, error: String(e.message || e).slice(0, 200) };
  }
}

