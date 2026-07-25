# Direct label change

## Objective

Change the exported `Settings` label to `Account settings` and update its test.

## Why this workflow

The task is clear, local, low risk, and requires no research or design. The
public direct path should route from `lead` to `developer`.

## Initial tree

The `before/` repository contains one module, one test, and a dependency-free
package manifest.

## Expected change

The exported label and its assertion match the contents of `expected/`.

## Isolated preparation

Copy `before/` into a fresh temporary directory, initialize a temporary Git
repository, and verify its tests before each invocation.

## Harness command

`opencode run --format json --thinking --dir <case-dir> "Change the Settings label to Account settings and run the smallest relevant validation."`

## Reduced command

`opencode run --agent developer --format json --thinking --dir <case-dir> "Change the Settings label to Account settings and run the smallest relevant validation."`

## Expected and observed agents

Harness expects `lead`, then `developer`; reduced expects `developer`.
The harness transcript exposed `developer`; the reduced transcript exposed no
portable agent identity. Primary-agent identity was not reliably emitted.

## Validation

Both variants passed `npm test` and `git diff --check`. Both failed exact
repository comparison with `expected/` because the test title was unchanged.

## Human intervention

Neither variant required human intervention.

## Invocations and correction cycles

Each variant used one top-level invocation and zero correction cycles.

## Tokens and cost

Reliable aggregate token evidence was unavailable. No cost is inferred.

## Result

Both variants are `fail` under the exact repository-equivalence contract,
despite their passing functional validation.

## Comparison

Observed in these runs, both variants made the same functional change and left
the same test title unchanged. Only the harness exposed a developer delegation.

## Limitations

One run per variant is an observation, not a benchmark. Primary-agent identity
and reliable aggregate tokens were unavailable. The harness wrapper did not
retain the OpenCode process exit status after that completed invocation.

## Cleanup

Delete only the dedicated temporary run directory after extracting the
sanitized result; never retain raw output in this repository.
