---
description: Run the final read-only review of the current task or diff.
agent: reviewer
subtask: false
---

Review the current diff and task against original evidence. Use `git diff` as
primary change evidence.

User arguments:

$ARGUMENTS

```text
canonical_policy: required
review_stage: final
final_verdict_authority: reviewer
```

Load `code-review-and-quality` and apply its canonical policy. Core review is
always required. Select generic backend/frontend profiles from the changed
surface. Apply strict Clean Architecture, DDD, hexagonal, CQRS, or layered
profiles only when explicitly declared by the task or repository.

Inspect `git status`, the diff, applicable instructions, task/specification,
and original validation evidence. The developer summary is context, not
evidence. Do not modify files.

Only introduced or worsened problems may block. Report relevant pre-existing
debt separately as non-blocking observations.

Return the canonical final envelope with `review_stage: final`, a verdict,
profile resolution, findings with causality, acceptance-criteria coverage,
validation rerun or `not_run`, residual risks, and a bounded correction
handoff when required.
