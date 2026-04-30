# Workflows

## Direct mode

Free-form messages without a slash command use `developer` by default. This is intended for small, clear, low-risk changes where a full product-development pipeline would be unnecessary.

If the request has ambiguity, visual/product impact, medium or large scope, or critical missing context, switch to `/feature`, `/scope`, `/design`, or `/spec`.

## Feature

`lead -> designer if applicable -> researcher -> specifier -> developer -> reviewer`

The lead decides whether design or research is needed. Specifier waits for relevant discovery. Developer waits for spec. Reviewer waits for diff.

## Scope

`scoper -> researcher -> scoper synthesis -> specifier`

No design, implementation, or review.

## Design

`designer -> open-design`

Designer reads product/design docs, optionally uses Impeccable, then creates or runs an Open Design project.

## AHE

`evaluator -> debugger -> evolver -> lead approval -> developer -> evaluator -> debugger -> reviewer`

Only for improving the harness itself.
