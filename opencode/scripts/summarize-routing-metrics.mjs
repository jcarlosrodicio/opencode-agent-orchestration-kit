#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  computeCorpusDigest,
  validateScenarios,
} from "./replay-routing.mjs";

const reportKeys = [
  "schema_version",
  "corpus_digest",
  "mode",
  "operational_status",
  "status",
  "scenario_results",
];
const resultKeys = [
  "scenario_id",
  "status",
  "assertions",
  "observed_agents",
  "delegation_count",
  "writes",
  "review_sequence",
  "observed_stop_condition",
  "limitations",
];
const assertionKeys = [
  "id",
  "status",
  "reason_code",
  "evidence_sequences",
];
const assertionIds = [
  "observation-integrity",
  "root-agent",
  "required-agents",
  "forbidden-agents",
  "skills",
  "write-before-spec",
  "review-policy",
  "stop-condition",
  "delegation-budget",
];
const writeKeys = ["sequence", "agent", "tool"];
const reviewKeys = ["sequence", "agent", "verdict"];
const limitationKeys = ["code", "channels"];
const coverageChannels = [
  "session_events",
  "skill_events",
  "tool_events",
  "review_events",
  "stop_events",
];
const portableValuePattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const sensitiveValuePatterns = [
  /\/(?:Users|home)\//i,
  /https?:\/\//i,
  /\b(?:provider|model|endpoint|token|secret|prompt|thinking|reasoning|password|username|credential|api[_-]?key)\b/i,
];
const humanRequiredStops = new Set([
  "clarification-required",
  "evidence-required",
  "resume-checkpoint",
]);

export class MetricsInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "MetricsInputError";
  }
}

function fail(label, message) {
  throw new MetricsInputError(`${label}: ${message}`);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireExactKeys(value, expected, label) {
  if (!isObject(value)) fail(label, "must be an object");
  for (const key of expected) {
    if (!Object.hasOwn(value, key)) fail(label, `missing field ${key}`);
  }
  for (const key of Object.keys(value)) {
    if (!expected.includes(key)) fail(label, "unknown field");
  }
}

function requirePortableValue(value, label) {
  if (
    typeof value !== "string"
    || !portableValuePattern.test(value)
    || sensitiveValuePatterns.some((pattern) => pattern.test(value))
  ) {
    fail(label, "must be a portable sanitized value");
  }
}

function requireStatus(value, label) {
  if (!["pass", "fail", "inconclusive"].includes(value)) {
    fail(label, "invalid status");
  }
}

function aggregate(statuses) {
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("inconclusive")) return "inconclusive";
  return "pass";
}

function validateAssertion(value, expectedId, label) {
  requireExactKeys(value, assertionKeys, label);
  if (value.id !== expectedId) fail(label, `expected assertion ${expectedId}`);
  requireStatus(value.status, label);
  if (typeof value.reason_code !== "string" || value.reason_code.length === 0) {
    fail(label, "reason_code must be a non-empty string");
  }
  requirePortableValue(value.reason_code, label);
  if (
    !Array.isArray(value.evidence_sequences)
    || value.evidence_sequences.some((sequence) => !Number.isInteger(sequence) || sequence < 1)
  ) {
    fail(label, "evidence_sequences must contain positive integers");
  }
}

function validateResult(value, scenarioId, label) {
  requireExactKeys(value, resultKeys, label);
  if (value.scenario_id !== scenarioId) fail(label, "scenario_id mismatch");
  requireStatus(value.status, label);
  if (!Array.isArray(value.assertions) || value.assertions.length !== assertionIds.length) {
    fail(label, "assertions must contain the closed assertion set");
  }
  for (const [index, assertionId] of assertionIds.entries()) {
    validateAssertion(value.assertions[index], assertionId, `${label} assertion ${index + 1}`);
  }
  if (value.status !== aggregate(value.assertions.map(({ status }) => status))) {
    fail(label, "status does not match assertions");
  }
  if (!Number.isInteger(value.delegation_count) || value.delegation_count < 0) {
    fail(label, "delegation_count must be a non-negative integer");
  }
  if (!Array.isArray(value.observed_agents)) {
    fail(label, "observed_agents must be an array");
  }
  for (const agent of value.observed_agents) requirePortableValue(agent, label);
  if (!Array.isArray(value.writes)) fail(label, "writes must be an array");
  for (const [index, write] of value.writes.entries()) {
    const itemLabel = `${label} write ${index + 1}`;
    requireExactKeys(write, writeKeys, itemLabel);
    if (!Number.isInteger(write.sequence) || write.sequence < 1) {
      fail(itemLabel, "sequence must be a positive integer");
    }
    requirePortableValue(write.agent, itemLabel);
    requirePortableValue(write.tool, itemLabel);
  }
  if (!Array.isArray(value.review_sequence)) {
    fail(label, "review_sequence must be an array");
  }
  for (const [index, review] of value.review_sequence.entries()) {
    const itemLabel = `${label} review ${index + 1}`;
    requireExactKeys(review, reviewKeys, itemLabel);
    if (!Number.isInteger(review.sequence) || review.sequence < 1) {
      fail(itemLabel, "sequence must be a positive integer");
    }
    requirePortableValue(review.agent, itemLabel);
    if (!["approved", "changes-requested", "blocked"].includes(review.verdict)) {
      fail(itemLabel, "invalid verdict");
    }
  }
  if (!Array.isArray(value.limitations)) fail(label, "limitations must be an array");
  for (const [index, limitation] of value.limitations.entries()) {
    const itemLabel = `${label} limitation ${index + 1}`;
    requireExactKeys(limitation, limitationKeys, itemLabel);
    requirePortableValue(limitation.code, itemLabel);
    if (
      !Array.isArray(limitation.channels)
      || limitation.channels.some((channel) => !coverageChannels.includes(channel))
    ) {
      fail(itemLabel, "channels must contain known coverage channels");
    }
  }
  if (
    value.observed_stop_condition !== null
    && (typeof value.observed_stop_condition !== "string"
      || value.observed_stop_condition.length === 0)
  ) {
    fail(label, "observed_stop_condition must be null or a non-empty string");
  }
  if (value.observed_stop_condition !== null) {
    requirePortableValue(value.observed_stop_condition, label);
  }
}

