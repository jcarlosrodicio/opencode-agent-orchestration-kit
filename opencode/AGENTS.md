# Global Rules for OpenCode

This file is the short map for the harness. Detailed contracts live in
`docs/ai/harness/`; harness evolution records live in `docs/ai/evolution/`.

## Work model

- For normal messages without a slash command, use the simplest path.
- If a change is small, clear, and low risk, direct mode goes to `developer`.
- Full flows activate through slash commands such as `/feature`, `/scope`,
  `/design`, `/review`, or `/evolve`.
- Before implementing, understand the stack, scope, and minimum validation.
- At closure, summarize changes, validation, and risks.

## Agents

- `developer`: direct implementation and reasonable validation.
- `lead`: orchestration with phase barriers.
- `designer`: UX/UI, brand, layout, interaction, and Open Design.
- `researcher`: technical/product uncertainty, APIs, libraries, and risks.
- `specifier`: specs, atomic tasks, acceptance criteria, and validation.
- `reviewer`: diff review, security, bugs, risks, and compliance.
- `scoper`: research -> spec without implementation.
- `evaluator`: optional benchmark/smoke evidence sidecar.
- `debugger`: optional traces, root causes, and attribution sidecar.
- `evolver`: sidecar only for OpenCode harness evolution.

See `docs/ai/harness/agents.md` for full contracts.

## Base flows

- Small free-form request: `developer`.
- Full feature: `lead -> designer if applicable -> researcher -> specifier -> developer -> reviewer`.
- Scope/spec without implementation: `scoper -> researcher -> scoper synthesis -> specifier`.
- Design: `designer -> open design`.
- AHE evolution: `evaluator -> debugger -> evolver -> lead approval -> developer -> evaluator -> debugger -> reviewer`.

See `docs/ai/harness/commands.md` for command contracts.

## General rules

- Work inside the current repository.
- Respect the repository-local `AGENTS.md` when present.
- Do not touch secrets or credentials.
- Do not run destructive commands without explicit approval.
- Do not introduce dependencies without justification.
- Do not expand scope silently.
- Do not close if required validation failed or was not run without saying why.

## Superpowers discipline

This kit enables the upstream Superpowers OpenCode plugin. Use it as operational
discipline when applicable:

- brainstorming for ambiguous feature intent;
- writing-plans before complex implementation;
- test-driven-development for behavior changes when feasible;
- systematic-debugging when a bug or failure is not understood;
- verification-before-completion before claiming completion;
- requesting-code-review and receiving-code-review for review loops.

User instructions and the local repo `AGENTS.md` take precedence.

## Observability

Observability does not redefine the normal flow. `evaluator`, `debugger`, and
`evolver` are sidecars, not mandatory phases for normal features.

Evidence types:

- `static_contract`: file and contract inspection.
- `transcript_replay`: `opencode run --format json --thinking` execution.
- `live_smoke`: real repo, app, browser, or runtime check.
- `manual_oracle`: documented human judgment.

See `docs/ai/harness/evidence.md` for evidence thresholds.

## AHE evolution

To change agents, commands, skills, tools, or global rules:

1. Run evaluable scenarios with `evaluator`.
2. Turn results into root causes with `debugger`.
3. Use `evolver` only with evidence, root cause, predicted fixes, and risk tasks.
4. Record changes in `docs/ai/evolution/runs/iteration-XXX/change_manifest.json`.
5. Evaluate the next iteration with `change_evaluation.json`.

Real rollback requires git. If the harness is not versioned, do not promise
automatic rollback.
