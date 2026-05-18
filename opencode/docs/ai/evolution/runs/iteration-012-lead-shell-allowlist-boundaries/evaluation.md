# Evaluation: iteration-012-lead-shell-allowlist-boundaries

## Objective

Reduce approval drift after iteration 011 by guiding `lead` to reuse exact
allowlisted shell primitives during lightweight repo inspection.

## Evidence

- `transcript_replay`: exact `which node` and `cd .` runs succeeded without a
  permission request.
- `transcript_replay`: exact `pwd` still requested permission, preserving the
  fallback boundary.
- `transcript_replay`: a natural inspection prompt that named `cd` and
  `which node` originally drifted to a nearby compound command form, causing an
  avoidable permission request.

## Result

Keep the tool allowlist unchanged and tighten the `lead` contract at the agent
level. The intended behavior is selection discipline, not broader shell
authority.
