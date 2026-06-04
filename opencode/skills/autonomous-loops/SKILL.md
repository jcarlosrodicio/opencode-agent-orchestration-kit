---
name: autonomous-loops
description: Patterns and architectures for autonomous loops — from simple sequential pipelines to RFC-driven multi-agent DAG systems. Use when setting up autonomous development workflows, choosing the right loop architecture, or building CI/CD-style continuous development pipelines.
phase: operate
domains:
  - orchestration
  - evolution
  - release
stacks:
  - any
  - harness
allowed_agents:
  - lead
  - evolver
surfaces:
  - autonomous-orchestration
  - ci-cd-pipelines
  - multi-agent-orchestration
skill_source: external
origin: affaan-m/ecc
status: active
---

# Autonomous Loops

Patterns, architectures, and reference implementations for running autonomous loops. Covers everything from simple sequential pipelines to full RFC-driven multi-agent DAG orchestration.

## When to Use

- Setting up autonomous development workflows that run without human intervention
- Choosing the right loop architecture for your problem (simple vs complex)
- Building CI/CD-style continuous development pipelines
- Running parallel agents with merge coordination
- Implementing context persistence across loop iterations
- Adding quality gates and cleanup passes to autonomous workflows

## Loop Pattern Spectrum

From simplest to most sophisticated:

| Pattern | Complexity | Best For |
|---------|-----------|----------|
| Sequential Pipeline | Low | Daily dev steps, scripted workflows |
| Infinite Agentic Loop | Medium | Parallel content generation, spec-driven work |
| Continuous PR Loop | Medium | Multi-day iterative projects with CI gates |
| De-Sloppify Pattern | Add-on | Quality cleanup after any implementer step |
| RFC-Driven DAG | High | Large features, multi-unit parallel work with merge queue |

---

## 1. Sequential Pipeline

**The simplest loop.** Break daily development into a sequence of non-interactive calls. Each call is a focused step with a clear prompt.

### Core Insight

> If you can't figure out a loop like this, it means you can't even drive the LLM to fix your code in interactive mode.

Chain calls to build a pipeline:

```bash
#!/bin/bash
# daily-dev.sh — Sequential pipeline for a feature branch

set -e

# Step 1: Implement the feature
opencode run "Read the spec in docs/auth-spec.md. Implement OAuth2 login in src/auth/. Write tests first (TDD)."

# Step 2: De-sloppify (cleanup pass)
opencode run "Review all files changed by the previous commit. Remove unnecessary type tests, overly defensive checks. Keep real business logic tests."

# Step 3: Verify
opencode run "Run the full build, lint, type check, and test suite. Fix any failures."

# Step 4: Commit
opencode run "Create a conventional commit for all staged changes."
```

### Key Design Principles

1. **Each step is isolated** — A fresh context window per call means no context bleed between steps.
2. **Order matters** — Steps execute sequentially. Each builds on the filesystem state left by the previous.
3. **Negative instructions are dangerous** — Don't say "don't test type systems." Instead, add a separate cleanup step.
4. **Exit codes propagate** — `set -e` stops the pipeline on failure.

---

## 2. Infinite Agentic Loop

**A two-prompt system** that orchestrates parallel sub-agents for specification-driven generation.

### Architecture: Two-Prompt System

```
PROMPT 1 (Orchestrator)              PROMPT 2 (Sub-Agents)
┌─────────────────────┐             ┌──────────────────────┐
│ Parse spec file      │             │ Receive full context  │
│ Scan output dir      │  deploys   │ Read assigned number  │
│ Plan iteration       │────────────│ Follow spec exactly   │
│ Assign creative dirs │  N agents  │ Generate unique output │
│ Manage waves         │             │ Save to output dir    │
└─────────────────────┘             └──────────────────────┘
```

### The Pattern

1. **Spec Analysis** — Orchestrator reads a specification file defining what to generate
2. **Directory Recon** — Scans existing output to find the highest iteration number
3. **Parallel Deployment** — Launches N sub-agents, each with:
   - The full spec
   - A unique creative direction
   - A specific iteration number (no conflicts)
   - A snapshot of existing iterations (for uniqueness)
4. **Wave Management** — For infinite mode, deploys waves of 3-5 agents until context is exhausted

### Batching Strategy

| Count | Strategy |
|-------|----------|
| 1-5 | All agents simultaneously |
| 6-20 | Batches of 5 |
| infinite | Waves of 3-5, progressive sophistication |

### Key Insight: Uniqueness via Assignment

Don't rely on agents to self-differentiate. The orchestrator **assigns** each agent a specific creative direction and iteration number.

---

## 3. Continuous PR Loop

**A production-grade loop** that runs code in a continuous loop, creating PRs, waiting for CI, and merging automatically.

### Core Loop

```
┌─────────────────────────────────────────────────────┐
│  CONTINUOUS ITERATION                               │
│                                                     │
│  1. Create branch (continuous/iteration-N)           │
│  2. Run implementation with enhanced prompt         │
│  3. (Optional) Reviewer pass                        │
│  4. Commit changes                                  │
│  5. Push + create PR (gh pr create)                 │
│  6. Wait for CI checks (poll gh pr checks)          │
│  7. CI failure? → Auto-fix pass                     │
│  8. Merge PR (squash/merge/rebase)                  │
│  9. Return to main → repeat                         │
│                                                     │
│  Limit by: --max-runs N | --max-cost $X             │
│            --max-duration 2h | completion signal     │
└─────────────────────────────────────────────────────┘
```

