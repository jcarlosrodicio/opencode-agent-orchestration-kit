# Debugger Overview — iteration-019-handoff-routing-audit

## 1. Evidencia analizada

- `evaluation.md`
- staged tree artifacts under `raw/`:
  - `execution-trees.jsonl`
  - `normalized-sessions.jsonl`
  - `session-sources.summary.json`
  - `cursor.json`
- repo contracts used for attribution:
  - `agents/lead.md`
  - `docs/ai/harness/commands.md`
  - `docs/ai/harness/agents.md`

Method note: attribution is based on complete trees first. Child-session inspection was only used to confirm the observed tree order and the handoff type.

Source note: the staged source summary includes `local-opencode-db` and supplemental `external-opencode-raw`, but the accepted execution trees used for attribution here are labeled `local-opencode-db`. No source-to-source interpretation split was required for the conclusions below.

## 2. Estado

**Estado:** listo para cerrar como audit; **no listo para evolver**.

Reason: this iteration closes the routing audit with real-handoff evidence, but it does **not** produce a confirmed routing defect or harmful regression that would justify opening an evolver phase.

## 3. Patrones de fallo

### A. Small / clear / low-risk free message

- **Historical corpus behavior:** declared intent only.
  - Trees 1-3 show `lead` describing a direct implementation path, but with no child session.
- **Replay-confirmed behavior:** real handoff observed.
  - Tree 9 (`ses_18789c0caffelJSfGS4vk1i5JK`) shows first real child `developer` (`ses_18789753fffeUApXwoki4kr2jc`).
- **Pattern result:** no wrong-first-handoff confirmed.
- **Method caveat:** the replay used to force a real low-risk handoff edited the iteration's own `evaluation.md`. That is acceptable as a one-off confirmation of `lead -> developer`, but it is not the clean benchmark shape to reuse in future audits.

### B. Technical-uncertainty free message

- **Historical corpus behavior:** declared intent only.
  - Tree 4 declares `researcher` first, but has no child session.
- **Replay-confirmed behavior:** real handoff observed.
  - Tree 10 (`ses_18787a760ffe1U82oRHHZIL3Me`) shows first real child `researcher` (`ses_1878740fbffePUjEBuO5dlm5qi`).
- **Pattern result:** no wrong-first-handoff confirmed.

### C. Plan/spec free message without implementation

- **Historical corpus behavior:** both intent and real handoff exist.
  - Tree 5 shows plan-oriented declared intent only.
  - Tree 6 (`ses_187dfda06ffeY8Q50Sii1mVjuH`) shows real sequence `lead -> researcher -> specifier`.
- **Replay-confirmed behavior:** partial real handoff observed.
  - Tree 11 (`ses_187853007ffe2CO4PSgvPBZBlJ`) shows real `lead -> researcher`, then an explicit clarification gate before `specifier`.
- **Pattern result:** no premature `developer`, no phase inversion, but one gray zone remains: a natural plan-only replay stopped at `researcher + clarification` instead of advancing to `specifier` within the same tree.
- **Confidence note:** this is best read as `no confirmed regression` rather than a strong replay-level confirmation that the full `researcher -> specifier` path always closes in natural plan-only prompts.

### D. Sidecar overreach in normal free-message trees

- **Historical corpus behavior:** none confirmed in normal free-message trees.
- **Replay-confirmed behavior:** none.
  - Trees 1-11 do not invoke `evaluator`, `debugger`, or `evolver`.
  - Sidecars appear only in tree 12, an explicit `/evolve` tree.
- **Pattern result:** no sidecar overreach confirmed.

## 4. Root causes

### RC0 — No confirmed routing failure in the audited scenarios

**Facts**
- Real-handoff evidence now exists for the two scenarios that were previously only intent-backed: small/direct and technical-uncertain.
- The historical corpus already contained one real planning tree (`lead -> researcher -> specifier`).
- The natural plan-only replay did not invoke `developer` and did not invert the expected order.
- No normal free-message tree in the audited set invoked sidecars.

**Inference**
- The observed routing behavior matches the declared contract strongly enough to close the audit.

**Impact**
- There is no evidence-backed defect to hand to `evolver`.

### RC1 — Remaining issue is a contract gray zone, not a confirmed regression

