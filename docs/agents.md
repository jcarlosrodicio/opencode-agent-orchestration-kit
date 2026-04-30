# Agents

## Core agents

- `lead`: orchestrates feature work and enforces phase barriers.
- `scoper`: lightweight research -> spec orchestrator.
- `designer`: uses PRODUCT.md/DESIGN.md, optional Impeccable, and Open Design.
- `researcher`: verifies code, docs, APIs, alternatives, and risks.
- `specifier`: produces specs, tasks, acceptance criteria, and validation plans.
- `developer`: implements approved tasks and validates changes.
- `reviewer`: reviews diffs against spec and returns verdicts.

## Optional AHE sidecars

- `evaluator`: captures benchmark/smoke evidence.
- `debugger`: turns results and traces into root causes.
- `evolver`: proposes harness changes only with evidence.

Sidecars are not part of the normal feature flow.
