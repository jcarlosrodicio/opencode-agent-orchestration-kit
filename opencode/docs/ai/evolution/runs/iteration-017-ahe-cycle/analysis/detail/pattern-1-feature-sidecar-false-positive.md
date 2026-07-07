# Pattern 1 — `/feature` sidecar overreach false positive from coercive test prompt

## Evidence used

- `raw/execution-trees.jsonl:36`
- `raw/normalized-sessions.jsonl:101-109`
- `commands/feature.md:26-52`
- `docs/ai/evolution/rejected_mechanisms.jsonl:2`
- `raw/normalized-sessions.jsonl:110-111` as control case

## Facts

- Root session `ses_21cb97bcdffeE10ri056Aeafpz` is a `/feature` run.
- Its prompt explicitly says: `Habla con cada agente y dile que responda exactamente cada uno OK`.
- The resulting child sessions include `evaluator`, `debugger` and `evolver` in addition to the normal feature agents.
- Current `/feature` contract says sidecars are optional and only for doubtful validation, real failures, traces, or explicit evidence requests.
- The same staged corpus also contains a control tree where technical uncertainty routes first to `researcher` without sidecar evidence.

## Root cause

The failing evaluator scenario treated a **coercive flow-test prompt** as if it were a normal feature request. That makes the observed sidecar usage non-diagnostic for the harness rule “sidecars are optional in normal feature flow.”

This is a **workflow/evidence-selection** issue: the benchmark did not separate artificial routing tests from natural user requests before inferring a product-level regression.

## Component level implicated

- `workflow`

## Predicted fixes

- Add corpus classification that marks prompts explicitly asking to contact every agent, every phase, or every sidecar as synthetic routing tests, not baseline feature evidence.
- Require a second proof source for sidecar-overreach claims: either a natural-language feature tree without coercive wording or a stable replay on the current harness.
- Keep the rejected mechanism guard (`mech-sidecars-for-every-feature`) but only trigger it from evidence that actually tests the rule.

## Risk tasks

- Ensure the classifier does not discard genuine regressions where sidecars appear without being requested.
- Audit whether there are other staged “flow test” prompts contaminating negative corpora.
- Verify that explicit user requests for sidecars remain legal when intentionally asked for.

## Falsification criteria

This diagnosis is wrong if any of the following is shown:

1. A natural `/feature` transcript, without explicit sidecar/every-agent instructions, still invokes `evaluator`, `debugger`, or `evolver` as part of the normal path.
2. A stable replay on the current harness reproduces the same sidecar fan-out for an ordinary feature request.
3. The lead/feature contract elsewhere explicitly mandates obeying “talk to every agent” even when that contradicts sidecar optionality for normal features.

## Why this is independent

This pattern is about **benchmark attribution**. It is unrelated to the checker-test runtime issue.
