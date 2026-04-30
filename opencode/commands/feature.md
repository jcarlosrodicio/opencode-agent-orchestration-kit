---
description: Orchestrate a complete feature through discovery, spec, implementation, and review.
agent: lead
---


Objective:

$ARGUMENTS

Run the feature flow with explicit barriers.

## Mandatory flow

1. Analyze the objective and current repository.
2. Apply the base flow: `lead -> designer if applicable -> researcher -> specifier -> developer -> reviewer`.
3. Decide whether design and/or research are needed.
4. If UX, brand, layout, interaction, or acceptance criteria are affected, invoke `designer` and wait for handoff.
5. If there is technical/product/API/library/risk/architecture uncertainty, invoke `researcher` and wait for output.
6. Parallelize designer and researcher only if their results are independent.
7. Synthesize design/research before invoking `specifier`.
8. Invoke `developer` only for sufficiently specified tasks.
9. Invoke `reviewer` after implementation.
10. If reviewer requires changes, route through lead back to developer, then review again.
11. Close with changes, validation, and risks.

AHE sidecars are optional and must not be inserted unless evidence is needed or this request changes the harness itself.
