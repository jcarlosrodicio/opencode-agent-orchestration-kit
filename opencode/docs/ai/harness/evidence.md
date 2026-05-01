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
