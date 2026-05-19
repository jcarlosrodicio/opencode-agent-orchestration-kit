# Iteration 015 - Semantic Checker Evaluation

## Result

Decision: `keep`.

The public checker now preserves exact structural checks and uses bounded
semantic regex checks for lead-router prompt prose.

## Scenarios

| Scenario | Expected | Actual |
| --- | --- | --- |
| `node --check scripts/check-harness.mjs` | pass | pass |
| `node scripts/check-harness.mjs` | pass | pass |
| Equivalent lead wording rewrite | pass | pass |
| Equivalent `commands.md` wording rewrite | pass | pass |
| Remove "Do not edit code" rule | fail | fail |
| Change `edit: deny` to `edit: ask` | fail | fail |
| `git diff --check` | pass | pass |

## Notes

- Bounded regexes are intentionally not a full natural-language parser.
- Critical lead prohibition checks keep literal fallbacks.
- No public artifact includes raw transcripts, private providers, MCP config,
  credentials, or local machine paths.
