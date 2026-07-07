# Debugger Overview — iteration-018-free-message-routing-audit

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
  - `docs/ai/harness/evidence.md`
- replay-tree confirmation from `~/.local/share/opencode/opencode.db` for the evaluator sessions cited in `evaluation.md`

Method note: attribution is based on complete trees first. Child sessions were only inspected after reconstructing the parent tree.

## 2. Estado

**Estado:** no listo para evolver/spec; **listo para cerrar como audit**.

Reason: the current evidence supports a routing audit conclusion, but does **not** show a confirmed routing defect strong enough to justify an evolver phase.

## 3. Pattern summary

### A. Over-delegation

- **Observed historical-corpus behavior:** none confirmed.
- **Replay-confirmed behavior:** none.
- **Conclusion:** no evidence that free-message routing is over-delegating in the current sample.

### B. Wrong-first-handoff

- **Observed historical-corpus behavior:** one staged free-message tree (`ses_18807423fffey1ToAgBg9YtyaI`) routes `lead -> researcher`, but the prompt is synthetic/coercive, so it only proves that path exists.
- **Replay-confirmed behavior:**
  - small/clear/low-risk prompt: lead keeps fast-path intent toward `developer`.
  - technical-uncertainty prompt: lead chooses `researcher` first.
  - plan-only prompt: lead avoids implementation and routes toward research/spec flow.
- **Conclusion:** no wrong-first-handoff confirmed.

### C. Sidecar overreach

- **Observed historical-corpus behavior:** sidecars in staged corpus appear only in `/evolve` trees.
- **Replay-confirmed behavior:** none of the normal free-message replays invoked `evaluator`, `debugger`, or `evolver`.
- **Conclusion:** no sidecar overreach confirmed.

### D. Incoherent sequencing in multi-delegation trees

- **Observed historical-corpus behavior:** no natural historical tree available to test this.
- **Replay-confirmed behavior:** complex planning replay root `ses_187dfda06ffeY8Q50Sii1mVjuH` produced coherent sequencing `lead -> researcher -> specifier`, with no extra agents and no phase inversion.
- **Conclusion:** no incoherent sequencing confirmed.

## 4. Root causes

### RC0 — No confirmed routing failure in the available evidence

**Facts**
- The staged historical corpus accepted by cursor contains only `3` trees, `2` of which are `/evolve` and therefore not baseline free-message evidence.
- The only staged free-message tree is synthetic/coercive and cannot stand in for natural baseline behavior.
- Replays cover the requested routing classes and all passed evaluator criteria.
- The complex replay tree shows the expected phase order without sidecars.

**Inference**
- The observed system behavior currently matches the declared routing contract for the scenarios tested.

**Impact**
- There is no evidence-backed defect to hand to `evolver`.

### RC1 — Evidence gap: weak natural historical baseline for free-message routing

**Facts**
- `cursor.json` shows only `3` accepted trees in the staged slice.
- `evaluation.md` explicitly records that the historical corpus is too small for a robust natural baseline.
- Natural routing conclusions therefore rest mostly on fresh replays, not on a broad historical sample.

**Inference**
- The main limitation is not a harness routing bug but insufficient naturally occurring tree evidence in this staged window.

**Impact**
- We can confirm absence of obvious failure in the tested scenarios, but not claim strong behavioral stability across broader natural traffic.

### RC2 — Contract gray zone: allowed lead intake vs. delegated research remains under-falsified for planning prompts

**Facts**
- `agents/lead.md` allows light inspection to route (`69-73`) and says substantive understanding should go to `researcher` (`53-60`).
- `docs/ai/harness/commands.md` says free-message routing may go directly to `specifier` when context is sufficient (`15`) and to `researcher` when uncertainty exists (`13`).
- In the plan-only replay `ses_187e0a2d6ffe40q84bHbdIiEWW`, lead reports a light context check before saying it would delegate to `researcher`.
- In the complex replay, lead lightly inspected docs before handing off to `researcher`, then to `specifier`; the resulting tree remained coherent.

**Inference**
- This is not a confirmed defect. It is a classification gray zone: current contracts allow some lead-owned intake, but the replay set does not yet falsify where planning-oriented intake should stop and delegated research should begin.

**Impact**
- This ambiguity can affect future audits, because different evaluators may classify the same pre-handoff reading differently.

See `analysis/detail/intake-gray-zone.md`.

## 5. Fixes candidatos por nivel de componente

No evidence-backed fixes are recommended at this time.

If a future iteration collects stronger contrary evidence, the likely component level would be:
- `workflow/evidence`: improve natural baseline collection for free-message trees.
- `agent/command contract`: only if future complete-tree evidence shows lead crossing from light intake into substantive planning/discovery before first handoff.

For this audit, proposing actual harness changes would overreach the evidence.

## 6. Riesgos y regresiones

### Confirmed regressions

- None.

### Open risks

- **Audit repeatability risk:** with such a small natural staged sample, future audits may depend too heavily on replay prompts.
- **Classification drift risk:** the intake-vs-research boundary in planning prompts may be interpreted inconsistently until a stronger natural corpus or a more falsable benchmark exists.

### Not supported by evidence

- claiming `researcher` is overused in free-message normal flow
- claiming `developer` fast-path is broken
- claiming sidecars leak into normal flow
- claiming multi-delegation sequencing is incoherent

## 7. Atribución de cambios previos

No `change_manifest.json` exists for this iteration, so there is no prior change set to score as `keep`, `improve`, or `rollback+pivot`.

Relevant historical note only: iteration 006 already tightened the `/feature` intake-vs-research boundary, but this iteration does not present evidence of a new regression in free-message routing.

## 8. Handoff para lead / specifier / evolver / reviewer

### Concise pattern summary

- No confirmed over-delegation.
- No confirmed wrong-first-handoff.
- No confirmed sidecar overreach in normal free-message flow.
- No confirmed incoherent sequencing; the only multi-delegation replay was coherent.
- The only meaningful open question is the planning-prompt gray zone around how much lead-owned intake is acceptable before first handoff.

### Confidence

- **Medium** for the replay-confirmed conclusions.
- **Low-to-medium** for historical-baseline claims, because the staged natural corpus is thin.

### Evidence gaps

- More natural free-message trees covering small/direct, technical-uncertain, and plan-only requests.
- At least one natural multi-delegation free-message tree not produced by replay.
- A benchmark that makes the planning intake boundary observable without coercing the routing outcome.

### Falsification criteria

The current “stop at audit” conclusion should be reconsidered if any future complete-tree evidence shows one of the following in a natural free-message request:

1. a small/clear/low-risk request routes first to `researcher` or `specifier` without concrete blocking ambiguity;
2. a technical-uncertainty request routes first to `developer` or to substantive lead-owned discovery;
3. a normal free-message tree invokes `evaluator`, `debugger`, or `evolver` without explicit `/evolve` or concrete failure-analysis need;
4. a planning tree inverts the expected order, e.g. `specifier` before necessary research, or `developer` before plan/spec criteria exist;
5. a planning-oriented replay or natural tree shows lead performing substantive repo/code analysis that is necessary to answer the user’s question before any `researcher` handoff.

### Recommendation

**Stop at debugger-only audit. Do not proceed to evolver.**

Why:
- there is no confirmed routing defect;
- the strongest finding is an evidence/classification gap, not a behavior regression;
- moving to evolver now would turn an audit ambiguity into an implementation search without root-cause proof.
