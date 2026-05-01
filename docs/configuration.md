# Configuration

The kit is organized as an OpenCode config directory:

- `AGENTS.md`: global behavior rules.
- `opencode.json`: models, permissions, plugin registration, default agent.
- `agents/`: role prompts.
- `commands/`: slash commands.
- `docs/ai/harness/`: agent-readable contracts for agents, commands, evidence, and checks.
- `docs/ai/evolution/`: AHE benchmark and evolution records.
- `skills/`: local skills, including `open-design`.
- `scripts/check-harness.mjs`: local harness validator.
- `tools/`: custom TypeScript tools.

The default permissions are conservative: reads are allowed, edits and bash ask by default, and external directories are denied.

The default agent is `developer`, with `mode: all`, so free-form small changes can be implemented directly. Slash commands still route to their explicit agents, for example `/feature` to `lead`, `/scope` to `scoper`, and `/design` to `designer`.

Run `node scripts/check-harness.mjs` from an installed OpenCode config directory to validate the core harness contracts. In this repository, `npm run check` runs the same validator against `opencode/`.
