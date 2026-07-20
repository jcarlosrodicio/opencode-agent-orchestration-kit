# Configuration

The kit is organized as an OpenCode config directory:

- `AGENTS.md`: global behavior rules.
- `opencode.json`: models, permissions, plugin registration, default agent.
- `tui.json`: TUI plugin registration.
- `agents/`: role prompts.
- `commands/`: slash commands.
- `docs/ai/harness/`: agent-readable contracts for agents, commands, evidence, and checks.
- `docs/ai/evolution/`: AHE benchmark and evolution records.
- `plugins/`: bundled OpenCode/TUI plugins.
- `references/`: reusable checklists that local skills may cite.
- `skills/`: local skills, including `open-design`.
- `scripts/check-harness.mjs`: local harness validator.
- `tools/`: custom TypeScript tools.

The default permissions are conservative: reads are allowed, edits and bash ask by default, and external directories are denied.

The default agent is `lead`, acting as a bounded router for free-form messages. For small, clear, low-risk work, lead delegates direct mode to `developer`; for technical uncertainty it delegates to `researcher`; for visual or interaction work it delegates to `designer`; and for planning gaps it delegates to `specifier`. Slash commands still route to their explicit agents, for example `/feature` and `/plan` to `lead`, `/scope` to `scoper`, and `/design` to `designer`.

Run `node scripts/check-harness.mjs` from an installed OpenCode config directory
to validate the core harness contracts. In this repository,
`npm run check:quick` runs the contract path against `opencode/`, while
`npm run check` also runs every bundled `node:test` suite. Use
`npm run check:release` for the complete release-readiness path.

The bundled TUI token plugin is registered in `tui.json`. It shows lead token
usage and total usage across child/subagent sessions when OpenCode exposes that
session tree through the TUI plugin API.
