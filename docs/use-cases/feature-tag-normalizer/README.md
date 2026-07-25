# Feature tag normalizer

## Objective

Add `normalizeTags(values)` with its complete public contract and tests.

## Why this workflow

The task has multiple acceptance criteria and needs implementation, tests, and
review. The feature workflow is appropriate without mandatory research or
design.

## Initial tree

The `before/` repository contains a pass-through implementation, its initial
test, and a dependency-free package manifest.

## Expected change

The function trims and lowercases values, removes empty values and duplicates,
preserves first occurrence order, and does not mutate the input, matching
`expected/`.

## Isolated preparation

Copy `before/` into a fresh temporary directory, initialize a temporary Git
repository, and verify its tests before each invocation.

## Harness command

`opencode run --command feature --format json --thinking --dir <case-dir> "Add normalizeTags(values): trim and lowercase values, remove empty entries and duplicates, preserve first occurrence order, do not mutate the input, add tests, and keep the public API minimal."`

## Reduced command

`opencode run --agent developer --format json --thinking --dir <case-dir> "Add normalizeTags(values): trim and lowercase values, remove empty entries and duplicates, preserve first occurrence order, do not mutate the input, add tests, and keep the public API minimal."`

## Expected and observed agents

Harness expects `lead`, `specifier`, `developer`, and `reviewer`; `researcher`
is conditional on a real doubt. Reduced expects `developer`. Observed agents are
empty because neither transcript emitted a portable agent identity.

## Validation

Both unchanged repositories passed `npm test` and `git diff --check`, but both
failed repository comparison with `expected/`.

## Human intervention

Neither variant received human intervention.

## Invocations and correction cycles

Each variant used one top-level invocation and zero correction cycles.

## Tokens and cost

Reliable aggregate token evidence was unavailable. No cost is inferred.

## Result

Both variants are `fail` because neither implemented the expected repository.

## Comparison

Observed in these runs, the harness encountered two permission-rejected shell
actions and the reduced variant encountered one. Both left the fixture
unchanged.

## Limitations

One run per variant is an observation, not a benchmark. Agent identity and
reliable aggregate tokens were unavailable.

## Cleanup

Delete only the dedicated temporary run directory after extracting the
sanitized result; never retain raw output in this repository.