function validateReport(report, index, scenarios, corpusDigest) {
  const label = `report ${index + 1}`;
  requireExactKeys(report, reportKeys, label);
  if (report.schema_version !== 1) fail(label, "schema_version must be 1");
  if (report.corpus_digest !== corpusDigest) fail(label, "corpus_digest mismatch");
  if (!["deterministic", "live"].includes(report.mode)) fail(label, "invalid mode");
  if (report.operational_status !== "ok") {
    fail(label, "operational_status must be ok");
  }
  requireStatus(report.status, label);
  if (
    !Array.isArray(report.scenario_results)
    || report.scenario_results.length !== scenarios.length
  ) {
    fail(label, "scenario_results must cover the corpus exactly");
  }
  const sortedResults = report.scenario_results
    .slice()
    .sort((left, right) => String(left?.scenario_id).localeCompare(String(right?.scenario_id)));
  const sortedScenarios = scenarios
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const [resultIndex, scenario] of sortedScenarios.entries()) {
    validateResult(sortedResults[resultIndex], scenario.id, `${label} result ${resultIndex + 1}`);
  }
  if (report.status !== aggregate(sortedResults.map(({ status }) => status))) {
    fail(label, "status does not match scenario_results");
  }
  return sortedResults;
}

function assertionFor(result, id) {
  return result.assertions.find((assertion) => assertion.id === id);
}

function availableMetric(numerator, denominator, excludedInconclusive) {
  if (denominator === 0) {
    return {
      status: "unavailable",
      reason: "no-conclusive-observations",
      numerator: null,
      denominator: null,
      value: null,
      excluded_inconclusive: excludedInconclusive,
    };
  }
  return {
    status: "available",
    numerator,
    denominator,
    value: Number((numerator / denominator).toFixed(6)),
    excluded_inconclusive: excludedInconclusive,
  };
}

function assertionRate(observations, assertionId, countStatus) {
  let numerator = 0;
  let denominator = 0;
  let excludedInconclusive = 0;
  for (const { result } of observations) {
    const assertion = assertionFor(result, assertionId);
    if (assertion.status === "inconclusive") {
      excludedInconclusive += 1;
      continue;
    }
    denominator += 1;
    if (assertion.status === countStatus) numerator += 1;
  }
  return availableMetric(numerator, denominator, excludedInconclusive);
}

function routingAccuracy(observations) {
  const routingIds = ["root-agent", "required-agents", "delegation-budget"];
  let numerator = 0;
  let denominator = 0;
  let excludedInconclusive = 0;
  for (const { result } of observations) {
    const assertions = routingIds.map((id) => assertionFor(result, id));
    if (assertions.some(({ status }) => status === "inconclusive")) {
      excludedInconclusive += 1;
      continue;
    }
    denominator += 1;
    if (assertions.every(({ status }) => status === "pass")) numerator += 1;
  }
  return availableMetric(numerator, denominator, excludedInconclusive);
}

function stopMetric(observations, {
  category,
  success,
}) {
  let numerator = 0;
  let denominator = 0;
  let excludedInconclusive = 0;
  for (const observation of observations) {
    if (category !== undefined && observation.scenario.category !== category) continue;
    const stop = assertionFor(observation.result, "stop-condition");
    if (stop.status === "inconclusive") {
      excludedInconclusive += 1;
      continue;
    }
    denominator += 1;
    if (success(observation, stop)) numerator += 1;
  }
  return availableMetric(numerator, denominator, excludedInconclusive);
}

