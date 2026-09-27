# OpenCode 2 support

## Status

OpenCode 2 support is **experimental**. The supported range is
`>=2.0.18 <3.0.0`, recorded as `opencode_v2` in `compatibility.json`. Its CI
runs in `.github/workflows/opencode-v2.yml` and is non-blocking: do not mark
it as a required status check while the status is `experimental`.

OpenCode 1 (`>=1.14.41 <2.0.0`) remains the supported, release-blocking line.
One repository and one installed payload serve both lines.

## What works

- Config, agents, commands and skills keep their OpenCode 1 shape. OpenCode 2
  translates that shape in memory when it loads the config directory.
- The shell export guard, the Open Design tools and the task-run session
  links run as OpenCode 2 core plugins.
- The mission toasts and the token sidebar run as the OpenCode 2 CLI plugin
  in `opencode/plugins/oak-tui/`.
- The session evidence collector reads the OpenCode 2 tables `session_v2`
  and `session_message`.

## Known differences

- OpenCode 2 does not send per-agent `temperature` to models yet.
- `compaction.prune` is ignored.
- `lsp`, `list` and `todowrite` are not OpenCode 2 tools.
- MCP tools default to Code Mode. Set `codemode: false` on a server to restore
  its direct tools.
- `tui.json` is replaced by the global `cli.json`.
- The `instructions` array is accepted but not applied.
- Commands with `subtask: true` run as background child sessions.
- OpenCode 2 renames `task` to `subagent` and `bash` to `shell`.
  `opencode/AGENTS.md` maps the names for every agent.
- The shell export guard checks calls to the `shell` tool, as it checks the
  `bash` tool on OpenCode 1. It does not hook the OpenCode 2 shell service, so
  a shell that does not come from the `shell` tool is not checked.
- One OpenCode 2 server can serve several projects. Task-run session links
  only record sessions of the plugin's own directory, but the CLI plugin shows
  mission toasts for every session its server reports.

## Switching between OpenCode 1 and 2

- Both lines use the `opencode` binary, the same config directory and the same
  database. The OpenCode 2 installer replaces OpenCode 1.
- Going from OpenCode 1 to OpenCode 2 and back works: on first start OpenCode 2
  imports the OpenCode 1 sessions and leaves the OpenCode 1 tables in place.
  OpenCode 1 cannot open a database that OpenCode 2 created from scratch; it
  fails with `Database is not empty and has no session table`.
- Run `oak doctor` after switching. On an OpenCode 2 release inside the
  supported range it reports `info` for `opencode-version` and
  `compatibility`.
- To try OpenCode 2 without touching your setup, isolate it: point
  `OPENCODE_CONFIG_DIR` and the XDG directories (`XDG_CONFIG_HOME`,
  `XDG_DATA_HOME`, `XDG_STATE_HOME`, `XDG_CACHE_HOME`) at temporary
  directories. `opencode api --standalone` answers before plugins activate,
  so query plugins through `opencode plugin list` or a running server.

## Layout rules

Both runtimes scan the same `plugins/` folder. OpenCode 1 loads only
`plugins/*.{ts,js}` files; OpenCode 2 also loads plugin directories. Each
plugin entry file default-exports one object: OpenCode 1 calls `server`,
OpenCode 2 calls `setup`.

```
opencode/
  plugins/
    shell-export-guard.ts      entry: { id, server: v1, setup: v2 }
    open-design.ts             entry: { id, server: no-op (v1 uses tools/), setup: v2 }
    mission-runtime.ts         entry: { id, server: v1, setup: v2 }
    token-tree-usage.tsx       OpenCode 1 CLI plugin (loaded through tui.json); no-op setup
    oak-tui/                   OpenCode 2 CLI plugin package (OpenCode 1 ignores directories)
      server.ts                { id: "oak.tui", setup() {} }, required so OpenCode 2 loads the tui entry
      tui.tsx                  token sidebar and mission toasts
  runtime/
    v1/                        OpenCode 1 adapters only
      shell-export-guard.ts
      mission-runtime.ts
    v2/                        OpenCode 2 adapters and their runtime-neutral helpers
      shell-export-guard.ts
      open-design.ts
      mission-runtime.ts
      mission-events.mjs, token-usage.mjs (with .d.mts and .test.mjs)
  scripts/
    shell-export-guard-core.mjs   shared shell export decision
    session-sources.mjs           OpenCode 1 and 2 session SQL
  tools/
    open_design.ts             OpenCode 1 file-tool wrapper
    open-design-tools.mjs      shared Open Design tool definitions
typecheck/v2/                  OpenCode 2 type workspace, never shipped
scripts/opencode-v2-smoke.mjs  OpenCode 2 runtime smoke
```

Rules:

- OpenCode-1-only code lives in `opencode/runtime/v1/`, or carries the marker
  `oak:v1-only` on the line or at the top of the file.
