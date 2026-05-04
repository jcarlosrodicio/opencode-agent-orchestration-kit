---
description: Design with PRODUCT.md/DESIGN.md, optional Impeccable, and Open Design workbench.
agent: designer
subtask: true
---


Design the following:

$ARGUMENTS

Mandatory flow:

1. Search for and read `PRODUCT.md` and `DESIGN.md`.
2. If either is missing, load `impeccable` and create or propose the missing document(s).
3. Load `open-design`.
4. Resolve `baseUrl` from approved safe configuration or explicit user/lead context.
5. If `baseUrl` is missing, stop and ask; do not guess or hardcode URLs.
6. Check `open_design_health` with the resolved `baseUrl`.
7. Check `open_design_list_agents` with the resolved `baseUrl`.
8. Choose the best Open Design `skillId`.
9. Choose the best `designSystemId`.
10. Use `open_design_run_design` with the resolved `baseUrl` only when generated files are explicitly requested.
11. Otherwise use `open_design_create_project` with the resolved `baseUrl` for an editable workbench project.
12. Return project URL, prompt, decisions, assumptions, risks, visual acceptance criteria, and developer handoff.

Never invent URLs or hardcode `baseUrl`; it must come from approved configuration/context.