### Cross-Iteration Context: SHARED_TASK_NOTES.md

The critical innovation: a `SHARED_TASK_NOTES.md` file persists across iterations:

```markdown
## Progress
- [x] Added tests for auth module (iteration 1)
- [x] Fixed edge case in token refresh (iteration 2)
- [ ] Still need: rate limiting tests, error boundary tests

## Next Steps
- Focus on rate limiting module next
- The mock setup in tests/helpers.ts can be reused
```

Read this file at iteration start and update it at iteration end. This bridges the context gap between independent invocations.

### CI Failure Recovery

When PR checks fail:
1. Fetch the failed run ID via `gh run list`
2. Spawn a new implementation run with CI fix context
3. Inspect logs via `gh run view`, fix code, commit, push
4. Re-wait for checks (up to retry max)

### Completion Signal

Signal "I'm done" by outputting a magic phrase. Three consecutive iterations signaling completion stops the loop.

---

## 4. The De-Sloppify Pattern

**An add-on pattern for any loop.** Add a dedicated cleanup/refactor step after each implementer step.

### The Problem

When you ask an LLM to implement with TDD, it takes "write tests" too literally:
- Tests that verify TypeScript's type system works
- Overly defensive runtime checks the type system already guarantees
- Tests for framework behavior rather than business logic
- Excessive error handling that obscures the actual code

### The Solution: Separate Pass

Instead of constraining the implementer, let it be thorough. Then add a focused cleanup agent:

```bash
# Step 1: Implement (let it be thorough)
opencode run "Implement the feature with full TDD. Be thorough with tests."

# Step 2: De-sloppify (separate context, focused cleanup)
opencode run "Review all changes in the working tree. Remove:
- Tests that verify language/framework behavior rather than business logic
- Redundant type checks that the type system already enforces
- Over-defensive error handling for impossible states
- Console.log statements
- Commented-out code

Keep all business logic tests. Run the test suite after cleanup."
```

### Key Insight

> Rather than adding negative instructions which have downstream quality effects, add a separate de-sloppify pass. Two focused agents outperform one constrained agent.

---

## 5. RFC-Driven DAG Orchestration

**The most sophisticated pattern.** An RFC-driven, multi-agent pipeline that decomposes a spec into a dependency DAG, runs each unit through a tiered quality pipeline, and lands them via an agent-driven merge queue.

### Architecture Overview

```
RFC/PRD Document
       │
       ▼
  DECOMPOSITION (AI)
  Break RFC into work units with dependency DAG
       │
       ▼
┌──────────────────────────────────────────────────────┐
│  QUALITY PIPELINES (parallel per unit)                │
│  Each unit in its own worktree:                      │
│  Research → Plan → Implement → Test → Review         │
│  (depth varies by complexity tier)                   │
├──────────────────────────────────────────────────────┤
│  MERGE QUEUE                                         │
│  Rebase onto main → Run tests → Land or evict        │
│  Evicted units re-enter with conflict context        │
└──────────────────────────────────────────────────────┘
```

### Complexity Tiers

| Tier | Pipeline Stages |
|------|----------------|
| **trivial** | implement → test |
| **small** | implement → test → code-review |
| **medium** | research → plan → implement → test → review → review-fix |
| **large** | research → plan → implement → test → review → review-fix → final-review |

### Key Design Principles

1. **Deterministic execution** — Upfront decomposition locks in parallelism and ordering
2. **Human review at leverage points** — The work plan is the single highest-leverage intervention point
3. **Separate concerns** — Each stage in a separate context window with a separate agent
4. **Conflict recovery with context** — Full eviction context enables intelligent re-runs
5. **Tier-driven depth** — Trivial changes skip research/review; large changes get maximum scrutiny

---

## Choosing the Right Pattern

### Decision Matrix

```
Is the task a single focused change?
├─ Yes → Sequential Pipeline
└─ No → Is there a written spec/RFC?
         ├─ Yes → Do you need parallel implementation?
         │        ├─ Yes → RFC-Driven DAG
         │        └─ No → Continuous PR Loop
         └─ No → Do you need many variations of the same thing?
                  ├─ Yes → Infinite Agentic Loop
                  └─ No → Sequential Pipeline with de-sloppify
```

### Combining Patterns

These patterns compose well:

1. **Sequential Pipeline + De-Sloppify** — The most common combination. Every implement step gets a cleanup pass.
2. **Continuous Loop + De-Sloppify** — Add a de-sloppify directive to each iteration.
3. **Any loop + Verification** — Use `verification-loop` skill as a gate before commits.

---

## Anti-Patterns

1. **Infinite loops without exit conditions** — Always have a max-runs, max-cost, max-duration, or completion signal.
2. **No context bridge between iterations** — Each call starts fresh. Use `SHARED_TASK_NOTES.md` or filesystem state to bridge context.
3. **Retrying the same failure** — If an iteration fails, capture the error context and feed it to the next attempt.
4. **Negative instructions instead of cleanup passes** — Don't say "don't do X." Add a separate pass that removes X.
5. **All agents in one context window** — For complex workflows, separate concerns into different agent processes.

## Verification

After applying autonomous-loops:

- [ ] The chosen pattern matches the complexity of the task
- [ ] Exit conditions are defined (max-runs, max-cost, max-duration, or completion signal)
- [ ] Context is bridged between iterations (SHARED_TASK_NOTES.md or equivalent)
- [ ] Failure recovery captures error context for the next attempt
- [ ] De-sloppify pass is separate from the implementer pass (not negative instructions)
- [ ] Verification runs before commits
