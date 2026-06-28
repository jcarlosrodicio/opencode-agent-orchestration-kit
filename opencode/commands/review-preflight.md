---
description: Fast deterministic review preparation without reviewer execution.
agent: lead
---

Run only the deterministic preflight for the current diff.

User arguments:

$ARGUMENTS

## Contract

- This is the recommended daily path.
- Do not modify files in the reviewed repository.
- Run `rtk node scripts/review-orchestrated-prepare.mjs --dry-run` with received
  scope or budget arguments.
- Generate the workspace, `manifest.json`, `shared-review-context.md`,
  `patches/`, and `findings/`.
- Do not invoke reviewers, subagents, or additional review.
- Do not claim an AI review was performed; this is preflight only.
- Do not ask follow-up questions; return the observed result and stop.
- `--retain` preserves the workspace; otherwise clean it at the end.

Return level, risk flags, considered and filtered files, recommended reviewers
clearly marked not executed, budgets, and workspace path or cleanup state.
