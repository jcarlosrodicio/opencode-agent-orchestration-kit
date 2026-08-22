# Public synchronization boundary

This repository publishes a reviewed public projection of a fuller private
harness. The public payload contains portable agents, commands, skills,
contracts, tests, and read-only runtime helpers under `opencode/`, plus the
installation and release tooling required to distribute them.

The projection is deliberately not a private checkout mirror. Provider
discovery, local model assignment, credentials, authentication files, MCP
servers, private endpoints, sessions, transcripts, logs, and raw runtime
evidence stay outside this repository. Public files must use portable relative
paths and example service URLs only.

<!-- projection-source-commit: 1ca607adcbae12cd16de1772662d942852b32502 -->

The marker above identifies the reviewed source projection for release
provenance. It is a commit identity only; it does not disclose the source
checkout, its providers, or its runtime evidence.

The source-side manifest classifies changes as `copy`, `translate`,
`transform`, `exclude`, or `generated`. The private comparator verifies that
classification before a change reaches this repository. This repository's
`check-public-boundary.mjs` then verifies the required projection surfaces and
reuses the same private-marker scan as `check.sh`.

The boundary check is read-only. It does not install dependencies, publish a
package, create a release, or synchronize a target checkout.
