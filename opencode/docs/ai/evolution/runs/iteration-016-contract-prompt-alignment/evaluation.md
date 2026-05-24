# Iteration 016 - Contract/Prompt Alignment

## Result

Decision: `improve`.

The checker now covers additional harness contracts:

- `/evolve` must preserve the `evaluator -> debugger -> evolver` ordering.
- `/scope` must preserve `researcher -> specifier` ordering.
- `/design` must keep its Open Design contract.
- Agent prompts must keep each configured invariant from `docs/ai/harness/agents.md`.
- AHE JSON evidence prose may mention markdown filenames without being treated as a path.

## Scenarios

| Scenario | Expected | Actual |
| --- | --- | --- |
| `node --check scripts/check-harness.mjs` | pass | pass |
| `node scripts/check-harness.mjs` | pass | pass |
| Prose evidence mentions `PRODUCT.md/DESIGN.md` | pass | pass |
| `/evolve` order is inverted | fail | fail |
| `/scope` order is inverted | fail | fail |
| `lead` prompt keeps only one invariant | fail | fail |
| `git diff --check` | pass | pass |

## Notes

- This public artifact contains summary evidence only.
- No raw transcripts, private providers, MCP configuration, credentials, or local
  machine paths are included.
