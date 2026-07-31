---
name: code-review-and-quality
description: Conducts multi-axis code review. Use before merging any change. Use when reviewing code written by yourself, another agent, or a human. Use when you need to assess code quality across multiple dimensions before it enters the main branch.
phase: review
domains:
  - review
  - security
  - testing
  - performance
stacks:
  - any
allowed_agents:
  - reviewer
  - lead
  - developer
surfaces:
  - diff-review
  - quality-gates
skill_source: built-in
origin: null
status: active
---

# Code Review And Quality

## Purpose

Route every code review through one canonical policy and only the profiles that
match the changed surface and declared architecture. This file is an entrypoint,
not a second source of review rules.

## Required Loading Sequence

1. Read [`references/review-policy.md`](references/review-policy.md) completely.
2. Always activate the `core` policy.
3. Activate the generic backend and/or frontend profile from the changed
   surface.
4. Activate a strict architecture profile only from an explicit declaration in
   the task, applicable repository instructions, an ADR, a specification, or
   architecture documentation.
5. Treat file names and folders only as corroborating evidence; layout alone
   does not activate a strict profile.
6. Report `profile_resolution`: selected profiles, omitted profiles, evidence
   for selection, and fallback used when architecture is not declared.
7. Apply the findings and final-output contracts from the canonical policy.

## Profile Routing

### Generic backend

Read
[`references/profiles/backend.md`](references/profiles/backend.md) for server,
worker, consumer, persistence, backend API, or server-side integration changes.

### Declared Clean/DDD/hexagonal/CQRS backend

Read
[`references/profiles/backend-clean-ddd-cqrs.md`](references/profiles/backend-clean-ddd-cqrs.md)
only for the parts of Clean Architecture, DDD, hexagonal architecture, or CQRS
that the repository or task explicitly declares.

### Generic frontend

Read
[`references/profiles/frontend.md`](references/profiles/frontend.md) for web,
mobile, desktop, UI, client state, navigation, local storage, or client network
changes.

### Declared Clean/layered frontend

Read
[`references/profiles/frontend-clean-layered.md`](references/profiles/frontend-clean-layered.md)
only when a layered/Clean client architecture is explicitly declared.

## Contextual Adaptation

When no strict profile is declared:

- preserve correctness, dependency direction, boundary clarity, testability,
  replaceability, and explicit contracts;
- translate those principles into the project's actual modules, services,
  stores, hooks, components, controllers, adapters, or other boundaries;
- follow applicable local instructions, ADRs, and canonical examples;
- do not require DDD building blocks, Clean layers, CQRS, repositories, value
  objects, use-case classes, or specific folder/naming conventions;
- do not treat personal preference as architecture evidence.

## Optional Supporting Skills

Load `security-and-hardening`, `performance-optimization`,
`test-driven-development`, or `debugging-and-error-recovery` only when the diff
or evidence activates that risk. Supporting skills may deepen an axis but may
not redefine the canonical policy's causality, stage, verdict, or blocking
rules.

## Completion Check

Before returning:

- the canonical policy was read;
- selected profiles and activation evidence are explicit;
- the real diff and primary evidence were inspected;
- relevant deterministic validation was independently repeated or listed as
  `not_run` with impact;
- every finding follows the common schema and causal blocking rules;
- pre-existing debt remains non-blocking;
- only the general reviewer emits `review_stage: final` and a final verdict.
