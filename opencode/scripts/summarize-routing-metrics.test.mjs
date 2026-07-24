import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runReplay } from "./replay-routing.mjs";
import {
  MetricsInputError,
  serializeMetrics,
  summarizeRoutingMetrics,
} from "./summarize-routing-metrics.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(scriptDir);
const metricsPath = path.join(scriptDir, "summarize-routing-metrics.mjs");
const corpusPath = path.join(
  root,
  "docs/ai/evolution/benchmarks/router-scenarios.jsonl",
);
const fixturesPath = path.join(
  root,
  "docs/ai/evolution/benchmarks/replay-fixtures.jsonl",
);

function readJsonl(file) {
  return fs
    .readFileSync(file, "utf8")
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
}

function canonicalInputs() {
  return {
    scenarios: readJsonl(corpusPath),
    reports: [runReplay({ corpus: corpusPath, fixtures: fixturesPath })],
  };
}

test("summarizes the canonical replay without inventing token evidence", () => {
  const summary = summarizeRoutingMetrics(canonicalInputs());

  assert.equal(summary.schema_version, 1);
  assert.equal(summary.report_count, 1);
  assert.equal(summary.observation_count, 14);
  assert.equal(summary.accepted_task_count, 14);
  assert.deepEqual(summary.metrics.routing_accuracy, {
    status: "available",
    numerator: 14,
    denominator: 14,
    value: 1,
    excluded_inconclusive: 0,
  });
  assert.deepEqual(summary.metrics.forbidden_agent_activation_rate, {
    status: "available",
    numerator: 0,
    denominator: 14,
    value: 0,
    excluded_inconclusive: 0,
  });
  assert.deepEqual(summary.metrics.premature_write_rate, {
    status: "available",
    numerator: 0,
    denominator: 14,
    value: 0,
    excluded_inconclusive: 0,
  });
  assert.deepEqual(summary.metrics.review_bypass_rate, {
    status: "available",
    numerator: 0,
    denominator: 14,
    value: 0,
    excluded_inconclusive: 0,
  });
  assert.deepEqual(summary.metrics.resume_success_rate, {
    status: "available",
    numerator: 1,
    denominator: 1,
    value: 1,
    excluded_inconclusive: 0,
  });
  assert.deepEqual(summary.metrics.human_intervention_rate, {
    status: "available",
    numerator: 3,
    denominator: 14,
    value: 0.214286,
    excluded_inconclusive: 0,
  });
  assert.deepEqual(summary.metrics.validation_failure_closure_rate, {
    status: "available",
    numerator: 1,
    denominator: 1,
    value: 1,
    excluded_inconclusive: 0,
  });
  assert.deepEqual(summary.metrics.delegations_per_accepted_task, {
    status: "available",
    numerator: 14,
    denominator: 14,
    value: 1,
    excluded_inconclusive: 0,
  });
  assert.deepEqual(summary.metrics.tokens_per_accepted_task, {
    status: "unavailable",
    reason: "token-evidence-absent",
    numerator: null,
    denominator: null,
    value: null,
    excluded_inconclusive: 0,
  });
});

test("excludes inconclusive evidence instead of converting it to failure", () => {
  const inputs = canonicalInputs();
  const result = inputs.reports[0].scenario_results[0];
  const rootAssertion = result.assertions.find(({ id }) => id === "root-agent");
  rootAssertion.status = "inconclusive";
  rootAssertion.reason_code = "session-events-incomplete";
  result.status = "inconclusive";
  inputs.reports[0].status = "inconclusive";

  const summary = summarizeRoutingMetrics(inputs);
  assert.deepEqual(summary.metrics.routing_accuracy, {
    status: "available",
    numerator: 13,
    denominator: 13,
    value: 1,
    excluded_inconclusive: 1,
  });
  assert.equal(summary.accepted_task_count, 13);
});

test("uses unavailable for a zero denominator", () => {
  const inputs = canonicalInputs();
  const validation = inputs.reports[0].scenario_results.find(
    ({ scenario_id: scenarioId }) => scenarioId === "validation-failure-blocks-close",
  );
  const stop = validation.assertions.find(({ id }) => id === "stop-condition");
  stop.status = "inconclusive";
  stop.reason_code = "stop-events-incomplete";
  validation.status = "inconclusive";
  inputs.reports[0].status = "inconclusive";

  assert.deepEqual(
    summarizeRoutingMetrics(inputs).metrics.validation_failure_closure_rate,
    {
      status: "unavailable",
      reason: "no-conclusive-observations",
      numerator: null,
      denominator: null,
      value: null,
      excluded_inconclusive: 1,
    },
  );
});

test("rejects reports that are not operationally usable", () => {
  const inputs = canonicalInputs();
  inputs.reports[0].operational_status = "cleanup-failed";

  assert.throws(
    () => summarizeRoutingMetrics(inputs),
    (error) => error instanceof MetricsInputError
      && error.message === "report 1: operational_status must be ok",
  );
});

test("rejects reports for a different corpus", () => {
  const inputs = canonicalInputs();
  inputs.reports[0].corpus_digest = `sha256:${"0".repeat(64)}`;

  assert.throws(
    () => summarizeRoutingMetrics(inputs),
    (error) => error instanceof MetricsInputError
      && error.message === "report 1: corpus_digest mismatch",
  );
});

test("rejects unsanitized nested report fields without disclosing them", () => {
  const inputs = canonicalInputs();
  const result = inputs.reports[0].scenario_results.find(
    ({ writes }) => writes.length > 0,
  );
  result.writes[0].provider_secret = "do-not-leak-this-value";

  assert.throws(
    () => summarizeRoutingMetrics(inputs),
    (error) => error instanceof MetricsInputError
      && error.message.endsWith("unknown field")
      && !error.message.includes("provider_secret")
      && !error.message.includes("do-not-leak"),
  );
});

test("serialization is deterministic and newline terminated", () => {
  const summary = summarizeRoutingMetrics(canonicalInputs());
  assert.equal(serializeMetrics(summary), `${JSON.stringify(summary, null, 2)}\n`);
});

test("CLI diagnostics do not disclose input paths or report contents", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-routing-metrics-"));
  try {
    const privatePath = path.join(cwd, "private-provider-secret-report.json");
    fs.writeFileSync(privatePath, JSON.stringify({
      operational_status: "cleanup-failed",
      secret: "do-not-leak-this-value",
    }));
    const result = spawnSync(
      process.execPath,
      [
        metricsPath,
        "--corpus",
        corpusPath,
        "--report",
        privatePath,
      ],
      { encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^MetricsInputError: report 1:/);
    assert.doesNotMatch(result.stderr, /private-provider|do-not-leak|secret-report/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
