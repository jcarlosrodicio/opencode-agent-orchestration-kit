# Workflows

## Direct mode

Free-form messages without a slash command use `lead` by default as a bounded router. This keeps the simplest path for small, clear, low-risk changes while avoiding silent guesses when the right flow is unclear.

Lead decides quickly between `developer`, `researcher`, `designer`, or `specifier`. It delegates small direct work to `developer`, routes uncertainty to `researcher`, visual/product work to `designer`, planning gaps to `specifier`, and asks the user when ambiguity changes the right path.

## Feature

`lead -> designer if applicable -> researcher -> specifier -> developer -> reviewer`

The lead decides whether design or research is needed. Specifier waits for relevant discovery. Developer waits for spec. Reviewer waits for diff.

## Plan

`lead -> researcher -> specifier -> reviewer`

Plan-only mode always starts with researcher, then specifier creates the implementation-ready plan, and reviewer audits the plan/spec without requiring a diff. It never invokes developer and allows only one correction pass before returning the plan with risks or a blocked state.

## Scope

`scoper -> researcher -> scoper synthesis -> specifier`

No design, implementation, or review.

## Design

`designer -> open-design`

Designer reads product/design docs, optionally uses Impeccable, then creates or runs an Open Design project.

## AHE

`evaluator -> debugger -> evolver -> lead approval -> developer -> evaluator -> debugger -> reviewer`

Only for improving the harness itself.

## Core and default release evidence

The release-blocking core smoke loads an isolated configuration without
Superpowers, the token plugin, an Open Design service, or Impeccable at both
supported OpenCode boundaries. A separate default-config smoke loads the
packed starter at the stable boundary with the full reviewed Superpowers
commit. The latter proves the default can load; it does not make optional
integrations part of the supported core contract or promote them from
experimental.

Release readiness prepares and checks the package artifact but does not
publish it. Exact checksum, publication, and post-publication verification
steps are in [the supply-chain runbook](supply-chain.md), and every remote
mutation requires separate authorization.

Harness-evolution evidence is classified in `opencode/docs/ai/harness/evidence.md`:

- `static_contract`: file and contract inspection.
- `transcript_replay`: `opencode run --format json --thinking` execution.
- `live_smoke`: real repo, app, browser, or runtime check.
- `manual_oracle`: documented human judgment.
