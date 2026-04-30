# Models

Configure models through environment variables:

```bash
export OPENCODE_MODEL="openai/gpt-5.5"
export OPENCODE_SMALL_MODEL="$OPENCODE_MODEL"
```

Each role can be overridden independently:

```bash
export OPENCODE_RESEARCHER_MODEL="openai/gpt-5.5"
export OPENCODE_REVIEWER_MODEL="openai/gpt-5.5"
```

Keep provider credentials in your shell, password manager, or OpenCode auth flow. Do not commit credentials.
