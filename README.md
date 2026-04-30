# opencode-agent-orchestration-kit

A starter kit for configuring OpenCode with a product-development agent orchestration flow, Open Design integration, optional Impeccable design context, Superpowers workflow discipline, and optional AHE observability sidecars.

This project is for developers who want a reproducible global OpenCode setup without hand-writing agents, commands, skills, tools, and Docker notes from scratch.

This repository is not affiliated with OpenCode, Open Design, Impeccable, or Superpowers.

## Architecture

By default, free-form messages open with `developer` for small, clear, low-risk changes. Use slash commands when you want an explicit workflow.

Core feature flow:

```text
lead -> designer if applicable -> researcher -> specifier -> developer -> reviewer
```

Scoped research/spec flow:

```text
scoper -> researcher -> scoper synthesis -> specifier
```

Design flow:

```text
designer -> open-design
```

Optional harness-evolution flow:

```text
evaluator -> debugger -> evolver -> lead approval -> developer -> evaluator -> debugger -> reviewer
```

## Skills and integrations

Included locally:

- `open-design`: shipped in this repo at `opencode/skills/open-design`. It wraps Open Design workbench usage through `OPEN_DESIGN_URL` and the `open_design_*` tools.

Referenced from upstream:

- `superpowers`: not vendored in this repo. It is enabled through the upstream OpenCode plugin `superpowers@git+https://github.com/obra/superpowers.git`, so OpenCode downloads/loads it from upstream when plugins are supported and network access is available.

Optional, user-installed:

- `impeccable`: not included in this repo. Install it from upstream if you want `designer` to use it when `PRODUCT.md` or `DESIGN.md` are missing.

## Quick install

```bash
git clone https://github.com/jcarlosrodicio/opencode-agent-orchestration-kit.git
cd opencode-agent-orchestration-kit
./install.sh
```

Then configure your environment:

```bash
cp env.example .env
source .env
opencode auth login
opencode
```

## Use without installing globally

```bash
export OPENCODE_CONFIG_DIR="$PWD/opencode"
export OPEN_DESIGN_URL="https://open-design.example.com"
opencode
```

This is the safest way to test the kit before touching your global config.

## Global install

```bash
./install.sh
```

The installer copies agents, commands, skills, and tools to `${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}`. It creates a backup when existing files are present. It does not overwrite `opencode.json` or `AGENTS.md` unless you pass `--force`.

```bash
./install.sh --target "$HOME/.config/opencode"
./install.sh --force
```

If your existing `opencode.json` was preserved, add Superpowers manually. This references the upstream plugin; it does not copy Superpowers into this repository:

```json
{
  "plugin": ["superpowers@git+https://github.com/obra/superpowers.git"]
}
```

For reproducibility you may pin a version:

```json
{
  "plugin": ["superpowers@git+https://github.com/obra/superpowers.git#v5.0.5"]
}
```

## Models

The example config reads models from environment variables:

```bash
export OPENCODE_MODEL="openai/gpt-5.5"
export OPENCODE_SMALL_MODEL="$OPENCODE_MODEL"
export OPENCODE_LEAD_MODEL="$OPENCODE_MODEL"
export OPENCODE_DEVELOPER_MODEL="$OPENCODE_MODEL"
```

See `env.example` for all role-specific variables.

## Open Design configuration

Set `OPEN_DESIGN_URL` to the base URL of your Open Design workbench.

Valid:

```bash
export OPEN_DESIGN_URL="https://open-design.example.com"
export OPEN_DESIGN_URL="http://192.168.1.50:7456"
```

Invalid:

```bash
export OPEN_DESIGN_URL="https://open-design.example.com/projects/my-project"
export OPEN_DESIGN_URL="https://open-design.example.com/projects/my-project/files/index.html"
```

Do not expose Open Design directly to the Internet without authentication, VPN, Tailscale, WireGuard, or a secure reverse proxy.

## Command examples

```text
/feature Create onboarding with plan selection and welcome screen
/scope Research Stripe Checkout integration and generate an MVP spec
/mvp-spec Email notifications when an agent finishes a task
/design Read PRODUCT.md and DESIGN.md, create an editable Open Design project, and generate a first version
/review
```

Without a slash command, simple implementation requests go directly through `developer`. Use `/feature` when you want the full orchestration flow.

## Docker Open Design

```bash
cd docker/open-design
cp .env.example .env
docker compose up -d --build
```

Authenticate OpenCode inside the container if you want Open Design to use OpenCode as the design engine:

```bash
docker exec -it open-design bash
opencode auth login
opencode models openai --refresh
exit
```

Then set:

```bash
export OPEN_DESIGN_URL="http://192.168.1.50:7456"
```

## Security

- Do not commit `.env`, auth files, sessions, logs, or provider credentials.
- Do not commit private `PRODUCT.md` or `DESIGN.md` files unless intended.
- Open Design can run local agent CLIs and write files inside project workspaces.
- Prefer localhost, LAN, VPN, Tailscale, WireGuard, or authenticated HTTPS reverse proxy.

## Troubleshooting

- `OPEN_DESIGN_URL is not set`: export the base URL, not a project URL.
- `/api/health` fails: check Open Design is running and reachable from your OpenCode process.
- OpenCode does not appear in Open Design agents: run `opencode auth login` and ensure `opencode` is on `PATH`.
- `crypto.randomUUID` fails on HTTP LAN: use HTTPS or the optional upstream frontend patch described in docs.
- Superpowers skills do not load: restart OpenCode and verify the plugin line in `opencode.json`.
- Designer cannot see Open Design: verify `OPEN_DESIGN_URL`, tool registration, and `opencode/tools/open_design.ts`.

## License

Apache License 2.0. See `LICENSE` and `NOTICE.md`.
