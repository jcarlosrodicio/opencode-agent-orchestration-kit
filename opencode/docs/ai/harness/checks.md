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

Slice 3.3 adds `docs/ai/harness/orchestration-contracts.json` as the portable
authority for mechanical relationships between agents, commands, workflows,
barriers, retries, and evidence. The checker selects exactly one inventory
profile (`private` or `public`), then cross-checks the contract with
frontmatter, the routing corpus, and narrative documentation. Frontmatter
remains the effective OpenCode configuration, while Markdown retains rules
that do not belong in the schema. Version 1 validates only; it does not
generate or rewrite agents, commands, or docs.

The normal local check combines both paths:

```bash
npm run check
```

Deterministic routing replay is part of normal validation:

```bash
node scripts/replay-routing.mjs \
  --corpus docs/ai/evolution/benchmarks/router-scenarios.jsonl \
  --fixtures docs/ai/evolution/benchmarks/replay-fixtures.jsonl
```

The contract checker validates the replay surface and scenario-ID
correspondence but does not execute the live adapter. Live replay requires
`--confirm-live`, can consume tokens, and remains outside normal checks and CI.

Slice 2.3 aggregates one or more sanitized reports without rereading raw
evidence:

```bash
node scripts/summarize-routing-metrics.mjs \
  --corpus docs/ai/evolution/benchmarks/router-scenarios.jsonl \
  --report /path/to/routing-replay-report.json
```

The aggregator requires `operational_status: "ok"` and the same
`corpus_digest`. It writes deterministic JSON to stdout, does not call models,
and does not make automatic harness-optimization decisions.

Slice 2.4 adds durable structured state for `/loop`. Run its focused tests with:

```bash
node --test scripts/loop-state.test.mjs
```

The dependency-free runtime maintains a JSON snapshot, append-only JSONL
history, and exclusive lock. Tests cover crash recovery, same-session
contention, symlink boundaries, journal continuity, migration, and explicit
repair.

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
- durable `/loop` runtime, tests, and canonical JSON/JSONL/lock paths;
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
- router/skill scenarios in
  `docs/ai/evolution/benchmarks/router-scenarios.jsonl`: exact schema v1 keys
  (`schema_version`, `id`, `category`, `prompt`, `command_path`,
  `expected_root_agent`, `required_agents`, `forbidden_agents`,
  `allowed_skills`, `forbidden_skills`, `write_before_spec_policy`,
  `review_policy`, `expected_stop_condition`, `maximum_delegation_budget`, and
  `required_evidence`); agents derived from regular `agents/*.md` files that
  satisfy the existing frontmatter contract; root-agent consistency with
  `default_agent` or the selected command; unique IDs and array entries, with
  disjoint required/forbidden and allowed/forbidden lists; coverage of all 12
  categories; and invariants for review, pre-spec writes, delegation budget,
  and evidence. This is a static check and does not execute replays;
- routing replay surface: deterministic/live runners and the metrics aggregator
  as regular files, one synthetic fixture per corpus ID, and documented
  tri-state, opt-in, and privacy contracts;
- portable adversarial corpus at
  `docs/ai/evolution/benchmarks/adversarial-scenarios.jsonl`, with exactly
  eleven threats and one real defense per scenario;
- `node --test scripts/adversarial-harness.test.mjs` verifies review
  boundaries, paths and symlinks, shell/network permissions, durable approval,
  canaries, supply-chain rules, and corrupt or repeated events;
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
- The canonical review policy and backend/frontend profiles are present;
  strict architecture profiles require explicit declaration, partial reviews
  cannot pass, and only introduced or worsened findings may block.
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
- mechanisms and router scenarios must be parseable JSONL with their required
  schema and invariants.

Budget rule:

- If `node --test scripts/check-harness.test.mjs` is used in an AHE iteration,
  the run should record the time budget and observed runtime so operational
  timeout is not confused with a functional checker regression.

Do not make doc gardening mandatory for normal features.
