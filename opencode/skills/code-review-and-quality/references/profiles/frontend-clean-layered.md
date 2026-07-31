# Declared Clean Layered Frontend Profile

## Activation

Activate only when the task, applicable instructions, ADR, specification, or
architecture documentation explicitly declares a layered/Clean client
architecture, feature boundaries, pure domain, unidirectional state, ports, or
repositories. Apply only the declared parts. Layout alone does not activate
this profile.

Local conventions control the state manager, folder names, DTO style, use-case
shape, dependency injection, navigation, and test vocabulary.

## Questions

- Do dependencies point toward the declared domain/application layers?
- Can declared domain rules run without UI framework, HTTP, storage, or native
  plugin startup?
- Does presentation render prepared state and dispatch actions instead of
  owning business decisions or calling infrastructure directly?
- Are screen states immutable and explicit enough to prevent impossible
  combinations?
- Is data flow unidirectional according to the project's state model?
- Do declared repositories/use cases expose business operations instead of
  transport verbs and types?
- Are API/storage DTOs mapped explicitly at the infrastructure boundary rather
  than deserialized into domain models?
- Are network/storage/plugin errors translated before reaching presentation?
- Is composition/wiring outside the declared domain and application core?
- Does shared code represent a real stable cross-feature concept rather than
  coupling unrelated features prematurely?

## Required Evidence By Risk

- Domain/use-case/state logic: pure focused tests.
- DTO mapping: tolerant-read and strict-write contract tests where applicable.
- Presentation states: component/widget tests for explicit state variants.
- Infrastructure adapters: integration/contract tests through declared seams.
- Dependency direction: architecture/import checks or direct import evidence.
- Core user flow: runtime/integration evidence with external network mocked.

## Typical Blocking Findings

- Newly introduced framework/network/storage dependency in a declared pure
  inner layer.
- Presentation calling an API/repository directly contrary to declared flow.
- Business rule implemented only in a component and bypassable from another
  entry point.
- Impossible state combinations introduced where closed states are declared.
- API DTO or transport error leaking into domain/presentation contrary to the
  declared boundary.
- Duplicate source of truth that can produce divergent visible state.

## Non-blocking Or Contextual Findings

- Pre-existing boundary drift not worsened by the task.
- Missing value objects, repositories, use-case classes, or feature folders not
  required by the project's declaration.
- Alternative state-management or DI preferences.
- Broad architecture migration outside the requested feature.
