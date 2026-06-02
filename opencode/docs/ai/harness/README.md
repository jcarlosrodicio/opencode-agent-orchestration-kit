# OpenCode Harness

This directory is the harness system of record. `AGENTS.md` should stay a short
map; details that agents need for action, validation, or harness evolution live
here.

## Sources of Truth

- `agents.md`: agent contracts and usage matrix.
- `commands.md`: command contracts and phase barriers.
- `evidence.md`: evidence types and required threshold by change type.
- `checks.md`: local validation and lightweight doc gardening.
- `skill_registry.md`: generated skill index for selective `lead` handoffs.
- `docs/ai/evolution/`: AHE history, benchmarks, manifests, and attribution.

## Principles

- Humans direct; agents execute against verifiable contracts.
- Useful documentation is short, local, and versioned.
- A repeated or fragile rule should become a mechanical check.
- Harness changes need evidence proportional to risk.
- Sidecars add observability, not mandatory bureaucracy.

## Done Criteria

A harness change is ready when:

- the affected contract is updated;
- `node scripts/check-harness.mjs` passes from the OpenCode config root;
- an AHE iteration has evaluation and manifest when behavior changed;
- there is at least `static_contract` evidence and, for behavior changes, a
  `transcript_replay` or `live_smoke`.
