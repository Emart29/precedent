# Evaluation results (development set, first run, before the prompt fix)

51 labelled work items against the Kestrel sample decisions, 2026-11-16, model claude-sonnet-4-6.

This run found every revisit signal but verification rejected them, because the model quoted the condition as shown in its prompt. Verification now also accepts text exactly as shown to the model. One issue that fixed a privacy problem was flagged as a conflict; the prompt now says that fixing something to follow a decision is not a conflict.

| | Conflict precision | Conflict recall | Revisit precision | Revisit recall | False alarms on items that should stay quiet |
|---|---|---|---|---|---|
| With quote verification (shipped) | 95% (18/19) | 100% (18/18) | 100% | 0% | 1 of 28 |
| Without verification | 95% (18/19) | 100% (18/18) | 100% | 100% | 1 of 28 |

Exact-match accuracy by group (all expected findings and nothing else):

| Group | Correct |
|---|---|
| conflict | 18 of 18 |
| compatible | 15 of 16 |
| unrelated | 10 of 10 |
| revisit | 0 of 5 |
| lifecycle | 2 of 2 |

Per-case results are in [results.json](results.json). Cases are in [src/data/eval-cases.js](../src/data/eval-cases.js).
