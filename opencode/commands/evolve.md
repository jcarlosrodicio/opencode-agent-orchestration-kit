---
description: Run an optional AHE iteration to evaluate or improve this OpenCode harness with evidence and attribution.
agent: lead
---


Evolve the OpenCode harness:

$ARGUMENTS

Run the AHE flow that matches the requested scope. The full flow remains
mandatory for real harness changes; audit-only branches have explicit stop
conditions. This is for agents, commands, skills, tools, workflows, or harness
memory, not app features.

## Preconditions

1. Check whether the harness is in git with `git status`.
2. If git is unavailable, do not promise automatic rollback.
3. Identify or create the target iteration path under `docs/ai/evolution/runs/iteration-XXX/`.

## Init/context policy

Before evaluating or proposing harness changes, record:

- `cwd`: must be the OpenCode harness repo.
- `AGENTS.md`: local rules and evolution boundaries.
- `git state`: branch, pending changes, and real rollback ability.
- `validation commands`: `node scripts/check-harness.mjs`,
  `node --test scripts/check-harness.test.mjs`, and needed replays.
- `repo docs`: `docs/ai/harness/`, `docs/ai/evolution/`,
  `mechanisms.jsonl`, `rejected_mechanisms.jsonl`, and benchmarks.

## Flow

1. Invoke `evaluator` for benchmark/smoke evidence.
2. If the user requested evaluation/audit only and did not authorize analysis,
   manifest, or implementation, stop here with results, limitations, and the
   next handoff; do not create a manifest.
3. Invoke `debugger` for patterns and root causes when there are results or
   traces to attribute.
4. If the scope is debugger-only, no-apply, or no-manifest, stop here with root
   causes, falsification criteria, and recommendation; do not invoke `evolver`
   or `developer`.
5. Invoke `evolver` only if evidence is sufficient and the user scope allows
   harness change proposals.
6. Review the proposed manifest.
7. If the manifest is valid and applying is approved, invoke `developer` for
   bounded harness changes.
8. Re-run evaluator.
9. Re-run debugger for attribution.
10. Invoke reviewer against diff, manifest, and evaluation.
11. Close with keep / improve / rollback+pivot.

## Rules

- Do not accept changes without concrete evidence.
- Do not accept changes without predicted fixes and risk tasks.
- Do not mix independent patterns into a single change.
- Do not promise automatic rollback without git.
- Do not modify LLM config, models, credentials, or providers to simulate
  improvement.
- Create or update a manifest only when evidence is sufficient, the user scope
  allows change proposals, and the flow reached `evolver`.
- Do not invoke `developer` or apply changes without a valid manifest and
  explicit approval to apply.

## Expected Result

- Evaluated iteration.
- Manifest created or updated only when the branch reached a change proposal.
- Previous-change evaluation when applicable.
- Changes applied, if approved.
- Validations run.
- Final decision and risks.
- `Task Contract` if implementation is delegated to `developer`.
- `handoff_packet` if the iteration is left mid-flow or needs another session.
