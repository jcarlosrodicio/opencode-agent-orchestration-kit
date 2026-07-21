# Compatibility

This document is the public compatibility contract for the kit. The canonical
Node.js engine is `^22.9.0 || ^24.0.0`, and the supported OpenCode range is
`>=1.14.41 <2.0.0`.

## Status definitions

- **tested**: an exact version or environment for which the stated evidence is collected.
- **supported**: a maintained compatibility promise derived from boundary evidence.
- **experimental**: usable on a best-effort basis, without a release-blocking guarantee.
- **unsupported**: outside the maintained compatibility contract.

`tested` is not a superset of `supported`: `tested` records exact evidence,
while `supported` describes the maintained promise derived from that evidence.

## Matrix

<!-- compatibility-matrix:start -->
| Surface | Status | Contract |
|---|---|---|
| Node.js 22 | supported | 22.9.0 or newer within major 22; blocking CI |
| Node.js 24 | supported | major 24; blocking CI |
| Node.js 26 | experimental | non-blocking canary only |
| Node.js 20 and EOL/odd lines | unsupported | no release guarantee |
| OpenCode 1.14.41 | tested | minimum boundary in the blocking core smoke |
| OpenCode 1.18.4 | tested | pinned stable boundary in the blocking core smoke |
| OpenCode >=1.14.41 <2.0.0 | supported | boundary-tested compatibility promise |
| OpenCode <1.14.41 or >=2.0.0 | unsupported | requires a reviewed policy change |
| `@opencode-ai/plugin` 1.14.41 | tested | exact pin with install, import, and typecheck evidence |
| OpenTUI core/solid 0.2.5 | tested | exact pins with install, import, and typecheck evidence |
| Ubuntu GitHub runner | tested | blocking Node 22 and 24 jobs |
| macOS GitHub runner | tested | blocking Node 24 job; runner details recorded |
| Other mainstream Linux/macOS environments | supported | Bash, Node, and OpenCode must support the host |
| WSL2 | experimental | recommended upstream path, no kit-owned runner |
| Native Windows | unsupported | Bash lifecycle wrappers have no native contract |
| Token usage plugin | experimental | compile/import is tested; runtime session-tree behavior is not stable API evidence |
| Open Design Docker adapter | experimental | optional pinned image inputs, no blocking integration smoke |
| Superpowers | experimental | optional upstream Git plugin, not part of core smoke |
| Impeccable | experimental | optional externally installed skill |
<!-- compatibility-matrix:end -->

## Exact dependency pins

| Dependency | Exact pin |
|---|---|
| `@opencode-ai/plugin` | `1.14.41` |
| `@opentui/core` | `0.2.5` |
| `@opentui/solid` | `0.2.5` |

## Evidence as of 2026-07-21

### Local evidence

The compatibility contract checker, its focused tests, the repository contract
check, and whitespace validation were run in a local maintainer checkout. This
evidence confirms the committed contract and documentation consistency; it is
not evidence that every remote runner combination passed.

### Blocking CI policy

The release-blocking policy requires Ubuntu jobs on Node.js 22 and 24, a macOS
job on Node.js 24, and core OpenCode smokes at both `1.14.41` and `1.18.4`.
Those combinations remain policy statements until their remote jobs record
results. This document does not claim that the remote matrix has passed.

Node.js 26 and OpenCode `latest` are non-blocking canaries. A failed canary is
an early warning, not proof that the supported range has failed and not a
release blocker by itself. Maintainers must inspect the failure and decide
whether to fix the kit, revise this contract through review, or wait for an
upstream correction.

## Promoting a stable boundary

To promote a canary version, update `stable_tested` in `compatibility.json`, run
both the minimum and stable boundary smokes, update this document and related
surfaces, and submit the change for review. Canary jobs are read-only evidence:
they must never rewrite `compatibility.json` or documentation automatically.

## Scope

This matrix covers the kit, its declared runtime boundaries, and the listed
optional integrations. Model-provider compatibility, credentials, quotas, and
provider-specific model behavior are outside its scope.
