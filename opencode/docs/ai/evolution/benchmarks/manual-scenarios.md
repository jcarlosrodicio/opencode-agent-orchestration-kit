# Benchmark Scenarios

These scenarios are the initial harness benchmark. They can be executed as a
manual oracle, but behavior changes should move toward real replay with JSON
events.

## Base Command

Free-form message:

```bash
opencode run --format json --thinking --dir /path/to/repo "<prompt>"
```

Slash command:

```bash
opencode run --format json --thinking --command <command> --dir /path/to/repo "<prompt>"
```

## Evidence Taxonomy

- `static_contract`: inspect files, frontmatter, manifests, and declared flows.
- `transcript_replay`: run `opencode run --format json --thinking`.
- `live_smoke`: test the real repo, app, browser, or runtime.
- `manual_oracle`: documented human judgment when automation is not useful.

## Scenarios

## feature-small-no-design

Goal: verify that a small feature with no visual impact does not activate design
unnecessarily.

Criteria:

- `lead` inspects context.
- `specifier` produces minimum acceptance criteria when the change is not trivial.
- `developer` does not act without clear criteria.
- `reviewer` reviews only after a diff.

Minimum evidence: `static_contract`.
Evidence for routing changes: `transcript_replay`.

## feature-technical-research

Goal: verify that technical uncertainty goes through research before spec.

Criteria:

- `researcher` reads internal sources before external ones.
- `specifier` waits for research handoff.
- Risks and assumptions enter the spec.

Minimum evidence: `static_contract`.
Evidence for routing changes: `transcript_replay`.

## feature-design-open-design

Goal: verify that visual impact activates designer and Open Design.

Criteria:

- `designer` looks for `PRODUCT.md` and `DESIGN.md`.
- If they are missing, designer uses or proposes product/design context.
- Visual handoff contains observable criteria.
- `specifier` waits for visual handoff.

Minimum evidence: `static_contract`.
Evidence for visual changes: `live_smoke` or verifiable visual handoff.

## research-to-spec-no-implementation

Goal: verify that `scoper` does not implement.

Criteria:

- Allowed flow: researcher -> optional debugger only with evidence -> specifier.
- Does not invoke designer, developer, or reviewer.
- Produces scoped, validatable tasks.

Minimum evidence: `static_contract`.
Evidence for routing changes: `transcript_replay`.

## review-current-diff

Goal: verify that `reviewer` reviews the diff against spec/evidence.

Criteria:

- Uses `git diff` if available.
- If no git exists, declares the limitation.
- Findings are ordered by severity.
- Does not modify files.

Minimum evidence: `static_contract`.

## ambiguous-request-clarification

Goal: verify that ambiguous requests do not become invented specs.

Criteria:

- `lead` or `specifier` lists assumptions.
- If a critical decision is missing, asks for clarification.
- If a reasonable assumption is enough, marks it.

Minimum evidence: `manual_oracle`.
Evidence for routing changes: `transcript_replay`.

## validation-failure-blocks-close

Goal: verify that failed validation blocks closure.

Criteria:

- `evaluator` records fail when used.
- `debugger` analyzes root cause if the failure is not obvious.
- `reviewer` does not approve without a decision about the failure.
- `lead` closes only with explicit risk or follow-up task.

Minimum evidence: `static_contract`.
Evidence for close/validation changes: `transcript_replay` or `live_smoke`.
