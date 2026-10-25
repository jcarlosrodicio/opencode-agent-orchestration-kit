---
name: oak-adversarial-review
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

Attack each reviewed file along these eleven dimensions:

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
10. **A weakened bar.** Faced with a red check, the cheapest road to green
    ends with the check passing and nothing fixed. Read the removed lines as
    carefully as the added ones; that is where these show:
    - **A test got easier.** A skip or focus marker added, a test file
      deleted, an assertion removed or loosened in a test that stayed, an
      expected value rewritten to match what the code now returns.
    - **A checker got silenced.** A new suppression comment (`@ts-ignore`,
      `eslint-disable`, `# noqa`, `# type: ignore`, `#[allow]`,
      `@SuppressWarnings`) or one that drops code from coverage.
    - **A threshold moved.** A coverage or performance budget lowered, a lint
      rule turned off or down a severity, a step removed from the project's
      validation gate or CI.
    - **Work is unfinished.** A stub that throws "not implemented", an empty
      `catch` that turns a failure into silence, a `TODO` where the
      implementation should be.

    None of these is wrong by itself: a test may change when the spec did.
    Each one is a defect of at least medium severity that breaks safe
    operation, so under the review policy it is **blocking** unless the task artifacts or the Verification
    Envelope name it and quote the requirement behind it. Tightening the bar
    needs no justification; loosening it always does.
11. **Tests that prove nothing new.** A new test that re-proves what an
    existing one asserts, the same rule tested again at a slower layer, a
    table of near-identical cases, or anything "Which Tests to Write" in
    `test-driven-development` says not to test. Name the existing test it
    duplicates or the rule it breaks. It is **Should fix**: it does not make
    the change wrong, it makes every later task slower.

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

## Stage 5 Rounds

A review that ends `not_safe_to_commit` sends the change back for a fix, and
then it is reviewed again. Each pass is a **round**.

- **Round 1 reviews the whole change.** Record the commit it reviewed
  (`git log -1 --format=%H`) and whether the tree had uncommitted changes.
- **Every later round reads the previous report first.** It is a review, not
  the author's reasoning, so the context boundary does not apply to it. Close
  each of its findings as **resolved**, **still open** or **dismissed with a
  reason**. A finding the fix did not resolve is still open, not new; one
  dismissed with a reason stays dismissed unless the diff contradicts the
  reason.
- **Then review only what changed since that round**: `git diff` against the
  commit it recorded, plus any file that did not exist then. If that round
  reviewed uncommitted changes, there is no commit to diff against: review the
  whole change again, and do not raise again what the previous report raised.
- **Name the class, not only the instance.** When a finding is one case of a
  pattern (a missing bound, an unchecked error, the same assumption in three
  callers), name the pattern and list every instance, so one round fixes all
  of them.
- **Three rounds is the cap.** If the third round still has a Blocking
  finding, stop reviewing: the verdict is `not_safe_to_commit`, and the report
  says the approach needs reconsidering. That decision is the human's.
- **An approval ends the series.** A correction reviewed after it, such as a
  CI fix, starts a new series at round 1 on that correction's diff.

## Output

1. The coverage line comes first:
   `coverage: round=<n> files_in_change=<n> reviewed=<n> skipped=<n>`,
   followed by each skipped file and its reason. From round 2, the files are
   the ones that round reviewed.
2. From round 2, the previous report's findings with their closure.
3. Findings grouped as **Blocking**, **Should fix** and **Nit**, and
   **Pre-existing** apart from them. Each has `file:line`, what breaks, the
   exact trigger and why the existing tests miss it. Findings keep the
   canonical fields of the reviewer policy. A pre-existing finding is a defect
   the change did not write, modify or make newly reachable: it never blocks
   and is never counted as blocking or unresolved. If the change makes it
   worse, it is the change's, at its real severity.
4. A verdict: `safe_to_commit` or `not_safe_to_commit`.

Never invent findings to look thorough. An empty Blocking group is a valid
result.

Return the full report in the review output under the heading
`Adversarial coverage`. The reviewer is read-only, so the workflow's state-sync
step copies it verbatim to `docs/ai/runs/<YYYY-MM-DD>-<slug>/oak-adversarial-review.md`
when a run folder exists, appending each round under a `## Round <n>` heading so
the file keeps every round. Never leave the report only in the session.

## Mapping to OAK verdicts

| Adversarial verdict | Canonical verdict |
| --- | --- |
| `safe_to_commit`, no Should fix or Nit | `pass` |
| `safe_to_commit`, with Should fix or Nit | `pass_with_observations` |
| `not_safe_to_commit` | `needs_changes` |
| `not_safe_to_commit` because evidence is missing | `blocked` |
| `not_safe_to_commit` after the third round | `blocked` |

The canonical verdict is the one the reviewer returns.

## Run event

When a run is open, end the report with these counts. The state-sync step, not
the reviewer, records them:

```bash
oak run event --type review review=adversarial round=<n> files_in_change=<n> files_reviewed=<n> files_skipped=<n> blocking=<n> should_fix=<n> nit=<n> pre_existing=<n> verdict=<safe_to_commit|not_safe_to_commit>
```

From round 2, add `unresolved=<n>`: the previous findings still open. The last
event is authoritative.
