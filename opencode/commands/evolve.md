---
description: Run an optional AHE iteration to improve this OpenCode harness with evidence and attribution.
agent: lead
---


Evolve the OpenCode harness:

$ARGUMENTS

Run the optional AHE flow. This is for agents, commands, skills, tools, workflows, or harness memory, not app features.

## Preconditions

1. Check whether the harness is in git with `git status`.
2. If git is unavailable, do not promise automatic rollback.
3. Identify or create the target iteration path under `docs/ai/evolution/runs/iteration-XXX/`.

## Flow

1. Invoke `evaluator` for benchmark/smoke evidence.
2. Invoke `debugger` for patterns and root causes.
3. Invoke `evolver` only if evidence is sufficient.
4. Review the proposed manifest.
5. If approved, invoke `developer` for bounded harness changes.
6. Re-run evaluator.
7. Re-run debugger for attribution.
8. Invoke reviewer against diff, manifest, and evaluation.
9. Close with keep / improve / rollback+pivot.
