# Declared Clean DDD CQRS Backend Profile

## Activation

Activate only when the task, applicable instructions, ADR, specification, or
architecture documentation explicitly declares Clean Architecture, DDD,
hexagonal architecture, and/or CQRS. Apply only the declared parts. Layout
alone does not activate this profile.

Local declarations and canonical examples control exact vocabulary, package
structure, naming, HTTP conventions, migration practices, and tactical DDD
depth.

## Questions

- Do dependencies point toward the declared domain/application core?
- Can domain rules run without framework, ORM, HTTP, broker, storage, or UI
  startup?
- Are business invariants owned by the declared aggregate/entity/value-object
  boundaries instead of controllers or adapters?
- Do application/use-case handlers orchestrate policy through declared ports
  rather than constructing infrastructure clients?
- If CQRS is declared, do writes use the domain model and reads use the
  project's declared projection path without leaking write-side rules?
- Are adapters thin translations, and are ORM/transport types prevented from
  becoming domain or public-contract types?
- Are domain events, public events, mappings, and known consumers propagated
  through the complete declared chain?
- If atomic state plus message publication is required, does the change preserve
  the declared outbox or equivalent guarantee?
- Are bounded contexts protected by explicit translations rather than shared
  mutable models?

## Required Evidence By Risk

- Domain rules: pure unit tests with no framework boot.
- Use cases: port doubles or in-memory fakes following local convention.
- Adapters: contract/integration tests for the declared port behavior.
- Dependency direction: architecture/import-rule checks when the project has
  them, otherwise direct import evidence.
- Events/contracts: mapping and known-consumer compatibility evidence.

## Typical Blocking Findings

- Newly introduced outer-layer dependency in a declared inner layer.
- Business invariant bypassed or moved into a transport/persistence adapter.
- Use case coupled directly to an ORM, broker, HTTP client, or framework type
  contrary to the declared architecture.
- Public contract exposing an internal domain/persistence model contrary to the
  declared anti-corruption boundary.
- Declared write/read or event-publication guarantee broken by the diff.

## Non-blocking Or Contextual Findings

- Pre-existing dependency violations not worsened or required by the change.
- Missing tactical DDD building blocks the project does not declare.
- Preferences for value objects, repository names, controllers, or package
  layout that conflict with the project's canonical example.
- A migration toward this profile when the task only requested a safe local
  change.
