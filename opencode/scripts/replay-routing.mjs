#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixtureKeys = [
  "schema_version",
  "scenario_id",
  "observation_coverage",
  "git_snapshot",
  "events",
];
const scenarioKeys = [
  "schema_version",
  "id",
  "category",
  "command_path",
  "prompt",
  "expected_root_agent",
  "required_agents",
  "forbidden_agents",
  "allowed_skills",
  "forbidden_skills",
  "write_before_spec_policy",
  "review_policy",
  "expected_stop_condition",
  "maximum_delegation_budget",
  "required_evidence",
];
const coverageChannels = [
  "session_events",
  "skill_events",
  "tool_events",
  "review_events",
  "stop_events",
];
const eventKeys = {
  session_started: ["sequence", "type", "session_id", "parent_session_id", "agent"],
  session_completed: ["sequence", "type", "session_id", "agent"],
  skill_selected: ["sequence", "type", "session_id", "agent", "skill"],
  tool_call_completed: ["sequence", "type", "session_id", "agent", "tool", "mutation"],
  review_completed: ["sequence", "type", "session_id", "agent", "verdict"],
  stop_observed: ["sequence", "type", "condition"],
  run_error: ["sequence", "type", "code"],
};
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
const portableIdentifierPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const reportValuePattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const sensitiveMaterialPatterns = [
  /\/(?:Users|home)\//i,
  /https?:\/\//i,
  /\b(?:provider|model|endpoint|token|secret|prompt|thinking|reasoning|password|username|credential|api[_-]?key)\b/i,
];
const sensitiveScenarioPatterns = [
  /\/(?:Users|home)\//i,
  /https?:\/\//i,
  /\b(?:provider|model|endpoint|token|secret|api[_-]?key)\b/i,
];

export class ReplayInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReplayInputError";
  }
}

function inputError(file, line, field, reason) {
  throw new ReplayInputError(`${file}: line ${line} ${field} ${reason}`);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireNonEmptyString(value, file, line, field) {
  if (typeof value !== "string" || value.length === 0) {
    inputError(file, line, field, "must be a non-empty string");
  }
}

function validateExactKeys(record, expected, file, line, prefix = "") {
  for (const key of expected) {
    if (!Object.hasOwn(record, key)) {
      inputError(file, line, `${prefix}${key}`, "missing field");
    }
  }
  for (const key of Object.keys(record)) {
    if (!expected.includes(key)) {
      inputError(file, line, `${prefix}${key}`, "unknown field");
    }
  }
}

function parseJsonl(file) {
  let contents;
  try {
    contents = fs.readFileSync(file, "utf8");
  } catch {
    inputError(file, 1, "record", "unable to read");
  }

  const physicalLines = contents.split("\n");
  if (physicalLines.at(-1) === "") physicalLines.pop();
  if (physicalLines.length === 0) inputError(file, 1, "record", "missing value");

  return physicalLines.map((text, index) => {
    const line = index + 1;
    if (text.trim() === "") inputError(file, line, "record", "blank line");
    let record;
    try {
      record = JSON.parse(text);
    } catch {
      inputError(file, line, "record", "invalid JSON");
    }
    if (!isObject(record)) inputError(file, line, "record", "must be an object");
    return { record, line };
  });
}

function parseArguments(argv) {
  const allowed = new Set(["--corpus", "--fixtures", "--output"]);
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    if (!allowed.has(option)) {
      throw new ReplayInputError(`arguments: line 1 ${option ?? "argument"} unknown option`);
    }
    if (Object.hasOwn(values, option)) {
      throw new ReplayInputError(`arguments: line 1 ${option} duplicate option`);
    }
    const value = argv[index + 1];
    if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) {
      throw new ReplayInputError(`arguments: line 1 ${option} missing value`);
    }
    values[option] = value;
  }
  for (const option of ["--corpus", "--fixtures"]) {
    if (!Object.hasOwn(values, option)) {
      throw new ReplayInputError(`arguments: line 1 ${option} missing option`);
    }
  }
  return {
    corpus: values["--corpus"],
    fixtures: values["--fixtures"],
    output: values["--output"],
  };
}

