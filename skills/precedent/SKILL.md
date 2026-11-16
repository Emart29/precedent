---
name: precedent
description: Check a team's recorded decisions before proposing or starting work. Use when planning a change, writing a ticket or design doc, or when someone asks "did we already decide this?", in a workspace that has the Precedent Forge app and its MCP server enabled.
---

# Precedent: check recorded decisions before you act

Precedent is a Forge app that keeps a log of a team's decisions (from Confluence decision pages and
meeting notes) and exposes it as an MCP server: `https://mcp.atlassian.com/forge/<app id>`.
A site admin enables the server under Atlassian Administration → Connected apps; MCP clients sign in with OAuth.

## Tools

| Tool | Use it when |
|---|---|
| `find-decisions` (`query`) | Someone asks whether the team already decided something, or before reopening a topic. |
| `check-proposal` (`proposal`) | Before proposing or starting a change. Returns verified conflicts with exact quotes. |
| `get-decision` (`decisionId`) | You need the full decision, its reasons, revisit conditions, and the people and teams to talk to. |
| `find-revisit-signals` (`decisionId` optional) | You suspect a decision is out of date. |

## Rules

1. Before suggesting a significant change (architecture, vendor, process, policy), call `check-proposal` with a one-paragraph description of it.
2. If a conflict comes back, show the decision ID, title, both quotes exactly as returned, and the link. Do not paraphrase the quotes.
3. A conflict is not a veto. Offer the options: align with the decision, go ahead with a written reason, or ask the decision owner to reopen it.
4. If `find-decisions` says no record was found, say so. Never invent a decision.
5. Results only include decisions the signed-in user is allowed to see.
