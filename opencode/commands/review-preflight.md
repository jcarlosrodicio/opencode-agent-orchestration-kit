---
description: Fast deterministic review preparation without reviewer execution.
agent: lead
---

Run only deterministic preflight for the current diff.
This is the recommended daily path when deterministic preparation is enough.

User arguments:

$ARGUMENTS

## Contract

- Do not modify files in the reviewed repository.
- Run:
  `node "${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}/scripts/review-orchestrated-prepare.mjs" --dry-run $ARGUMENTS`
- Generate the workspace, `manifest.json`, `shared-review-context.md`,
  `patches/`, and `findings/`.
- Do not invoke reviewers, subagents, or additional review.
- Return `review_stage: preflight` and `verdict: not_run`; never imply
  approval or final review.
- Do not claim an AI review was performed. Do not ask follow-up questions.
- `--retain` preserves the workspace; otherwise clean it at the end.

Return level, risk flags, considered and filtered files, recommended reviewers
clearly marked not executed, budgets, and workspace cleanup/retention state.
