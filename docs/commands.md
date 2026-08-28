# Commands

- `/feature`: full feature orchestration.
- `/plan`: research, implementation-ready spec, and reviewer pass with no implementation.
- `/scope`: research plus scoped spec, no implementation.
- `/loop`: explicitly approved, resumable developer-review loop with durable state and bounded iterations.
- `/autonomous`: explicitly requested local-only developer-review cycle with deterministic validation and a one-to-six iteration budget.
- `/mvp-spec`: strict MVP spec with small tasks and clear out of scope.
- `/design`: design via PRODUCT.md/DESIGN.md, optional Impeccable, and Open Design.
- `/research`: direct researcher task.
- `/spec`: direct specifier task.
- `/implement`: direct developer task for approved work.
- `/test`: focused validation or test-driven bug reproduction through `developer`.
- `/code-simplify`: bounded behavior-preserving simplification through `developer`.
- `/review`: direct reviewer task for current diff.
- `/evolve`: optional AHE harness evolution flow.

Detailed command contracts live in `opencode/docs/ai/harness/commands.md`.
