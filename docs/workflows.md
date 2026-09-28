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

## Autonomous

`enrich -> branch -> plan -> developer -> reviewer -> developer (state sync) -> close -> deliver -> CI`

One explicit invocation runs the whole task without human gates:

1. `oak-enrich-task` turns the objective into a specification and sorts its open
   questions into decided and blocking.
2. `developer` creates a `<type>/<slug>` feature branch and opens a task run
   with `oak run start`.
3. The plan is self-reviewed and logged in `docs/ai/runs/<date>-<slug>/autonomy.md`.
4. The cycle repeats within a one-to-six iteration budget: a focused change,
   deterministic validation, `oak-runtime-verification` when there is a runtime
   surface, `oak-update-docs`, and a fresh `reviewer` subagent applying
   `oak-adversarial-review`.
5. After approval, `oak state attest-review`, `oak state record --status
   completed`, and `oak run close` write the attestation and the run summary.
6. `developer` commits with `oak-commit` and runs `oak deliver pr`.
7. CI is polled with `oak deliver checks` and every failing job is classified;
   a failure caused by the change gets at most two reviewed fixes.

It ends at the open pull request and never merges. Any of its seven stop
reasons stops the run before delivery, with a numbered list of questions.

## AHE

`evaluator -> debugger -> evolver -> lead approval -> developer -> evaluator -> debugger -> reviewer`

Only for improving the harness itself.

## Core and default release evidence

The release-blocking core smoke loads an isolated configuration without
the token plugin, an Open Design service, or Impeccable at both supported
OpenCode boundaries. A separate default-config smoke loads the packed starter,
which declares no external plugins, at the stable boundary. The latter proves the default can load; it does not make optional
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

## Reproducible use cases

Two synthetic [end-to-end cases](use-cases/README.md) compare the harness with
a reduced direct-developer flow. They are observations from isolated opt-in
runs, not a statistical benchmark, and never include raw session evidence.
