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
| `oak run` | Open, record, inspect, and close the task run context of an explicit project root |
| `oak deliver` | Push a reviewed feature branch and open its pull request, or read its CI checks |
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

## Task run context

A task run spans the sessions, subagents, and reviews that deliver one change.
`oak run` keeps its identity in the working tree, next to the loop state:

```bash
oak run start --root /path/to/project --slug task-slug [--kind production|benchmark]
oak run status --root /path/to/project
oak run event --root /path/to/project --type review blocking=0 verdict=safe_to_commit
oak run close --root /path/to/project --output docs/ai/runs/2026-09-27-task-slug/run-summary.json
```

- `start` writes `<root>/.opencode/runs/active.json` (schema `oak.run/1`) with
  a `run_id` of the form `oak_<YYYYMMDDTHHMMSSZ>_<8 hex>`, the change slug, the
  current branch, and the repository name. It is idempotent on the same branch
  and refuses only while a run from another branch is open. The directory
  carries its own `.gitignore`, so the context never shows up in `git status`.
- `event` appends one `oak.event/1` line to `active.events.jsonl`. The type
  is one of `agent_session`, `review`, `runtime_verification`, `verify`,
  `delivery`, or `ci`; keys are lowercase; integer values stay numbers and
  control characters are stripped. Without an open run it succeeds and records
  nothing.
- `status` reports the run and its event count, and flags it as stale when it
  belongs to another branch or is older than seven days.
- `close` writes an `oak.run.summary/1` file inside the root, which is meant to
  be committed with the change, and removes the active context.

The run context is optional and gates nothing: a stale run is only reported. It
uses no network and no subprocess. Events carry counts and enums only, never
prose, prompts, output, secrets, or absolute paths; the words belong in the
task reports.

## Delivery

`oak deliver` is the only path from a finished loop to a remote. Agents are
denied `git push` and `gh`; this command runs them itself with `shell: false`.

```bash
oak deliver pr --root /path/to/project --slug task-slug --title "feat: add x" --body-file pr-body.md
oak deliver checks --root /path/to/project --pr 7
```

`pr` refuses before touching the remote unless, in this order:

1. the loop `<slug>` is `completed`;
2. its `<slug>.review.json` attestation is a reviewer `APPROVE` bound to the
   approved contract;
3. the current branch is not the default branch, `main`, `master`, or a
   detached `HEAD`;
4. the working tree is clean, apart from OAK's own `.opencode/loops` and
   `.opencode/runs` state;
5. the branch has at least one commit ahead of `origin/<default>`;
6. the body file is a regular file inside the root with no absolute home path,
   and the title has 1-200 characters.

It then runs `git push --set-upstream origin <branch>`, never forced, and
`gh pr create` against the default branch, and records a `delivery` event
when a task run is open. `checks` returns `gh pr checks` as JSON and treats
the pending exit status 8 as success.

There is no merge, auto-merge, release, or deploy action, by design.

## Safety boundary

The dispatcher uses Node directly with `shell: false`. It does not install
dependencies, access the network, authenticate, inspect providers or models,
read sessions, or publish artifacts. Lifecycle commands retain their existing
confirmation, dry-run, ownership, and rollback contracts.
