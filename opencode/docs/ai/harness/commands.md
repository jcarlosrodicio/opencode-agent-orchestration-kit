# Command Contracts

## Free-form Message

Contract: `lead` router -> appropriate agent.

Criteria:

- `lead` decides quickly between `developer`, `researcher`, `designer`, or `specifier`.
- `lead` may inspect only the minimum needed for routing; if it needs to
  understand code behavior or diagnose flow, it delegates to `researcher`.
- If the change is small, clear, and low risk, delegate to `developer` with minimum validation.
- If there is technical/product uncertainty, delegate to `researcher`.
- If there is UX/UI, brand, layout, interaction, or visual criteria impact, delegate to `designer`.
- If enough context exists but tasks, criteria, or a plan are missing, delegate to `specifier`.
- If there is a diff, implementation, or reviewable plan, delegate review to
  `reviewer` instead of reviewing it as `lead`.
- If ambiguity changes the correct flow, ask the user before delegating.

## `/feature`

Contract: `lead -> designer if applicable -> researcher -> specifier -> developer -> reviewer`.

Init/context policy:

- Read `PROJECT_CONTEXT.md` at the repo root, or `docs/ai/project-context.md`,
  when present. Use it as a context accelerator for validation commands, testing
  posture, and stack. Treat it as advisory, not as truth.
- Read or locate `cwd`, `AGENTS.md`, `git state`, `validation commands`, and
  `repo docs` only as needed for routing.
- The small-task fast path must not become broad discovery.
- `lead` consults `docs/ai/harness/skill_registry.md` to select relevant skills
  per handoff.

Criteria:

- `designer` acts before `specifier` if UX, brand, layout, interaction, or visual
  acceptance criteria matter.
- `researcher` acts before `specifier` if technical uncertainty, APIs,
  libraries, risks, or architecture matter.
- The first `lead` action in `/feature` is classification and handoff building
  only: it may gather minimal routing context, but must not do substantive
  discovery, broad repository/config inspection, or close technical conclusions
  before delegating uncertainty to the correct agent.
- If the request states or reveals technical/product/API/library/risk/
  architecture uncertainty, the first substantive discovery on that topic is a
  `researcher` task; the handoff includes objective, uncertainty, constraints,
  and expected evidence without pre-resolving the question.
- If the request states or reveals UX/UI, brand, layout, interaction, or visual
  criteria uncertainty, the first substantive discovery on that topic is
  delegated to `designer`.
- `researcher` is not universal: simple, clear features without relevant
  uncertainty may keep fast routing toward spec/implementation.
- `designer` and `researcher` may run in parallel only if their results are
  independent.
- `developer` does not act without acceptance criteria.
- `reviewer` does not act without a reviewable diff.
- `lead` does not replace `reviewer`; it only consolidates the verdict and sends
  bounded fixes back to `developer` when changes are required.

## `/plan`

Contract: `lead -> researcher -> specifier -> reviewer`.

Init/context policy:

- Read `PROJECT_CONTEXT.md` at the repo root, or `docs/ai/project-context.md`,
  when present. Use it as a context accelerator.
- Record `cwd`, `AGENTS.md`, `git state`, `validation commands`, and
  `repo docs` as planning context.
- Deliver `Clarifications`, `Task Contract`, and `Acceptance Checklist`.

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

Init/context policy:

- Fix `cwd`, `AGENTS.md`, `git state`, `validation commands`, and `repo docs`
  before research.

Criteria:

- No design, implementation, or diff review.
- `debugger` enters only for traces, results, or concrete previous evidence.
- Output is scoped specs, atomic tasks, and validation.

## `/mvp-spec`

Contract: `scoper -> researcher -> scoper synthesis -> specifier`.

Criteria:

- Same no-implementation boundary as `/scope`.
- Produces a strict MVP spec with small 1-2 hour tasks.
- Makes out of scope explicit.
- Stops if research is not ready for spec.

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

### `/test`

Contract: auxiliary/subtask `developer` with testing/debugging skills.

