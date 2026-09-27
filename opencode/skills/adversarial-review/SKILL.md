---
name: adversarial-review
description: Use for every final review of a diff - an independent pass that assumes the change is wrong, accounts for every changed file, attacks it along fixed dimensions, fact-checks its own findings and ends in an explicit verdict. Use also when the user asks for a red-team or devil's-advocate review.
phase: review
domains:
  - review
  - security
  - testing
stacks:
  - any
allowed_agents:
  - reviewer
skill_source: built-in
origin: null
status: active
---

# Adversarial Review

## Overview

Green tests show only that the tests pass. This review starts from the opposite
assumption: the change is broken somewhere, and the job is to find where. It
adds a coverage contract and a fact-check to the canonical review, so that no
changed file goes unexamined and no finding survives on a misreading.

The coverage contract and the drop grounds in Stage 4 follow
`alibaba/open-code-review` (Apache-2.0).

## Stance and context boundary

- Attack; do not praise. A finding that cannot be demonstrated is not a finding.
- Every finding names a file, a line and a concrete input or sequence of steps
  that breaks it.
- Build your view from the task artifacts (spec, acceptance criteria, plan) and
  the diff. Do not read the author's notes, the developer summary, run events or
  an autonomy log until your findings are written. Checking run *status* is
  allowed.
- Run in a fresh subagent context, never in the session that wrote the change.

## Stage 1 Coverage

1. List every changed file as `(path, status)`, where status is added, modified,
   deleted or renamed.
2. Every file ends as **reviewed** or **skipped**. A skip needs a concrete
   reason, such as "generated file" or "lockfile". "Looked minor" is not a
   reason.
3. Reviewing a file does not cover its counterpart. A changed interface, test or
   config is its own entry.
4. Publish the counts: files in the change, reviewed and skipped.

## Stage 2 Attack plan

For each risk you suspect, write down before reading further:

- the expected severity;
- the stake: where it happens, what breaks and who would notice;
- exactly what you must read to confirm or refute it.

Then read that, and confirm or drop the risk. Do not pad the plan with risks you
have no reason to suspect.

## Stage 3 Dimensions

Attack each reviewed file along these nine dimensions:

1. **Assumptions.** Does the code assume a value exists, is non-empty, is
   unique, is ordered or arrives only once?
2. **State preconditions.** What state must hold before this runs, and what
   happens when it does not?
3. **Authorization.** Is access checked, including on every new read path?
4. **Input handling.** Empty, whitespace-only, maximum length, wrong type,
   encoding, unicode, and injection into a query, a shell, a template or a log.
5. **Concurrency and idempotency.** Two callers at once; the same request twice.
6. **Error paths.** What does the caller actually see when this fails?
7. **Spec drift.** Behavior the spec asked for that is missing, and behavior
   the diff adds that nobody asked for.
8. **Conventions.** Consistency with the conventions the repository documents.
9. **Architecture.** Conformance with the project's own declared rules only,
   never with rules you would prefer.

A finding that spans files is filed against a changed file.

## Stage 4 Fact-check

Re-read every finding against the diff and ask whether the diff proves it wrong.
Drop a finding on only two grounds:

- **A.** The construct it names does not exist in the file it was filed against.
- **B.** A line of the diff literally contradicts it.

Never drop a finding about memory safety, concurrency, a mismatch between a
declaration and its definition, a behavioral or compatibility change, or a
parameter that is accepted but unused.

Disagreeing with the fix, being unable to confirm the finding, or a wrong line
number are not grounds to drop it. Correct the citation instead.

## Output

1. The coverage line comes first:
   `coverage: files_in_change=<n> reviewed=<n> skipped=<n>`, followed by each
   skipped file and its reason.
2. Findings grouped as **Blocking**, **Should fix** and **Nit**. Each has
   `file:line`, what breaks, the exact trigger and why the existing tests miss
   it. Findings keep the canonical fields of the reviewer policy.
3. A verdict: `safe_to_commit` or `not_safe_to_commit`.

Never invent findings to look thorough. An empty Blocking group is a valid
result.

Write the report to `docs/ai/runs/<YYYY-MM-DD>-<slug>/adversarial-review.md`
when a run folder exists. Otherwise put it in the review output under the
heading `Adversarial coverage`. Never leave the report only in the session.

## Mapping to OAK verdicts

| Adversarial verdict | Canonical verdict |
| --- | --- |
| `safe_to_commit`, no Should fix or Nit | `pass` |
| `safe_to_commit`, with Should fix or Nit | `pass_with_observations` |
| `not_safe_to_commit` | `needs_changes` |
| `not_safe_to_commit` because evidence is missing | `blocked` |

The canonical verdict is the one the reviewer returns.

## Run event

When a run is open, record counts only:

```bash
oak run event --type review review=adversarial files_in_change=<n> files_reviewed=<n> files_skipped=<n> blocking=<n> should_fix=<n> nit=<n> verdict=<safe_to_commit|not_safe_to_commit>
```

After a correction pass, emit it again with `unresolved=<n>`. The last event is
authoritative.