function validateScenario(record, file, line, ids) {
  validateExactKeys(record, scenarioKeys, file, line);
  if (record.schema_version !== 1) inputError(file, line, "schema_version", "unknown value");
  requireNonEmptyString(record.id, file, line, "id");
  if (ids.has(record.id)) inputError(file, line, "id", `duplicate value ${record.id}`);
  ids.add(record.id);
  requireNonEmptyString(record.expected_root_agent, file, line, "expected_root_agent");
  requireNonEmptyString(record.expected_stop_condition, file, line, "expected_stop_condition");
  for (const field of ["category", "command_path", "prompt"]) {
    requireNonEmptyString(record[field], file, line, field);
  }
  for (const field of [
    "required_agents",
    "forbidden_agents",
    "allowed_skills",
    "forbidden_skills",
    "required_evidence",
  ]) {
    if (!Array.isArray(record[field]) || record[field].some(
      (value) => typeof value !== "string" || value.length === 0,
    )) {
      inputError(file, line, field, "must be an array of non-empty strings");
    }
  }
  if (!["allowed", "forbidden", "not-applicable"].includes(
    record.write_before_spec_policy,
  )) {
    inputError(file, line, "write_before_spec_policy", "unknown value");
  }
  if (!["required", "forbidden", "optional"].includes(record.review_policy)) {
    inputError(file, line, "review_policy", "unknown value");
  }
  if (!Number.isInteger(record.maximum_delegation_budget)
      || record.maximum_delegation_budget < 0) {
    inputError(file, line, "maximum_delegation_budget", "must be a non-negative integer");
  }
}

function validateFixture(record, file, line, scenarioIds) {
  validateExactKeys(record, fixtureKeys, file, line);
  if (record.schema_version !== 1) inputError(file, line, "schema_version", "unknown value");
  requireNonEmptyString(record.scenario_id, file, line, "scenario_id");
  if (!scenarioIds.has(record.scenario_id)) {
    inputError(file, line, "scenario_id", `unknown value ${record.scenario_id}`);
  }
  if (!isObject(record.observation_coverage)) {
    inputError(file, line, "observation_coverage", "must be an object");
  }
  validateExactKeys(
    record.observation_coverage,
    coverageChannels,
    file,
    line,
    "observation_coverage.",
  );
  for (const channel of coverageChannels) {
    if (!["complete", "partial", "unavailable"].includes(
      record.observation_coverage[channel],
    )) {
      inputError(file, line, `observation_coverage.${channel}`, "unknown value");
    }
  }
  if (!["clean", "changed", "unavailable"].includes(record.git_snapshot)) {
    inputError(file, line, "git_snapshot", "unknown value");
  }
  if (!Array.isArray(record.events)) inputError(file, line, "events", "must be an array");

  let previousSequence = 0;
  const sessions = new Map();
  let rootSeen = false;
  for (const [index, event] of record.events.entries()) {
    const prefix = `events[${index}].`;
    if (!isObject(event)) inputError(file, line, `events[${index}]`, "must be an object");
    if (!Object.hasOwn(event, "type")) inputError(file, line, `${prefix}type`, "missing field");
    if (!Object.hasOwn(eventKeys, event.type)) {
      inputError(file, line, `${prefix}type`, `unknown value ${String(event.type)}`);
    }
    validateExactKeys(event, eventKeys[event.type], file, line, prefix);
    if (!Number.isInteger(event.sequence) || event.sequence <= previousSequence) {
      inputError(file, line, `${prefix}sequence`, "must be strictly increasing");
    }
    previousSequence = event.sequence;

    if (event.type === "session_started") {
      requireNonEmptyString(event.session_id, file, line, `${prefix}session_id`);
      requireNonEmptyString(event.agent, file, line, `${prefix}agent`);
      if (sessions.has(event.session_id)) {
        inputError(file, line, `${prefix}session_id`, `duplicate session ${event.session_id}`);
      }
      if (!rootSeen) {
        if (event.parent_session_id !== null) {
          inputError(file, line, `${prefix}parent_session_id`, "root must have null parent");
        }
        rootSeen = true;
      } else {
        requireNonEmptyString(
          event.parent_session_id,
          file,
          line,
          `${prefix}parent_session_id`,
        );
        if (!sessions.has(event.parent_session_id)) {
          inputError(
            file,
            line,
            `${prefix}parent_session_id`,
            `unknown session ${event.parent_session_id}`,
          );
        }
      }
      sessions.set(event.session_id, event.agent);
      continue;
    }

    if (event.type === "stop_observed") {
      requireNonEmptyString(event.condition, file, line, `${prefix}condition`);
      continue;
    }
    if (event.type === "run_error") {
      requireNonEmptyString(event.code, file, line, `${prefix}code`);
      if (!portableIdentifierPattern.test(event.code)) {
        inputError(file, line, `${prefix}code`, "invalid portable identifier");
      }
      continue;
    }

    requireNonEmptyString(event.session_id, file, line, `${prefix}session_id`);
    requireNonEmptyString(event.agent, file, line, `${prefix}agent`);
    if (!sessions.has(event.session_id)) {
      inputError(file, line, `${prefix}session_id`, `unknown session ${event.session_id}`);
    }
    if (sessions.get(event.session_id) !== event.agent) {
      inputError(
        file,
        line,
        `${prefix}agent`,
        `does not match started agent ${sessions.get(event.session_id)}`,
      );
    }
    if (event.type === "skill_selected") {
      requireNonEmptyString(event.skill, file, line, `${prefix}skill`);
    } else if (event.type === "tool_call_completed") {
      requireNonEmptyString(event.tool, file, line, `${prefix}tool`);
      if (!["read", "write", "unknown"].includes(event.mutation)) {
        inputError(file, line, `${prefix}mutation`, "unknown value");
      }
    } else if (event.type === "review_completed") {
      if (event.agent !== "reviewer") {
        inputError(file, line, `${prefix}agent`, "must be reviewer");
      }
      if (!["approved", "changes-requested", "blocked"].includes(event.verdict)) {
        inputError(file, line, `${prefix}verdict`, "unknown value");
      }
    }
  }
  if (!rootSeen) inputError(file, line, "events", "missing root session");
}

