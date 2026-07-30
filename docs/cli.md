# `oak` CLI

`oak` is the dependency-free command-line frontend for the kit's existing
lifecycle, validation, and deterministic replay tools. It delegates to the same
engines as the shell wrappers; it does not add a second implementation.

## Commands

| Command | Behavior |
| --- | --- |
| `oak install` | Install the portable harness with the existing ownership-safe lifecycle |
| `oak upgrade` | Preview or apply a compatible upgrade |
| `oak doctor` | Run actionable environment and installation diagnostics |
| `oak check` | Validate an installed harness with the checker shipped by this package |
| `oak replay` | Run the packaged deterministic routing corpus and fixtures |
| `oak state` | Run the packaged durable loop-state runtime against an explicit project root |
| `oak uninstall` | Remove only unchanged files owned by the lifecycle manifest |
| `oak rollback` | Reverse the most recent committed lifecycle operation |
| `oak version` | Print the canonical package identity |

Use `oak --help` or `oak <command> --help` for the closed option set. The
existing `install.sh`, `upgrade.sh`, `doctor.sh`, `uninstall.sh`, and
`rollback.sh` wrappers remain supported.

## Installed harness check

```bash
oak check
oak check --target /path/to/opencode-config
```

The target precedence is:

1. `--target`;
2. `OPENCODE_CONFIG_DIR`;
3. `$HOME/.config/opencode`.

The target must be an existing non-symlink directory. `oak check` runs the
checker included in the package with the target as its working directory. It
never executes a checker supplied by the target and does not repair or write
files.

## Deterministic replay

```bash
oak replay
oak replay --corpus scenarios.jsonl --fixtures fixtures.jsonl
oak replay --output report.json
```

With no overrides, replay uses the static public corpus and synthetic fixtures
included in the same package version. Overrides accept only `--corpus`,
`--fixtures`, and `--output`.

Replay preserves the engine's exit codes:

- `0`: pass;
- `1`: fail;
- `2`: invalid input or operational error;
- `3`: inconclusive.

Live replay is deliberately excluded because it requires an explicit OpenCode
runtime and session boundary. `oak benchmark` is also excluded until the kit
defines one canonical meaning rather than conflating metrics aggregation,
adversarial tests, and other evaluator workflows.

## Durable loop state

`oak state` delegates to the packaged loop-state runtime and requires a
non-implicit `--root PATH`. It supports `init`, `resume`, `record`, `release`,
`inspect`, `attest-review`, `repair`, and `migrate`; its remaining flags are exactly those of
the runtime.

```bash
oak state inspect --root /path/to/project --slug task-slug
```

The runtime keeps its JSON snapshot, append-only history, and lease lock under
`<root>/.opencode/loops/`. It does not copy its implementation into that
project. State operations may write those durable artifacts; they do not
commit, publish, access the network, or execute a target-provided script.

Before a loop can record `status: completed`, it needs a reviewer attestation:

```bash
oak state attest-review --root /path/to/project --slug task-slug \
  --reviewer-session-id reviewer-session-id \
  --reviewer-agent reviewer --reviewer-verdict APPROVE
```

This stores `<slug>.review.json`, bound to the approved contract. Completion
fails closed unless the attestation identifies the `reviewer` subagent and an
`APPROVE` verdict.

## Safety boundary

The dispatcher uses Node directly with `shell: false`. It does not install
dependencies, access the network, authenticate, inspect providers or models,
read sessions, or publish artifacts. Lifecycle commands retain their existing
confirmation, dry-run, ownership, and rollback contracts.
