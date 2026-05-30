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
- validation expectations:
  - `node scripts/check-harness.mjs` is the cheap local smoke check;
  - `node --test scripts/check-harness.test.mjs` is the long checker suite and
    should run with an explicit time budget above the default harness timeout,
    record observed runtime, and not be classified as a functional failure only
    because cancellation happened near the time ceiling.
- `repo docs`: `docs/ai/harness/`, `docs/ai/evolution/`,
  `mechanisms.jsonl`, `rejected_mechanisms.jsonl`, `session-sources.md`, and benchmarks.

## Session Sources

`/evolve` is OpenCode-first. Its local default source is:

- `~/.local/share/opencode/opencode.db`

The primary evidence unit is an `execution tree`, not a flat standalone session:

- one root session with `parent_id = null`
- all child sessions and descendants linked through `parent_id`

`session_sources` may add optional raw exports from:

- `RAW_SESSIONS_DIR`
- `/raw-sessions`

Before invoking `evaluator`, stage normalized evidence with:

- `node scripts/collect-session-evidence.mjs --iteration iteration-XXX`

The collector should emit:

- `execution-trees.jsonl`
- `normalized-sessions.jsonl`
- `session-sources.summary.json`
- `cursor.json`

By default, `/evolve` runs incrementally from the latest valid tree cursor:

- canonical boundary: `tree_time_updated_max`
- tie-breaker: `root_session_id`

Raw exports are supplemental:

- they may enrich replay/debug coverage
- they do not advance or reset the canonical cursor
- `--full-rescan` remains available for audits and recovery

If no external raw exports are available, `/evolve` still runs from `opencode.db`.

## Flow

1. Collect `session_sources` and stage normalized artifacts with `collect-session-evidence.mjs`.
2. Invoke `evaluator` for benchmark/smoke evidence.
3. If the user requested evaluation/audit only and did not authorize analysis,
   manifest, or implementation, stop here with results, limitations, and the
   next handoff; do not create a manifest.
4. Invoke `debugger` for patterns and root causes when there are results or
   traces to attribute.
5. If the scope is debugger-only, no-apply, or no-manifest, stop here with root
   causes, falsification criteria, and recommendation; do not invoke `evolver`
   or `developer`.
6. Invoke `evolver` only if evidence is sufficient and the user scope allows
   harness change proposals.
7. Review the proposed manifest.
8. If the manifest is valid and applying is approved, invoke `developer` for
   bounded harness changes.
9. Re-run evaluator.
10. Re-run debugger for attribution.
11. Invoke reviewer against diff, manifest, and evaluation.
12. Close with keep / improve / rollback+pivot.

## Rules

- Do not accept changes without concrete evidence.
- Do not accept changes without predicted fixes and risk tasks.
- Do not mix independent patterns into a single change.
- Do not promise automatic rollback without git.
- Do not modify LLM config, models, credentials, or providers to simulate
  improvement.
- Do not use `~/.codex/sessions` as the base corpus for `/evolve`.
- Do not treat a subagent child session as primary evidence when it belongs to an execution tree.
- Classify prompts that explicitly order the harness to talk to every agent,
  every phase, or every sidecar as synthetic/coercive routing tests, not as
  natural `/feature` evidence.
- One coercive `/feature` tree, by itself, is not enough to claim sidecar
  overreach; require a second proof source such as a natural feature tree or a
  stable replay on the current harness.
- Explicit user requests to use sidecars remain legal; synthetic classification
  only prevents misattribution as the baseline normal feature flow.
- Create or update a manifest only when evidence is sufficient, the user scope
  allows change proposals, and the flow reached `evolver`.
- Do not invoke `developer` or apply changes without a valid manifest and
  explicit approval to apply.

## Expected Result

- Evaluated iteration.
- Staged `session_sources` and `execution tree` artifacts.
- Manifest created or updated only when the branch reached a change proposal.
- Previous-change evaluation when applicable.
- Changes applied, if approved.
- Validations run.
- Final decision and risks.
- `Task Contract` if implementation is delegated to `developer`.
- `handoff_packet` if the iteration is left mid-flow or needs another session.
