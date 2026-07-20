# Checks and Doc Gardening

## Local Check

From the OpenCode config root, run:

```bash
node scripts/check-harness.mjs
```

This is the cheap local smoke check for the harness. It should remain the
default low-cost validation before closing small documentation or structural
changes.

For all bundled script tests from this public repository, run:

```bash
npm run unit-and-script-tests
```

The normal local check combines both paths:

```bash
npm run check
```

Use `npm run check:quick` when only the fast contract checker is needed. Use
`npm run check:release` for a clean dependency install followed by contracts,
all script tests, typechecking, dependency audit, and installation smoke.

The harness check validates:

- `opencode.json`;
- `default_agent: lead`;
- `AGENTS.md` as a short index pointing to `docs/ai/harness/` and
  `docs/ai/evolution/`;
- minimum frontmatter in `agents/*.md` and `commands/*.md`;
- documentation coverage for every `agents/*.md` file in
  `docs/ai/harness/agents.md`;
- documentation coverage for every `commands/*.md` file in
  `docs/ai/harness/commands.md`;
- local `/feature` contract;
- local `/plan` contract;
- local `/evolve` contract;
- minimum consistency between agent contracts and prompts in `agents/*.md`;
- local `/scope` and `/design` contracts;
- main docs in `docs/ai/harness/`;
- benchmark references to replay and evidence taxonomy;
- AHE run lifecycle under `docs/ai/evolution/runs/`;
- AHE manifests when present.
- local paths referenced by `change_manifest.json` and
  `change_evaluation.json`.
- `Task Contract`, `Clarifications`, `Acceptance Checklist`,
  `handoff_packet`, and init/context policy in the surfaces that require them;
- `memory-as-hint` contract: persistent memory/MCP context is a hint and must be
  verified against current state;
- accepted/rejected mechanism JSONL registries;
- router/skill scenarios in `docs/ai/evolution/benchmarks/router-scenarios.jsonl`.
- presence of `docs/ai/harness/skill_registry.md` (soft check; warns when missing);
- `agents/lead.md` contains `Skill Resolution` or a registry reference;
- `developer`, `researcher`, `specifier`, `reviewer`, `designer`, and `scoper`
  mention selected-skill behavior;
- if `scripts/update-skill-registry.mjs` exists, its `--check` mode passes;
- `commands/init.md` exists (soft check);
- `docs/ai/harness/commands.md` documents `/init`;
- `docs/ai/harness/init-detection-rules.md` exists (soft check);
- `specifier` contains the Auto-Forecast contract (`estimated_scope`,
  `affected_files`, `suggested_phases`);
- `lead` contains the Auto-Forecast gate for `large`, the advisory `Strict TDD`
  block, and context quarantine wording (`minimum handoff` + `compact output`);
- `developer` honors the `Strict TDD` block when it appears in a handoff.
- `/review-preflight` exists as the deterministic daily path and runs no AI.
- `/review-orchestrated` exposes explicit `--agents` and experimental
  `--full-agents` modes without changing `/review`.
- The orchestrated-review contract covers the temporary workspace,
  anti-injection boundary, classification, budgets, filtered lockfiles and
  generated files, timeout, partial failure, cleanup/retention, and deferred
  concurrency.
- Sensitive fixtures validate `auth/permissions -> review_security`,
  `dependencies + filtered lockfile -> review_security`, and
  `logic + deleted test -> review_tests`.
- In `--agents`, the primary coordinator uses no `task`, reads only assigned
  patches, and does not reconstruct the diff to inspect filtered files.

## AHE Run Lifecycle

- A run with `evaluation.md` but no `analysis/overview.md` and no
  `change_manifest.json` is a valid evaluator -> debugger intermediate state.
  The check must not reject it as a completed run.
- Once `change_manifest.json` exists, the run has entered proposal or apply
  phase: the check requires `analysis/overview.md`, validates the manifest, and
  requires `change_evaluation.json` so shape or closure errors are not hidden.

## Lightweight Doc Gardening

Before closing an AHE iteration:

- keep `AGENTS.md` as an index, not a long manual;
- check that commands and harness docs do not diverge;
- review incomplete runs in `docs/ai/evolution/runs/`;
- verify every manifest has predicted fixes, risk tasks, and component level;
- add `change_evaluation.json` when evaluating a previous change.

## Mechanical Doc Gardening

The local check turns the cheapest maintenance rules into mechanical checks:

- `AGENTS.md` must stay a short map, not a long manual;
- new agents and commands must appear in the harness docs;
- manifests and evaluations must not point to missing local artifacts.
- mechanisms and router scenarios must be parseable JSONL with minimum fields.

Budget rule:

- If `node --test scripts/check-harness.test.mjs` is used in an AHE iteration,
  the run should record the time budget and observed runtime so operational
  timeout is not confused with a functional checker regression.

Do not make doc gardening mandatory for normal features.
