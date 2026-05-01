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
  benchmarks/manual-scenarios.md
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

## Required Manifest

Every applied harness change should declare:

- changed files;
- failure pattern;
- evidence;
- predicted fixes;
- risk tasks;
- constraint level;
- why this component is the smallest sufficient place to change.
