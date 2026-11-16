# Evaluation results (held-out set, run once, no tuning)

30 labelled work items against the Kestrel sample decisions, 2026-11-16, model claude-sonnet-4-6.

| | Conflict precision | Conflict recall | Revisit precision | Revisit recall | False alarms on items that should stay quiet |
|---|---|---|---|---|---|
| With quote verification (shipped) | 93% (14/15) | 100% (14/14) | 75% | 100% | 2 of 14 |
| Without verification | 93% (14/15) | 100% (14/14) | 75% | 100% | 2 of 14 |

Exact-match accuracy by group (all expected findings and nothing else):

| Group | Correct |
|---|---|
| conflict | 13 of 13 |
| compatible | 9 of 10 |
| unrelated | 3 of 3 |
| revisit | 3 of 4 |

Per-case results are in [results-holdout.json](results-holdout.json). Cases are in [src/data/eval-cases.js](../src/data/eval-cases.js).
