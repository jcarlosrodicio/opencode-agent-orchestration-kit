---
description: "Calibrate the current repo: detect stack, tests, conventions, and persist reusable PROJECT_CONTEXT.md."
agent: lead
---

# /init

Contract: `lead` runs lightweight repository calibration and persists context.

## Init/context policy

1. Confirm `cwd` and target repository.
2. Detect stack, test runner, conventions, and tooling from config-file signals.
3. Optionally ask user preferences such as interactive mode, context-file location, or review budget.
4. Write `PROJECT_CONTEXT.md` at the repo root, or `docs/ai/project-context.md` if the user prefers.
5. Return detection summary, confidence, and next action.

## Criteria

- `/init` is idempotent: rewrite without duplicating sections.
- Detection is based on real config files, not guesses.
- Ambiguous items are marked `unknown` or confidence `low`.
- Do not mutate project files except the context file.
- If `PROJECT_CONTEXT.md` already exists, overwrite it with updated detection.
- Strict TDD is recommended, advisory only, when tests are detected with high confidence.
- The generated file is compact, about 80 lines max, markdown bullet-list, optimized for agent reading.

## Result Contract

- `status`: pass | needs_changes | blocked
- `summary`: short summary of what was detected
- `artifacts`: path of the written file
- `next_recommended`: next step
- `risks`: low-confidence detections or unknowns
