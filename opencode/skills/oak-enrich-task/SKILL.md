---
name: oak-enrich-task
description: Use before specifying any feature, fix or refactor that arrives as a short request, roadmap line, screenshot or one-paragraph idea - turns it into an implementable specification with scope, reuse, requirements, acceptance criteria, hostile test cases and the open questions the request leaves ambiguous.
phase: define
domains:
  - specification
  - research
stacks:
  - any
allowed_agents:
  - lead
  - scoper
  - specifier
skill_source: built-in
origin: null
status: active
---

# Enrich Task

## Overview

A short request hides most of the decisions an implementation needs. This skill
turns it into a specification a developer can build and a reviewer can check,
and it surfaces the questions the request does not answer instead of guessing.

The input can be a roadmap line, a phase name, free text, a screenshot or a
link. Work from what was given. Do not ask for a ticket id and do not fetch one.

## When to skip

Skip the skill when the request already states acceptance criteria, the files or
modules it affects, and its non-functional requirements. Say that you skipped it
and why.

If the request is larger than one reviewable change, stop and propose a split
into smaller tasks instead of enriching the whole thing.

## Steps

1. **Read the project's own rules first.** Open the repository `AGENTS.md` and
   follow its links to the architecture, standards and data-model documents the
   task touches. Do this before exploring code.
2. **Understand the problem before the solution.** State who has the problem,
   what they cannot do today and what changes for them. Keep technical depth,
   but do not jump to an implementation.
3. **Find what to reuse.** Name the existing endpoints, models, components, use
   cases and response shapes the change should build on. Reuse beats new code.
4. **Test for completeness.** Check that the enhanced version covers:
   - the behavior, including every field that changes;
   - the boundaries the change may cross (modules, services, stored data);
   - the definition of done, including doc and test updates;
   - non-functional requirements: security, performance, observability and
     data integrity.
5. **Write the enhanced version** in the format below.
6. **List the open questions.** At minimum consider: one or many, who owns it,
   who may do it, what happens to existing data, and what happens on partial
   failure. Never answer one of these silently inside the requirements.

## Output format

The output has exactly two top-level headings.

```markdown
## Original

<the request as received, unedited>

## Enhanced

### Summary and scope
<business summary; an explicit "Out of scope" list>

### Reuse
<existing code, contracts and shapes to build on>

### Functional requirements

### Non-functional requirements

### Affected files and modules

### Acceptance criteria and definition of done

### Test cases
<happy path plus hostile cases: empty input, oversized input, wrong encoding,
injection, concurrent writes, and an entity in a state that forbids the action>

### Open questions
```

Do not write files unless the caller asks for them. The specification is the
reply.

## Open questions

Each question names the decision, the candidate answers and what each answer
would change. A question that no candidate answer would change is not a
question; drop it.

## Autonomous mode

Under `/autonomous`, sort every open question into one of two piles:

- **Decided.** The roadmap, the docs or the code answer it. Record the answer,
  the reason and the alternative you rejected in the autonomy log.
- **Blocking.** It matches one of the `/autonomous` stop reasons. Stop and ask.

An empty Blocking pile is the normal case, not a sign that something was missed.