export function summarizeRoutingMetrics({ scenarios, reports }) {
  try {
    validateScenarios(scenarios, { file: "corpus" });
  } catch {
    fail("corpus", "invalid schema");
  }
  if (!Array.isArray(reports) || reports.length === 0) {
    fail("reports", "at least one report is required");
  }
  const corpusDigest = computeCorpusDigest(scenarios);
  const scenariosById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const observations = reports.flatMap((report, index) => validateReport(
    report,
    index,
    scenarios,
    corpusDigest,
  ).map((result) => ({
    result,
    scenario: scenariosById.get(result.scenario_id),
  })));
  const accepted = observations.filter(({ result }) => result.status === "pass");
  const delegationSum = accepted.reduce(
    (sum, { result }) => sum + result.delegation_count,
    0,
  );
  const delegationExcluded = observations.filter(
    ({ result }) => result.status === "inconclusive",
  ).length;

  return {
    schema_version: 1,
    corpus_digest: corpusDigest,
    report_count: reports.length,
    observation_count: observations.length,
    accepted_task_count: accepted.length,
    metrics: {
      routing_accuracy: routingAccuracy(observations),
      forbidden_agent_activation_rate: assertionRate(
        observations,
        "forbidden-agents",
        "fail",
      ),
      premature_write_rate: assertionRate(observations, "write-before-spec", "fail"),
      review_bypass_rate: assertionRate(observations, "review-policy", "fail"),
      resume_success_rate: stopMetric(observations, {
        category: "resume",
        success: ({ result }, stop) => result.status === "pass" && stop.status === "pass",
      }),
      human_intervention_rate: stopMetric(observations, {
        success: ({ result }, stop) => stop.status === "pass"
          && humanRequiredStops.has(result.observed_stop_condition),
      }),
      validation_failure_closure_rate: stopMetric(observations, {
        category: "validation-failure",
        success: ({ result, scenario }, stop) => stop.status === "pass"
          && result.observed_stop_condition === scenario.expected_stop_condition,
      }),
      delegations_per_accepted_task: accepted.length === 0
        ? {
          status: "unavailable",
          reason: "no-accepted-tasks",
          numerator: null,
          denominator: null,
          value: null,
          excluded_inconclusive: delegationExcluded,
        }
        : availableMetric(delegationSum, accepted.length, delegationExcluded),
      tokens_per_accepted_task: {
        status: "unavailable",
        reason: "token-evidence-absent",
        numerator: null,
        denominator: null,
        value: null,
        excluded_inconclusive: 0,
      },
    },
  };
}

export function serializeMetrics(summary) {
  return `${JSON.stringify(summary, null, 2)}\n`;
}

function parseArguments(args) {
  let corpus;
  const reports = [];
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (!["--corpus", "--report"].includes(flag)) {
      fail("arguments", "expected --corpus and one or more --report values");
    }
    if (value === undefined || value.startsWith("--")) {
      fail("arguments", `${flag} requires a value`);
    }
    if (flag === "--corpus") {
      if (corpus !== undefined) fail("arguments", "--corpus may only appear once");
      corpus = value;
    } else {
      reports.push(value);
    }
    index += 1;
  }
  if (corpus === undefined || reports.length === 0) {
    fail("arguments", "expected --corpus and one or more --report values");
  }
  return { corpus, reports };
}

function readJson(file, label) {
  let contents;
  try {
    contents = fs.readFileSync(file, "utf8");
  } catch {
    fail(label, "unable to read");
  }
  try {
    return JSON.parse(contents);
  } catch {
    fail(label, "invalid JSON");
  }
}

function readJsonl(file) {
  let contents;
  try {
    contents = fs.readFileSync(file, "utf8");
  } catch {
    fail("corpus", "unable to read");
  }
  const lines = contents.trimEnd().split("\n");
  if (lines.length === 1 && lines[0] === "") fail("corpus", "missing records");
  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch {
      fail("corpus", `line ${index + 1} invalid JSON`);
    }
  });
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const summary = summarizeRoutingMetrics({
      scenarios: readJsonl(options.corpus),
      reports: options.reports.map((report, index) => readJson(report, `report ${index + 1}`)),
    });
    process.stdout.write(serializeMetrics(summary));
  } catch (error) {
    const message = error instanceof MetricsInputError
      ? error.message
      : "metrics internal error";
    process.stderr.write(`MetricsInputError: ${message}\n`);
    process.exitCode = 2;
  }
}

const modulePath = fs.realpathSync(fileURLToPath(import.meta.url));
const entryPath = process.argv[1] === undefined
  ? null
  : fs.realpathSync(path.resolve(process.argv[1]));
if (entryPath === modulePath) main();
