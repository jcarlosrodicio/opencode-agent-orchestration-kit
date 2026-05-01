# Agent Contracts

## Usage Matrix

| Agent | Use when | Do not use when | Expected evidence |
| --- | --- | --- | --- |
| `developer` | Change is small, clear, approved, or direct without slash command | Critical decision, design, or research is missing | Validation run or explicit reason |
| `lead` | Slash workflow, coordination, or phase dependencies are needed | Free-form request is small and localized | Assumptions, criteria, and barriers respected |
| `designer` | UX/UI, brand, layout, interaction, or Open Design matters | Technical change has no visual impact | Visual handoff with observable criteria |
| `researcher` | Technical/product uncertainty, APIs, libraries, risks | Fact is already clear in repo | Sources reviewed and unknowns remaining |
| `specifier` | There is enough context to turn goal into tasks | Critical research/design is pending | Acceptance criteria and validation plan |
| `reviewer` | A diff or implementation exists | There is no reviewable change | Findings by severity or explicit approval |
| `scoper` | User wants research -> spec without implementation | User asks for direct implementation | Scoped spec and ordered tasks |
| `evaluator` | Benchmark/smoke evidence or `/evolve` is needed | Normal feature already has clear validation | pass/fail/not_run results |
| `debugger` | Failures, traces, results, or attribution need analysis | There is no concrete evidence | Root cause or not-ready state |
| `evolver` | Harness improvement has AHE evidence | Normal app feature | Manifest with predicted fixes and risk tasks |

## Invariants

- `developer` is the harness `default_agent`.
- `lead` must not force the full flow for small free-form messages.
- `specifier` waits for research/design when those results affect requirements.
- `reviewer` waits for a diff or reviewable implementation.
- `evaluator`, `debugger`, and `evolver` are optional sidecars.
- `evolver` works only on the OpenCode harness.
