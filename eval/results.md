# Evaluation results

51 labelled work items against the Kestrel sample decisions, 2026-11-16, model claude-sonnet-4-6.

| | Conflict precision | Conflict recall | Revisit precision | Revisit recall | False alarms on items that should stay quiet |
|---|---|---|---|---|---|
| With quote verification (shipped) | 100% (18/18) | 100% (18/18) | 100% | 100% | 0 of 28 |
| Without verification | 100% (18/18) | 100% (18/18) | 100% | 100% | 0 of 28 |

Exact-match accuracy by group (all expected findings and nothing else):

| Group | Correct |
|---|---|
| conflict | 18 of 18 |
| compatible | 16 of 16 |
| unrelated | 10 of 10 |
| revisit | 5 of 5 |
| lifecycle | 2 of 2 |

Per-case results are in [results.json](results.json). Cases are in [src/data/eval-cases.js](../src/data/eval-cases.js).