function assertion(id, status, reasonCode, evidenceSequences = []) {
  return {
    id,
    status,
    reason_code: reasonCode,
    evidence_sequences: [...evidenceSequences].sort((left, right) => left - right),
  };
}

function complete(fixture, channel) {
  return fixture.observation_coverage[channel] === "complete";
}

function aggregate(statuses) {
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("inconclusive")) return "inconclusive";
  return "pass";
}

function isSafeReportValue(kind, value) {
  const patterns = kind === "scenario"
    ? sensitiveScenarioPatterns
    : sensitiveMaterialPatterns;
  return typeof value === "string"
    && reportValuePattern.test(value)
    && !patterns.some((pattern) => pattern.test(value));
}

function createReportRedactor(scenarios, observations) {
  const usedByKind = new Map();
  const aliasesByKind = new Map();

  function reserve(kind, value) {
    if (!isSafeReportValue(kind, value)) return;
    if (!usedByKind.has(kind)) usedByKind.set(kind, new Set());
    usedByKind.get(kind).add(value);
  }

  for (const scenario of scenarios) reserve("scenario", scenario.id);
  for (const observation of observations) {
    for (const event of observation.events) {
      if (Object.hasOwn(event, "agent")) reserve("agent", event.agent);
      if (event.type === "tool_call_completed") reserve("tool", event.tool);
      if (event.type === "run_error") reserve("code", event.code);
      if (event.type === "stop_observed") reserve("condition", event.condition);
    }
  }

  return function redact(kind, value) {
    if (isSafeReportValue(kind, value)) return value;
    if (!aliasesByKind.has(kind)) aliasesByKind.set(kind, new Map());
    const aliases = aliasesByKind.get(kind);
    if (aliases.has(value)) return aliases.get(value);
    if (!usedByKind.has(kind)) usedByKind.set(kind, new Set());
    const used = usedByKind.get(kind);
    let ordinal = aliases.size + 1;
    let alias = `redacted-${kind}-${ordinal}`;
    while (used.has(alias)) {
      ordinal += 1;
      alias = `redacted-${kind}-${ordinal}`;
    }
    aliases.set(value, alias);
    used.add(alias);
    return alias;
  };
}

