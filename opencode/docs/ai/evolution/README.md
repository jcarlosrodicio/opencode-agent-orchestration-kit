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
  evolution_history.md
  mechanisms.jsonl
  rejected_mechanisms.jsonl
  benchmarks/manual-scenarios.md
  benchmarks/router-scenarios.jsonl
  runs/
    iteration-XXX/
      evaluation.md
      analysis/overview.md
      change_manifest.json
      change_evaluation.json
```

## AHE Flow

1. `evaluator` runs or defines benchmark/smoke scenarios.
2. `debugger` analyzes results and produces root causes.
3. `evolver` proposes changes only with evidence and manifest.
4. `developer` applies bounded approved changes.
5. `evaluator` measures again.
6. `debugger` attributes fixes and regressions.
7. `reviewer` reviews diff, spec, manifest, and evaluation.
8. `lead` decides keep, improve, or rollback+pivot.

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
