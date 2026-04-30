# Global Rules for OpenCode

## Work model

Use a phased product-development flow:

1. Research when there is uncertainty.
2. Design when there is visual, UX, brand, layout, or interaction impact.
3. Specification before medium or large implementation.
4. Implementation in small changes.
5. Review before closing.

For normal messages without a slash command, prefer direct mode: if the change is small, clear, and low risk, it can go straight to implementation with reasonable validation. Full flows activate when the user uses commands like `/feature`, `/scope`, `/design`, `/evolve`, or when the scope truly requires orchestration.

## Available agents

- `lead`: main orchestrator for product work.
- `scoper`: lightweight research -> spec orchestrator.
- `designer`: visual design, UX/UI, Open Design handoff.
- `researcher`: technical and product research.
- `specifier`: specifications, tasks, acceptance criteria, validation plan.
- `developer`: implementation.
- `reviewer`: code review.
- `evaluator`: optional AHE evidence sidecar.
- `debugger`: optional AHE/debugging sidecar.
- `evolver`: optional harness-evolution sidecar.

## General rules

- Work inside the current repository.
- Respect the repository-local `AGENTS.md` when present.
- Do not touch secrets or credentials.
- Do not run destructive commands without explicit approval.
- Do not introduce dependencies without justification.
- Understand the stack and conventions before implementing.
- Do not implement without a minimal spec and acceptance criteria.
- Do not close without validation evidence or a clear reason validation was not run.
- Summarize changes, validation, and risks at closure.

## Base flows

- Feature: `lead -> designer if applicable -> researcher -> specifier -> developer -> reviewer`.
- Scope: `scoper -> researcher -> scoper synthesis -> specifier`.
- Design: `designer -> open-design`.

These base flows are command contracts, not mandatory behavior for every free-form message.

Rules:

- If research is pending, `specifier` waits.
- If design affects requirements or acceptance criteria, `specifier` waits.
- `developer` waits for `specifier`.
- `reviewer` waits for `developer` and a reviewable diff.
- Only parallelize independent work.
- `lead` acts as the barrier between phases.

## Superpowers discipline

This kit enables the upstream Superpowers OpenCode plugin. Use it as operational discipline when applicable:

- brainstorming for ambiguous feature intent;
- writing-plans before complex implementation;
- test-driven-development for behavior changes when feasible;
- systematic-debugging when a bug or failure is not understood;
- verification-before-completion before claiming completion;
- requesting-code-review and receiving-code-review for review loops.

User instructions and the local repo `AGENTS.md` take precedence.

## AHE sidecars

AHE sidecars do not redefine the normal feature flow. Use them only when there is concrete value:

- `evaluator`: additional smoke/benchmark evidence or `/evolve`.
- `debugger`: failures, traces, root cause, or `/evolve`.
- `evolver`: changes to this harness only; never normal app features.

Harness evolution flow:

1. `evaluator` captures scenarios and results.
2. `debugger` turns results into patterns and root causes.
3. `evolver` proposes changes only with evidence, predicted fixes, and risk tasks.
4. `developer` applies approved harness changes.
5. `evaluator` and `debugger` attribute fixes/regressions.
6. `reviewer` reviews manifest, diff, and evaluation.
