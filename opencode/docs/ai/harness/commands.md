# Command Contracts

## Free-form Message

Contract: `lead` router -> appropriate agent.

Criteria:

- `lead` decides quickly between `developer`, `researcher`, `designer`, or `specifier`.
- If the change is small, clear, and low risk, delegate to `developer` with minimum validation.
- If there is technical/product uncertainty, delegate to `researcher`.
- If there is UX/UI, brand, layout, interaction, or visual criteria impact, delegate to `designer`.
- If enough context exists but tasks, criteria, or a plan are missing, delegate to `specifier`.
- If ambiguity changes the correct flow, ask the user before delegating.

## `/feature`

Contract: `lead -> designer if applicable -> researcher -> specifier -> developer -> reviewer`.

Criteria:

- `designer` acts before `specifier` if UX, brand, layout, interaction, or visual
  acceptance criteria matter.
- `researcher` acts before `specifier` if technical uncertainty, APIs,
  libraries, risks, or architecture matter.
- `designer` and `researcher` may run in parallel only if their results are
  independent.
- `developer` does not act without acceptance criteria.
- `reviewer` does not act without a reviewable diff.

## `/plan`

Contract: `lead -> researcher -> specifier -> reviewer`.

Criteria:

- No implementation and no `developer`.
- No `designer`; if design is needed, declare that dependency or recommend
  `/design` or `/feature`.
- `researcher` always acts first and returns context, alternatives, risks, and a
  recommendation.
- `specifier` acts only after the lead synthesis of research.
- `reviewer` reviews the plan/spec even when there is no diff.
- If reviewer finds significant issues, lead allows exactly `1` correction pass.
- After the second review, lead delivers the plan with risks or declares a
  blocked state; it does not open more cycles.

## `/scope`

Contract: `scoper -> researcher -> scoper synthesis -> specifier`.

Criteria:

- No design, implementation, or diff review.
- `debugger` enters only for traces, results, or concrete previous evidence.
- Output is scoped specs, atomic tasks, and validation.

## Visible Auxiliary/Subtask Commands

These commands are visible slash commands, but they do not add mandatory phases
or promote sidecars by themselves. They inherit the barriers of the parent flow,
or the `lead` barriers when used directly.

### `/research`

Contract: auxiliary/subtask `researcher`.

Criteria:

- Clarify technical/product uncertainty, APIs, libraries, risks, or architecture.
- Do not implement and do not invoke `developer` by itself.
- Return context, alternatives, risks, recommendation, and remaining unknowns.

### `/implement`

Contract: auxiliary/subtask `developer`.

Criteria:

- Execute approved changes or clear acceptance criteria.
- Do not replace `/feature`, `/plan`, or `/scope` when research, design, spec,
  or scope decisions are still missing.
- Keep reasonable minimum validation and do not add mandatory review/evaluation
  unless the parent flow requires it.

## `/design`

Contract: `designer -> open design`.

Criteria:

- Read `PRODUCT.md` and `DESIGN.md` when they exist.
- Use `impeccable` only when product/design context is missing.
- Use `open-design` for editable project or visual generation as requested.

## `/evolve`

Full contract for real harness changes: `evaluator -> debugger -> evolver -> lead approval -> developer -> evaluator -> debugger -> reviewer`.

Allowed no-apply branches:

- `evaluation-only`: stops after `evaluator` when the user requested audit or
  evaluation only and did not authorize analysis, manifest, or implementation.
- `debugger-only` / `no-apply` / `no-manifest`: stops after `debugger` with root
  causes, falsification criteria, and handoff; it does not invoke `evolver` or
  `developer`.

Criteria:

- No changes without concrete evidence.
- Every applied change needs a valid `change_manifest.json` and approval to
  apply.
- Manifest, developer, and implementation are conditional on sufficient
  evidence, user scope, and approval; they are not mandatory outputs of
  evaluation-only or debugger-only branches.
- The next measurement needs `change_evaluation.json` when a manifest/change was
  applied or previous changes are being evaluated.
- Do not promise automatic rollback without git.

## `/review`

Contract: `reviewer`.

Criteria:

- Review `git diff`, active spec, and available evidence.
- If the diff changes the harness, also review AHE manifests and evaluations.
