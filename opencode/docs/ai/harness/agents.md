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
- `specifier` waits for research/design when those results affect requirements.
- `reviewer` waits for a diff, reviewable implementation, or `/plan` artifact.
- `evaluator`, `debugger`, and `evolver` are optional sidecars.
- `evolver` works only on the OpenCode harness.