function unique(values) {
  const result = [];
  for (const value of values) {
    if (!result.includes(value)) result.push(value);
  }
  return result;
}

function evaluateScenario(scenario, fixture, redact) {
  const starts = fixture.events.filter((event) => event.type === "session_started");
  const root = starts[0];
  const children = starts.slice(1);
  const skills = fixture.events.filter((event) => event.type === "skill_selected");
  const toolEvents = fixture.events.filter((event) => event.type === "tool_call_completed");
  const writes = toolEvents.filter((event) => event.mutation === "write");
  const unknownMutations = toolEvents.filter((event) => event.mutation === "unknown");
  const reviews = fixture.events.filter((event) => event.type === "review_completed");
  const stops = fixture.events.filter((event) => event.type === "stop_observed");
  const runErrors = fixture.events.filter((event) => event.type === "run_error");
  const completedSpecifiers = fixture.events.filter(
    (event) => event.type === "session_completed" && event.agent === "specifier",
  );
  const assertions = [
    assertion("observation-integrity", "pass", "observation-valid"),
  ];

  if (!complete(fixture, "session_events")) {
    assertions.push(assertion("root-agent", "inconclusive", "session-events-incomplete"));
  } else if (root.agent !== scenario.expected_root_agent) {
    assertions.push(assertion(
      "root-agent",
      "fail",
      "unexpected-root-agent",
      [root.sequence],
    ));
  } else {
    assertions.push(assertion(
      "root-agent",
      "pass",
      "expected-root-observed",
      [root.sequence],
    ));
  }

  const firstSeenChildren = [];
  for (const event of children) {
    if (!firstSeenChildren.includes(event.agent)) firstSeenChildren.push(event.agent);
  }
  const requiredPositions = scenario.required_agents.map(
    (agent) => firstSeenChildren.indexOf(agent),
  );
  if (requiredPositions.some((position) => position === -1)) {
    assertions.push(complete(fixture, "session_events")
      ? assertion("required-agents", "fail", "required-agent-missing")
      : assertion("required-agents", "inconclusive", "session-events-incomplete"));
  } else if (requiredPositions.some(
    (position, index) => index > 0 && position <= requiredPositions[index - 1],
  )) {
    assertions.push(complete(fixture, "session_events")
      ? assertion("required-agents", "fail", "required-agent-order-mismatch")
      : assertion("required-agents", "inconclusive", "session-events-incomplete"));
  } else if (!complete(fixture, "session_events")) {
    assertions.push(assertion("required-agents", "inconclusive", "session-events-incomplete"));
  } else {
    assertions.push(assertion(
      "required-agents",
      "pass",
      "required-agent-order-observed",
      children
        .filter((event) => scenario.required_agents.includes(event.agent))
        .map((event) => event.sequence),
    ));
  }

  const forbiddenAgentEvents = starts.filter(
    (event) => scenario.forbidden_agents.includes(event.agent),
  );
  if (forbiddenAgentEvents.length > 0) {
    assertions.push(assertion(
      "forbidden-agents",
      "fail",
      "forbidden-agent-observed",
      forbiddenAgentEvents.map((event) => event.sequence),
    ));
  } else if (!complete(fixture, "session_events")) {
    assertions.push(assertion("forbidden-agents", "inconclusive", "session-events-incomplete"));
  } else {
    assertions.push(assertion(
      "forbidden-agents",
      "pass",
      "no-forbidden-agent-observed",
    ));
  }

  const forbiddenSkillEvents = skills.filter(
    (event) => scenario.forbidden_skills.includes(event.skill),
  );
  const outsideAllowlistEvents = skills.filter(
    (event) => !scenario.allowed_skills.includes(event.skill),
  );
  if (forbiddenSkillEvents.length > 0) {
    assertions.push(assertion(
      "skills",
      "fail",
      "forbidden-skill-observed",
      forbiddenSkillEvents.map((event) => event.sequence),
    ));
  } else if (outsideAllowlistEvents.length > 0) {
    assertions.push(assertion(
      "skills",
      "fail",
      "skill-not-allowed",
      outsideAllowlistEvents.map((event) => event.sequence),
    ));
  } else if (!complete(fixture, "skill_events")) {
    assertions.push(assertion("skills", "inconclusive", "skill-events-incomplete"));
  } else {
    assertions.push(assertion(
      "skills",
      "pass",
      "skill-allowlist-satisfied",
      skills.map((event) => event.sequence),
    ));
  }

  const writePolicy = scenario.write_before_spec_policy;
  if (writePolicy === "allowed") {
    assertions.push(assertion(
      "write-before-spec",
      "pass",
      writes.length === 0 ? "no-write-observed" : "write-before-spec-allowed",
      writes.map((event) => event.sequence),
    ));
  } else if (writePolicy === "not-applicable") {
    if (writes.length > 0) {
      assertions.push(assertion(
        "write-before-spec",
        "fail",
        "write-observed-when-not-applicable",
        writes.map((event) => event.sequence),
      ));
    } else if (fixture.git_snapshot === "changed") {
      assertions.push(assertion(
        "write-before-spec",
        "fail",
        "git-changed-when-write-not-applicable",
      ));
    } else if (unknownMutations.length > 0) {
      assertions.push(assertion(
        "write-before-spec",
        "inconclusive",
        "write-mutation-unknown",
        unknownMutations.map((event) => event.sequence),
      ));
    } else if (complete(fixture, "tool_events") || fixture.git_snapshot === "clean") {
      assertions.push(assertion("write-before-spec", "pass", "no-write-observed"));
    } else {
      assertions.push(assertion("write-before-spec", "inconclusive", "write-evidence-incomplete"));
    }
  } else {
    const lastSpecifierCompletion = completedSpecifiers.at(-1)?.sequence;
    const prematureWrites = writes.filter(
      (event) => lastSpecifierCompletion === undefined
        || event.sequence < lastSpecifierCompletion,
    );
    if (prematureWrites.length > 0) {
      assertions.push(assertion(
        "write-before-spec",
        "fail",
        "write-before-spec-completed",
        prematureWrites.map((event) => event.sequence),
      ));
    } else if (unknownMutations.length > 0) {
      assertions.push(assertion(
        "write-before-spec",
        "inconclusive",
        "write-mutation-unknown",
        unknownMutations.map((event) => event.sequence),
      ));
    } else if (fixture.git_snapshot === "changed" && writes.length === 0) {
      assertions.push(assertion(
        "write-before-spec",
        "inconclusive",
        "git-write-unsequenced",
      ));
    } else if (!complete(fixture, "tool_events")
        || !complete(fixture, "session_events")) {
      assertions.push(assertion(
        "write-before-spec",
        "inconclusive",
        "write-or-session-events-incomplete",
      ));
    } else {
      assertions.push(assertion(
        "write-before-spec",
        "pass",
        writes.length === 0 ? "no-write-observed" : "write-after-spec-completed",
        writes.map((event) => event.sequence),
      ));
    }
  }

  const reviewerStarts = starts.filter((event) => event.agent === "reviewer");
  const lastWrite = writes.at(-1)?.sequence;
  const lastReview = reviews.at(-1)?.sequence;
  const unknownAfterReview = lastReview === undefined
    ? []
    : unknownMutations.filter((event) => event.sequence > lastReview);
  const hasUnsequencedGitMutation = fixture.git_snapshot === "changed"
    && writes.length === 0;
  if (scenario.review_policy === "forbidden") {
    if (reviewerStarts.length > 0 || reviews.length > 0) {
      assertions.push(assertion(
        "review-policy",
        "fail",
        "reviewer-forbidden",
        [...reviewerStarts, ...reviews]
          .map((event) => event.sequence)
          .sort((left, right) => left - right),
      ));
    } else if (!complete(fixture, "session_events")
        || !complete(fixture, "review_events")) {
      assertions.push(assertion(
        "review-policy",
        "inconclusive",
        "review-events-incomplete",
      ));
    } else {
      assertions.push(assertion(
        "review-policy",
        "pass",
        "review-forbidden-and-absent",
      ));
    }
  } else if (scenario.review_policy === "required") {
    if (reviews.length === 0) {
      assertions.push(complete(fixture, "review_events")
        ? assertion("review-policy", "fail", "required-review-missing")
        : assertion("review-policy", "inconclusive", "review-events-incomplete"));
    } else if (lastWrite !== undefined && lastReview < lastWrite
        && complete(fixture, "review_events")) {
      assertions.push(assertion(
        "review-policy",
        "fail",
        "write-after-review",
        [lastReview, lastWrite],
      ));
    } else if (unknownAfterReview.length > 0) {
      assertions.push(assertion(
        "review-policy",
        "inconclusive",
        "write-order-unknown-after-review",
        [lastReview, ...unknownAfterReview.map((event) => event.sequence)],
      ));
    } else if (hasUnsequencedGitMutation) {
      assertions.push(assertion(
        "review-policy",
        "inconclusive",
        "git-write-unsequenced",
      ));
    } else if (!complete(fixture, "review_events")
        || !complete(fixture, "tool_events")) {
      assertions.push(assertion(
        "review-policy",
        "inconclusive",
        "review-or-tool-events-incomplete",
      ));
    } else {
      assertions.push(assertion(
        "review-policy",
        "pass",
        "required-review-completed",
        reviews.map((event) => event.sequence),
      ));
    }
  } else if (reviews.length === 0) {
    assertions.push(assertion("review-policy", "pass", "optional-review-absent"));
  } else if (lastWrite !== undefined && lastReview < lastWrite
      && !complete(fixture, "review_events")) {
    assertions.push(assertion(
      "review-policy",
      "inconclusive",
      "review-events-incomplete",
      [lastReview, lastWrite],
    ));
  } else if (lastWrite !== undefined && lastReview < lastWrite) {
    assertions.push(assertion(
      "review-policy",
      "fail",
      "write-after-review",
      [lastReview, lastWrite],
    ));
  } else if (unknownAfterReview.length > 0) {
    assertions.push(assertion(
      "review-policy",
      "inconclusive",
      "write-order-unknown-after-review",
      [lastReview, ...unknownAfterReview.map((event) => event.sequence)],
    ));
  } else if (hasUnsequencedGitMutation) {
    assertions.push(assertion(
      "review-policy",
      "inconclusive",
      "git-write-unsequenced",
    ));
  } else if (!complete(fixture, "tool_events")) {
    assertions.push(assertion(
      "review-policy",
      "inconclusive",
      "tool-events-incomplete",
      reviews.map((event) => event.sequence),
    ));
  } else {
    assertions.push(assertion(
      "review-policy",
      "pass",
      "optional-review-order-satisfied",
      reviews.map((event) => event.sequence),
    ));
  }

  const wrongStops = stops.filter(
    (event) => event.condition !== scenario.expected_stop_condition,
  );
  const expectedStops = stops.filter(
    (event) => event.condition === scenario.expected_stop_condition,
  );
  if (wrongStops.length > 0) {
    assertions.push(assertion(
      "stop-condition",
      "fail",
      "unexpected-stop-condition",
      wrongStops.map((event) => event.sequence),
    ));
  } else if (runErrors.length > 0) {
    assertions.push(assertion(
      "stop-condition",
      "inconclusive",
      "run-error-observed",
      runErrors.map((event) => event.sequence),
    ));
  } else if (expectedStops.length === 0) {
    assertions.push(assertion("stop-condition", "inconclusive", "stop-not-observed"));
  } else if (!complete(fixture, "stop_events")) {
    assertions.push(assertion("stop-condition", "inconclusive", "stop-events-incomplete"));
  } else {
    assertions.push(assertion(
      "stop-condition",
      "pass",
      "expected-stop-observed",
      expectedStops.map((event) => event.sequence),
    ));
  }

  if (children.length > scenario.maximum_delegation_budget) {
    assertions.push(assertion(
      "delegation-budget",
      "fail",
      "delegation-budget-exceeded",
      children.map((event) => event.sequence),
    ));
  } else if (!complete(fixture, "session_events")) {
    assertions.push(assertion(
      "delegation-budget",
      "inconclusive",
      "session-events-incomplete",
    ));
  } else {
    assertions.push(assertion(
      "delegation-budget",
      "pass",
      "delegation-budget-satisfied",
      children.map((event) => event.sequence),
    ));
  }

  if (assertions.length !== assertionIds.length
      || assertions.some((item, index) => item.id !== assertionIds[index])) {
    throw new Error("internal assertion contract mismatch");
  }

  const observedAgents = [];
  for (const event of starts) {
    if (!observedAgents.includes(event.agent)) observedAgents.push(event.agent);
  }
  const limitations = runErrors.map((event) => ({
    code: redact("code", event.code),
    channels: coverageChannels.filter(
      (channel) => fixture.observation_coverage[channel] !== "complete",
    ),
  }));

  return {
    scenario_id: redact("scenario", scenario.id),
    status: aggregate(assertions.map((item) => item.status)),
    assertions,
    observed_agents: unique(observedAgents.map((agent) => redact("agent", agent))),
    delegation_count: children.length,
    writes: writes.map((event) => ({
      sequence: event.sequence,
      agent: redact("agent", event.agent),
      tool: redact("tool", event.tool),
    })),
    review_sequence: reviews.map((event) => ({
      sequence: event.sequence,
      agent: redact("agent", event.agent),
      verdict: event.verdict,
    })),
    observed_stop_condition: stops[0]?.condition !== undefined
      ? redact("condition", stops[0].condition)
      : null,
    limitations,
  };
}

