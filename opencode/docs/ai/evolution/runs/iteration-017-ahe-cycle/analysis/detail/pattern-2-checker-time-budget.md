# Pattern 2 — `check-harness.test.mjs` misclassified as functional failure under tight timeout

## Evidence used

- `evaluation.md:120-137`
- `scripts/check-harness.test.mjs:12-29`
- `scripts/check-harness.test.mjs:35-344`
- local measurement: single test run completed in ~9.96s
- local measurement: full suite passed `14/14` in `112959ms`
- local measurement: workspace size ~`19939` files / `260380681` bytes

## Facts

- The evaluator reported `node --test scripts/check-harness.test.mjs` as fail after a 120s timeout.
- The suite itself passes when allowed more time.
- Each test creates a fresh temp fixture by copying the entire repo with `fs.cpSync(root, tmp, ...)`.
- There are 14 tests, and the current repo is large enough that fixture creation dominates runtime.

## Root cause

The observable failure is not currently “broken async logic inside the tests.” The direct cause supported by evidence is that the suite's execution time is close enough to the harness command timeout that an external cancellation can terminate a passing run and surface Node's generic cancellation text.

At component level, this is primarily a **tool/runtime-budget** issue caused by heavyweight fixture strategy.

## Component level implicated

- `tool`
- secondary: `workflow`

## Predicted fixes

- Distinguish short smoke validation from full checker-suite validation in AHE runs.
- Give the full suite an explicit timeout budget based on observed runtime rather than default command timeout.
- Track suite cost as repo size grows; fixture-copy-per-test is the main pressure point supported by current evidence.

## Risk tasks

- Confirm the suite still passes under generous timeout on a second run to rule out hidden flakiness.
- Check whether dirty iteration artifacts further increase copy cost over time.
- Avoid masking a real async leak by treating every cancellation as “just timeout.”

## Falsification criteria

This diagnosis is wrong if any of the following is shown:

1. The suite still hangs or fails with a generous timeout budget.
2. The suite fails in a minimal repo copy where runtime is not near the timeout ceiling.
3. A targeted test reproduces `Promise resolution is still pending...` even without external cancellation.

## Why this is independent

This pattern is about **validation runtime and harness smoke reliability**. It does not depend on the `/feature` corpus-classification issue.
