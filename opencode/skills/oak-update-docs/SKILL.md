---
name: oak-update-docs
description: Use as the last step of any change that altered behavior, contracts, schema, architecture, setup or a roadmap item, before committing - updates the documentation the repository treats as its source of truth so the next session starts from accurate context.
phase: ship
domains:
  - documentation
stacks:
  - any
allowed_agents:
  - developer
skill_source: built-in
origin: null
status: active
---

# Update Docs

## Overview

The next session, human or agent, starts from the documentation. A change that
leaves it stale costs more later than it saves now. Updating the owning docs is
part of the change, not a follow-up, and it happens before delivery.

## Map each change to its owning doc

| The change touched | Update |
| --- | --- |
| an API contract | the API document |
| a schema, migration or model | the data-model document |
| a module or service boundary | the architecture document, plus an ADR if a rule was bent |
| a new command, script or environment variable | the setup guide |
| behavior a reader would not expect | the spec, or an ADR |
| a roadmap item it completes | the roadmap entry and its status |

The roadmap entry is the update most often forgotten. Check it every time.

## How to write the update

- Match the structure the document already has.
- Explain intent and constraints. Do not paraphrase the code.
- Fix every statement the change made false, not just the paragraph you were
  looking for.
- Do not create a new document when one already owns the topic.
- Do not add a changelog entry unless the project keeps a changelog.
- Do not leave a TODO in place of the update.

## Report

End with one of:

- the list of documents updated; or
- the documents you checked, and why each was unaffected.

"No docs needed" without that list is not a report.