export function computeCorpusDigest(scenarios) {
  const canonicalCorpus = `${scenarios
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((scenario) => JSON.stringify(scenario))
    .join("\n")}\n`;
  return `sha256:${crypto
    .createHash("sha256")
    .update(canonicalCorpus)
    .digest("hex")}`;
}

function buildReport(scenarios, observations, mode) {
  const scenariosById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const observationsById = new Map(
    observations.map((observation) => [observation.scenario_id, observation]),
  );
  const redact = createReportRedactor(scenarios, observations);
  const scenarioResults = [...scenariosById.keys()]
    .sort()
    .map((scenarioId) => evaluateScenario(
      scenariosById.get(scenarioId),
      observationsById.get(scenarioId),
      redact,
    ))
    .sort((left, right) => left.scenario_id.localeCompare(right.scenario_id));
  const status = aggregate(scenarioResults.map((result) => result.status));
  return {
    schema_version: 1,
    corpus_digest: computeCorpusDigest(scenarios),
    mode,
    operational_status: "ok",
    status,
    scenario_results: scenarioResults,
  };
}

function validateReplayRecords({
  scenarios,
  observations,
  scenarioFile,
  observationFile,
  scenarioLines,
  observationLines,
}) {
  validateScenarios(scenarios, {
    file: scenarioFile,
    lines: scenarioLines,
  });
  const scenarioIds = new Set(scenarios.map((scenario) => scenario.id));
  const fixtureById = new Map();
  for (const [index, observation] of observations.entries()) {
    const line = observationLines?.[index] ?? index + 1;
    validateFixture(observation, observationFile, line, scenarioIds);
    if (fixtureById.has(observation.scenario_id)) {
      inputError(
        observationFile,
        line,
        "scenario_id",
        `duplicate value ${observation.scenario_id}`,
      );
    }
    fixtureById.set(observation.scenario_id, observation);
  }
  for (const scenarioId of scenarioIds) {
    if (!fixtureById.has(scenarioId)) {
      inputError(
        observationFile,
        observations.length + 1,
        "scenario_id",
        `missing value ${scenarioId}`,
      );
    }
  }
}

