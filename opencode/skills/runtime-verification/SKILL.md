---
name: runtime-verification
description: Use after tests and validation pass and before the final review, whenever a change could show up at runtime - a screen, a command, an endpoint, a job or a data store - to prove the change works in the running system, including its failure path, with repeatable steps and minimal evidence.
phase: verify
domains:
  - testing
  - evaluation
stacks:
  - any
allowed_agents:
  - developer
skill_source: built-in
origin: null
status: active
---

# Runtime Verification

## Overview

Tests prove that the tests pass. This step proves that the change works in the
running system. It runs after validation is green and before the final review,
and it exercises the real surface the change touches: the happy path and the
failure path.

## Decide the surface

Pick exactly one surface per affected area:

| Surface | Use when | What to do |
| --- | --- | --- |
| `none` | refactor, types, build-only change | Skip, and state why in one line. |
| `command` | a CLI, script or job | Run it and inspect its effect and logs. |
| `endpoint` | an HTTP, RPC or message handler | Call it and inspect the response and effect. |
| `store` | a database, cache, file or queue | Query it before and after. |
| `screen` | a user interface | Drive the real application. |

Never open a browser or a simulator for a change that has no screen.

## Find how the project is exercised

Look in this order and stop at the first answer:

1. The project's own mandatory steps, or its `AGENTS.md`.
2. The documents those link to.
3. The repository itself: manifest scripts, container files, an end-to-end
   suite, a seed command.

A project with no way to run the surface is a finding to report. It is not a
reason to skip the step.

## Exercise it

- Run the happy path, then at least one failure path.
- Check the real effect, not just the exit code: the row written, the message
  sent, the file created, the log line, the cache entry.
- Write the steps down so someone else can repeat them exactly.
- For a migration, use the real engine and check three things:
  1. applying it a second time changes nothing;
  2. it migrates a store that already holds data;
  3. the engine and its version are named in the report.

## Evidence

Collect the cheapest evidence that proves the point:

- `screen`: one still image per state;
- `command`: the verbatim output and exit code, as text;
- `endpoint`: the request sent, and the status and body received;
- `store`: the query, and the rows before and after.

Do not record video. Keep evidence in a temporary directory outside the
repository, and never commit it.

## Report

The report states:

- what was run;
- the evidence, by file name only;
- what was observed, including the failure path;
- a **Not covered** list;
- a verdict: `works_as_specified`, `does_not`, or `could_not_be_verified`.

`could_not_be_verified` names exactly what was missing.

Record the result in the developer's Verification Envelope as
`runtime_verification: { surface, verdict, report }`.

## When it cannot run

If the step needs something you do not have (a credential, a paid service, a
device, an unavailable dependency), say so and return `could_not_be_verified`.
Under `/autonomous` this is a stop reason. Never report the step as done on the
strength of unit tests.

## Run event

When a run is open, emit one event per surface, with counts and enums only:

```bash
oak run event --type runtime_verification surface=<none|command|endpoint|store|screen> verdict=<works_as_specified|does_not|could_not_be_verified> evidence_count=<n>
```
