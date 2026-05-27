---
description: Research a task and produce a scoped spec. No design, implementation, or review.
agent: scoper
---


I want to research and specify this task:

$ARGUMENTS

Run strictly: `researcher -> scoper synthesis -> specifier`.

## Init/context policy

Before research, fix minimum context:

- `cwd`: current repo or target directory.
- `AGENTS.md`: applicable local rules when present.
- `git state`: clean/dirty state when current changes matter.
- `validation commands`: checks that should prove the future spec.
- `repo docs`: relevant local documentation.

Rules:

1. Do not use designer.
2. Do not use developer.
3. Do not use reviewer.
4. Do not implement code.
5. Invoke researcher first.
6. Wait for the complete researcher output.
7. Synthesize findings, risks, decisions, and assumptions.
8. Invoke specifier only if research is ready for spec.
9. Ask for scoped specs, not a large macro-spec.
10. Produce small ordered tasks with acceptance criteria and validation.
11. Include a `Task Contract` for future implementation.
12. Include a `handoff_packet` when multiple sessions or agents are involved.
