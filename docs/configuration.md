# Configuration

The kit is organized as an OpenCode config directory:

- `AGENTS.md`: global behavior rules.
- `opencode.json`: models, permissions, plugin registration, default agent.
- `agents/`: role prompts.
- `commands/`: slash commands.
- `skills/`: local skills, including `open-design`.
- `tools/`: custom TypeScript tools.

The default permissions are conservative: reads are allowed, edits and bash ask by default, and external directories are denied.
