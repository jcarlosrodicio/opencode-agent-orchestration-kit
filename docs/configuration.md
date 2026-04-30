# Configuration

The kit is organized as an OpenCode config directory:

- `AGENTS.md`: global behavior rules.
- `opencode.json`: models, permissions, plugin registration, default agent.
- `agents/`: role prompts.
- `commands/`: slash commands.
- `skills/`: local skills, including `open-design`.
- `tools/`: custom TypeScript tools.

The default permissions are conservative: reads are allowed, edits and bash ask by default, and external directories are denied.

The default agent is `developer`, with `mode: all`, so free-form small changes can be implemented directly. Slash commands still route to their explicit agents, for example `/feature` to `lead`, `/scope` to `scoper`, and `/design` to `designer`.
