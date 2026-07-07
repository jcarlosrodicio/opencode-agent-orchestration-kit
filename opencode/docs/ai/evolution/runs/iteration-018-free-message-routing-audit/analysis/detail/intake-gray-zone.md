# Detail: planning-prompt intake gray zone

## Question

Does current evidence show that `lead` is doing too much of the planning/discovery work itself before the first handoff in free-message planning prompts?

## Evidence

### Contracts

- `agents/lead.md:69-73` permits light inspection for routing.
- `agents/lead.md:53-60` forbids deep investigation and says substantive understanding should go to `researcher`.
- `docs/ai/harness/commands.md:13-15` routes technical uncertainty to `researcher` and routes directly to `specifier` only when context is already sufficient.

### Replay observations

#### `ses_187e0a2d6ffe40q84bHbdIiEWW` — plan-only, no implementation

- Lead says it already performed a “light context check”.
- Lead identifies relevant control-point docs.
- Lead still chooses `researcher` first rather than implementing or specifying directly.

#### `ses_187dfda06ffeY8Q50Sii1mVjuH` — complex planning request

- Complete tree is coherent: `lead -> researcher -> specifier`.
- Research and specification were delegated in the expected order.
- No sidecars appeared.

## What is actually proven

### Facts

- Lead sometimes reads enough to name key docs before the first handoff in planning-oriented free messages.
- In the observed replays, that pre-handoff reading did **not** cause a wrong-first-handoff, skipped research, premature implementation, or phase inversion.

### Inference

- The observed behavior is compatible with the current contract.
- The main unresolved issue is evaluator/debugger classification: the contract allows light intake, but the replay set does not define a hard observable threshold for when planning-oriented intake becomes substantive research.

### Not proven

- Not proven that lead is overreaching.
- Not proven that direct `specifier` would have been more correct.
- Not proven that this is a regression.

## Why this matters

This gray zone is operationally important for future audits because it can create false positives:

- one auditor may classify “read a few contract docs before delegating” as acceptable intake;
- another may classify the same behavior as delayed research handoff.

Current evidence is enough to flag the ambiguity, but not enough to demand a harness change.

## Falsification criteria

Escalate beyond audit only if future complete-tree evidence shows at least one of these under natural or stable replay conditions:

1. lead resolves substantive planning or technical uncertainty itself before any `researcher` handoff;
2. lead reads broad repo/config/code evidence that is necessary to answer the planning question, not just to route it;
3. direct-to-`specifier` happens while research-sensitive uncertainty is still open;
4. repeated natural free-message trees show materially different first-handoff behavior for the same planning class.

Absent that, the current best attribution is: **gray zone in auditability, not confirmed routing failure**.
