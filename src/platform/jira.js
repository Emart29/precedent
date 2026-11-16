// Jira REST helpers.

import { asApp, asUser, route } from '@forge/api';

import { adfToText } from '../core/adf.js';

const api = { asApp, asUser };
const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };

/** Issue summary + description as plain text, plus the people involved. */
export async function getIssueText(issueKey, asUserAccountId) {
  const requester = asUserAccountId === 'app' ? api.asApp() : api.asUser();
  const res = await requester.requestJira(route`/rest/api/3/issue/${issueKey}?fields=summary,description,reporter,creator,project,issuetype`);
  if (!res.ok) throw new Error(`Jira ${res.status} reading ${issueKey}`);
  const issue = await res.json();
  const description = adfToText(issue.fields.description);
  return {
    key: issue.key,
    id: issue.id,
    summary: issue.fields.summary,
    text: `${issue.fields.summary}\n${description}`.trim(),
    reporterId: issue.fields.reporter?.accountId || issue.fields.creator?.accountId || null,
    projectKey: issue.fields.project?.key,
  };
}

/** Post an ADF comment as the app (used by the issue-created trigger). */
export async function addAppComment(issueKey, adf) {
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ body: adf }),
  });
  if (!res.ok) throw new Error(`Jira ${res.status} commenting on ${issueKey}`);
  return res.json();
}

/** Post a plain comment as the current user (records an override or reopen in the issue history). */
export async function addUserComment(issueKey, text) {
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      body: { version: 1, type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
    }),
  });
  if (!res.ok) throw new Error(`Jira ${res.status} commenting on ${issueKey}`);
  return res.json();
}

/** Link the issue to the decision's Confluence page (shows under "Web links" on the issue). */
export async function linkDecision(issueKey, decision) {
  if (!decision.source?.url) return null;
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}/remotelink`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      globalId: `precedent:${decision.id}`,
      object: { url: decision.source.url, title: `${decision.id}: ${decision.title}`, summary: 'Recorded decision (Precedent)' },
    }),
  });
  if (!res.ok) throw new Error(`Jira ${res.status} linking ${issueKey}`);
  return res.json();
}

/** Recent issues mentioning any of the given words (used to look for "revisit if" evidence). */
export async function searchRecentIssues(words, days = 120) {
  const terms = words.filter(Boolean).slice(0, 6).map((w) => `text ~ "${w.replace(/["\\]/g, '')}"`).join(' OR ');
  if (!terms) return [];
  const jql = `(${terms}) AND created >= -${days}d ORDER BY created DESC`;
  const res = await api.asUser().requestJira(route`/rest/api/3/search/jql?jql=${jql}&maxResults=15&fields=summary,description,created`);
  if (!res.ok) return [];
  const body = await res.json();
  return (body.issues || []).map((i) => ({
    key: i.key,
    created: i.fields.created,
    text: `${i.fields.summary}\n${adfToText(i.fields.description)}`.trim(),
  }));
}
