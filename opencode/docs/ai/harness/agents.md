# Agent Contracts

## Usage Matrix

| Agent | Use when | Do not use when | Expected evidence |
| --- | --- | --- | --- |
| `developer` | Change is small, clear, approved, or delegated by lead | Critical decision, design, or research is missing | Validation run or explicit reason |
| `lead` | Free-form message without slash command, slash workflow, coordination, or phase dependencies | The task was already delegated to another agent | Routing decision, assumptions, criteria, and barriers respected |
| `designer` | UX/UI, brand, layout, interaction, or Open Design matters | Technical change has no visual impact | Visual handoff with observable criteria |
| `researcher` | Technical/product uncertainty, APIs, libraries, risks | Fact is already clear in repo | Sources reviewed and unknowns remaining |
| `specifier` | There is enough context to turn goal into tasks | Critical research/design is pending | Acceptance criteria and validation plan |
| `reviewer` | A diff, implementation, or `/plan` artifact exists | There is no reviewable change or planning artifact | Findings by severity or explicit approval |
| `scoper` | User wants research -> spec without implementation | User asks for direct implementation | Scoped spec and ordered tasks |
| `evaluator` | Benchmark/smoke evidence or `/evolve` is needed | Normal feature already has clear validation | pass/fail/not_run results |
| `debugger` | Failures, traces, results, or attribution need analysis | There is no concrete evidence | Root cause or not-ready state |
| `evolver` | Harness improvement has AHE evidence | Normal app feature | Manifest with predicted fixes and risk tasks |

## Invariants

- `lead` is the harness `default_agent` and acts as a bounded router for free-form messages.
- `lead` must not force the full flow for small free-form messages.
- `lead` does not edit files; if implementation or correction requires repo
  changes, delegate to `developer`.
- `lead` does not develop, deeply investigate code, or review diffs as a
  substitute for `researcher` or `reviewer`; it only gathers minimum routing
  context.
- If `lead` needs to understand how the code works before deciding what to do,
  it delegates substantive discovery to `researcher`.
- If there is a diff, implementation, or reviewable plan, bug, security,
  regression, and compliance review belongs to `reviewer`.
- Every `lead` handoff to another agent must be self-contained: objective,
  minimum context, constraints, assumptions, expected output, and expected
  validation or evidence.
- During lightweight shell inspection, `lead` should prefer exact allowlisted
  primitives already named by the user, without drifting to nearby substitutes
  or compound shell commands when a single call is enough.
- `developer` executes direct mode when `lead` delegates a small, clear, verifiable task.
- Once `developer` receives an implementation task, later adjustments for that
  same free-form request go back to `developer`; `lead` only consolidates,
  decides, or reroutes.
- Local skills in `skills/` are process checklists for agents, not a new
  mandatory orchestration layer.
- `lead` must consult `docs/ai/harness/skill_registry.md` before delegating
  non-trivial work, selecting 0-3 relevant skills per handoff.
- `lead` preserves context quarantine: minimum handoff + compact output,
  without carrying long history when decisions, paths, and evidence are enough.
- If `specifier` marks `estimated_scope: large`, `lead` asks the user whether
  to split, continue as one change, or adjust scope before delegating to
  `developer`.
- If project context marks `strict_tdd_recommended: yes`, `lead` includes an
  advisory `Strict TDD` block for testable tasks.
- `specifier` waits for research/design when those results affect requirements.
- `specifier` includes `estimated_scope`, `affected_files`, and
  `suggested_phases` for non-trivial specs that feed implementation.
- `reviewer` waits for a diff, reviewable implementation, or `/plan` artifact.
- `evaluator`, `debugger`, and `evolver` are optional sidecars.
- `evolver` works only on the OpenCode harness.

## Task Contract and handoff_packet

`specifier`, `developer`, and `reviewer` must work against a `Task Contract`
when the change is not trivial. The minimum block is:

- `objective`: observable result.
- `success_criteria`: verifiable criteria.
- `non_goals`: out-of-scope items.
- `assumptions`: accepted assumptions.
- `open_questions`: open questions or `none`.
- `accepted_tradeoffs`: accepted tradeoffs or `none`.
- `validation`: commands, tests, or evidence.
- `ask_abort_triggers`: conditions for asking, blocking, or returning work.

For long, multi-agent, or resumable work, the responsible agent adds a compact
`handoff_packet` with current objective, decisions made, files read/touched,
validation state, blockers, and next action. Long logs are referenced by path
and are not pasted into context.

`lead` must consult `docs/ai/harness/skill_registry.md` before delegating
non-trivial work, selecting 0-3 relevant skills per handoff.

## Result Contract

When `specifier`, `developer`, or `reviewer` closes a non-trivial phase, it must
return a compact `Result Contract` so the next agent does not need to interpret
free-form prose. The minimum block is:

- `status`: `pass`, `needs_changes`, `blocked`, or `not_run`.
- `summary`: short actionable result.
- `artifacts`: relevant files, specs, diffs, or logs.
- `next_recommended`: recommended next step.
- `risks`: open risks or `none`.
- `skill_resolution`: skills used, skills skipped, and fallback if applicable.

`developer` also adds a `Verification Envelope` before closeout:

- `commands_run`: commands executed.
- `results`: relevant result for each command.
- `not_run`: validations not run and why.
- `evidence`: paths, outputs, or observable checks reviewed.
