import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateReplay } from "./replay-routing.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(scriptDir);
const runnerPath = path.join(root, "scripts/replay-routing.mjs");
const corpusPath = path.join(
  root,
  "docs/ai/evolution/benchmarks/router-scenarios.jsonl",
);
const fixturesPath = path.join(
  root,
  "docs/ai/evolution/benchmarks/replay-fixtures.jsonl",
);
const redCorpusPath = path.join(
  root,
  "docs/ai/evolution/benchmarks/router-scenarios-red.jsonl",
);
const redFixturesPath = path.join(
  root,
  "docs/ai/evolution/benchmarks/replay-fixtures-red.jsonl",
);
const coverageChannels = [
  "session_events",
  "skill_events",
  "tool_events",
  "review_events",
  "stop_events",
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

const eventKeys = {
  session_started: ["sequence", "type", "session_id", "parent_session_id", "agent"],
  session_completed: ["sequence", "type", "session_id", "agent"],
  skill_selected: ["sequence", "type", "session_id", "agent", "skill"],
  tool_call_completed: ["sequence", "type", "session_id", "agent", "tool", "mutation"],
  review_completed: ["sequence", "type", "session_id", "agent", "verdict"],
  stop_observed: ["sequence", "type", "condition"],
  run_error: ["sequence", "type", "code"],
};

function readJsonl(file) {
  return fs
    .readFileSync(file, "utf8")
    .trimEnd()
    .split("\n")
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${file}: line ${index + 1} invalid JSON: ${error.message}`);
      }
    });
}

function writeJsonl(file, records) {
  fs.writeFileSync(file, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
}

function clone(value) {
  return structuredClone(value);
}

function makeReplayCopy() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-routing-replay-"));
  const corpus = path.join(cwd, "router-scenarios.jsonl");
  const fixtures = path.join(cwd, "replay-fixtures.jsonl");
  fs.copyFileSync(corpusPath, corpus);
  fs.copyFileSync(fixturesPath, fixtures);
  return { cwd, corpus, fixtures, report: path.join(cwd, "routing-replay-report.json") };
}

function runReplay(copy) {
  const result = spawnSync(
    process.execPath,
    [
      runnerPath,
      "--corpus",
      copy.corpus,
      "--fixtures",
      copy.fixtures,
      "--output",
      copy.report,
    ],
    { cwd: copy.cwd, encoding: "utf8" },
  );
  const report = fs.existsSync(copy.report)
    ? JSON.parse(fs.readFileSync(copy.report, "utf8"))
    : null;
  return { ...result, report };
}

function runReplayWithoutOutput(copy) {
  return spawnSync(
    process.execPath,
    [
      runnerPath,
      "--corpus",
      copy.corpus,
      "--fixtures",
      copy.fixtures,
    ],
    { cwd: copy.cwd, encoding: "utf8" },
  );
}

function runReplayWithOutput(copy, output) {
  return spawnSync(
    process.execPath,
    [
      runnerPath,
      "--corpus",
      copy.corpus,
      "--fixtures",
      copy.fixtures,
      "--output",
      output,
    ],
    { cwd: copy.cwd, encoding: "utf8" },
  );
}

function withReplayCopy(callback) {
  const copy = makeReplayCopy();
  try {
    return callback(copy);
  } finally {
    fs.rmSync(copy.cwd, { recursive: true, force: true });
  }
}

function mutateFixture(copy, scenarioId, mutate) {
  const fixtures = readJsonl(copy.fixtures);
  const fixture = fixtureFor(fixtures, scenarioId);
  mutate(fixture, fixtures);
  writeJsonl(copy.fixtures, fixtures);
}

function fixtureFor(fixtures, scenarioId) {
  const fixture = fixtures.find((candidate) => candidate.scenario_id === scenarioId);
  assert.ok(fixture, `missing fixture ${scenarioId}`);
  return fixture;
}

function scenarioIdsFromCorpus(corpus) {
  return readJsonl(corpus)
    .map((scenario) => scenario.id)
    .sort();
}

function mutateScenario(copy, scenarioId, mutate) {
  const scenarios = readJsonl(copy.corpus);
  const scenario = scenarios.find((candidate) => candidate.id === scenarioId);
  assert.ok(scenario, `missing scenario ${scenarioId}`);
  mutate(scenario, scenarios);
  writeJsonl(copy.corpus, scenarios);
}

function resequence(events) {
  for (const [index, event] of events.entries()) event.sequence = index + 1;
}

function insertBeforeStop(fixture, event) {
  const stopIndex = fixture.events.findIndex((candidate) => candidate.type === "stop_observed");
  assert.notEqual(stopIndex, -1, "fixture has no stop event");
  fixture.events.splice(stopIndex, 0, event);
  resequence(fixture.events);
}

function addSession(fixture, { sessionId, agent }) {
  insertBeforeStop(fixture, {
    sequence: 0,
    type: "session_started",
    session_id: sessionId,
    parent_session_id: "root",
    agent,
  });
}

function removeAgentEvents(fixture, agent) {
  const removedIds = new Set(
    fixture.events
      .filter((event) => event.type === "session_started" && event.agent === agent)
      .map((event) => event.session_id),
  );
  fixture.events = fixture.events.filter(
    (event) => event.agent !== agent && !removedIds.has(event.session_id),
  );
  resequence(fixture.events);
}

function assertionFor(report, scenarioId, assertionId) {
  assert.ok(report, "runner did not write a report");
  const scenario = report.scenario_results.find(
    (candidate) => candidate.scenario_id === scenarioId,
  );
  assert.ok(scenario, `missing result ${scenarioId}`);
  const assertion = scenario.assertions.find((candidate) => candidate.id === assertionId);
  assert.ok(assertion, `missing assertion ${assertionId}`);
  return assertion;
}

function assertCompleteScenarioResults(report, corpus) {
  assert.ok(Array.isArray(report.scenario_results), "report has no scenario_results");
  const expectedIds = scenarioIdsFromCorpus(corpus);
  const actualIds = report.scenario_results.map((scenario) => scenario.scenario_id);

  assert.equal(actualIds.length, expectedIds.length, "report has a truncated scenario batch");
  assert.equal(new Set(actualIds).size, actualIds.length, "report has duplicate scenario IDs");
  assert.deepEqual(actualIds, expectedIds, "report scenario IDs differ from the corpus");

  for (const scenario of report.scenario_results) {
    assert.deepEqual(
      scenario.assertions.map((assertion) => assertion.id),
      assertionIds,
      `${scenario.scenario_id} has an incomplete assertion contract`,
    );
  }

  return report.scenario_results;
}

function expectVerdict(copy, {
  exitCode,
  overallStatus,
  scenarioId,
  assertionId,
  assertionStatus,
  reasonCode,
}) {
  const result = runReplay(copy);
  assert.equal(result.status, exitCode, result.stderr);
  assert.ok(result.report, result.stderr);
  assert.equal(result.report.status, overallStatus);
  const scenarioResults = assertCompleteScenarioResults(result.report, copy.corpus);
  const mutatedScenario = scenarioResults.find(
    (scenario) => scenario.scenario_id === scenarioId,
  );
  assert.ok(mutatedScenario, `missing result ${scenarioId}`);
  assert.equal(mutatedScenario.status, overallStatus);

  const untouchedScenarios = scenarioResults.filter(
    (scenario) => scenario.scenario_id !== scenarioId,
  );
  assert.ok(untouchedScenarios.length > 0, "verdict helper needs an untouched control");
  for (const scenario of untouchedScenarios) {
    assert.equal(scenario.status, "pass", `${scenario.scenario_id} was unexpectedly affected`);
    assert.ok(
      scenario.assertions.every((assertion) => assertion.status === "pass"),
      `${scenario.scenario_id} contains a non-pass assertion`,
    );
  }
  assert.deepEqual(
    scenarioResults
      .filter((scenario) => scenario.status !== "pass")
      .map((scenario) => scenario.scenario_id),
    [scenarioId],
    "report must contain exactly one affected scenario",
  );

  const assertion = assertionFor(result.report, scenarioId, assertionId);
  assert.equal(assertion.status, assertionStatus);
  assert.equal(assertion.reason_code, reasonCode);
}

function expectInputError(copy, line, field, reason) {
  const result = runReplay(copy);
  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.report, null, "invalid input produced a canonical report");
  assert.match(
    result.stderr,
    new RegExp(
      `${escapeRegExp(copy.fixtures)}: line ${line} ${escapeRegExp(field)} ${escapeRegExp(reason)}`,
    ),
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("canonical fixtures cover the corpus exactly and have closed complete shape", () => {
  const scenarios = readJsonl(corpusPath);
  const fixtures = readJsonl(fixturesPath);
  const expectedIds = scenarios.map((scenario) => scenario.id).sort();
  const actualIds = fixtures.map((fixture) => fixture.scenario_id).sort();

  assert.equal(fixtures.length, expectedIds.length);
  assert.deepEqual(actualIds, expectedIds);
  assert.equal(new Set(actualIds).size, actualIds.length);

  for (const fixture of fixtures) {
    assert.deepEqual(
      Object.keys(fixture).sort(),
      ["events", "git_snapshot", "observation_coverage", "scenario_id", "schema_version"],
    );
    assert.equal(fixture.schema_version, 1);
    assert.deepEqual(Object.keys(fixture.observation_coverage).sort(), coverageChannels.toSorted());
    assert.deepEqual(
      Object.values(fixture.observation_coverage),
      Array(coverageChannels.length).fill("complete"),
    );
    assert.ok(["clean", "changed"].includes(fixture.git_snapshot));
    assert.ok(Array.isArray(fixture.events));
    assert.ok(fixture.events.length > 0);

    let previousSequence = 0;
    const sessions = new Map();
    for (const event of fixture.events) {
      assert.deepEqual(Object.keys(event).sort(), eventKeys[event.type]?.toSorted());
      assert.ok(Number.isInteger(event.sequence) && event.sequence > previousSequence);
      previousSequence = event.sequence;
      if (event.type === "session_started") {
        assert.ok(!sessions.has(event.session_id));
        if (event.parent_session_id === null) {
          assert.equal(sessions.size, 0);
        } else {
          assert.ok(sessions.has(event.parent_session_id));
        }
        sessions.set(event.session_id, event.agent);
      } else if ("session_id" in event) {
        assert.equal(sessions.get(event.session_id), event.agent);
      }
    }
  }

  const changed = fixtures.filter((fixture) => fixture.git_snapshot === "changed");
  assert.deepEqual(changed.map((fixture) => fixture.scenario_id), [
    "public-sync-private-boundary",
  ]);
});

test("canonical replay exits 0 and reports pass for every corpus scenario", () => {
  withReplayCopy((copy) => {
    const result = runReplay(copy);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.report, result.stderr);
    assert.equal(result.report.schema_version, 1);
    assert.equal(result.report.mode, "deterministic");
    assert.equal(result.report.operational_status, "ok");
    assert.equal(result.report.status, "pass");
    const scenarioResults = assertCompleteScenarioResults(result.report, copy.corpus);
    assert.equal(scenarioResults.length, readJsonl(copy.corpus).length);
    for (const scenario of scenarioResults) {
      assert.equal(scenario.status, "pass");
      assert.ok(scenario.assertions.every((assertion) => assertion.status === "pass"));
    }
  });
});

test("routing replay exposes pure evaluation and canonical serialization", async () => {
  const replayModule = await import("./replay-routing.mjs");
  assert.equal(typeof replayModule.evaluateReplay, "function");
  assert.equal(typeof replayModule.serializeReport, "function");

  const report = replayModule.evaluateReplay({
    scenarios: readJsonl(corpusPath),
    observations: readJsonl(fixturesPath),
  });
  assert.equal(report.status, "pass");
  assert.equal(
    replayModule.serializeReport(report),
    `${JSON.stringify(report, null, 2)}\n`,
  );
});

test("routing replay emits the exact stable sanitized report contract", () => {
  withReplayCopy((copy) => {
    const first = runReplayWithoutOutput(copy);
    const second = runReplayWithoutOutput(copy);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(first.stdout, second.stdout);
    assert.equal(first.stderr, "");
    assert.equal(second.stderr, "");

    const report = JSON.parse(first.stdout);
    assert.deepEqual(Object.keys(report), [
      "schema_version",
      "corpus_digest",
      "mode",
      "operational_status",
      "status",
      "scenario_results",
    ]);
    assert.doesNotMatch(first.stdout, /timestamp/i);
    assert.doesNotMatch(first.stdout, /\/Users\//);
    assert.deepEqual(
      report.scenario_results.map((result) => result.scenario_id),
      report.scenario_results.map((result) => result.scenario_id).toSorted(),
    );

    for (const result of report.scenario_results) {
      assert.deepEqual(Object.keys(result), [
        "scenario_id",
        "status",
        "assertions",
        "observed_agents",
        "delegation_count",
        "writes",
        "review_sequence",
        "observed_stop_condition",
        "limitations",
      ]);
      assert.deepEqual(
        result.assertions.map((item) => item.id),
        assertionIds,
      );
      for (const item of result.assertions) {
        assert.deepEqual(Object.keys(item), [
          "id",
          "status",
          "reason_code",
          "evidence_sequences",
        ]);
        assert.deepEqual(item.evidence_sequences, item.evidence_sequences.toSorted(
          (left, right) => left - right,
        ));
      }
      for (const write of result.writes) {
        assert.deepEqual(Object.keys(write), ["sequence", "agent", "tool"]);
      }
      for (const review of result.review_sequence) {
        assert.deepEqual(Object.keys(review), ["sequence", "agent", "verdict"]);
      }
      for (const limitation of result.limitations) {
        assert.deepEqual(Object.keys(limitation), ["code", "channels"]);
        assert.deepEqual(
          limitation.channels,
          coverageChannels.filter((channel) => limitation.channels.includes(channel)),
        );
      }
    }

    const observed = report.scenario_results.find(
      (result) => result.scenario_id === "feature-technical-research",
    );
    assert.deepEqual(
      observed.observed_agents,
      ["lead", "researcher", "specifier", "developer", "reviewer"],
    );
  });
});

test("routing replay digest and report bytes are independent of corpus record order", () => {
  withReplayCopy((copy) => {
    const canonical = runReplayWithoutOutput(copy);
    assert.equal(canonical.status, 0, canonical.stderr);

    const scenarios = readJsonl(copy.corpus).reverse();
    writeJsonl(copy.corpus, scenarios);
    const reordered = runReplayWithoutOutput(copy);

    assert.equal(reordered.status, 0, reordered.stderr);
    assert.equal(reordered.stdout, canonical.stdout);
    const canonicalCorpus = `${scenarios
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((scenario) => JSON.stringify(scenario))
      .join("\n")}\n`;
    assert.equal(
      JSON.parse(reordered.stdout).corpus_digest,
      `sha256:${createHash("sha256").update(canonicalCorpus).digest("hex")}`,
    );
  });
});

test("routing replay removes sensitive canaries from report and diagnostics", () => {
  withReplayCopy((copy) => {
    const canaries = [
      "/private-owner/",
      "provider-secret",
      "model-secret",
      "https://private.invalid",
      "sk-secret",
      "full private prompt",
      "thinking secret",
    ];
    mutateScenario(copy, "public-sync-private-boundary", (scenario) => {
      scenario.prompt = canaries.join(" ");
      scenario.expected_root_agent = "model-secret";
      scenario.required_agents[0] = "https://private.invalid";
      scenario.expected_stop_condition = "thinking secret";
    });
    mutateFixture(copy, "public-sync-private-boundary", (fixture) => {
      for (const event of fixture.events) {
        if (event.session_id === "root") event.session_id = "/private-owner/";
        if (event.parent_session_id === "root") {
          event.parent_session_id = "/private-owner/";
        }
        if (event.agent === "lead") event.agent = "model-secret";
        if (event.session_id === "s1") event.session_id = "sk-secret";
        if (event.agent === "developer") event.agent = "https://private.invalid";
        if (event.type === "stop_observed") event.condition = "thinking secret";
      }
      const write = fixture.events.find(
        (event) => event.type === "tool_call_completed" && event.mutation === "write",
      );
      assert.ok(write, "fixture must contain a write");
      write.tool = "provider-secret";
    });

    const result = runReplayWithoutOutput(copy);
    assert.equal(result.status, 0, result.stderr);
    const combined = `${result.stdout}\n${result.stderr}`;
    for (const canary of canaries) {
      assert.doesNotMatch(combined, new RegExp(escapeRegExp(canary), "i"));
    }
  });
});

test("routing replay emits limitations with only portable ordered fields", () => {
  withReplayCopy((copy) => {
    mutateFixture(copy, "freeform-tiny-direct-fix", (fixture) => {
      fixture.observation_coverage.skill_events = "partial";
      fixture.observation_coverage.review_events = "unavailable";
      insertBeforeStop(fixture, {
        sequence: 0,
        type: "run_error",
        code: "capture-incomplete",
      });
    });

    const result = runReplayWithoutOutput(copy);
    assert.equal(result.status, 3, result.stderr);
    const report = JSON.parse(result.stdout);
    const scenario = report.scenario_results.find(
      (candidate) => candidate.scenario_id === "freeform-tiny-direct-fix",
    );
    assert.deepEqual(scenario.limitations, [
      {
        code: "capture-incomplete",
        channels: ["skill_events", "review_events"],
      },
    ]);
  });
});

test("routing replay pseudonymizes sensitive scenario IDs and limitation codes", () => {
  withReplayCopy((copy) => {
    const originalId = "freeform-tiny-direct-fix";
    const sensitiveId = "/private-owner/scenario";
    mutateScenario(copy, originalId, (scenario) => {
      scenario.id = sensitiveId;
    });
    mutateFixture(copy, originalId, (fixture) => {
      fixture.scenario_id = sensitiveId;
      fixture.observation_coverage.stop_events = "partial";
      insertBeforeStop(fixture, {
        sequence: 0,
        type: "run_error",
        code: "provider-secret",
      });
    });

    const result = runReplayWithoutOutput(copy);
    assert.equal(result.status, 3, result.stderr);
    assert.doesNotMatch(result.stdout, /\/private-owner\/scenario|provider-secret/i);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(
      report.scenario_results.map((scenario) => scenario.scenario_id),
      report.scenario_results.map((scenario) => scenario.scenario_id).toSorted(),
    );
    const redacted = report.scenario_results.find(
      (scenario) => scenario.limitations.length > 0,
    );
    assert.match(redacted.scenario_id, /^redacted-scenario-\d+$/);
    assert.match(redacted.limitations[0].code, /^redacted-code-\d+$/);
    assert.ok(
      report.scenario_results.some(
        (scenario) => scenario.scenario_id === "freeform-ambiguous-clarify",
      ),
      "normal scenario IDs must remain unchanged",
    );
  });
});

test("routing replay preserves distinct sensitive agent identities in first-seen order", () => {
  withReplayCopy((copy) => {
    const firstAgent = "/private-owner/agent-a";
    const secondAgent = "https://private.invalid/agent-b";
    mutateScenario(copy, "freeform-tiny-direct-fix", (scenario) => {
      scenario.required_agents = [firstAgent, secondAgent];
      scenario.maximum_delegation_budget = 3;
    });
    mutateFixture(copy, "freeform-tiny-direct-fix", (fixture) => {
      for (const event of fixture.events) {
        if (event.agent === "developer") event.agent = firstAgent;
      }
      addSession(fixture, { sessionId: "s2", agent: secondAgent });
      addSession(fixture, { sessionId: "s3", agent: firstAgent });
      insertBeforeStop(fixture, {
        sequence: 0,
        type: "tool_call_completed",
        session_id: "s1",
        agent: firstAgent,
        tool: "apply_patch",
        mutation: "write",
      });
    });

    const result = runReplayWithoutOutput(copy);
    const repeated = runReplayWithoutOutput(copy);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(repeated.status, 0, repeated.stderr);
    assert.equal(repeated.stdout, result.stdout);
    assert.doesNotMatch(result.stdout, /private-owner|private\.invalid/i);
    const report = JSON.parse(result.stdout);
    const scenario = report.scenario_results.find(
      (candidate) => candidate.scenario_id === "freeform-tiny-direct-fix",
    );
    assert.equal(new Set(scenario.observed_agents).size, scenario.observed_agents.length);
    assert.equal(scenario.observed_agents[0], "lead");
    assert.match(scenario.observed_agents[1], /^redacted-agent-\d+$/);
    assert.match(scenario.observed_agents[2], /^redacted-agent-\d+$/);
    assert.notEqual(scenario.observed_agents[1], scenario.observed_agents[2]);
    assert.equal(scenario.writes[0].agent, scenario.observed_agents[1]);
  });
});

test("routing replay writes --output as a regular mode-0600 file", () => {
  withReplayCopy((copy) => {
    const result = runReplayWithOutput(copy, copy.report);
    assert.equal(result.status, 0, result.stderr);
    const stat = fs.lstatSync(copy.report);
    assert.ok(stat.isFile());
    assert.equal(stat.mode & 0o777, 0o600);
    assert.equal(fs.readFileSync(copy.report, "utf8"), result.stdout);
  });
});

test("routing replay CLI executes from a script path containing spaces", () => {
  withReplayCopy((copy) => {
    const spacedDirectory = path.join(copy.cwd, "runner with spaces");
    const spacedRunner = path.join(spacedDirectory, "replay routing.mjs");
    fs.mkdirSync(spacedDirectory);
    fs.copyFileSync(runnerPath, spacedRunner);

    const result = spawnSync(
      process.execPath,
      [
        spacedRunner,
        "--corpus",
        copy.corpus,
        "--fixtures",
        copy.fixtures,
      ],
      { cwd: copy.cwd, encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, "pass");
  });
});

test("routing replay rejects a symlink --output without touching its target", () => {
  withReplayCopy((copy) => {
    const target = path.join(copy.cwd, "target.json");
    fs.writeFileSync(target, "sentinel\n", { mode: 0o600 });
    fs.symlinkSync(target, copy.report);

    const result = runReplayWithOutput(copy, copy.report);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stdout, "");
    assert.equal(fs.readFileSync(target, "utf8"), "sentinel\n");
    assert.match(result.stderr, /ReplayInputError: output: line 1 path must not be a symlink/);
    assert.doesNotMatch(result.stderr, /runner internal error|node:internal|\n\s+at /);
  });
});

test("routing replay rejects --output whose parent does not exist", () => {
  withReplayCopy((copy) => {
    const output = path.join(copy.cwd, "missing", "report.json");
    const result = runReplayWithOutput(copy, output);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stdout, "");
    assert.ok(!fs.existsSync(output));
    assert.match(
      result.stderr,
      /ReplayInputError: output: line 1 parent must be an existing directory/,
    );
    assert.doesNotMatch(result.stderr, /runner internal error|node:internal|\n\s+at /);
  });
});

test("routing replay rejects a non-regular --output path", () => {
  withReplayCopy((copy) => {
    fs.mkdirSync(copy.report);
    const result = runReplayWithOutput(copy, copy.report);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stdout, "");
    assert.match(
      result.stderr,
      /ReplayInputError: output: line 1 path must be a regular file/,
    );
    assert.doesNotMatch(result.stderr, /runner internal error|node:internal|\n\s+at /);
  });
});

test("routing replay leaves no partial report when input fails before results", () => {
  withReplayCopy((copy) => {
    fs.writeFileSync(copy.report, "previous-report\n", { mode: 0o600 });
    mutateFixture(copy, "freeform-tiny-direct-fix", (fixture) => {
      fixture.extra = true;
    });

    const result = runReplayWithOutput(copy, copy.report);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stdout, "");
    assert.equal(fs.readFileSync(copy.report, "utf8"), "previous-report\n");
    assert.doesNotMatch(result.stderr, /runner internal error|node:internal|\n\s+at /);
  });
});

const shapeCases = [
  {
    name: "missing required top-level fixture key",
    scenarioId: "freeform-tiny-direct-fix",
    field: "git_snapshot",
    reason: "missing field",
    mutate(fixture) {
      delete fixture.git_snapshot;
    },
  },
  {
    name: "unknown top-level fixture key",
    scenarioId: "freeform-tiny-direct-fix",
    field: "extra",
    reason: "unknown field",
    mutate(fixture) {
      fixture.extra = true;
    },
  },
  {
    name: "missing coverage channel",
    scenarioId: "freeform-tiny-direct-fix",
    field: "observation_coverage.stop_events",
    reason: "missing field",
    mutate(fixture) {
      delete fixture.observation_coverage.stop_events;
    },
  },
  {
    name: "unknown coverage enum",
    scenarioId: "freeform-tiny-direct-fix",
    field: "observation_coverage.stop_events",
    reason: "unknown value",
    mutate(fixture) {
      fixture.observation_coverage.stop_events = "opaque";
    },
  },
  {
    name: "duplicate scenario_id",
    scenarioId: "freeform-ambiguous-clarify",
    field: "scenario_id",
    reason: "duplicate value freeform-tiny-direct-fix",
    mutate(fixture, fixtures) {
      fixture.scenario_id = fixtureFor(fixtures, "freeform-tiny-direct-fix").scenario_id;
    },
  },
  {
    name: "unknown scenario_id",
    scenarioId: "freeform-tiny-direct-fix",
    field: "scenario_id",
    reason: "unknown value unknown-scenario",
    mutate(fixture) {
      fixture.scenario_id = "unknown-scenario";
    },
  },
  {
    name: "missing scenario_id from fixture set",
    scenarioId: "optional-integration-unavailable",
    field: "scenario_id",
    reason: "missing value optional-integration-unavailable",
    missingSetEntry: true,
    mutate(fixture, fixtures) {
      fixtures.splice(fixtures.findIndex((candidate) => candidate === fixture), 1);
    },
  },
  {
    name: "duplicate event sequence",
    scenarioId: "freeform-tiny-direct-fix",
    field: "events[1].sequence",
    reason: "must be strictly increasing",
    mutate(fixture) {
      fixture.events[1].sequence = fixture.events[0].sequence;
    },
  },
  {
    name: "non-increasing event sequence",
    scenarioId: "freeform-tiny-direct-fix",
    field: "events[2].sequence",
    reason: "must be strictly increasing",
    mutate(fixture) {
      fixture.events[2].sequence = 1;
    },
  },
  {
    name: "unknown deterministic event type",
    scenarioId: "freeform-tiny-direct-fix",
    field: "events[1].type",
    reason: "unknown value mystery_event",
    mutate(fixture) {
      fixture.events[1].type = "mystery_event";
    },
  },
  {
    name: "unknown deterministic event key",
    scenarioId: "freeform-tiny-direct-fix",
    field: "events[0].private",
    reason: "unknown field",
    mutate(fixture) {
      fixture.events[0].private = true;
    },
  },
  {
    name: "missing required event key",
    scenarioId: "freeform-tiny-direct-fix",
    field: "events[0].agent",
    reason: "missing field",
    mutate(fixture) {
      delete fixture.events[0].agent;
    },
  },
  {
    name: "missing parent session",
    scenarioId: "freeform-tiny-direct-fix",
    field: "events[1].parent_session_id",
    reason: "unknown session missing-parent",
    mutate(fixture) {
      fixture.events[1].parent_session_id = "missing-parent";
    },
  },
  {
    name: "duplicate session",
    scenarioId: "freeform-tiny-direct-fix",
    field: "events[2].session_id",
    reason: "duplicate session s1",
    mutate(fixture) {
      fixture.events.splice(2, 0, clone(fixture.events[1]));
      resequence(fixture.events);
    },
  },
  {
    name: "completed-agent mismatch",
    scenarioId: "freeform-tiny-direct-fix",
    field: "events[2].agent",
    reason: "does not match started agent developer",
    mutate(fixture) {
      fixture.events[2].agent = "reviewer";
    },
  },
];

for (const shapeCase of shapeCases) {
  test(`runner rejects ${shapeCase.name} with a stable diagnostic`, () => {
    withReplayCopy((copy) => {
      const fixtures = readJsonl(copy.fixtures);
      const fixture = fixtureFor(fixtures, shapeCase.scenarioId);
      shapeCase.mutate(fixture, fixtures);
      const line = shapeCase.missingSetEntry
        ? fixtures.length + 1
        : fixtures.findIndex((candidate) => candidate === fixture) + 1;
      assert.ok(line > 0, `cannot locate mutated fixture ${shapeCase.scenarioId}`);
      writeJsonl(copy.fixtures, fixtures);
      expectInputError(copy, line, shapeCase.field, shapeCase.reason);
    });
  });
}

for (const malformed of [
  { name: "primitive", value: 7 },
  { name: "null", value: null },
  { name: "array", value: [] },
]) {
  test(`runner rejects a JSONL ${malformed.name} record`, () => {
    withReplayCopy((copy) => {
      const fixtures = readJsonl(copy.fixtures);
      const fixture = fixtureFor(fixtures, "freeform-tiny-direct-fix");
      const line = fixtures.findIndex((candidate) => candidate === fixture) + 1;
      const lines = fs.readFileSync(copy.fixtures, "utf8").trimEnd().split("\n");
      lines[line - 1] = JSON.stringify(malformed.value);
      fs.writeFileSync(copy.fixtures, `${lines.join("\n")}\n`);
      expectInputError(copy, line, "record", "must be an object");
    });
  });
}

test("runner rejects malformed JSONL syntax", () => {
  withReplayCopy((copy) => {
    const fixtures = readJsonl(copy.fixtures);
    const fixture = fixtureFor(fixtures, "freeform-tiny-direct-fix");
    const line = fixtures.findIndex((candidate) => candidate === fixture) + 1;
    const lines = fs.readFileSync(copy.fixtures, "utf8").trimEnd().split("\n");
    lines[line - 1] = '{"schema_version":1';
    fs.writeFileSync(copy.fixtures, `${lines.join("\n")}\n`);
    expectInputError(copy, line, "record", "invalid JSON");
  });
});

test("runner rejects non-portable run_error.code without echoing its value", () => {
  withReplayCopy((copy) => {
    const sensitiveCode = "/private-user/session-secret";
    const fixtures = readJsonl(copy.fixtures);
    const fixture = fixtureFor(fixtures, "freeform-tiny-direct-fix");
    const line = fixtures.findIndex((candidate) => candidate === fixture) + 1;
    insertBeforeStop(fixture, {
      sequence: 0,
      type: "run_error",
      code: sensitiveCode,
    });
    const eventIndex = fixture.events.findIndex(
      (event) => event.type === "run_error",
    );
    writeJsonl(copy.fixtures, fixtures);

    const result = runReplay(copy);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.report, null);
    assert.match(
      result.stderr,
      new RegExp(
        `${escapeRegExp(copy.fixtures)}: line ${line} `
        + `events\\[${eventIndex}\\]\\.code invalid portable identifier`,
      ),
    );
    assert.doesNotMatch(result.stdout, new RegExp(escapeRegExp(sensitiveCode)));
    assert.doesNotMatch(result.stderr, new RegExp(escapeRegExp(sensitiveCode)));
  });
});

test("runner reports an unreadable corpus as a ReplayInputError", () => {
  withReplayCopy((copy) => {
    fs.rmSync(copy.corpus);
    const result = runReplay(copy);

    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.report, null);
    assert.match(
      result.stderr,
      new RegExp(`${escapeRegExp(copy.corpus)}: line 1 record unable to read`),
    );
    assert.doesNotMatch(result.stderr, /runner internal error|at file:|node:internal/);
  });
});

const verdictCases = [
  {
    name: "wrong root",
    scenarioId: "freeform-tiny-direct-fix",
    assertionId: "root-agent",
    reasonCode: "unexpected-root-agent",
    mutate(copy) {
      mutateFixture(copy, this.scenarioId, (fixture) => {
        fixture.events[0].agent = "developer";
      });
    },
  },
  {
    name: "missing required agent",
    scenarioId: "feature-technical-research",
    assertionId: "required-agents",
    reasonCode: "required-agent-missing",
    mutate(copy) {
      mutateFixture(copy, this.scenarioId, (fixture) => removeAgentEvents(fixture, "researcher"));
    },
  },
  {
    name: "out-of-order required agents",
    scenarioId: "feature-technical-research",
    assertionId: "required-agents",
    reasonCode: "required-agent-order-mismatch",
    mutate(copy) {
      mutateFixture(copy, this.scenarioId, (fixture) => {
        for (const event of fixture.events) {
          if (event.agent === "researcher") event.agent = "specifier";
          else if (event.agent === "specifier") event.agent = "researcher";
        }
      });
    },
  },
  {
    name: "forbidden agent",
    scenarioId: "freeform-tiny-direct-fix",
    assertionId: "forbidden-agents",
    reasonCode: "forbidden-agent-observed",
    mutate(copy) {
      mutateFixture(copy, this.scenarioId, (fixture) => {
        addSession(fixture, { sessionId: "s2", agent: "evolver" });
      });
    },
  },
  {
    name: "forbidden skill",
    scenarioId: "freeform-tiny-direct-fix",
    assertionId: "skills",
    reasonCode: "forbidden-skill-observed",
    mutate(copy) {
      mutateScenario(copy, this.scenarioId, (scenario) => {
        scenario.forbidden_skills = ["danger-skill"];
      });
      mutateFixture(copy, this.scenarioId, (fixture) => {
        insertBeforeStop(fixture, {
          sequence: 0,
          type: "skill_selected",
          session_id: "root",
          agent: "lead",
          skill: "danger-skill",
        });
      });
    },
  },
  {
    name: "skill outside allowlist",
    scenarioId: "public-sync-private-boundary",
    assertionId: "skills",
    reasonCode: "skill-not-allowed",
    mutate(copy) {
      mutateFixture(copy, this.scenarioId, (fixture) => {
        insertBeforeStop(fixture, {
          sequence: 0,
          type: "skill_selected",
          session_id: "root",
          agent: "lead",
          skill: "unlisted-skill",
        });
      });
    },
  },
  {
    name: "skill when allowlist is empty",
    scenarioId: "freeform-tiny-direct-fix",
    assertionId: "skills",
    reasonCode: "skill-not-allowed",
    mutate(copy) {
      mutateFixture(copy, this.scenarioId, (fixture) => {
        insertBeforeStop(fixture, {
          sequence: 0,
          type: "skill_selected",
          session_id: "root",
          agent: "lead",
          skill: "unexpected-skill",
        });
      });
    },
  },
  {
    name: "premature write",
    scenarioId: "feature-technical-research",
    assertionId: "write-before-spec",
    reasonCode: "write-before-spec-completed",
    mutate(copy) {
      mutateFixture(copy, this.scenarioId, (fixture) => {
        fixture.events.splice(2, 0, {
          sequence: 0,
          type: "tool_call_completed",
          session_id: "s1",
          agent: "researcher",
          tool: "apply_patch",
          mutation: "write",
        });
        resequence(fixture.events);
      });
    },
  },
  {
    name: "write in not-applicable scenario",
    scenarioId: "validation-failure-blocks-close",
    assertionId: "write-before-spec",
    reasonCode: "write-observed-when-not-applicable",
    mutate(copy) {
      mutateFixture(copy, this.scenarioId, (fixture) => {
        insertBeforeStop(fixture, {
          sequence: 0,
          type: "tool_call_completed",
          session_id: "s1",
          agent: "debugger",
          tool: "apply_patch",
          mutation: "write",
        });
      });
    },
  },
  {
    name: "required review absent",
    scenarioId: "plan-ambiguous-task-contract",
    assertionId: "review-policy",
    reasonCode: "required-review-missing",
    mutate(copy) {
      mutateFixture(copy, this.scenarioId, (fixture) => {
        fixture.events = fixture.events.filter((event) => event.type !== "review_completed");
        resequence(fixture.events);
      });
    },
  },
  {
    name: "write after review",
    scenarioId: "public-sync-private-boundary",
    assertionId: "review-policy",
    reasonCode: "write-after-review",
    mutate(copy) {
      mutateFixture(copy, this.scenarioId, (fixture) => {
        insertBeforeStop(fixture, {
          sequence: 0,
          type: "tool_call_completed",
          session_id: "root",
          agent: "lead",
          tool: "apply_patch",
          mutation: "write",
        });
      });
    },
  },
  {
    name: "reviewer when forbidden",
    scenarioId: "freeform-ambiguous-clarify",
    assertionId: "review-policy",
    reasonCode: "reviewer-forbidden",
    mutate(copy) {
      mutateFixture(copy, this.scenarioId, (fixture) => {
        addSession(fixture, { sessionId: "s1", agent: "reviewer" });
      });
    },
  },
  {
    name: "delegation budget exceeded by repeated sessions",
    scenarioId: "freeform-tiny-direct-fix",
    assertionId: "delegation-budget",
    reasonCode: "delegation-budget-exceeded",
    mutate(copy) {
      mutateFixture(copy, this.scenarioId, (fixture) => {
        addSession(fixture, { sessionId: "s2", agent: "developer" });
      });
    },
  },
  {
    name: "wrong stop",
    scenarioId: "freeform-tiny-direct-fix",
    assertionId: "stop-condition",
    reasonCode: "unexpected-stop-condition",
    mutate(copy) {
      mutateFixture(copy, this.scenarioId, (fixture) => {
        fixture.events.at(-1).condition = "clarification-required";
      });
    },
  },
];

for (const verdictCase of verdictCases) {
  test(`observable violation: ${verdictCase.name}`, () => {
    withReplayCopy((copy) => {
      verdictCase.mutate(copy);
      expectVerdict(copy, {
        exitCode: 1,
        overallStatus: "fail",
        scenarioId: verdictCase.scenarioId,
        assertionId: verdictCase.assertionId,
        assertionStatus: "fail",
        reasonCode: verdictCase.reasonCode,
      });
    });
  });
}

test("multiple stops report the first wrong stop before an expected stop", () => {
  withReplayCopy((copy) => {
    mutateFixture(copy, "freeform-tiny-direct-fix", (fixture) => {
      const expectedIndex = fixture.events.findIndex(
        (event) => event.type === "stop_observed",
      );
      fixture.events.splice(expectedIndex, 0, {
        sequence: 0,
        type: "stop_observed",
        condition: "clarification-required",
      });
      resequence(fixture.events);
    });

    const result = runReplay(copy);
    assert.equal(result.status, 1, result.stderr);
    const scenario = result.report.scenario_results.find(
      (candidate) => candidate.scenario_id === "freeform-tiny-direct-fix",
    );
    const stopAssertion = scenario.assertions.find(
      (assertion) => assertion.id === "stop-condition",
    );
    assert.equal(scenario.observed_stop_condition, "clarification-required");
    assert.equal(stopAssertion.status, "fail");
    assert.equal(stopAssertion.reason_code, "unexpected-stop-condition");
    assert.deepEqual(stopAssertion.evidence_sequences, [4]);
  });
});

test("multiple stops report the first expected stop before a later wrong stop", () => {
  withReplayCopy((copy) => {
    mutateFixture(copy, "freeform-tiny-direct-fix", (fixture) => {
      fixture.events.push({
        sequence: 0,
        type: "stop_observed",
        condition: "clarification-required",
      });
      resequence(fixture.events);
    });

    const result = runReplay(copy);
    assert.equal(result.status, 1, result.stderr);
    const scenario = result.report.scenario_results.find(
      (candidate) => candidate.scenario_id === "freeform-tiny-direct-fix",
    );
    const stopAssertion = scenario.assertions.find(
      (assertion) => assertion.id === "stop-condition",
    );
    assert.equal(scenario.observed_stop_condition, "task-completed");
    assert.equal(stopAssertion.status, "fail");
    assert.equal(stopAssertion.reason_code, "unexpected-stop-condition");
    assert.deepEqual(stopAssertion.evidence_sequences, [5]);
  });
});

const reviewOrderingCases = [
  {
    name: "required review with unknown mutation after review",
    policy: "required",
    mutation: "unknown-after",
    exitCode: 3,
    status: "inconclusive",
    reasonCode: "write-order-unknown-after-review",
  },
  {
    name: "optional review with unknown mutation after review",
    policy: "optional",
    mutation: "unknown-after",
    exitCode: 3,
    status: "inconclusive",
    reasonCode: "write-order-unknown-after-review",
  },
  {
    name: "required review with unknown mutation before review",
    policy: "required",
    mutation: "unknown-before",
    exitCode: 0,
    status: "pass",
    reasonCode: "required-review-completed",
  },
  {
    name: "optional review with unknown mutation before review",
    policy: "optional",
    mutation: "unknown-before",
    exitCode: 0,
    status: "pass",
    reasonCode: "optional-review-order-satisfied",
  },
  {
    name: "required review with unsequenced Git mutation",
    policy: "required",
    mutation: "git-changed",
    exitCode: 3,
    status: "inconclusive",
    reasonCode: "git-write-unsequenced",
  },
  {
    name: "optional review with unsequenced Git mutation",
    policy: "optional",
    mutation: "git-changed",
    exitCode: 3,
    status: "inconclusive",
    reasonCode: "git-write-unsequenced",
  },
  {
    name: "optional write after review with partial review evidence",
    policy: "optional",
    mutation: "write-after",
    reviewCoverage: "partial",
    exitCode: 3,
    status: "inconclusive",
    reasonCode: "review-events-incomplete",
  },
  {
    name: "optional write after review with complete review evidence",
    policy: "optional",
    mutation: "write-after",
    reviewCoverage: "complete",
    exitCode: 1,
    status: "fail",
    reasonCode: "write-after-review",
  },
  {
    name: "required write after review with partial review evidence",
    policy: "required",
    mutation: "write-after",
    reviewCoverage: "partial",
    exitCode: 3,
    status: "inconclusive",
    reasonCode: "review-or-tool-events-incomplete",
  },
  {
    name: "required write after review with complete review evidence",
    policy: "required",
    mutation: "write-after",
    reviewCoverage: "complete",
    exitCode: 1,
    status: "fail",
    reasonCode: "write-after-review",
  },
];

for (const reviewCase of reviewOrderingCases) {
  test(`review ordering: ${reviewCase.name}`, () => {
    withReplayCopy((copy) => {
      mutateScenario(copy, "plan-ambiguous-task-contract", (scenario) => {
        scenario.review_policy = reviewCase.policy;
        scenario.write_before_spec_policy = "allowed";
      });
      mutateFixture(copy, "plan-ambiguous-task-contract", (fixture) => {
        if (reviewCase.reviewCoverage !== undefined) {
          fixture.observation_coverage.review_events = reviewCase.reviewCoverage;
        }
        if (reviewCase.mutation === "git-changed") {
          fixture.git_snapshot = "changed";
          return;
        }
        const reviewIndex = fixture.events.findIndex(
          (event) => event.type === "review_completed",
        );
        const event = {
          sequence: 0,
          type: "tool_call_completed",
          session_id: "s3",
          agent: "reviewer",
          tool: "apply_patch",
          mutation: reviewCase.mutation === "write-after" ? "write" : "unknown",
        };
        const insertionIndex = reviewCase.mutation === "unknown-before"
          ? reviewIndex
          : reviewIndex + 1;
        fixture.events.splice(insertionIndex, 0, event);
        resequence(fixture.events);
      });

      const result = runReplay(copy);
      assert.equal(result.status, reviewCase.exitCode, result.stderr);
      const scenario = result.report.scenario_results.find(
        (candidate) => candidate.scenario_id === "plan-ambiguous-task-contract",
      );
      const reviewAssertion = scenario.assertions.find(
        (assertion) => assertion.id === "review-policy",
      );
      assert.equal(scenario.status, reviewCase.status);
      assert.equal(reviewAssertion.status, reviewCase.status);
      assert.equal(reviewAssertion.reason_code, reviewCase.reasonCode);
    });
  });
}

test("missing required-agent evidence is inconclusive", () => {
  withReplayCopy((copy) => {
    mutateFixture(copy, "feature-technical-research", (fixture) => {
      removeAgentEvents(fixture, "researcher");
      fixture.observation_coverage.session_events = "partial";
    });
    expectVerdict(copy, {
      exitCode: 3,
      overallStatus: "inconclusive",
      scenarioId: "feature-technical-research",
      assertionId: "required-agents",
      assertionStatus: "inconclusive",
      reasonCode: "session-events-incomplete",
    });
  });
});

for (const coverage of ["partial", "unavailable"]) {
  test(`wrong root with ${coverage} session evidence is inconclusive`, () => {
    withReplayCopy((copy) => {
      mutateFixture(copy, "freeform-tiny-direct-fix", (fixture) => {
        fixture.events[0].agent = "developer";
        fixture.observation_coverage.session_events = coverage;
      });
      expectVerdict(copy, {
        exitCode: 3,
        overallStatus: "inconclusive",
        scenarioId: "freeform-tiny-direct-fix",
        assertionId: "root-agent",
        assertionStatus: "inconclusive",
        reasonCode: "session-events-incomplete",
      });
    });
  });
}

test("unobservable skill selection is inconclusive", () => {
  withReplayCopy((copy) => {
    mutateFixture(copy, "public-sync-private-boundary", (fixture) => {
      fixture.observation_coverage.skill_events = "partial";
    });
    expectVerdict(copy, {
      exitCode: 3,
      overallStatus: "inconclusive",
      scenarioId: "public-sync-private-boundary",
      assertionId: "skills",
      assertionStatus: "inconclusive",
      reasonCode: "skill-events-incomplete",
    });
  });
});

test("unknown relevant mutation is inconclusive", () => {
  withReplayCopy((copy) => {
    mutateFixture(copy, "feature-technical-research", (fixture) => {
      fixture.events.splice(2, 0, {
        sequence: 0,
        type: "tool_call_completed",
        session_id: "s1",
        agent: "researcher",
        tool: "unknown-tool",
        mutation: "unknown",
      });
      resequence(fixture.events);
    });
    expectVerdict(copy, {
      exitCode: 3,
      overallStatus: "inconclusive",
      scenarioId: "feature-technical-research",
      assertionId: "write-before-spec",
      assertionStatus: "inconclusive",
      reasonCode: "write-mutation-unknown",
    });
  });
});

test("missing stop evidence is inconclusive", () => {
  withReplayCopy((copy) => {
    mutateFixture(copy, "freeform-tiny-direct-fix", (fixture) => {
      fixture.events = fixture.events.filter((event) => event.type !== "stop_observed");
      resequence(fixture.events);
    });
    expectVerdict(copy, {
      exitCode: 3,
      overallStatus: "inconclusive",
      scenarioId: "freeform-tiny-direct-fix",
      assertionId: "stop-condition",
      assertionStatus: "inconclusive",
      reasonCode: "stop-not-observed",
    });
  });
});

test("phase-0 red fixtures fail deterministically with the natural routing symptoms", () => {
  const scenarios = readJsonl(redCorpusPath);
  const fixtures = readJsonl(redFixturesPath);
  assert.deepEqual(
    fixtures.map((fixture) => fixture.scenario_id).sort(),
    scenarios.map((scenario) => scenario.id).sort(),
  );

  const report = evaluateReplay({
    scenarios,
    observations: fixtures,
    mode: "deterministic",
  });
  // Intentional red-pending regression net: these fail until the small-gate
  // fast path changes real routing; the classic corpus stays all-green.
  assert.equal(report.operational_status, "ok");
  assert.equal(report.status, "fail");

  const byId = new Map(
    report.scenario_results.map((result) => [result.scenario_id, result]),
  );
  const copyTrivial = byId.get("freeform-tiny-copy-trivial");
  assert.ok(copyTrivial, "missing copy-trivial red scenario");
  assert.equal(copyTrivial.status, "fail");
  const copyFails = new Map(
    copyTrivial.assertions
      .filter((assertion) => assertion.status === "fail")
      .map((assertion) => [assertion.id, assertion]),
  );
  assert.equal(copyFails.get("forbidden-agents")?.reason_code, "forbidden-agent-observed");
  assert.deepEqual(copyFails.get("forbidden-agents")?.evidence_sequences, [5]);
  assert.equal(copyFails.get("review-policy")?.reason_code, "reviewer-forbidden");
  assert.deepEqual(copyFails.get("delegation-budget")?.reason_code, "delegation-budget-exceeded");

  const seedPipeline = byId.get("freeform-tiny-toy-single-file-full-pipeline");
  assert.ok(seedPipeline, "missing toy single-file full-pipeline red scenario");
  assert.equal(seedPipeline.status, "fail");
  const seedForbidden = seedPipeline.assertions.find(
    (assertion) => assertion.id === "forbidden-agents",
  );
  assert.equal(seedForbidden?.status, "fail");
  assert.deepEqual(seedForbidden?.evidence_sequences, [2, 4, 9]);
  const seedReviewPolicy = seedPipeline.assertions.find(
    (assertion) => assertion.id === "review-policy",
  );
  assert.equal(seedReviewPolicy?.status, "fail");
  assert.equal(seedReviewPolicy?.reason_code, "reviewer-forbidden");
});