export function validateScenarios(scenarios, {
  file = "scenarios",
  lines,
} = {}) {
  if (!Array.isArray(scenarios)) {
    throw new ReplayInputError(`${file}: line 1 record must be an array`);
  }
  const scenarioIds = new Set();
  for (const [index, scenario] of scenarios.entries()) {
    validateScenario(
      scenario,
      file,
      lines?.[index] ?? index + 1,
      scenarioIds,
    );
  }
}

export function evaluateReplay({
  scenarios,
  observations,
  mode = "deterministic",
}) {
  if (!Array.isArray(scenarios)) {
    throw new ReplayInputError("scenarios: line 1 record must be an array");
  }
  if (!Array.isArray(observations)) {
    throw new ReplayInputError("observations: line 1 record must be an array");
  }
  if (!["deterministic", "live"].includes(mode)) {
    throw new ReplayInputError("mode: line 1 value must be deterministic or live");
  }
  validateReplayRecords({
    scenarios,
    observations,
    scenarioFile: "scenarios",
    observationFile: "observations",
  });
  return buildReport(scenarios, observations, mode);
}

export function serializeReport(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function runReplay({ corpus, fixtures }) {
  const scenarioLines = parseJsonl(corpus);
  const fixtureLines = parseJsonl(fixtures);
  const scenarios = scenarioLines.map(({ record }) => record);
  const observations = fixtureLines.map(({ record }) => record);
  validateReplayRecords({
    scenarios,
    observations,
    scenarioFile: corpus,
    observationFile: fixtures,
    scenarioLines: scenarioLines.map(({ line }) => line),
    observationLines: fixtureLines.map(({ line }) => line),
  });
  return buildReport(scenarios, observations, "deterministic");
}

function writeOutput(output, serialized) {
  const parent = path.dirname(output);
  let parentStat;
  try {
    parentStat = fs.lstatSync(parent);
  } catch {
    throw new ReplayInputError(
      "output: line 1 parent must be an existing directory",
    );
  }
  if (!parentStat.isDirectory()) {
    throw new ReplayInputError(
      "output: line 1 parent must be an existing directory",
    );
  }

  try {
    const outputStat = fs.lstatSync(output);
    if (outputStat.isSymbolicLink()) {
      throw new ReplayInputError("output: line 1 path must not be a symlink");
    }
    if (!outputStat.isFile()) {
      throw new ReplayInputError("output: line 1 path must be a regular file");
    }
  } catch (error) {
    if (error instanceof ReplayInputError) throw error;
    if (error?.code !== "ENOENT") {
      throw new ReplayInputError("output: line 1 path unable to inspect");
    }
  }

  let descriptor;
  try {
    descriptor = fs.openSync(
      output,
      fs.constants.O_WRONLY
        | fs.constants.O_CREAT
        | fs.constants.O_TRUNC
        | (fs.constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    fs.fchmodSync(descriptor, 0o600);
    fs.writeFileSync(descriptor, serialized, "utf8");
  } catch (error) {
    if (error instanceof ReplayInputError) throw error;
    throw new ReplayInputError("output: line 1 path unable to write");
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const report = runReplay(options);
    const serialized = serializeReport(report);
    if (options.output !== undefined) writeOutput(options.output, serialized);
    process.stdout.write(serialized);
    process.exitCode = report.status === "pass"
      ? 0
      : report.status === "fail"
        ? 1
        : 3;
  } catch (error) {
    if (error instanceof ReplayInputError) {
      process.stderr.write(`${error.name}: ${error.message}\n`);
      process.exitCode = 2;
    } else {
      process.stderr.write(`ReplayInputError: runner internal error\n`);
      process.exitCode = 2;
    }
  }
}

const modulePath = fs.realpathSync(fileURLToPath(import.meta.url));
const entryPath = process.argv[1] === undefined
  ? null
  : fs.realpathSync(path.resolve(process.argv[1]));
if (entryPath === modulePath) main();
