# Native tool-path benchmark

This benchmark measures the current dependency-free Node path before deciding
whether a native Rust helper is justified. It is evidence collection, not a
Rust implementation or a release blocker.

Run it with at least two iterations per operation:

```bash
node scripts/benchmark-tool-paths.mjs --iterations 5 > /tmp/oak-native-benchmark.json
```

It exercises two synthetic fixtures and, by default, this repository. Each
fixture measures file listing, text search, Node parse checking, capability
snapshot generation, and installation through the same manager used by the
package. The report contains p50/p95 elapsed time, p50 CPU, and p95 RSS for
each path. RSS is the benchmark runner's process value; child-command memory is
not isolated, so the result must not be presented as a process-level peak for
`node --check`.

## Adoption threshold

Keep the Node implementation unless a Rust replacement demonstrates, on both
fixtures and two consecutive runs:

- at least 2x lower p95 latency for one material hot path;
- no regression above 10% in p95 RSS or installation time;
- equivalent portable behavior and failure semantics;
- a reviewable multi-platform distribution and checksum plan.

The current repository has no Rust candidate or cross-platform artifact to
compare. Until that evidence exists, adding Rust would increase distribution
and supply-chain surface without a measured product benefit.