- Unit-tested behavior lives in `.mjs` files with a sibling `.d.mts`. The
  `.ts` and `.tsx` files stay thin adapters.
- OpenCode 2 adapters use `import type` only, so the harness ships no OpenCode
  2 dependency. Their types are checked in `typecheck/v2/` with
  `npm run typecheck:v2`.

## Retiring OpenCode 1 (checklist)

1. Delete `opencode/runtime/v1/`, `opencode/plugins/token-tree-usage.tsx`,
   `opencode/tui.json` and `opencode/tools/open_design.ts`.
2. Remove every line marked `oak:v1-only`, and every block between
   `oak:v1-only — start` and `oak:v1-only — end`: `rg -n "oak:v1-only"`. This drops
   the `server` keys from the plugin entries, the OpenCode 1 branch in
   `opencode/scripts/session-sources.mjs` and the OpenCode 1 line in the
   doctor.
3. Remove the `opencode` key from `compatibility.json`. Rename `opencode_v2` to
   `opencode`, and fold the checker's OpenCode 2 code into the main path.
4. Drop `@opencode-ai/plugin` and `@opentui/*` 0.2.5 from
   `opencode/package.json` and the `typecheck` script. Move the `typecheck/v2`
   pins into the shipped manifest only if a runtime import becomes necessary.
5. Replace `scripts/opencode-compat-smoke.sh` with
   `scripts/opencode-v2-smoke.mjs`, and merge `.github/workflows/opencode-v2.yml`
   into `check.yml` as blocking jobs.
6. Rewrite the prompts to `subagent` and `shell`, update the pinned tokens in
   `opencode/scripts/check-harness.mjs`, and delete the tool-name glossary in
   `opencode/AGENTS.md`.
7. Convert `opencode.json` and the agent frontmatter to native OpenCode 2 keys
   (`agents`, `permissions` arrays, `plugins`) only after OpenCode 1 is gone.
   Never mix OpenCode 1 and OpenCode 2 keys inside one agent file.

## Evidence

Results recorded on 2026-09-27 on macOS (arm64) with Node.js 24.14.1.

- `bash scripts/opencode-compat-smoke.sh default 1.18.4` and
  `bash scripts/opencode-compat-smoke.sh default 1.14.41`: ok. Every server
  plugin file imported with the Bun runtime embedded in the OpenCode binary,
  and the designer agent listed `open_design_health`. Negative controls
  failed as expected: a plugin with a broken import (`an OAK plugin failed to
  import`) and a plugin whose `server` hook throws (`an OAK or configured
  plugin failed to load`).
- `node scripts/opencode-v2-smoke.mjs core 2.0.18` and
  `node scripts/opencode-v2-smoke.mjs default 2.0.18`: ok, with
  `oak.mission-runtime`, `oak.open-design`, `oak.shell-export-guard` and
  `oak.tui` active. A plugin with a broken import failed the smoke.
- `node scripts/opencode-v2-smoke.mjs core latest`: ok (resolved 2.0.18).
- `bash scripts/opencode-compat-smoke.sh core 1.14.41` and `core 1.18.4`: ok.

Manual sessions ran in an isolated config installed with `oak install`, with
an OpenAI-compatible provider model, on OpenCode 2.0.18 and OpenCode 1.18.4:

| Check | OpenCode 2.0.18 | OpenCode 1.18.4 |
|---|---|---|
| Sidebar shows `Tokens` and `Lead … \| Total …`, and `Subagents +… \| 1` after a delegation | pass | partial: `Tokens` renders but the values stay 0 in a scripted terminal; release 1.0.45 behaves the same |
| A mission toast appears when a session starts (`running`) and finishes (`idle`) | pass | pass |
| `lead` delegates `export -p` to `developer`, and the guard blocks it with `[shell-export-guard:shell-export-environment-enumeration]` | pass (`shell`) | pass (`bash`) |
| `designer` calls `open_design_health` without `OPEN_DESIGN_URL` and gets `OPEN_DESIGN_URL is not set` | pass (through Code Mode) | pass |
| `lead` cannot create a file: it has no edit tool and its shell redirection is denied | pass | pass |
| An open task run records `agent_session` events for the root and child sessions | pass | pass |
| `collect-session-evidence.mjs --run` rebuilds the execution trees from the database | pass (`session_v2`) | covered by unit tests |

OpenCode 2 behavior that shaped the smoke:

- `opencode --version` prints `opencode v2.0.18`.
- `opencode api --standalone plugin.list` answers before plugins activate, so
  it returns an empty list. The smoke therefore starts a private
  `opencode serve` with `OPENCODE_PASSWORD` and queries it until the plugins
  settle.
- A local plugin that fails to import is listed without an `id`, with
  `state.status` set to `failed`.
