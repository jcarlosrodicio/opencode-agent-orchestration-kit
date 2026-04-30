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
4. Check `open_design_health` without URL arguments.
5. Check `open_design_list_agents`.
6. Choose the best Open Design `skillId`.
7. Choose the best `designSystemId`.
8. Use `open_design_run_design` only when generated files are explicitly requested.
9. Otherwise use `open_design_create_project` for an editable workbench project.
10. Return project URL, prompt, decisions, assumptions, risks, visual acceptance criteria, and developer handoff.

Never pass `baseUrl` or invent URLs. The tool reads `OPEN_DESIGN_URL`.
