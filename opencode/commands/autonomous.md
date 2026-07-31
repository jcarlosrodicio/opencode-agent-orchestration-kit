---
description: Run a bounded, locally verifiable autonomous engineering workflow.
agent: lead
---

authorization: explicit_command_invocation
execution_scope: local_checkout_only
max_iterations_per_invocation: 6
completion_authority: reviewer_only
canonical_review_policy: code-review-and-quality/references/review-policy.md
final_review_authority: reviewer
validation_gate: deterministic_per_iteration
canonical_state_path: .opencode/loops/<slug>.json
history_path: .opencode/loops/<slug>.history.jsonl
lock_path: .opencode/loops/<slug>.lock
human_view_path: .opencode/loops/<slug>.md
worktree_mode: prohibited
scheduling: prohibited
parallelism: prohibited
external_writes: prohibited
auto_commit_push_merge_deploy: prohibited
reviewer_execution: task_subagent_only
reviewer_evidence: required_subagent_attestation
final_review_attestation: review_stage_verdict_causality_evidence

# /autonomous

Use only for one explicitly requested local objective. Read the local rules,
Git state, and minimum validation guidance. Stop before writing if protected
changes overlap or the task reaches secrets, authorization, payments, PII,
migrations, infrastructure, production, or another material decision outside
the contract.

Write the Task Contract to `.opencode/loops/<slug>.md`. If state does not
exist, initialize it with `oak state init --root .`; otherwise inspect and
resume it. Never delete or reinitialize existing state.

## Cycle

```text
developer -> reviewer -> developer (state sync)
```

For at most six iterations, `developer` makes one focused change and runs at
least one relevant deterministic validation. `lead` invokes `reviewer` only as
a subagent with `task reviewer`; never run `opencode run --agent reviewer`.
Only that child session's final `pass` or `pass_with_observations` may complete
the objective. Preserve stage, verdict, causality, and evidence. The state-sync
step translates either successful canonical verdict to the historical runtime
`APPROVE` attestation through `oak state attest-review --root .`; `oak state
record` cannot set `completed` without that
attestation bound to the approved contract.

With `needs_changes`, the blocking finding is the only next action; with
`blocked`, pause. Every retry needs new evidence. Stop as `blocked` or `paused`
on success, six iterations,
two iterations without observable progress, a repeated failure, impossible
validation, exhausted budget, protected changes, scope expansion, or a denied
surface.

## Denylist

Do not create worktrees, schedule runs, execute parallel branches, use network
or write MCP connectors, or commit, push, merge, open a pull request, deploy,
release, tag, publish, access secrets, change permissions, touch production,
payments, PII, migrations, Terraform, or Kubernetes.
