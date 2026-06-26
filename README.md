# OpenCode Agent Orchestration Kit

[![Check](https://github.com/jcarlosrodicio/opencode-agent-orchestration-kit/actions/workflows/check.yml/badge.svg)](https://github.com/jcarlosrodicio/opencode-agent-orchestration-kit/actions/workflows/check.yml)
[![License](https://img.shields.io/github/license/jcarlosrodicio/opencode-agent-orchestration-kit)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/jcarlosrodicio/opencode-agent-orchestration-kit)](https://github.com/jcarlosrodicio/opencode-agent-orchestration-kit/releases)

A reproducible product-development workflow for OpenCode.

Turn OpenCode into a structured team of specialized agents that can research, design, specify, implement, review, and validate software changes — without building every agent, command, skill, tool, and workflow convention from scratch.

Built for developers and small teams who want more structure than a single general-purpose coding agent, while keeping the setup local, inspectable, version-controlled, and adaptable.

> [!NOTE]
> This project is a configuration and workflow kit for OpenCode. It is not a hosted platform, a fully autonomous software factory, or a replacement for engineering judgment.

## Why this exists

A basic coding-agent setup often starts simple:

- One general-purpose agent.
- A few custom prompts.
- Some copied skills.
- Ad hoc instructions.
- Manual review and validation.

Over time, that setup becomes harder to maintain:

- Agents overlap or contradict each other.
- Planning, research, implementation, and review blur together.
- Workflows become prompt-dependent and difficult to reproduce.
- Configuration changes become risky.
- Documentation and validation drift away from the actual setup.

This kit provides a documented OpenCode harness with:

- Specialized agents with explicit responsibilities.
- Predictable handoffs between research, design, specification, implementation, and review.
- Slash commands for common product-development workflows.
- Local process skills and reusable engineering checklists.
- Safe installation and uninstall scripts.
- Local validation for configuration and harness contracts.
- Optional integrations for Open Design, Superpowers, Impeccable, and observability.

The goal is not to force every request through a heavy process. Small, clear, low-risk changes can go directly to implementation. Larger or ambiguous work can follow a structured flow with research, planning, review, and evidence.

## What you get

| Capability | What it gives you |
|---|---|
| Role-based agents | Dedicated agents for routing, research, design, specification, implementation, review, and optional harness evolution |
| Product-development workflows | Structured flows for features, plans, scoped research, MVP specs, testing, simplification, and review |
| Bounded routing | A default `lead` agent that routes simple requests directly and escalates only when needed |
| Local skills | Practical checklists for testing, debugging, security, performance, documentation, APIs, code review, and more |
| Safe installation | Backup-aware install and uninstall scripts, plus a project-local test mode |
| Validation | Mechanical checks for JSON configuration, agent contracts, command contracts, and harness consistency |
| Optional design workflow | Open Design integration for editable UI workspaces and design-oriented flows |
| Optional token visibility | TUI plugin for lead and subagent token usage when OpenCode exposes session trees |
| Versioned documentation | Agent, command, evidence, and validation contracts stored alongside the configuration |

## Who this is for

This kit is a good fit if you:

- Use OpenCode and want a repeatable development workflow instead of isolated prompts.
- Want specialized agent roles without building the whole system from zero.
- Want to separate research, planning, implementation, review, and validation.
- Prefer local configuration that can be inspected, customized, committed, and evolved.
- Work alone or in a small technical team.
- Want a practical starting point rather than a black-box orchestration platform.

## Who this is not for

This kit may not be the right fit if you:

- Only need one small custom prompt or agent.
- Do not use OpenCode.
- Want a hosted multi-agent platform with queues, dashboards, billing, and team administration.
- Need autonomous parallel execution across many repositories or worktrees.
- Expect every request to be fully automated without human oversight.

## How it works

Free-form requests start with the `lead` agent.

`lead` acts as a bounded router:

- Simple and low-risk implementation work goes directly to `developer`.
- Technical uncertainty goes to `researcher`.
- Visual or interaction work goes to `designer`.
- Planning gaps go to `specifier`.
- Larger feature work follows a structured orchestration flow.

```text
Simple change
lead
  └── developer
        └── validation

Feature work
lead
  ├── designer            when visual or interaction design is needed
  ├── researcher          when technical uncertainty must be resolved
  ├── specifier           creates tasks, acceptance criteria, and validation plan
  ├── developer           implements approved work
  └── reviewer            checks the final diff against the agreed scope

Plan-only work
lead
  └── researcher
        └── specifier
              └── reviewer

Scoped research and specification
scoper
  └── researcher
        └── scoper synthesis
              └── specifier

Optional harness evolution
evaluator
  └── debugger
        └── evolver
              └── lead approval
                    └── developer
                          └── evaluator
                                └── debugger
                                      └── reviewer
```

The normal workflow is intentionally not a fixed ceremony for every task.

Use the smallest useful flow:

- Direct implementation for a small change.
- `/plan` when you want an implementation-ready plan but no code changes.
- `/scope` when you need research and an MVP-oriented specification.
- `/feature` when the work deserves full orchestration.

## Included agents

| Agent | Responsibility |
|---|---|
| `lead` | Default router, feature orchestrator, and phase-barrier owner |
| `scoper` | Lightweight research-to-spec orchestration |
| `designer` | Product and interaction design using project context, optional Impeccable, and Open Design |
| `researcher` | Code, documentation, API, alternative, and risk investigation |
| `specifier` | Specs, tasks, acceptance criteria, scope boundaries, and validation plans |
| `developer` | Implementation, direct-mode changes, and focused validation |
| `reviewer` | Diff review against scope, requirements, and evidence |
| `evaluator` | Optional benchmark and smoke-test evidence collection |
| `debugger` | Optional root-cause analysis from failures and traces |
| `evolver` | Optional evidence-driven harness improvement proposals |

The `evaluator`, `debugger`, and `evolver` agents are optional harness-evolution sidecars. They are not part of the normal feature-development path.

## Included commands

| Command | Use it when you want to... |
|---|---|
| `/feature` | Run the full feature workflow |
| `/plan` | Research and create an implementation-ready plan without implementing |
| `/scope` | Research a topic and produce a scoped MVP specification |
| `/mvp-spec` | Create a strict MVP spec with small tasks and explicit out-of-scope items |
| `/design` | Create or evolve a design through project context and Open Design |
| `/research` | Run a direct research task |
| `/spec` | Run a direct specification task |
| `/implement` | Implement approved work directly |
| `/test` | Reproduce a bug or run focused validation |
| `/code-simplify` | Simplify code without changing behavior |
| `/review` | Review the current diff |
| `/evolve` | Run the optional harness-evolution workflow |
| `/init` | Initialize project-oriented context for the workflow |

Examples:

```text
/feature Create onboarding with plan selection and welcome screen

/plan Add a dry-run flag to the harness check without implementing it yet

/scope Research Stripe Checkout integration and generate an MVP spec

/mvp-spec Email notifications when an agent finishes a task

/design Read PRODUCT.md and DESIGN.md, create an editable Open Design project, and generate a first version

/test Reproduce the checkout regression with a focused test

/code-simplify Simplify the parser branch without changing behavior

/review
```

A small request can also be written directly:

```text
Change the Settings heading to Account settings and run the smallest relevant validation.
```

For this kind of request, `lead` should choose the direct path and delegate to `developer` without invoking the full feature workflow.

## Quick start: test it safely first

The safest way to try the kit is to load it from the repository directory without changing your global OpenCode configuration.

### Requirements

- Git
- Bash
- OpenCode installed and available on your `PATH`
- Node.js and npm
- An OpenCode-compatible model provider configured through `opencode auth login`

### 1. Clone the repository

```bash
git clone https://github.com/jcarlosrodicio/opencode-agent-orchestration-kit.git
cd opencode-agent-orchestration-kit
```

### 2. Configure models

```bash
cp env.example .env
source .env
```

`env.example` provides a shared default model plus optional per-role overrides.

```bash
export OPENCODE_MODEL="openai/gpt-5.5"

export OPENCODE_SMALL_MODEL="$OPENCODE_MODEL"
export OPENCODE_LEAD_MODEL="$OPENCODE_MODEL"
export OPENCODE_SCOPER_MODEL="$OPENCODE_MODEL"
export OPENCODE_DESIGNER_MODEL="$OPENCODE_MODEL"
export OPENCODE_RESEARCHER_MODEL="$OPENCODE_MODEL"
export OPENCODE_SPECIFIER_MODEL="$OPENCODE_MODEL"
export OPENCODE_DEVELOPER_MODEL="$OPENCODE_MODEL"
export OPENCODE_REVIEWER_MODEL="$OPENCODE_MODEL"
export OPENCODE_EVALUATOR_MODEL="$OPENCODE_MODEL"
export OPENCODE_DEBUGGER_MODEL="$OPENCODE_MODEL"
export OPENCODE_EVOLVER_MODEL="$OPENCODE_MODEL"
```

You can use one model for every role or assign different models depending on cost, speed, and task complexity.

### 3. Install local plugin dependencies

```bash
(cd opencode && npm install)
```

### 4. Load the kit without global installation

```bash
export OPENCODE_CONFIG_DIR="$PWD/opencode"
opencode auth login
opencode
```

OpenCode now loads the configuration from this repository instead of your default global config.

Try one of these commands:

```text
/scope Research whether this repository should use Stripe Checkout or Payment Element and produce an MVP spec
```

```text
/plan Add a dry-run flag to the harness check without implementing it yet
```

```text
/feature Add a small settings page with a saved theme preference
```

## Install globally

Once you are happy with the workflow, install it into your OpenCode configuration directory:

```bash
./install.sh
```

The default target is:

```text
${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}
```

Use a custom target when needed:

```bash
./install.sh --target "$HOME/.config/opencode"
```

The installer copies the kit’s agents, commands, skills, tools, plugins, references, and documentation into the target configuration directory.

### Safe defaults

The installer is designed to avoid destructive changes:

- It creates a backup when existing files are present.
- It preserves existing `opencode.json` unless `--force` is used.
- It preserves existing `AGENTS.md` unless `--force` is used.
- It preserves existing `tui.json` unless `--force` is used.

Use `--force` only when you explicitly want to overwrite those files:

```bash
./install.sh --force
```

After global installation, install the OpenCode config dependencies:

```bash
(cd "${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}" && npm install)
```

## Uninstall

The repository includes an uninstall script for removing the files installed by this kit.

```bash
./uninstall.sh
```

Use a custom target when needed:

```bash
./uninstall.sh --target "$HOME/.config/opencode"
```

Skip confirmation only when running in a controlled environment:

```bash
./uninstall.sh --yes
```

## Skills

The kit includes local skills that agents use as practical checklists rather than mandatory process overhead.

Included skills cover:

- API and interface design
- Autonomous loops
- Code review and quality
- Code simplification
- Context engineering
- Debugging and error recovery
- Documentation and ADRs
- Doubt-driven development
- Iterative retrieval
- Open Design
- Performance optimization
- Security and hardening
- Source-driven development
- Test-driven development
- Verification loops
- Using agent skills effectively

These skills are available under:

```text
opencode/skills/
```

They are designed to help agents make better engineering decisions without forcing every task through every checklist.

## Optional integrations

### Open Design

Open Design is included as an optional local integration for design-oriented workflows.

The `designer` agent can use:

- Project context from `PRODUCT.md` and `DESIGN.md`.
- Optional Impeccable design context.
- Open Design tools through `OPEN_DESIGN_URL`.

Set `OPEN_DESIGN_URL` to the base URL of your Open Design workbench:

```bash
export OPEN_DESIGN_URL="https://open-design.example.com"
```

A local or LAN URL is also valid:

```bash
export OPEN_DESIGN_URL="http://192.168.1.50:7456"
```

Do not use a project page or file URL:

```bash
# Invalid
export OPEN_DESIGN_URL="https://open-design.example.com/projects/my-project"
export OPEN_DESIGN_URL="https://open-design.example.com/projects/my-project/files/index.html"
```

Open Design is optional. You can use the rest of the kit without it.

### Run Open Design with Docker

A Docker setup is included:

```bash
cd docker/open-design
cp .env.example .env
docker compose up -d --build
```

If Open Design should use OpenCode as a design engine, authenticate inside the container:

```bash
docker exec -it open-design bash
opencode auth login
opencode models openai --refresh
exit
```

Then configure the Open Design base URL:

```bash
export OPEN_DESIGN_URL="http://192.168.1.50:7456"
```

### Superpowers

Superpowers is not vendored into this repository.

When plugins are supported and network access is available, the kit can reference the upstream plugin:

```json
{
  "plugin": [
    "superpowers@git+https://github.com/obra/superpowers.git"
  ]
}
```

For reproducibility, pin a version:

```json
{
  "plugin": [
    "superpowers@git+https://github.com/obra/superpowers.git#v5.0.5"
  ]
}
```

If your existing `opencode.json` was preserved during installation, add the plugin manually.

### Impeccable

Impeccable is optional and is not included in this repository.

Install it from its upstream source when you want the `designer` agent to use it as additional design context, particularly when project-specific `PRODUCT.md` or `DESIGN.md` files are missing.

### Token usage plugin

The bundled TUI plugin can show:

- Lead-agent token usage.
- Total token usage across child and subagent sessions.

This depends on OpenCode exposing the session tree through its TUI plugin API.

If your existing `tui.json` was preserved during installation, add the bundled plugin manually:

```json
{
  "plugin": [
    "./plugins/token-tree-usage.tsx"
  ]
}
```

## Validation

Run the repository checks with:

```bash
npm run check
```

This validates the shipped harness, including:

- Configuration JSON.
- Agent and command frontmatter.
- Default `lead` routing contract.
- `/feature` sidecar boundaries.
- `/plan` behavior.
- Agent-readable documentation under `opencode/docs/ai/harness/`.

The core harness validator is located at:

```text
opencode/scripts/check-harness.mjs
```

After global installation, you can also run it from the installed OpenCode configuration directory:

```bash
node scripts/check-harness.mjs
```

## Project structure

```text
.
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── workflows/
│   ├── CODEOWNERS
│   └── PULL_REQUEST_TEMPLATE.md
├── docker/
│   └── open-design/
├── docs/
│   ├── releases/
│   ├── agents.md
│   ├── commands.md
│   ├── configuration.md
│   ├── docker-open-design.md
│   ├── impeccable.md
│   ├── installation.md
│   ├── models.md
│   ├── open-design.md
│   ├── quickstart.md
│   ├── security.md
│   ├── superpowers.md
│   ├── synology.md
│   ├── troubleshooting.md
│   └── workflows.md
├── opencode/
│   ├── agents/
│   ├── commands/
│   ├── docs/ai/
│   ├── plugins/
│   ├── references/
│   ├── scripts/
│   ├── skills/
│   ├── tools/
│   ├── AGENTS.md
│   ├── opencode.json
│   └── tui.json
├── scripts/
│   └── check.sh
├── install.sh
├── uninstall.sh
└── env.example
```

The shipped OpenCode configuration contains:

| Path | Purpose |
|---|---|
| `AGENTS.md` | Global behavior rules and agent index |
| `opencode.json` | Models, permissions, plugins, and default agent |
| `tui.json` | TUI plugin registration |
| `agents/` | Specialized agent prompts |
| `commands/` | Slash-command workflows |
| `skills/` | Local process skills |
| `tools/` | Custom TypeScript tools |
| `plugins/` | Bundled OpenCode/TUI plugins |
| `references/` | Reusable checklists referenced by skills |
| `docs/ai/harness/` | Agent, command, evidence, and validation contracts |
| `docs/ai/evolution/` | Harness-evolution benchmark and evidence records |
| `scripts/check-harness.mjs` | Mechanical harness validation |

## Permissions and safety

The default OpenCode permissions are conservative:

- Reads are allowed.
- Edits ask by default.
- Bash commands ask by default.
- External directories are denied.

Security recommendations:

- Do not commit `.env`, authentication files, sessions, logs, or provider credentials.
- Do not commit private `PRODUCT.md` or `DESIGN.md` files unless intended.
- Treat Open Design as a privileged local tool because it can run local agent CLIs and write files inside project workspaces.
- Do not expose Open Design directly to the Internet without authentication.
- Prefer localhost, LAN, VPN, Tailscale, WireGuard, or authenticated HTTPS through a reverse proxy.

## Troubleshooting

### `OPEN_DESIGN_URL is not set`

Set the base URL only:

```bash
export OPEN_DESIGN_URL="http://192.168.1.50:7456"
```

Do not use a project-specific path.

### `/api/health` fails

Check that Open Design is running and reachable from the machine or container where OpenCode runs.

### OpenCode does not appear in Open Design agents

Run:

```bash
opencode auth login
```

Also verify that `opencode` is available on `PATH`.

### Superpowers skills do not load

Restart OpenCode and verify that the Superpowers plugin entry is present in `opencode.json`.

### Token usage does not appear in the TUI

Verify:

1. `tui.json` contains the bundled plugin entry.
2. `npm install` was run in the OpenCode config directory.
3. OpenCode was restarted.
4. The current OpenCode TUI exposes child-session information to plugins.

### Designer cannot access Open Design

Verify:

- `OPEN_DESIGN_URL`.
- Tool registration.
- `opencode/tools/open_design.ts`.
- Network reachability between OpenCode and Open Design.

### `crypto.randomUUID` fails over HTTP on a LAN URL

Use HTTPS, or apply the optional upstream frontend patch described in the documentation.

## Documentation

Detailed guides are available in [`docs/`](docs/):

- [Quickstart](docs/quickstart.md)
- [Installation](docs/installation.md)
- [Configuration](docs/configuration.md)
- [Agents](docs/agents.md)
- [Commands](docs/commands.md)
- [Workflows](docs/workflows.md)
- [Models](docs/models.md)
- [Open Design](docs/open-design.md)
- [Docker Open Design](docs/docker-open-design.md)
- [Superpowers](docs/superpowers.md)
- [Impeccable](docs/impeccable.md)
- [Security](docs/security.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Synology notes](docs/synology.md)

## Contributing

Contributions are welcome.

Good contributions include:

- Clearer documentation.
- Safer installation or uninstall behavior.
- Improved troubleshooting.
- Tighter agent or command prompts.
- Better Docker and Open Design setup.
- Validation improvements.
- Reusable process skills.
- Focused workflow enhancements that remain portable and safe for public reuse.

Before opening a pull request:

```bash
npm run check
```

If Docker files changed:

```bash
docker compose -f docker/open-design/docker-compose.yml config
```

Please avoid committing credentials, authentication files, sessions, logs, private product documents, or machine-specific paths.

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

Licensed under the [Apache License 2.0](LICENSE).

See [NOTICE.md](NOTICE.md) for attribution notices.

## Disclaimer

This repository is not affiliated with OpenCode, Open Design, Impeccable, or Superpowers.
