---
description: "Design and run a bounded engineering loop with durable state, human approval, and independent verification."
agent: lead
---

Objective or action:

$ARGUMENTS

Run a manual, resumable engineering loop for work with mechanical validation.
This command does not schedule recurring runs or turn the task into unattended
automation.

## Verifiable invariants

```text
approval_gate: explicit_before_writes
max_iterations_per_invocation: 3
planned_iteration_budget: task_specific_1_to_6
hard_safety_ceiling: 6
completion_authority: reviewer_only
canonical_review_policy: code-review-and-quality/references/review-policy.md
final_review_authority: reviewer
canonical_state_path: .opencode/loops/<slug>.json
history_path: .opencode/loops/<slug>.history.jsonl
lock_path: .opencode/loops/<slug>.lock
human_view_path: .opencode/loops/<slug>.md
worktree_mode: explicit_opt_in
```

The three-iteration value limits one invocation. The persisted
`planned_iteration_budget` (`planned_iterations` in canonical state) is the total budget for the mission and may not
exceed the hard ceiling of six; `current_iteration` may never exceed that
budget. Once the total budget is exhausted, the loop must stop as `blocked` or
`completed` rather than injecting another continuation.

The durable `handoff_packet` (`.opencode/handoffs/<slug>.md` with
`approval_status`) persists human approval to survive session restarts. `/loop`
keeps `.opencode/loops/<slug>.json` as canonical state,
`.opencode/loops/<slug>.history.jsonl` as append-only history, and
`.opencode/loops/<slug>.md` as the human view. See
`docs/ai/harness/agents.md` section "Durable `/loop` state".

Each iteration follows:

```text
developer -> reviewer -> developer (state sync)
```

## Interface

- `/loop <objective>` designs a new loop.
- `/loop resume <slug>` inspects canonical state before the gate and acquires
  the durable lock only after explicit approval.
- Enable a worktree only when the user explicitly includes `worktree` in the
  arguments or requests it at the approval gate. Otherwise work sequentially in
  the current checkout.
- Every invocation, including a resume, opens a new block of at most three
  iterations.

## Phase 1: preflight and Loop Contract

Before any write or handoff to `developer`:

1. Read `AGENTS.md`, `PROJECT_CONTEXT.md`, or `docs/ai/project-context.md` when
   present, plus git state and the minimum relevant repository documentation.
2. For resume, run only `node scripts/loop-state.mjs inspect` and read the
   requested Markdown. If state is missing or corrupt, stop; do not silently
   repair or replace it. `inspect` is read-only and does not acquire the lock.
3. Identify pre-existing local changes and mark them protected. If the loop must
   touch an already modified path, stop and request a human decision.
4. Load `autonomous-loops` to design bounds and `verification-loop` to define
   evidence, using `docs/ai/harness/skill_registry.md` when present.
5. Present a `Loop Contract` containing:
   - slug and one-sentence objective;
   - observable success criteria;
   - scope and non-goals;
   - allowed areas and protected pre-existing changes;
   - validation commands and any necessary baseline result;
   - risks, denylist, and escalation triggers;
   - `current_checkout` or `worktree_explicit` execution mode;
   - the three-iteration limit and stop conditions.
6. Request explicit human approval of the contract and end the turn waiting for
   the response. Do not write state, invoke `developer`, or modify files before
   receiving that approval.

If the user rejects or changes the contract, revise the design or finish without
writes. Approval of the original objective is not approval of the concrete
`Loop Contract`.

## Phase 2: initialize state

After approval, delegate only:

1. for a new loop, creation or update of `.opencode/loops/<slug>.md`, followed
   by `node scripts/loop-state.mjs init` with git baseline, session, and a
   unique `action_id`;
2. for an approved resume, `node scripts/loop-state.mjs resume` with slug,
   contract, session, and a new `action_id`.

Do not edit those files as `lead`.

The readable Markdown state must include:

- `status`: `approved`, `running`, `completed`, `paused`, or `blocked`;
- objective, success criteria, scope, non-goals, and denylist;
- execution mode and git baseline;
- protected pre-existing changes;
- validation commands;
- block number, current iteration, and maximum of three;
- per-iteration change, files, commands, results, and evidence;
- latest reviewer verdict and next action;
- human decisions and termination reason.

The project may version or ignore the state according to its own rules. Do not
modify `.gitignore` unless explicitly requested.

JSON is the source of truth for schema version, approved contract hash, git
baseline, session, approval, lease, status, iteration, last completed step,
blocking cause, and last action ID. Record every transition with
`node scripts/loop-state.mjs record`. Repeating identical content with the same
`action_id` is idempotent; reusing it for different content is an error.
Transitions from the same session are serialized inside the durable lock. A
retry succeeds only when journal, snapshot, and locks prove a complete commit;
otherwise it returns `recovery_required`.

## Phase 3: bounded cycle

For each available iteration:

1. Send `developer` a self-contained handoff with the approved contract, state,
   protected changes, one next action, and expected validation.
2. `developer` makes one focused change, runs reasonable validation, and records
   evidence in state. It cannot expand scope or declare the objective complete.
3. Send the diff, contract, and Verification Envelope to `reviewer`.
4. `reviewer` returns `review_stage: final` and exactly `pass`,
   `pass_with_observations`, `needs_changes`, or `blocked`, with causality,
   evidence, and an assessment of every success criterion.
5. Delegate only verdict/state synchronization back to `developer`. This
   administrative write does not consume an iteration and cannot include
   implementation changes. It updates the Markdown view and records the
   canonical transition with a new `action_id`.
6. On `needs_changes`, make the blocking findings the only next action. On
   `blocked`, pause immediately.
7. Mark `completed` only when every criterion passes and `reviewer` returns
   `pass` or `pass_with_observations`. If runtime state requires historical
   `APPROVE`, record it only as a translation of either successful canonical
   verdict. A `developer` completion claim is never sufficient.

## Stop conditions

Stop, synchronize state, and provide a human handoff when any condition occurs:

- objective completed with final `pass` or `pass_with_observations`;
- three iterations consumed in the invocation;
- two consecutive iterations without observable progress;
- approved scope must expand;
- required validation cannot be run or interpreted;
- overlap with pre-existing local changes;
- a third attempt on the same failure;
- any change to `.env`, secrets, credentials, authentication, authorization,
  payments, billing, PII, migrations, Terraform, Kubernetes, or production.

For sensitive paths use `blocked` or `paused`; never create a silent exception.

## First-version boundaries

- No auto-merge.
- No schedules or recurring cadence.
- No write-enabled MCP connectors.
- No parallel execution.
- No implicit worktree creation.
- No new dependencies, agents, or skills.

## Recovery and repair

- An interrupted write can leave the journal ahead of the snapshot. Run
  `node scripts/loop-state.mjs repair` to rebuild JSON from the latest complete
  event.
- Repair validates continuity of slug, contract, baseline, approval, iteration,
  and lease before trusting `state_after`.
- `--truncate-tail` removes only an incomplete final JSON line; middle
  corruption is rejected.
- `repair` refuses an active lock unless `--release-lock` explicitly authorizes
  releasing an abandoned lock. There is no automatic timeout unlock.
- `migrate` converts schema v0 or Markdown-only state to schema v1 only with
  `--approval-status approved`; old approval is never inherited.
- On pause or closure, run `release` with the owning session and a new
  `action_id`.

## Closure

Always report the slug, JSON/JSONL/Markdown paths, status, iterations used,
changes, validation, latest verdict, stop reason, risks, and next human
decision. Distinguish `pass`, `fail`, and `not_run`; never present `not_run` as
success.
