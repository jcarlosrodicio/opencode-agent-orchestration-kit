# Harness Evidence

## Types

| Type | What it proves | When it is enough |
| --- | --- | --- |
| `static_contract` | Files, frontmatter, declared flows, manifests | Docs, contracts, and checks without behavior change |
| `transcript_replay` | JSON events from `opencode run --format json --thinking` | Agent routing or orchestration changes |
| `live_smoke` | Real behavior in repo, app, browser, or runtime | Changes that promise observable external behavior |
| `manual_oracle` | Documented human judgment | Initial exploration or product judgment that is not useful to automate |

## Thresholds

- Documentation change: `static_contract`.
- Command/agent routing change: `static_contract` + `transcript_replay`.
- Tool or runtime change: `static_contract` + `live_smoke`.
- Design/UX change: visual evidence or verifiable handoff.
- Medium/large AHE change: evaluation, debugger overview, manifest, and later
  change evaluation.

## Replays

Base command:

```bash
opencode run --format json --thinking --command <command> --dir <dir> <prompt>
```

For free-form messages:

```bash
opencode run --format json --thinking --dir <dir> <prompt>
```

Record:

- command used;
- objective;
- observed result;
- limitations;
- evaluation artifact path.

### Routing Replay

Slice 2.2 separates two surfaces: a deterministic runner for synthetic fixtures
and an opt-in live adapter for one isolated real execution. Both use the same
evaluator and produce a `pass`, `fail`, or `inconclusive` verdict. Missing
evidence is never interpreted as success.

The deterministic replay uses no network or models:

```bash
node scripts/replay-routing.mjs \
  --corpus docs/ai/evolution/benchmarks/router-scenarios.jsonl \
  --fixtures docs/ai/evolution/benchmarks/replay-fixtures.jsonl
```

Live replay requires explicit confirmation:

```bash
node scripts/run-routing-live-replay.mjs \
  --scenario <id> \
  --confirm-live
```

Live execution can consume tokens, is variable, and never runs as part of
normal checks or CI. Raw live evidence is temporary and private. The sanitized
report omits model, provider, paths, prompt, and reasoning. No model or provider
configuration is persisted in this repository, whose replay fixtures are
synthetic only.

## Session Evidence

When `/evolve` uses OpenCode session evidence, it should first collect and
normalize sources with:

```bash
node scripts/collect-session-evidence.mjs --iteration iteration-XXX
```

Local default source:

- `~/.local/share/opencode/opencode.db`

Optional raw sources:

- `RAW_SESSIONS_DIR`
- `/raw-sessions`

The collector should write staged artifacts under `runs/iteration-XXX/raw/` and
record, per source:

- `discovered`
- `accepted`
- `skipped`
- `skip_reasons`

The primary `/evolve` evidence should be written as execution trees:

- `execution-trees.jsonl`
- `cursor.json`

Rules:

- each execution tree groups one root session and all descendants linked by `parent_id`
- `normalized-sessions.jsonl` remains a secondary diagnostic view
- the canonical cursor uses `tree_time_updated_max` and `root_session_id`
- raw exports are supplemental only and do not advance the cursor
- a full-rescan mode should remain available for audits and recovery
- `debugger` and `evolver` should consume these staged artifacts first rather
  than recalculating mechanical metrics with ad hoc scripting, unless a
  limitation is made explicit
- if a metric or summary is useful repeatedly, move it into the collector or an
  auditable repo script instead of leaving it as an improvised session command
