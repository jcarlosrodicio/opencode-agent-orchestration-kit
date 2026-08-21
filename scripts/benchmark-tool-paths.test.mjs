import assert from "node:assert/strict";
import test from "node:test";

import { percentile, summarizeMeasurements } from "./benchmark-tool-paths.mjs";

test("benchmark percentile uses linear interpolation", () => {
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5);
  assert.ok(Math.abs(percentile([1, 2, 3, 4], 0.95) - 3.85) < 1e-12);
});

test("benchmark summary exposes latency, CPU, and RSS percentiles", () => {
  const summary = summarizeMeasurements([
    { elapsed_ms: 1, user_cpu_ms: 2, system_cpu_ms: 3, max_rss_kb: 4 },
    { elapsed_ms: 2, user_cpu_ms: 3, system_cpu_ms: 4, max_rss_kb: 5 },
    { elapsed_ms: 3, user_cpu_ms: 4, system_cpu_ms: 5, max_rss_kb: 6 },
  ]);
  assert.equal(summary.samples, 3);
  assert.equal(summary.elapsed_ms_p50, 2);
  assert.equal(summary.elapsed_ms_p95, 2.9);
  assert.equal(summary.user_cpu_ms_p50, 3);
  assert.equal(summary.system_cpu_ms_p50, 4);
  assert.equal(summary.max_rss_kb_p95, 5.9);
});

test("benchmark rejects invalid sample and percentile inputs", () => {
  assert.throws(() => percentile([], 0.5), /non-empty/i);
  assert.throws(() => percentile([1], 2), /fraction/i);
  assert.throws(() => summarizeMeasurements([]), /non-empty/i);
});
