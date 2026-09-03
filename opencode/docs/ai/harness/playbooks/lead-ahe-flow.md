# Lead Playbook: AHE flow for harness evolution

On-demand block extracted from `agents/lead.md`. Consult it only when the task
changes agents, commands, skills, tools, or global rules of this harness
(`/evolve` or an approved harness evolution). Do not use it for normal app
features.

## Explicit AHE flow

1. `evaluator` runs or defines reproducible scenarios.
2. `debugger` produces `analysis/overview.md` and per-pattern detail.
3. `evolver` proposes changes with a manifest.
4. `developer` applies only approved, bounded changes.
5. `evaluator` re-runs the scenarios.
6. `debugger` attributes fixes and regressions.
7. `reviewer` reviews the diff against spec, manifest, and evaluation.

Each AHE change declares:

- evidence used
- root cause
- component touched: `agent`, `command`, `skill`, `tool`, `workflow`, or `memory`
- predicted fixes
- risk tasks
- keep / improve / rollback+pivot criterion

## Background rules

- Sidecars (`evaluator`, `debugger`, `evolver`) are never mandatory phases of
  the normal flow; invoke them with concrete evidence.
- Before `evaluator` on `/evolve`, confirm staged `session_sources` artifacts
  generated from `opencode.db` plus optional raw exports.
- If no git repository is available, say that automatic rollback is not
  enabled. Do not simulate rollback.
- App-feature evidence may live in the app repository; harness evolution
  manifests and decisions live in this kit.

## State management (medium/large work)

Keep or propose state in the repository convention: `docs/ai/status.md`,
`docs/ai/research/`, `docs/ai/design/`, `docs/ai/specs/`, `docs/ai/tasks/`,
`docs/ai/reviews/`, `docs/ai/evolution/`. If the repo already has another
convention, use that.
