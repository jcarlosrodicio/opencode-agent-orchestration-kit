# Detail: plan-only free-message gray zone

## Question

Does the plan-only free-message evidence show a routing defect, or only a contract-compatible clarification gate?

## Evidence

### Contracts

- `agents/lead.md` routes technical uncertainty to `researcher`, routes already-sufficient context to `specifier`, and tells `lead` to ask the user when ambiguity changes the correct flow.
- `docs/ai/harness/commands.md` uses the same split for normal free-message routing.

### Historical real tree

#### Tree 6 — `ses_187dfda06ffeY8Q50Sii1mVjuH`

- Prompt explicitly asks for the normal multi-agent process to reach an implementation-ready plan without editing files.
- Complete observed sequence: `lead -> researcher -> specifier`.
- This proves the harness can advance beyond research in a free-message planning request when the routing path is sufficiently resolved.

### Natural replay tree

#### Tree 11 — `ses_187853007ffe2CO4PSgvPBZBlJ`

- Prompt asks for an implementation-ready plan with acceptance criteria, no file edits yet.
- Complete observed sequence: `lead -> researcher`, then clarification from `lead`.
- The clarification is about whether free-message plan/spec requests should always be treated as planning flow rather than direct implementation flow.
- No `developer` handoff occurred.
- No sidecars appeared.

## What is proven

### Facts

- Free-message plan/spec requests can produce real `researcher -> specifier` continuation.
- Free-message plan/spec requests can also stop after `researcher` when `lead` judges a routing-defining ambiguity still open.
- The natural replay did not show premature implementation or phase inversion.

### Inference

- Tree 11 is better attributed as a clarification gate inside an otherwise coherent planning path, not as a confirmed routing failure.

## What is not proven

- Not proven that `specifier` should always have been invoked in tree 11.
- Not proven that the clarification itself is harmful behavior.
- Not proven that the difference between trees 6 and 11 is a regression rather than prompt-level ambiguity.

## Why this matters

This is the only remaining gray zone that could tempt an unnecessary evolver cycle. The evidence supports documenting it, but not escalating it into a defect.

## Falsification criteria

Escalate beyond audit only if future complete-tree evidence shows one of these:

1. repeated natural plan-only trees stall at `researcher + clarification` even when the routing policy is already explicit;
2. materially similar plan-only prompts alternate between `specifier` and non-`specifier` outcomes without an observable ambiguity difference;
3. plan-only requests route to `developer` or skip needed research-sensitive steps.

Current best attribution: **audit gray zone, not confirmed routing regression**.
