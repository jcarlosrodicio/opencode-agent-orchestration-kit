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
completion_authority: reviewer_only
state_path: .opencode/loops/<slug>.md
worktree_mode: explicit_opt_in
```

Each iteration follows:

```text
developer -> reviewer -> developer (state sync)
```

## Interface

- `/loop <objective>` designs a new loop.
- `/loop resume <slug>` reads `.opencode/loops/<slug>.md` and proposes resuming
  from its recorded next action.
- Enable a worktree only when the user explicitly includes `worktree` in the
  arguments or requests it at the approval gate. Otherwise work sequentially in
  the current checkout.
- Every invocation, including a resume, opens a new block of at most three
  iterations.

## Phase 1: preflight and Loop Contract

Before any write or handoff to `developer`:

1. Read `AGENTS.md`, `PROJECT_CONTEXT.md`, or `docs/ai/project-context.md` when
   present, plus git state and the minimum relevant repository documentation.
2. For resume, read the requested state. If it does not exist, stop and ask for
   a valid slug; do not silently create a replacement.
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

After approval, delegate only the creation or initial update of
`.opencode/loops/<slug>.md` to `developer`. Do not edit it as `lead`.

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

## Phase 3: bounded cycle

For each available iteration:

1. Send `developer` a self-contained handoff with the approved contract, state,
   protected changes, one next action, and expected validation.
2. `developer` makes one focused change, runs reasonable validation, and records
   evidence in state. It cannot expand scope or declare the objective complete.
3. Send the diff, contract, and Verification Envelope to `reviewer`.
4. `reviewer` returns exactly `APPROVE`, `REJECT`, or `ESCALATE_HUMAN`, with
   evidence and an assessment of every success criterion.
5. Delegate only verdict/state synchronization back to `developer`. This
   administrative write does not consume an iteration and cannot include
   implementation changes.
6. On `REJECT`, make the actionable findings the only next action. On
   `ESCALATE_HUMAN`, pause immediately.
7. Mark `completed` only when every criterion passes and `reviewer` returns
   `APPROVE`. A `developer` completion claim is never sufficient.

## Stop conditions

Stop, synchronize state, and provide a human handoff when any condition occurs:

- objective completed with `APPROVE`;
- three iterations consumed in the invocation;
- two consecutive iterations without observable progress;
- approved scope must expand;
- required validation cannot be run or interpreted;
- overlap with pre-existing local changes;
- a third attempt on the same failure;
- any change to `.env`, secrets, credentials, authentication, authorization,
  payments, billing, PII, migrations, Terraform, Kubernetes, or production.

For sensitive paths use `blocked` or `paused` and `ESCALATE_HUMAN`; never create
a silent exception.

## First-version boundaries

- No auto-merge.
- No schedules or recurring cadence.
- No write-enabled MCP connectors.
- No parallel execution.
- No implicit worktree creation.
- No new dependencies, agents, or skills.

## Closure

Always report the slug and state path, status, iterations used, changes,
validation, latest verdict, stop reason, risks, and next human decision.
Distinguish `pass`, `fail`, and `not_run`; never present `not_run` as success.
