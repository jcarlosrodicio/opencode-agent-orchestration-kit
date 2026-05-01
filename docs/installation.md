# Installation

## Test without global install

```bash
git clone https://github.com/<owner>/opencode-agent-orchestration-kit.git
cd opencode-agent-orchestration-kit
./install.sh --target "$HOME/.config/opencode"
opencode auth login
```

## Global install

```bash
./install.sh
```

Default target:

```bash
$HOME/.config/opencode
```

Use a custom target:

```bash
./install.sh --target "$HOME/.config/opencode"
```

Use `--force` only when you want to overwrite existing `AGENTS.md` and `opencode.json`.

## Auth and models

```bash
opencode auth login
opencode models openai --refresh
```

Then export model variables from `env.example`.

## Existing config

If `opencode.json` already exists, the installer preserves it unless `--force` is used. Add the Superpowers plugin manually if needed:

```json
{
  "plugin": ["superpowers@git+https://github.com/obra/superpowers.git"]
}
```
