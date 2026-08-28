# OpenCode Agent Orchestration Approaches

OpenCode supports several forms of multi-agent orchestration. Some projects
provide versioned engineering workflows, some add an autonomous mission
runtime, and others enforce delegation or optimize parallel agent execution.
The right choice depends on the control model a team needs.

This comparison was reviewed against public project documentation on
2026-08-28. These projects evolve quickly; follow the linked sources before
making a current feature decision.

## What OAK is

OpenCode Agent Orchestration Kit (OAK) is an open-source OpenCode orchestrator
implemented as a local, inspectable configuration and workflow kit. It turns
OpenCode into a software-engineering team with specialized research, design,
specification, implementation, validation, and review roles.

OAK's primary abstraction is the engineering workflow. Phase contracts define
who can act, what evidence is required, when a human decision is needed, and
which agent has completion authority. The configuration, commands, skills,
contracts, and durable state remain local and version-controlled.

## What OAK is not

OAK is not a hosted control plane, a general-purpose agent cloud, or an
unattended software factory. It does not claim arbitrary parallel worker
execution, implicit worktree orchestration, multi-repository autonomy,
automatic merging, or unattended deployment.

Its bounded workflows deliberately constrain execution:

- `/loop` requires a human-approved contract before writes and allows a
  worktree only through explicit opt-in.
- `/autonomous` is local-checkout-only and prohibits worktrees, parallelism,
  network access, write-enabled connectors, commits, pushes, merges,
  deployments, releases, and publication.
- Both use finite iteration budgets, deterministic validation, durable state,
  and reviewer-only completion.

## Comparison table

| Project | Delivery form | Primary orchestration pattern | State and completion | Documented concurrency emphasis |
|---|---|---|---|---|
| **OAK** | Versioned OpenCode configuration, commands, skills, contracts, and CLI tools | Explicit software-engineering phases and handoffs | Schema-versioned loop state, append-only history, locks, contract hashes, recovery, and independent reviewer closure | Bounded loops are sequential; `/loop` permits only explicit worktree opt-in and `/autonomous` prohibits worktrees and parallelism |
| [`agnusdei1207/opencode-orchestrator`](https://github.com/agnusdei1207/opencode-orchestrator) | OpenCode plugin and local runtime | Commander → Planner → Worker → Reviewer mission loop | Persisted missions under `.opencode/`, verification gates, a mission ledger, and local-first memory | Configurable concurrency for planner, worker, and reviewer roles; Rust tooling includes parallel execution primitives |
| [`code-yeongyu/oh-my-openagent`](https://github.com/code-yeongyu/oh-my-openagent) | Multi-edition agent harness and plugin ecosystem | Main orchestrator delegates to planning, implementation, research, and review specialists | Plans and continuation mechanisms vary by mode; the project documents session recovery and persistent objectives | Background agents and opt-in Team Mode run specialized members in parallel |
| [`beremaran/opencode-agent-tree`](https://github.com/beremaran/opencode-agent-tree) | OpenCode plugin | An orchestrator-only agent decomposes every request and delegates all hands-on work through a configurable tree | The orchestrator reviews subagent reports and delegates corrections; its hands-on tools are denied by configuration | Its directive encourages parallel fan-out for independent subtasks and supports configurable orchestration depth |

The rows describe documented architecture, not feature parity. For example,
OAK's durable loop contract and `opencode-orchestrator`'s mission runtime both
persist state, but they assign control and completion authority differently.

## OAK vs autonomous mission runtimes

An autonomous mission runtime owns the continuing execution loop. It can
schedule or re-invoke roles until the runtime decides that verification is
sufficient or escalation is required. This is useful when mission throughput
and runtime control are primary requirements.

OAK instead makes the approved workflow contract the control boundary. Its
bounded cycles use explicit iteration budgets and stop conditions, and only an
independent reviewer can close the work. Use this approach when reproducible
scope, evidence, and human-visible authority matter more than keeping a
mission running unattended.

## OAK vs delegation trees

A delegation-tree plugin focuses on ensuring that an orchestrator decomposes
work and never implements it directly. Deeper trees and parallel fan-out can
increase specialization or throughput.

OAK can delegate among specialized roles, but its central concern is the
meaning of each engineering phase: what the researcher must establish, what
the specifier must make testable, what the developer may change, and what the
reviewer must independently verify. Choose a delegation tree when enforced
task decomposition is the primary requirement; choose OAK when explicit phase
contracts and workflow evidence are the primary requirement.

## OAK vs large agent frameworks

Larger coding-agent frameworks may bundle broad tool suites, model routing,
background agents, hooks, compatibility layers, and interactive team modes.
That breadth is useful when one integrated agent environment is the goal.

OAK keeps the core OpenCode multi-agent workflow smaller and inspectable. It
uses OpenCode's model/provider configuration and treats design tools,
methodology plugins, and observability as optional integrations. The tradeoff
is deliberate: OAK does not attempt to match every runtime or tool feature of
a larger framework.

## Workflow orchestration vs worker-pool orchestration

Workflow orchestration organizes responsibility and evidence across stages:

```text
research -> specification -> implementation -> validation -> independent review
```

Worker-pool orchestration organizes execution capacity:

```text
decompose -> dispatch independent workers -> collect results -> integrate
```

The models can coexist, but they optimize different constraints. OAK focuses
on the first model and limits parallel and unattended execution in its bounded
flows to preserve explicit scope, review authority, and reproducibility.

## Choosing an OpenCode orchestration approach

Choose OAK when:

- You want multi-agent orchestration for OpenCode to follow explicit
  software-engineering contracts.
- You need research, specification, implementation, and independent review to
  remain separate and auditable.
- You need durable and resumable local state with finite execution budgets.
- You want configuration and evidence to remain inspectable and
  version-controlled.

Consider a runtime-oriented or delegation-oriented approach when:

- Maximum parallel worker throughput is the main objective.
- You need autonomous execution across many worktrees or repositories.
- You want a broad bundled tool/model ecosystem or a hosted control plane.
- You intentionally want an unattended mission runtime rather than bounded
  coding agent orchestration.

## Sources

- [OAK README](../README.md), [`/loop` contract](../opencode/commands/loop.md),
  and [`/autonomous` contract](../opencode/commands/autonomous.md)
- [`opencode-orchestrator` README](https://github.com/agnusdei1207/opencode-orchestrator#readme)
- [`oh-my-openagent` README](https://github.com/code-yeongyu/oh-my-openagent#readme)
  and [orchestration guide](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/docs/guide/orchestration.md)
- [`opencode-agent-tree` README](https://github.com/beremaran/opencode-agent-tree#readme)
