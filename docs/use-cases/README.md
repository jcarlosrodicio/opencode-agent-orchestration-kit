# Reproducible use cases

These two synthetic case packs compare the public harness with a reduced
`developer`-only invocation while holding the prompt, fixture, OpenCode version,
model selection, and validation constant.

- [Direct label change](direct-label-change/README.md) exercises the smallest
  direct-development path.
- [Feature tag normalizer](feature-tag-normalizer/README.md) exercises the
  explicit feature workflow.

Fixture checks prove that the four stored repositories are internally valid.
They are not live orchestration evidence. Live runs are manual, opt-in, excluded
from CI, and recorded only after their separate approval gate.

Each variant records `pass`, `fail`, or `inconclusive`. Token evidence is marked
`unavailable` when a reliable aggregate cannot be extracted. One run per
variant is an observation, not a benchmark or statistical claim.

Portable reports must not contain raw output, session IDs, reasoning,
model/provider identity, credentials, environment values, private URLs, or
local absolute paths.

Run the fixture checks without network access:

```bash
npm --prefix docs/use-cases/direct-label-change/before test
npm --prefix docs/use-cases/direct-label-change/expected test
npm --prefix docs/use-cases/feature-tag-normalizer/before test
npm --prefix docs/use-cases/feature-tag-normalizer/expected test
```
