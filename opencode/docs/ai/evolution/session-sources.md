# Session Sources for AHE

`/evolve` is OpenCode-first. The primary local session source is:

- `$HOME/.local/share/opencode/opencode.db`

Optional secondary raw exports:

- `RAW_SESSIONS_DIR`
- `/raw-sessions`

## Priority

1. Local OpenCode SQLite storage
2. Optional raw-session exports

If no external raw export is available, `/evolve` still works from local OpenCode
storage.

## Evidence unit

`/evolve` should not treat each `session_id` as a primary standalone evidence unit.

The primary unit is an `execution tree`:

- a root session with `parent_id = null`
- all child sessions and descendants linked by `parent_id`

Sidecars should review the full tree first and only descend to individual child
sessions for fine-grained diagnosis.

## Supported formats

- `opencode-sqlite`: local SQLite with `session`, `message`, and `part`
- `opencode-raw-json`: `ses_*.json` raw exports

## Collection and staging

Before `evaluator`, stage session evidence with:

```bash
node scripts/collect-session-evidence.mjs --iteration iteration-XXX
```

or use `--full-rescan` for audits and recovery.

The collector writes staged artifacts under:

- `docs/ai/evolution/runs/iteration-XXX/raw/session-sources.summary.json`
- `docs/ai/evolution/runs/iteration-XXX/raw/normalized-sessions.jsonl`
- `docs/ai/evolution/runs/iteration-XXX/raw/execution-trees.jsonl`
- `docs/ai/evolution/runs/iteration-XXX/raw/cursor.json`

Sidecars should consume staged artifacts instead of reading external directories
directly.

## Incremental cursor

The canonical cursor is tree-based, not flat-session based:

- boundary: `tree_time_updated_max`
- tie-breaker: `root_session_id`

Each iteration should:

- find the latest valid prior iteration
- read its `cursor.json`
- treat trees with newer `tree_time_updated_max` as new evidence
- or, on equal timestamps, use `root_session_id` as the tie-breaker

If no prior valid cursor exists, the run falls back to a baseline full tree scan.

## Minimum filtering

The collector should:

- discard `[]`
- discard invalid JSON
- keep SQLite sessions when the session row is valid even if long text is missing
- record `discovered`, `accepted`, `skipped`, and `skip_reasons` per source

## Dedupe

If the same `session_id` appears in SQLite and raw export, SQLite is canonical
by default and the raw export is reported as a duplicate.

Raw exports are supplemental:

- they may enrich replay/debug coverage
- they do not advance the canonical cursor
- they do not replace `opencode.db` as the source of truth
