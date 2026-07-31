# Backend Review Profile

## Activation

Activate for server-side code, workers, consumers, scheduled jobs, persistence,
or backend-facing contracts. This profile is architecture-neutral. It does not
require DDD, CQRS, hexagonal layers, repositories, aggregates, or particular
folder names.

## Questions

- Are untrusted inputs validated at the boundary and translated into stable
  application/business types?
- Does every operation enforce authentication, authorization, tenant/owner
  isolation, and least privilege where applicable?
- Are transactions and consistency boundaries correct across writes, events,
  caches, and retries?
- Can retries, duplicate messages, concurrent requests, or partial failures
  duplicate effects or corrupt state?
- Are database queries parameterized, bounded, ordered, and free of obvious
  N+1 or lock-contention regressions?
- Are errors mapped deliberately without leaking secrets or infrastructure
  details?
- Are public API/event/schema changes traced to known consumers?
- Will logs, metrics, and traces make important runtime failures attributable
  without exposing sensitive data?

## Required Evidence By Risk

- Pure policy: focused unit tests and static analysis.
- Database/adapters: relevant integration tests against realistic semantics.
- Concurrency/idempotency: repeat or parallel-path regression evidence.
- Public contracts: producer/schema/consumer trace and compatibility checks.
- Security boundaries: negative authorization/input tests.
- Performance-sensitive IO: query plan, measurement, or bounded-operation proof
  proportional to the claim.

## Typical Blocking Findings

- Introduced authorization bypass or cross-tenant access.
- Transaction boundary that can persist partial state or publish an impossible
  fact.
- Duplicate effects under a plausible retry or concurrent request.
- Unbounded query/list operation on a production path.
- Introduced breaking contract with a known consumer left incompatible.
- Business or consistency rule placed where the project's architecture cannot
  enforce or test it safely.

## Non-blocking Or Contextual Findings

- Pre-existing architectural debt not worsened by the diff.
- Alternative naming or layering preferences unsupported by project rules.
- Performance speculation without a plausible hot path or evidence.
- DDD/CQRS recommendations when the strict backend profile is not active.
