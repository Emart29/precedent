// Teamwork Graph: who shaped a decision, and which teams they belong to.
//
// Precedent uses the graph to answer "who do I talk to before going against this decision?"
// For the decision's Confluence page we read its owners and contributors
// (confluencePageOwners, confluencePageContributors) and the teams of the owner
// (atlassianUserInTeams). Results are permission-filtered by the graph for the calling user.

import { asApp, asUser } from '@forge/api';

const api = { asApp, asUser };

const PEOPLE_QUERY = `query precedent_decisionPeople($page: ID!) {
  confluencePageOwners(id: $page, first: 5) { edges { node { __typename ... on AtlassianUser { accountId name } } } }
  confluencePageContributors(id: $page, first: 10) { edges { node { __typename ... on AtlassianUser { accountId name } } } }
}`;

const TEAMS_QUERY = `query precedent_userTeams($user: ID!) {
  atlassianUserInTeams(userId: $user, first: 5) { edges { node { __typename ... on AtlassianTeam { id displayName profileUrl } } } }
}`;

const users = (conn) => (conn?.edges || []).map((e) => e.node).filter((n) => n?.accountId);

async function run(query, variables, accountId) {
  const requester = accountId ? api.asUser(accountId) : api.asUser();
  const res = await requester.requestTeamworkGraph(query, variables, query.match(/query (\w+)/)[1]);
  const body = await res.json();
  // Logged so empty results can be diagnosed (missing scopes return empty data, not errors).
  console.log(`TWG ${query.match(/query (\w+)/)[1]} status=${res.status} ${JSON.stringify(body).slice(0, 600)}`);
  if (body.errors?.length && !body.data) throw new Error(body.errors[0].message);
  return body.data || {};
}

/**
 * @returns {{ owners: {accountId,name}[], contributors: {accountId,name}[], teams: {id,displayName,profileUrl}[], error?: string }}
 */
export async function decisionPeople(decision, cloudId, accountId) {
  const empty = { owners: [], contributors: [], teams: [] };
  const pageId = decision?.source?.kind === 'confluence' ? decision.source.pageId : null;
  if (!pageId || !cloudId) return empty;
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
    return { owners, contributors, teams };
  } catch (e) {
    return { ...empty, error: String(e.message || e).slice(0, 200) };
  }
}

/** Diagnostics: which Teamwork Graph queries work for the calling user on this site. Logged only. */
export async function probeGraph(cloudId, accountId, issueId) {
  const tests = {
    echo: ['query precedent_echoProbe { echo(myString: "ok") }', {}],
    userTeams: [TEAMS_QUERY, { user: `ari:cloud:identity::user/${accountId}` }],
    issueComments: ['query precedent_issueProbe($id: ID!) { jiraWorkItemComments(id: $id, first: 1) { edges { cursor } } }',
      { id: `ari:cloud:jira:${cloudId}:issue/${issueId}` }],
  };
  for (const [name, [q, v]] of Object.entries(tests)) {
    try { await run(q, v); } catch (e) { console.log(`TWG probe ${name} threw ${e.message}`); }
  }
}