**Facts**
- `agents/lead.md` says free-message routing may ask the user when ambiguity changes the correct flow, routes technical uncertainty to `researcher`, and uses `specifier` when context is already sufficient.
- `docs/ai/harness/commands.md` says free-message routing should go to `specifier` when enough context already exists, and to `researcher` when uncertainty exists.
- Tree 6 proves that a plan/spec free message can legitimately continue `researcher -> specifier`.
- Tree 11 proves that a natural plan/spec free message can also pause after `researcher` when `lead` finds a routing-defining ambiguity and asks for clarification.

**Inference**
- The unresolved issue is not “wrong routing happened”, but “the plan-only free-message class still allows two contract-compatible outcomes depending on whether ambiguity is judged material.”

**Impact**
- This is sufficient to document an auditability gray zone.
- It is **not** sufficient to claim a regression or to open an evolver cycle.

See `analysis/detail/plan-only-gray-zone.md`.

## 5. Fixes candidatos por nivel de componente

No evidence-backed harness fix is recommended from this debugger pass.

If a future iteration falsifies the current conclusion, the likely component levels would be:
- `lead` routing contract / prompt, if natural complete trees show inconsistent first-handoff within the same prompt class;
- `evaluation benchmark design`, if the real issue is auditability rather than routing behavior.

For this iteration, proposing an actual harness change would outrun the evidence.

## 6. Riesgos y regresiones

### Confirmed regressions

- None.

### Open risks

- **Plan-only classification drift:** auditors may over-interpret the tree-11 clarification gate as a routing miss even though tree-level evidence still fits the current contract.
- **Sample-shape risk:** the strongest plan-only confirmation is split across one historical real tree and one fresh natural replay rather than repeated natural trees of the same class.

### Not supported by evidence

- claiming small/direct free messages no longer fast-path to `developer`
- claiming technical-uncertainty free messages route first to the wrong agent
- claiming normal free-message traffic triggers sidecars
- claiming plan-only free messages prematurely implement
- claiming a new sequencing regression from the tree-11 clarification alone

## 7. Atribución de cambios previos

No `change_manifest.json` exists for this iteration, and the user explicitly requested debugger-only attribution without manifest work.

Therefore there is no prior change set to score as `keep`, `improve`, or `rollback+pivot` in this iteration.

## 8. Handoff para lead / evolver / reviewer

### Concise pattern summary

- Small/direct free message: **intent + real handoff now aligned** (`lead -> developer`).
- Technical uncertainty free message: **intent + real handoff now aligned** (`lead -> researcher`).
- Plan/spec free message: **historical real tree confirms `lead -> researcher -> specifier`; natural replay confirms `lead -> researcher` with clarification gate and no premature `developer`**.
- Negative control: **no sidecars in normal free-message trees**.

### Attributed root causes or absence thereof

- Primary attribution: **absence of confirmed routing defect**.
- Secondary attribution: **remaining plan-only ambiguity is a contract gray zone about when clarification stops progression to `specifier`, not a confirmed regression**.

### Confidence

- **High** that scenarios 1, 2, and the sidecar negative control are audit-closed for this iteration.
- **Medium** that plan-only free-message routing is acceptable as-is, because the evidence supports coherence but still leaves a real clarification gray zone.

### Evidence gaps / falsification criteria

Reconsider the stop/go recommendation only if future complete-tree evidence shows at least one of these under natural or stable replay conditions:

1. small/clear/low-risk free messages route first to `researcher` or `specifier` without concrete blocking ambiguity;
2. technical-uncertainty free messages route first to `developer`;
3. plan-only free messages route to `developer` or skip necessary research-sensitive steps;
4. repeated natural plan-only trees show contradictory first-handoff behavior with no material ambiguity difference;
5. normal free-message trees invoke `evaluator`, `debugger`, or `evolver` without `/evolve` or concrete failure-analysis need.

### Recommendation

**Stop at audit. Do not proceed to evolver.**

Why:
- the audit goal was to close handoff attribution with real tree evidence, and that goal is met;
- no confirmed wrong-first-handoff, sidecar overreach, or incoherent sequencing was found;
- the only remaining issue is an under-falsified plan-only gray zone, which is not strong enough to justify a harness-change search.
