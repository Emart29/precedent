# Precedent

[![test](https://github.com/Emart29/precedent/actions/workflows/test.yml/badge.svg)](https://github.com/Emart29/precedent/actions/workflows/test.yml)

**Your team's decision memory, built into Jira, Confluence and Rovo.**

Teams forget what they decided. Someone files *"Move payouts to a new provider"* months after the team agreed, on a Confluence page, to stay with the current one, and why. Work gets duplicated, settled arguments come back, and new people undo decisions they never knew about.

Precedent reads decisions from where they already live (Confluence decision pages and meeting notes) and checks new work against them:

- **Guards new work.** When a Jira issue is created, Precedent checks it against your recorded decisions. If it contradicts one, it comments with the decision, an exact quote from the decision, an exact quote from the issue, and the decision owner.
- **Never misquotes.** Every finding is verified word for word against the source text before anyone sees it. Findings whose quotes do not match are thrown away.
- **Answers "did we already decide this?"** In Rovo chat, the issue panel or any MCP client. If there is no record, it says so instead of guessing.
- **Spots decisions that may be out of date.** Decisions can say when they should be revisited ("revisit if fees rise above 2%"). Precedent looks for recent work showing that has happened.
- **Shows who to talk to.** People and teams behind each decision come from the Teamwork Graph.
- **A conflict is not a veto.** From the issue panel you can link the issue to the decision, go ahead with a written reason, or reopen the decision. Each choice is recorded on the issue.

Built for [Codegeist 2026](https://codegeist2026.devpost.com/) on Atlassian Forge.

## Accuracy

Measured with labelled work items against the sample decision log (model `claude-sonnet-4-6` via Forge LLMs):

| Set | Conflict precision | Conflict recall | Revisit precision | Revisit recall | False alarms on items that should stay quiet |
|---|---|---|---|---|---|
| **Held-out**, 30 items, written after the last prompt change and run once | 93% (14/15) | 100% (14/14) | 75% (3/4) | 100% (3/3) | 2 of 14 |
| Development, 51 items (used to fix the prompt once) | 100% (18/18) | 100% (18/18) | 100% (5/5) | 100% (5/5) | 0 of 28 |

The held-out set is the fair number. Its two errors are in [eval/results-holdout.md](eval/results-holdout.md): an issue that *fixes* a privacy problem was flagged as a conflict, and a "could this ever happen?" question was treated as evidence. The first development run, before the prompt fix, is kept in [eval/results-run1.md](eval/results-run1.md). Cases are in [src/data/eval-cases.js](src/data/eval-cases.js) and [src/data/eval-holdout.js](src/data/eval-holdout.js).

Quote verification matched the model's own findings on these runs. Its job is a guarantee rather than a score: a quote that is not in the source is never shown.

## How it works

```
Confluence pages labelled "decision" ──┐
Meeting notes (decision items)         ├─► parse (no AI for structured pages) ─► decision log (Forge storage)
Decisions recorded in Rovo chat ───────┘                                           │
                                                                                  ▼
New Jira issue / proposal ─► candidate decisions (all, or BM25 top 8) ─► Forge LLM finds conflicts
                                                                          │   with two verbatim quotes
                                                                          ▼
                                                   quote check against source text ─► drop anything unverified
                                                                          │
                     Jira comment · issue panel · Rovo agent · MCP tools ◄┘  (+ owners and teams from Teamwork Graph)
```

- **Parsing** ([src/core/parse.js](src/core/parse.js)) understands ADR-style pages (headings such as *Decision*, *Why*, *Alternatives considered*, *Revisit if*, *Owner*, *Status*) and Confluence decision items, without AI. Superseded and proposed decisions are recognised and never enforced. Only pages labelled `decision` without a recognisable structure go to the LLM, and the extracted decision must be a verbatim sentence from the page.
- **Conflict check** ([src/core/conflict.js](src/core/conflict.js)) asks for findings of two kinds, `conflict` and `revisit_signal`, each with a quote from the decision and a quote from the work. [verifyFindings](src/core/conflict.js) keeps only findings whose quotes appear in the source.
- **Retrieval** ([src/core/retrieval.js](src/core/retrieval.js)) is a small BM25 index. Small logs send every live decision to the model; large logs send the top 8.

## Atlassian platform features used

| Feature | Where |
|---|---|
| **Rovo agent** `rovo:agent` with 7 actions | [manifest.yml](manifest.yml), [prompts/agent.md](prompts/agent.md) |
| **MCP server** `rovo:mcp` exposing `find-decisions`, `get-decision`, `check-proposal`, `find-revisit-signals` | [manifest.yml](manifest.yml), [skills/precedent/SKILL.md](skills/precedent/SKILL.md) for third-party agents |
| **Teamwork Graph** `confluencePageOwners`, `confluencePageContributors`, `atlassianUserInTeams` | [src/platform/twg.js](src/platform/twg.js) |
| **Forge LLMs** (Atlassian-hosted Claude) | [src/platform/llm.js](src/platform/llm.js) |
| Jira trigger `avi:jira:created:issue`, issue panel, global page (UI Kit) | [src/index.js](src/index.js), [src/frontend](src/frontend) |
| Confluence REST (CQL search, ADF pages), Forge KVS, daily scheduled sync | [src/platform](src/platform) |

## Permissions and privacy

- Decisions are synced as the app, but **shown only to people who can view the source page**. Every read in the panel, Rovo and MCP checks the viewer's access to the Confluence page first ([src/platform/access.js](src/platform/access.js)). Before an automatic comment is posted, the issue reporter's access is checked; if that cannot be checked, decisions from pages with read restrictions are left out.
- Teamwork Graph queries run as the user, so the graph applies its own permissions.
- Data stays in Forge storage on Atlassian's platform. The LLM is the Atlassian-hosted Forge LLM, and nothing is sent to other services.
- Overrides and reopen requests are written as comments by the person who made them, so the issue history shows who decided what.

## Try it

1. Install the app on a Jira + Confluence site with the installation link from the Codegeist submission.
2. In Jira, open **Apps → Precedent decisions**, then either:
   - press **Load sample decisions** (16 decisions for the fictional company Kestrel), or
   - label your own Confluence decision pages `decision` (meeting notes: `meeting-notes`) and press **Sync from Confluence**.
3. Create an issue such as *"Expose a public GraphQL endpoint for partners"* and watch the comment arrive. Open the **Precedent** panel on the issue to respond.
4. In Rovo chat, pick **Precedent** and ask *"Did we already decide anything about SMS login codes?"*

To recreate the demo site's Confluence space with real pages: `node scripts/seed-demo.js` (see the header of that file).

## Develop

```bash
npm install
npm test                     # unit tests for parsing, retrieval, verification and formatting
forge deploy && forge install
```

`npm run eval` runs the labelled sets through a deployed development build (the Forge LLM is only reachable inside Forge). It needs the token-protected `eval-webtrigger` URL and the `EVAL_TOKEN` variable; see [eval/run.js](eval/run.js).

## AI assistance

Built with Claude Code as a coding assistant; the idea, product decisions and review are mine. In the app, the Atlassian-hosted Forge LLM does the conflict judgement, and deterministic code checks every quote it returns.

## License

MIT. Sample data describes a fictional company; all company, vendor and product names in it are invented.