Criteria:

- Design or run bounded validation for a task, bug, or diff.
- For bugs, reproduce first with a test or observable evidence when viable.
- May implement the minimum code needed if the test fails and scope is clear.
- Does not replace `/feature` when research, design, spec, or scope decisions
  are missing.

### `/code-simplify`

Contract: auxiliary/subtask `developer` with `code-simplification`.

Criteria:

- Simplify bounded code without changing observable behavior.
- Do not mix simplification with new features or adjacent refactors.
- Run reasonable validation to prove behavior was preserved.
- If unrelated dead code is found, report it without deleting it.

## `/design`

Contract: `designer -> open design`.

Criteria:

- Read `PRODUCT.md` and `DESIGN.md` when they exist.
- Use `impeccable` only when product/design context is missing.
- Use `open-design` for editable project or visual generation as requested.

## `/evolve`

Full contract for real harness changes: `evaluator -> debugger -> evolver -> lead approval -> developer -> evaluator -> debugger -> reviewer`.

Init/context policy:

- Confirm harness `cwd`, `AGENTS.md`, `git state`, `validation commands`, and
  `repo docs` before proposing or applying changes.
- Consult `mechanisms.jsonl`, `rejected_mechanisms.jsonl`, and benchmarks for
  novelty/pruning before the manifest.
- Consult `docs/ai/evolution/session-sources.md` before evaluation.

Session sources:

- Primary source: `~/.local/share/opencode/opencode.db`
- Optional raw sources: `session_sources` from `RAW_SESSIONS_DIR` or `/raw-sessions`
- Required staging step: `node scripts/collect-session-evidence.mjs --iteration iteration-XXX`
- Without external raw exports, `/evolve` still runs from `opencode.db`
- Primary evidence is tree-based, not flat-session based
- `parent_id` links the root session and subagent children
- Canonical incremental cursor: `tree_time_updated_max` + `root_session_id`
- Raw exports are supplemental and do not advance the canonical cursor
- A full-rescan mode remains available for audit/debug recovery

Local validation expectations in AHE:

- `node scripts/check-harness.mjs` is the quick harness smoke and does not
  replace the full suite.
- `node --test scripts/check-harness.test.mjs` is long validation; run it with
  an explicit budget above the default timeout, record observed runtime, and do
  not mark it as a functional failure only because the shell or harness canceled
  it near the time ceiling.

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
- Historical trees used as benchmarks must be classified by prompt type:
  natural feature requests vs synthetic/coercive routing tests.
- A prompt that explicitly asks to talk to every agent, every phase, or every
  sidecar is not enough, by itself, to claim a `/feature` sidecar-overreach
  regression; require a second independent proof source such as natural
  evidence or a stable replay on the current harness.
- This rule does not invalidate real requests where the user intentionally asks
  for sidecars; it only prevents confusing them with the normal-flow baseline.
- The next measurement needs `change_evaluation.json` when a manifest/change was
  applied or previous changes are being evaluated.
- Do not promise automatic rollback without git.
- `~/.codex/sessions` is not the base corpus for `/evolve`.
- Sidecars should reason at execution-tree level first and only descend to individual child sessions for diagnosis.

## `/review`

Contract: `reviewer`.

Criteria:

- Review `git diff`, active spec, and available evidence.
- If the diff changes the harness, also review AHE manifests and evaluations.

## `/init`

Contract: `lead` runs lightweight repository calibration and persists a
`PROJECT_CONTEXT.md`.

Init/context policy:

- Confirm `cwd` and target repository.
- Detect stack, test runner, conventions, and tooling from real config-file
  signals.
- Write `PROJECT_CONTEXT.md` at the repo root.
- Return detection summary, confidence, and next action.

Criteria:

- Idempotent: rewrite without duplicating sections.
- Detection is based on real files, not guesses.
- Ambiguous items are marked `unknown`.
- Does not mutate project files except the context file.
- `lead` reads `PROJECT_CONTEXT.md` at the start of `/feature` and `/plan` when
  it exists.
