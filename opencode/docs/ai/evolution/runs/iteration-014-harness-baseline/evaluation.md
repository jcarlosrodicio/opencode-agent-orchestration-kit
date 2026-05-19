# Iteration 014 - Harness Baseline

## Status

- Checker baseline: `node scripts/check-harness.mjs` passed before the semantic-checker change.
- Evidence type: `static_contract`.
- Scope: inspect prior AHE runs and identify low-risk harness improvement opportunities.

## Findings

1. Runtime replay coverage is still limited across older AHE iterations.
2. `check-harness.mjs` used literal phrase checks for semantic lead-router rules.
3. Manual benchmark scenarios exist, but not all are executed systematically.
4. `evolution_history.md` is not a complete iteration index.

## Selected Opportunity

Only finding 2 justified an immediate harness change. Literal phrase checks made
the checker brittle when prompt text was rewritten with equivalent meaning. The
narrowest improvement was to keep structural tokens exact while replacing
semantic phrase checks with flexible regex patterns.

## Deferred Opportunities

- Execute more `transcript_replay` scenarios before changing routing behavior.
- Complete the evolution history/index in a separate documentation pass.
- Improve regex coverage only when a concrete false negative is found.

## Validation Recommendation

The next iteration should verify that:

- current documents still pass the checker;
- equivalent wording rewrites pass;
- real omissions still fail;
- structural permissions and agent identifiers remain exact.
