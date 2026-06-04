# AHE for OpenCode

This directory applies Agentic Harness Engineering to this OpenCode harness.

The goal is for changes to agents, commands, skills, tools, and orchestration
rules to be observable, evaluable, and reversible. Medium or large harness
improvements should not rely only on intuition.

AHE is a sidecar layer. It does not redefine normal workflows.

Base flows preserved:

- `lead -> designer if applicable -> researcher -> specifier -> developer -> reviewer`
- `scoper -> researcher -> scoper synthesis -> specifier`
- `designer -> open design`

`evaluator`, `debugger`, and `evolver` are used only when they add concrete
observability or when `/evolve` runs.

## Structure

```text
docs/ai/harness/
  README.md
  agents.md
  commands.md
  evidence.md
  checks.md
docs/ai/evolution/
  README.md
  session-sources.md
  evolution_history.md
  mechanisms.jsonl
  rejected_mechanisms.jsonl
  benchmarks/manual-scenarios.md
  benchmarks/router-scenarios.jsonl
  runs/
    iteration-XXX/
      preflight-audit.json
      evaluation.md
      analysis/overview.md
      change_manifest.json
      change_evaluation.json
```

## AHE Flow

1. **Preflight audit** runs `node scripts/preflight-audit.mjs --iteration iteration-XXX` to produce an objective harness-state baseline (`preflight-audit.json`).
2. OpenCode session sources are staged before evaluation with `collect-session-evidence.mjs`.
3. `evaluator` runs or defines benchmark/smoke scenarios.
4. `debugger` analyzes results and produces root causes.
5. `evolver` proposes changes only with evidence and manifest.
6. `developer` applies bounded approved changes.
7. `evaluator` measures again.
8. `debugger` attributes fixes and regressions.
9. `reviewer` reviews diff, spec, manifest, and evaluation.
10. `lead` decides keep, improve, or rollback+pivot.

The preflight audit reuses existing staging, docs, and contracts. It produces a
scorecard, doc/runtime matrix, drifts, and prioritized recommendations as a
per-iteration artifact.

Minimum evidence hygiene in this flow:

- Always distinguish natural feature evidence from synthetic/coercive routing
  tests.
- A prompt that explicitly requires talking to every agent, every phase, or
  every sidecar counts as a synthetic routing test, not the baseline normal
  `/feature` flow.
- One coercive tree is not enough to support a sidecar-overreach claim; require
  a second independent proof source such as a natural request or a stable replay
  on the current harness.
- Explicit user requests for sidecars remain valid; the classification only
  corrects evidence attribution.

## Session Sources

`/evolve` uses OpenCode sessions, not `~/.codex/sessions`, as its base corpus.

- Primary source: `~/.local/share/opencode/opencode.db`
- Optional raw sources: `RAW_SESSIONS_DIR`, `/raw-sessions`

The collector `scripts/collect-session-evidence.mjs` stages normalized
artifacts before `evaluator`. AHE sidecars consume those staged artifacts rather
than reading external directories directly.

Primary evidence is execution-tree based:

- one root session with `parent_id = null`
- all child sessions and descendants linked by `parent_id`
- primary artifact: `execution-trees.jsonl`
- cursor artifact: `cursor.json`

The canonical incremental cursor is tree-based:

- `tree_time_updated_max`
- `root_session_id`

Raw exports are supplemental and do not advance the canonical cursor.

## Mechanism Registry

`mechanisms.jsonl` and `rejected_mechanisms.jsonl` are append-only. Before
`evolver` proposes a change, it must check whether the mechanism already exists
or was rejected. If a proposal duplicates or replaces a mechanism, it must
include `pruning_decision` to explain what is kept, what is retired, and why.

Each accepted mechanism declares `mechanism_id`, `status`, `owning_surface`,
`activation`, `behavior_key`, `behavior_change`, `evidence`, and
`failure_modes`. Rejected mechanisms declare `mechanism_id`, `status`, `reason`,
`evidence`, and `failure_modes`.

Scenarios in `benchmarks/router-scenarios.jsonl` are the compact benchmark for
routing, allowed skills, forbidden sidecars, and required evidence.

## Required Manifest

Every applied harness change should declare:

- changed files;
- failure pattern;
- evidence;
- predicted fixes;
- risk tasks;
- constraint level;
- why this component is the smallest sufficient place to change.

When an iteration includes local harness checks, report separately:

- quick smoke: `node scripts/check-harness.mjs`
- long suite: `node --test scripts/check-harness.test.mjs`

The long suite should record observed runtime and run with an explicit time
budget above the default timeout. A timeout or cancellation near the ceiling is
not enough, by itself, to classify the checker as functionally broken.
