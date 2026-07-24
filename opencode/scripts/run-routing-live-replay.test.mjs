import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  parseLiveArguments,
  runLiveReplay,
  runtimeConfig,
  spawnProcessWithTimeout,
} from "./run-routing-live-replay.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(scriptDir);
const corpus = path.join(
  root,
  "docs",
  "ai",
  "evolution",
  "benchmarks",
  "router-scenarios.jsonl",
);
const scenarios = fs.readFileSync(corpus, "utf8").trim().split("\n").map(JSON.parse);
const freeformScenario = scenarios.find((row) => row.id === "freeform-ambiguous-clarify");
const featureScenario = scenarios.find((row) => row.command_path === "/feature");

function makeHarnessSource() {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), "routing-live-source-"));
  fs.mkdirSync(path.join(source, "agents"));
  fs.mkdirSync(path.join(source, "commands"));
  fs.mkdirSync(path.join(source, "skills", "safe"), { recursive: true });
  fs.mkdirSync(
    path.join(source, "docs", "ai", "evolution", "benchmarks"),
    { recursive: true },
  );
  fs.writeFileSync(path.join(source, "AGENTS.md"), "# Safe fixture\n");
  fs.writeFileSync(path.join(source, "agents", "lead.md"), "# Lead\n");
  fs.writeFileSync(path.join(source, "commands", "feature.md"), "# Feature\n");
  fs.writeFileSync(path.join(source, "skills", "safe", "SKILL.md"), "# Safe\n");
  fs.writeFileSync(
    path.join(source, "docs", "ai", "evolution", "benchmarks", "router-scenarios.jsonl"),
    `${JSON.stringify(freeformScenario)}\n`,
  );
  fs.writeFileSync(path.join(source, "opencode.json"), '{"private":"must-not-be-read"}\n');
  fs.writeFileSync(path.join(source, "opencode.jsonc"), '{"private":"must-not-be-read"}\n');
  for (const excluded of [".git", "node_modules", ".opencode", "artifacts", "raw"]) {
    fs.mkdirSync(path.join(source, excluded), { recursive: true });
    fs.writeFileSync(path.join(source, excluded, "canary.txt"), "never-copy");
  }
  return source;
}

function rootLine(id = "root-real") {
  return JSON.stringify({
    type: "session.created",
    properties: { info: { id, parentID: null, agent: "lead" } },
  });
}

function childSessionLine({
  id = "child-real",
  parentID = "root-real",
  agent = "developer",
} = {}) {
  return JSON.stringify({
    type: "session.created",
    properties: { info: { id, parentID, agent } },
  });
}

function stopLine(condition = "clarification-required") {
  return JSON.stringify({
    type: "stop.observed",
    properties: { condition },
  });
}

function coverageLine(channels = [
  "skill_events",
  "tool_events",
  "review_events",
  "stop_events",
]) {
  return JSON.stringify({
    type: "capture.complete",
    properties: { channels },
  });
}

function makeTree(rootId = "root-real", children = []) {
  return {
    root_session_id: rootId,
    root_session: {
      session_id: rootId,
      parent_session_id: null,
      agent: "lead",
    },
    child_sessions: children,
  };
}

function makeDeps(overrides = {}) {
  const calls = {
    spawn: [],
    collect: [],
    remove: [],
    sourceSnapshots: [],
  };
  const deps = {
    makeTempDir: async () => fs.mkdtempSync(path.join(os.tmpdir(), "routing-live-run-")),
    spawnProcess: async (command, args, options) => {
      calls.spawn.push({ command, args, options });
      return {
        exitCode: 0,
        stdout: `${rootLine()}\n${stopLine()}\n`,
        stderr: "",
        timedOut: false,
        cancelled: false,
      };
    },
    collectExecutionTreeByRoot: async (dbPath, rootId) => {
      calls.collect.push({ dbPath, rootId });
      return makeTree(rootId);
    },
    readOpenCodeDbPath: async () => "/tmp/fake-opencode.db",
    wait: async () => {},
    removeTree: async (target) => {
      calls.remove.push(target);
      fs.rmSync(target, { recursive: true, force: true });
    },
    ...overrides,
  };
  return { deps, calls };
}

function validOptions(sourceRoot, scenario = freeformScenario) {
  return {
    scenarioId: scenario.id,
    confirmLive: true,
    timeoutMs: 5_000,
    sourceRoot,
    scenarios,
    protectedRoots: [root],
  };
}

function collectStrings(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
}

test("live argument parser accepts only the explicit portable interface", () => {
  assert.deepEqual(
    parseLiveArguments([
      "--scenario",
      freeformScenario.id,
      "--confirm-live",
      "--timeout-ms",
      "1234",
      "--retain-private-output",
      "/tmp/private-live-output",
    ]),
    {
      scenarioId: freeformScenario.id,
      confirmLive: true,
      timeoutMs: 1234,
      retainPrivateOutput: "/tmp/private-live-output",
    },
  );
});

test("CLI validation exits 2 without reaching OpenCode", () => {
  const script = path.join(scriptDir, "run-routing-live-replay.mjs");
  const result = spawnSync(process.execPath, [
    script,
    "--scenario",
    freeformScenario.id,
  ], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--confirm-live is required/);
  assert.equal(result.stdout, "");
});

for (const args of [
  [],
  ["--scenario", freeformScenario.id],
  ["--scenario", freeformScenario.id, "--confirm-live", "--unknown"],
  ["--scenario", freeformScenario.id, "--confirm-live", "--timeout-ms", "0"],
  ["--scenario", freeformScenario.id, "--confirm-live", "--timeout-ms", "-1"],
  ["--scenario", freeformScenario.id, "--confirm-live", "--retain-private-output", "relative"],
  ...["--model", "--provider", "--variant", "--auto", "--attach", "--password", "--username"]
    .map((option) => ["--scenario", freeformScenario.id, "--confirm-live", option, "x"]),
]) {
  test(`live argument parser rejects ${args.join(" ") || "missing scenario"}`, () => {
    assert.throws(() => parseLiveArguments(args), { name: "LiveReplayError" });
  });
}

test("runLiveReplay rejects unknown scenarios before spawning", async () => {
  const source = makeHarnessSource();
  const { deps, calls } = makeDeps();
  try {
    const result = await runLiveReplay({
      ...validOptions(source),
      scenarioId: "unknown-scenario",
    }, deps);
    assert.equal(result.exitCode, 2);
    assert.equal(calls.spawn.length, 0);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("runLiveReplay validates the closed corpus before temp materialization or spawn", async () => {
  const source = makeHarnessSource();
  let tempCalls = 0;
  const { deps, calls } = makeDeps({
    makeTempDir: async () => {
      tempCalls += 1;
      return fs.mkdtempSync(path.join(os.tmpdir(), "must-not-materialize-"));
    },
  });
  const invalidScenario = {
    ...freeformScenario,
    unexpected_private_key: "/private/provider",
  };
  try {
    const result = await runLiveReplay({
      ...validOptions(source),
      scenarios: [invalidScenario],
    }, deps);
    assert.equal(result.exitCode, 2);
    assert.equal(result.error, "Live replay corpus is invalid.");
    assert.equal(tempCalls, 0);
    assert.equal(calls.spawn.length, 0);
    assert.equal(JSON.stringify(result).includes("/private/"), false);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("runLiveReplay requires explicit live confirmation before spawning", async () => {
  const source = makeHarnessSource();
  const { deps, calls } = makeDeps();
  try {
    const result = await runLiveReplay({
      ...validOptions(source),
      confirmLive: false,
    }, deps);
    assert.equal(result.exitCode, 2);
    assert.equal(calls.spawn.length, 0);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("freeform rejects a non-lead expected root before spawning", async () => {
  const source = makeHarnessSource();
  const scenario = {
    ...freeformScenario,
    expected_root_agent: "developer",
  };
  const { deps, calls } = makeDeps();
  try {
    const result = await runLiveReplay({
      ...validOptions(source),
      scenarios: [scenario],
    }, deps);
    assert.equal(result.exitCode, 2);
    assert.equal(calls.spawn.length, 0);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("runLiveReplay rejects protected retain destinations before spawning", async () => {
  const source = makeHarnessSource();
  const { deps, calls } = makeDeps();
  try {
    const result = await runLiveReplay({
      ...validOptions(source),
      retainPrivateOutput: path.join(root, "private-output"),
    }, deps);
    assert.equal(result.exitCode, 2);
    assert.equal(calls.spawn.length, 0);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("runLiveReplay rejects retention inside any Git worktree before spawning", async () => {
  const source = makeHarnessSource();
  const otherRepo = fs.mkdtempSync(path.join(os.tmpdir(), "routing-live-other-repo-"));
  spawnSync("git", ["init", "--quiet"], { cwd: otherRepo });
  const { deps, calls } = makeDeps();
  try {
    const result = await runLiveReplay({
      ...validOptions(source),
      retainPrivateOutput: path.join(otherRepo, "private-output"),
    }, deps);
    assert.equal(result.exitCode, 2);
    assert.equal(calls.spawn.length, 0);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(otherRepo, { recursive: true, force: true });
  }
});

test("runLiveReplay rejects a non-empty retention directory before spawning", async () => {
  const source = makeHarnessSource();
  const destination = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "routing-live-nonempty-retain-")),
  );
  fs.writeFileSync(path.join(destination, "existing"), "do not overwrite");
  const { deps, calls } = makeDeps();
  try {
    const result = await runLiveReplay({
      ...validOptions(source),
      retainPrivateOutput: destination,
    }, deps);
    assert.equal(result.exitCode, 2);
    assert.equal(calls.spawn.length, 0);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(destination, { recursive: true, force: true });
  }
});

test("live adapter materializes a clean disposable repository and never copies private config", async () => {
  const source = makeHarnessSource();
  const sourceBefore = fs.readdirSync(source).sort();
  let inspectedTemp;
  const { deps, calls } = makeDeps({
    spawnProcess: async (command, args, options) => {
      calls.spawn.push({ command, args, options });
      inspectedTemp = options.cwd;
      assert.ok(inspectedTemp.startsWith(`${fs.realpathSync(os.tmpdir())}${path.sep}`));
      assert.deepEqual(
        JSON.parse(fs.readFileSync(path.join(inspectedTemp, "opencode.json"), "utf8")),
        runtimeConfig,
      );
      assert.equal(fs.existsSync(path.join(inspectedTemp, "opencode.jsonc")), false);
      assert.equal(
        fs.existsSync(path.join(
          inspectedTemp,
          "docs",
          "ai",
          "evolution",
          "benchmarks",
          "router-scenarios.jsonl",
        )),
        true,
      );
      for (const excluded of ["node_modules", ".opencode", "artifacts", "raw"]) {
        assert.equal(fs.existsSync(path.join(inspectedTemp, excluded)), false);
      }
      assert.ok(fs.existsSync(path.join(inspectedTemp, ".git")));
      return {
        exitCode: 0,
        stdout: `${rootLine()}\n${stopLine()}\n${coverageLine()}\n`,
        stderr: "",
        timedOut: false,
        cancelled: false,
      };
    },
  });
  try {
    const result = await runLiveReplay(validOptions(source), deps);
    assert.equal(result.exitCode, 0);
    assert.equal(calls.remove.length, 1);
    assert.equal(fs.existsSync(inspectedTemp), false);
    assert.deepEqual(fs.readdirSync(source).sort(), sourceBefore);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("live adapter rejects symlinks in the portable source", async () => {
  const source = makeHarnessSource();
  fs.symlinkSync("/tmp", path.join(source, "agents", "unsafe-link"));
  const { deps, calls } = makeDeps();
  try {
    const result = await runLiveReplay(validOptions(source), deps);
    assert.equal(result.exitCode, 2);
    assert.equal(calls.spawn.length, 0);
    assert.equal(calls.remove.length, 1);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("live adapter rejects a symlink in an intermediate corpus path before spawning", async () => {
  const source = makeHarnessSource();
  const external = fs.mkdtempSync(path.join(os.tmpdir(), "routing-live-external-docs-"));
  fs.mkdirSync(
    path.join(external, "ai", "evolution", "benchmarks"),
    { recursive: true },
  );
  fs.writeFileSync(
    path.join(external, "ai", "evolution", "benchmarks", "router-scenarios.jsonl"),
    `${JSON.stringify(freeformScenario)}\n`,
  );
  fs.rmSync(path.join(source, "docs"), { recursive: true });
  fs.symlinkSync(external, path.join(source, "docs"));
  const { deps, calls } = makeDeps();
  try {
    const result = await runLiveReplay(validOptions(source), deps);
    assert.equal(result.exitCode, 2);
    assert.equal(calls.spawn.length, 0);
    assert.equal(calls.remove.length, 1);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(external, { recursive: true, force: true });
  }
});

test("live adapter rejects a missing portable corpus before spawning", async () => {
  const source = makeHarnessSource();
  fs.rmSync(path.join(
    source,
    "docs",
    "ai",
    "evolution",
    "benchmarks",
    "router-scenarios.jsonl",
  ));
  const { deps, calls } = makeDeps();
  try {
    const result = await runLiveReplay(validOptions(source), deps);
    assert.equal(result.exitCode, 2);
    assert.equal(calls.spawn.length, 0);
    assert.equal(calls.remove.length, 1);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("live adapter rejects a raw-capture symlink created during the run", async () => {
  const source = makeHarnessSource();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "routing-live-outside-"));
  const { deps } = makeDeps({
    spawnProcess: async (command, args, options) => {
      fs.rmSync(path.join(options.cwd, ".opencode-live"), { recursive: true, force: true });
      fs.symlinkSync(outside, path.join(options.cwd, ".opencode-live"));
      return {
        exitCode: 0,
        stdout: `${rootLine()}\n`,
        stderr: "must stay contained",
        timedOut: false,
        cancelled: false,
      };
    },
  });
  try {
    const result = await runLiveReplay(validOptions(source), deps);
    assert.equal(result.exitCode, 2);
    assert.equal(result.report, undefined);
    assert.deepEqual(fs.readdirSync(outside), []);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("raw files exist as regular mode-0600 files before spawn and a swap cannot overwrite a target", async () => {
  const source = makeHarnessSource();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "routing-live-raw-file-target-"));
  const target = path.join(outside, "target.txt");
  fs.writeFileSync(target, "untouched");
  let observedSecureFile = false;
  const { deps } = makeDeps({
    spawnProcess: async (command, args, options) => {
      const stdoutPath = path.join(options.cwd, ".opencode-live", "stdout.jsonl");
      const initial = fs.lstatSync(stdoutPath);
      assert.equal(initial.isFile(), true);
      assert.equal(initial.mode & 0o777, 0o600);
      observedSecureFile = true;
      fs.unlinkSync(stdoutPath);
      fs.symlinkSync(target, stdoutPath);
      options.onStdoutChunk(Buffer.from(`${rootLine()}\n`));
      return {
        exitCode: 0,
        timedOut: false,
        cancelled: false,
      };
    },
  });
  try {
    const result = await runLiveReplay(validOptions(source), deps);
    assert.equal(result.exitCode, 2);
    assert.equal(observedSecureFile, true);
    assert.equal(fs.readFileSync(target, "utf8"), "untouched");
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("unvalidated non-empty temp candidates are neither used nor deleted", async () => {
  const source = makeHarnessSource();
  const unsafe = fs.mkdtempSync(path.join(os.tmpdir(), "routing-live-unsafe-existing-"));
  const sentinel = path.join(unsafe, "keep-me");
  fs.writeFileSync(sentinel, "user data");
  const { deps, calls } = makeDeps({
    makeTempDir: async () => unsafe,
  });
  try {
    const result = await runLiveReplay(validOptions(source), deps);
    assert.equal(result.exitCode, 2);
    assert.equal(calls.spawn.length, 0);
    assert.equal(calls.remove.length, 0);
    assert.equal(fs.readFileSync(sentinel, "utf8"), "user data");
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(unsafe, { recursive: true, force: true });
  }
});

test("freeform command uses exact argv and verifies lead before launch", async () => {
  const source = makeHarnessSource();
  const { deps, calls } = makeDeps();
  try {
    await runLiveReplay(validOptions(source), deps);
    const call = calls.spawn[0];
    assert.equal(call.command, "opencode");
    assert.deepEqual(call.args, [
      "run",
      "--format",
      "json",
      "--thinking",
      "--dir",
      call.options.cwd,
      freeformScenario.prompt,
    ]);
    assert.equal(call.options.shell, false);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("slash command uses exact portable argv", async () => {
  const source = makeHarnessSource();
  const { deps, calls } = makeDeps({
    collectExecutionTreeByRoot: async (dbPath, rootId) => {
      calls.collect.push({ dbPath, rootId });
      return makeTree(rootId, [
        {
          session_id: "child",
          parent_session_id: rootId,
          agent: "researcher",
        },
      ]);
    },
  });
  try {
    await runLiveReplay(validOptions(source, featureScenario), deps);
    const call = calls.spawn[0];
    assert.deepEqual(call.args, [
      "run",
      "--format",
      "json",
      "--thinking",
      "--command",
      "feature",
      "--dir",
      call.options.cwd,
      featureScenario.prompt,
    ]);
    const allArgs = call.args.join(" ");
    for (const forbidden of ["--model", "--provider", "--variant", "--auto", "password", "username"]) {
      assert.equal(allArgs.includes(forbidden), false);
    }
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("explicit root ID is the only ID passed to the exact-tree collector", async () => {
  const source = makeHarnessSource();
  const { deps, calls } = makeDeps();
  try {
    await runLiveReplay(validOptions(source), deps);
    assert.ok(calls.collect.length >= 1);
    assert.deepEqual(new Set(calls.collect.map((call) => call.rootId)), new Set(["root-real"]));
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("explicit root evidence outranks generic child session IDs", async () => {
  const source = makeHarnessSource();
  const { deps, calls } = makeDeps({
    spawnProcess: async () => ({
      exitCode: 0,
      stdout: [
        rootLine("root-explicit"),
        JSON.stringify({
          type: "thinking",
          sessionID: "child-generic",
          properties: { text: "discard" },
        }),
        stopLine(),
      ].join("\n"),
      stderr: "",
      timedOut: false,
      cancelled: false,
    }),
  });
  try {
    const result = await runLiveReplay(validOptions(source), deps);
    assert.ok(result.report);
    assert.deepEqual(
      new Set(calls.collect.map((call) => call.rootId)),
      new Set(["root-explicit"]),
    );
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("stdout child absent from the exact tree makes the approved freeform replay inconclusive", async () => {
  const source = makeHarnessSource();
  const { deps, calls } = makeDeps({
    spawnProcess: async () => ({
      exitCode: 0,
      stdout: [
        rootLine(),
        childSessionLine(),
        stopLine(),
        coverageLine(),
      ].join("\n"),
      stderr: "",
      timedOut: false,
      cancelled: false,
    }),
  });
  try {
    const result = await runLiveReplay(validOptions(source), deps);
    assert.equal(result.exitCode, 3);
    assert.equal(result.report.status, "inconclusive");
    assert.equal(result.observation.observation_coverage.session_events, "partial");
    assert.ok(result.observation.events.some(
      (event) => event.type === "run_error" && event.code === "capture-incomplete",
    ));
    assert.deepEqual(result.report.scenario_results[0].observed_agents, ["lead"]);
    assert.equal(
      result.observation.events.some((event) => event.session_id === "child-real"),
      false,
    );
    assert.deepEqual(
      new Set(calls.collect.map((call) => call.rootId)),
      new Set(["root-real"]),
    );
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

for (const scopedCase of [
  {
    name: "session completion",
    event: {
      type: "session.completed",
      properties: { sessionID: "unknown-child", agent: "developer" },
    },
  },
  {
    name: "skill selection",
    event: {
      type: "skill.selected",
      properties: {
        sessionID: "unknown-child",
        agent: "developer",
        skill: "source-driven-development",
      },
    },
  },
  {
    name: "tool completion",
    event: {
      type: "tool.completed",
      properties: {
        sessionID: "unknown-child",
        agent: "developer",
        tool: "read",
        mutation: "read",
      },
    },
  },
  {
    name: "review completion",
    event: {
      type: "review.completed",
      properties: {
        sessionID: "unknown-child",
        agent: "reviewer",
        verdict: "approved",
      },
    },
  },
  {
    name: "stop",
    event: {
      type: "stop.observed",
      properties: {
        sessionID: "unknown-child",
        condition: "clarification-required",
      },
    },
  },
]) {
  test(`session-scoped ${scopedCase.name} outside the exact tree degrades session coverage`, async () => {
    const source = makeHarnessSource();
    const { deps, calls } = makeDeps({
      spawnProcess: async () => ({
        exitCode: 0,
        stdout: [
          rootLine(),
          JSON.stringify(scopedCase.event),
          stopLine(),
          coverageLine(),
        ].join("\n"),
        stderr: "",
        timedOut: false,
        cancelled: false,
      }),
    });
    try {
      const result = await runLiveReplay(validOptions(source), deps);
      assert.equal(result.exitCode, 3);
      assert.equal(result.observation.observation_coverage.session_events, "partial");
      assert.ok(result.observation.events.some(
        (event) => event.type === "run_error" && event.code === "capture-incomplete",
      ));
      assert.deepEqual(result.report.scenario_results[0].observed_agents, ["lead"]);
      const scopedEvents = result.observation.events.filter(
        (event) => Object.hasOwn(event, "session_id"),
      );
      assert.ok(scopedEvents.every((event) => event.session_id === "session-1"));
      assert.deepEqual(
        new Set(calls.collect.map((call) => call.rootId)),
        new Set(["root-real"]),
      );
    } finally {
      fs.rmSync(source, { recursive: true, force: true });
    }
  });
}

for (const ignoredType of [
  "thinking",
  "step_start",
  "step_finish",
  "message.part.updated",
  "text",
]) {
  test(`ignored session-scoped ${ignoredType} outside the exact tree degrades session coverage`, async () => {
    const source = makeHarnessSource();
    const sensitive = `discard-${ignoredType}-private`;
    const { deps, calls } = makeDeps({
      spawnProcess: async () => ({
        exitCode: 0,
        stdout: [
          rootLine(),
          JSON.stringify({
            type: ignoredType,
            sessionID: "unknown-child",
            properties: { text: sensitive, args: sensitive },
          }),
          stopLine(),
          coverageLine(),
        ].join("\n"),
        stderr: "",
        timedOut: false,
        cancelled: false,
      }),
    });
    try {
      const result = await runLiveReplay(validOptions(source), deps);
      assert.equal(result.exitCode, 3);
      assert.equal(result.report.status, "inconclusive");
      assert.equal(result.observation.observation_coverage.session_events, "partial");
      assert.ok(result.observation.events.some(
        (event) => event.type === "run_error" && event.code === "capture-incomplete",
      ));
      assert.equal(JSON.stringify(result.observation).includes(sensitive), false);
      assert.deepEqual(
        new Set(calls.collect.map((call) => call.rootId)),
        new Set(["root-real"]),
      );
    } finally {
      fs.rmSync(source, { recursive: true, force: true });
    }
  });
}

test("known child thinking is discarded without competing with the explicit root", async () => {
  const source = makeHarnessSource();
  const sensitive = "discard-known-child-private";
  const collectedRootIds = [];
  const scenario = {
    ...freeformScenario,
    forbidden_agents: [],
    maximum_delegation_budget: 1,
  };
  const { deps } = makeDeps({
    spawnProcess: async () => ({
      exitCode: 0,
      stdout: [
        rootLine("root-explicit"),
        JSON.stringify({
          type: "thinking",
          sessionID: "child-known",
          properties: { text: sensitive, args: sensitive },
        }),
        stopLine(),
        coverageLine(),
      ].join("\n"),
      stderr: "",
      timedOut: false,
      cancelled: false,
    }),
    collectExecutionTreeByRoot: async (_dbPath, rootId) => {
      collectedRootIds.push(rootId);
      return makeTree("root-explicit", [{
        session_id: "child-known",
        parent_session_id: "root-explicit",
        agent: "developer",
      }]);
    },
  });
  try {
    const result = await runLiveReplay({
      ...validOptions(source),
      scenarios: [scenario],
    }, deps);
    assert.equal(result.observation.observation_coverage.session_events, "complete");
    assert.equal(result.observation.events.some(
      (event) => event.type === "run_error" && event.code === "capture-incomplete",
    ), false);
    assert.equal(JSON.stringify(result.observation).includes(sensitive), false);
    assert.deepEqual(
      new Set(collectedRootIds),
      new Set(["root-explicit"]),
    );
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

for (const contradiction of [
  {
    name: "root agent",
    stdout: [
      JSON.stringify({
        type: "session.created",
        properties: {
          info: { id: "root-real", parentID: null, agent: "developer" },
        },
      }),
      stopLine(),
      coverageLine(),
    ].join("\n"),
    tree: makeTree(),
    expectedAgents: ["lead"],
  },
  {
    name: "child parent",
    stdout: [
      rootLine(),
      childSessionLine({ parentID: "other-parent" }),
      stopLine(),
      coverageLine(),
    ].join("\n"),
    tree: makeTree("root-real", [{
      session_id: "child-real",
      parent_session_id: "root-real",
      agent: "developer",
    }]),
    expectedAgents: ["lead", "developer"],
  },
  {
    name: "child agent",
    stdout: [
      rootLine(),
      childSessionLine({ agent: "reviewer" }),
      stopLine(),
      coverageLine(),
    ].join("\n"),
    tree: makeTree("root-real", [{
      session_id: "child-real",
      parent_session_id: "root-real",
      agent: "developer",
    }]),
    expectedAgents: ["lead", "developer"],
  },
]) {
  test(`stdout/tree contradiction in ${contradiction.name} becomes capture-incomplete`, async () => {
    const source = makeHarnessSource();
    const scenario = {
      ...freeformScenario,
      forbidden_agents: [],
      maximum_delegation_budget: 1,
    };
    const { deps } = makeDeps({
      spawnProcess: async () => ({
        exitCode: 0,
        stdout: contradiction.stdout,
        stderr: "",
        timedOut: false,
        cancelled: false,
      }),
      collectExecutionTreeByRoot: async () => contradiction.tree,
    });
    try {
      const result = await runLiveReplay({
        ...validOptions(source),
        scenarios: [scenario],
      }, deps);
      assert.equal(result.exitCode, 3);
      assert.equal(result.observation.observation_coverage.session_events, "partial");
      assert.ok(result.observation.events.some(
        (event) => event.type === "run_error" && event.code === "capture-incomplete",
      ));
      assert.deepEqual(
        result.report.scenario_results[0].observed_agents,
        contradiction.expectedAgents,
      );
    } finally {
      fs.rmSync(source, { recursive: true, force: true });
    }
  });
}

test("exact-root collection retries boundedly until the requested tree stabilizes", async () => {
  const source = makeHarnessSource();
  let attempts = 0;
  const waits = [];
  const { deps, calls } = makeDeps({
    collectExecutionTreeByRoot: async (dbPath, rootId) => {
      calls.collect.push({ dbPath, rootId });
      attempts += 1;
      return attempts === 1 ? null : makeTree(rootId);
    },
    wait: async (milliseconds) => waits.push(milliseconds),
  });
  try {
    const result = await runLiveReplay(validOptions(source), deps);
    assert.ok(result.report);
    assert.ok(attempts >= 2);
    assert.ok(attempts <= 6);
    assert.ok(waits.every((value) => value > 0 && value <= 1_000));
    assert.deepEqual(new Set(calls.collect.map((call) => call.rootId)), new Set(["root-real"]));
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("an execution tree that never stabilizes remains capture-incomplete", async () => {
  const source = makeHarnessSource();
  let attempts = 0;
  const { deps } = makeDeps({
    collectExecutionTreeByRoot: async (dbPath, rootId) => {
      attempts += 1;
      return makeTree(rootId, Array.from({ length: attempts }, (_, index) => ({
        session_id: `child-${index}`,
        parent_session_id: rootId,
        agent: "developer",
      })));
    },
  });
  try {
    const result = await runLiveReplay(validOptions(source), deps);
    assert.equal(attempts, 6);
    assert.ok(result.observation.events.some(
      (event) => event.type === "run_error" && event.code === "capture-incomplete",
    ));
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("collector runtime failure becomes capture-incomplete instead of leaking infrastructure data", async () => {
  const source = makeHarnessSource();
  const { deps } = makeDeps({
    collectExecutionTreeByRoot: async () => {
      throw new Error("/private/opencode.db unavailable");
    },
  });
  try {
    const result = await runLiveReplay(validOptions(source), deps);
    assert.equal(result.exitCode, 3);
    assert.ok(result.observation.events.some(
      (event) => event.type === "run_error" && event.code === "capture-incomplete",
    ));
    assert.equal(JSON.stringify(result.report).includes("/private/"), false);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("a successful tree does not claim non-session channel completeness by itself", async () => {
  const source = makeHarnessSource();
  const { deps } = makeDeps();
  try {
    const result = await runLiveReplay(validOptions(source), deps);
    assert.equal(result.exitCode, 3);
    assert.equal(result.observation.observation_coverage.session_events, "complete");
    for (const channel of ["skill_events", "tool_events", "review_events", "stop_events"]) {
      assert.equal(result.observation.observation_coverage[channel], "partial");
    }
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("missing explicit root becomes root-session-unresolved without collection fallback", async () => {
  const source = makeHarnessSource();
  const { deps, calls } = makeDeps({
    spawnProcess: async () => ({
      exitCode: 0,
      stdout: `${stopLine()}\n`,
      stderr: "",
      timedOut: false,
      cancelled: false,
    }),
  });
  try {
    const result = await runLiveReplay(validOptions(source), deps);
    assert.equal(result.exitCode, 3);
    assert.equal(calls.collect.length, 0);
    assert.ok(result.observation.events.some(
      (event) => event.type === "run_error" && event.code === "root-session-unresolved",
    ));
    assert.deepEqual(result.report.scenario_results[0].observed_agents, ["unknown-agent"]);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("conflicting explicit roots become capture-incomplete", async () => {
  const source = makeHarnessSource();
  const { deps, calls } = makeDeps({
    spawnProcess: async () => ({
      exitCode: 0,
      stdout: `${rootLine("root-one")}\n${rootLine("root-two")}\n`,
      stderr: "",
      timedOut: false,
      cancelled: false,
    }),
  });
  try {
    const result = await runLiveReplay(validOptions(source), deps);
    assert.equal(result.exitCode, 3);
    assert.equal(calls.collect.length, 0);
    assert.ok(result.observation.events.some(
      (event) => event.type === "run_error" && event.code === "capture-incomplete",
    ));
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("normalization keeps only canonical evidence and degrades unknown channels", async () => {
  const source = makeHarnessSource();
  const sensitive = "/private/model reasoning secret";
  const raw = [
    rootLine(),
    JSON.stringify({
      type: "tool.completed",
      properties: {
        sessionID: "root-real",
        agent: "lead",
        tool: "read",
        mutation: "read",
        arguments: sensitive,
      },
    }),
    JSON.stringify({
      type: "review.completed",
      properties: {
        sessionID: "review-real",
        agent: "reviewer",
        verdict: "approved",
        thinking: sensitive,
      },
    }),
    stopLine(),
    JSON.stringify({ type: "future.unknown", properties: { private: sensitive } }),
  ].join("\n");
  const { deps } = makeDeps({
    spawnProcess: async () => ({
      exitCode: 0,
      stdout: `${raw}\n`,
      stderr: sensitive,
      timedOut: false,
      cancelled: false,
    }),
    collectExecutionTreeByRoot: async (dbPath, rootId) => makeTree(rootId, [
      {
        session_id: "review-real",
        parent_session_id: rootId,
        agent: "reviewer",
      },
    ]),
  });
  try {
    const result = await runLiveReplay(validOptions(source), deps);
    const reportText = JSON.stringify(result.report);
    assert.equal(reportText.includes(sensitive), false);
    assert.equal(reportText.includes("arguments"), false);
    assert.equal(reportText.includes("thinking"), false);
    assert.ok(result.report.scenario_results[0].limitations.some(
      (row) => row.code === "unknown-live-event",
    ));
    for (const channel of ["skill_events", "tool_events", "review_events", "stop_events"]) {
      assert.equal(result.observation.observation_coverage[channel], "partial");
    }
    assert.equal(result.observation.observation_coverage.session_events, "complete");
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("classified unknown tool events degrade only tool coverage", async () => {
  const source = makeHarnessSource();
  const raw = [
    rootLine(),
    stopLine(),
    coverageLine(),
    JSON.stringify({ type: "tool.future", properties: { arguments: "private" } }),
  ].join("\n");
  const { deps } = makeDeps({
    spawnProcess: async () => ({
      exitCode: 0,
      stdout: `${raw}\n`,
      stderr: "",
      timedOut: false,
      cancelled: false,
    }),
  });
  try {
    const result = await runLiveReplay(validOptions(source), deps);
    assert.equal(result.observation.observation_coverage.tool_events, "partial");
    for (const channel of ["skill_events", "review_events", "stop_events"]) {
      assert.equal(result.observation.observation_coverage[channel], "complete");
    }
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("malformed supported tool evidence is omitted and degrades instead of crashing evaluation", async () => {
  const source = makeHarnessSource();
  const raw = [
    rootLine(),
    JSON.stringify({
      type: "tool.completed",
      properties: {
        sessionID: "root-real",
        mutation: "read",
        arguments: "/private/secret",
      },
    }),
    stopLine(),
  ].join("\n");
  const { deps } = makeDeps({
    spawnProcess: async () => ({
      exitCode: 0,
      stdout: `${raw}\n`,
      stderr: "",
      timedOut: false,
      cancelled: false,
    }),
  });
  try {
    const result = await runLiveReplay(validOptions(source), deps);
    assert.equal(result.exitCode, 3);
    assert.ok(result.report);
    assert.equal(
      result.observation.events.some((event) => event.type === "tool_call_completed"),
      false,
    );
    assert.equal(result.observation.observation_coverage.tool_events, "partial");
    assert.equal(JSON.stringify(result.report).includes("/private/"), false);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("incomplete exact-tree rows keep session coverage partial", async () => {
  const source = makeHarnessSource();
  const scenario = {
    ...freeformScenario,
    maximum_delegation_budget: 1,
  };
  const { deps } = makeDeps({
    collectExecutionTreeByRoot: async (dbPath, rootId) => makeTree(rootId, [
      {
        session_id: "child-without-agent",
        parent_session_id: rootId,
        agent: null,
      },
    ]),
  });
  try {
    const result = await runLiveReplay({
      ...validOptions(source),
      scenarios: [scenario],
    }, deps);
    assert.equal(result.exitCode, 3);
    assert.equal(result.observation.observation_coverage.session_events, "partial");
    assert.ok(result.observation.events.some(
      (event) => event.type === "run_error" && event.code === "capture-incomplete",
    ));
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

for (const treeCase of [
  {
    name: "root with non-null parent",
    tree(rootId) {
      return {
        root_session_id: rootId,
        root_session: {
          session_id: rootId,
          parent_session_id: "external-parent",
          agent: "lead",
        },
        child_sessions: [],
      };
    },
    expectedAgents: ["unknown-agent"],
  },
  {
    name: "disconnected orphan child",
    tree(rootId) {
      return makeTree(rootId, [{
        session_id: "orphan-real",
        parent_session_id: "missing-real",
        agent: "developer",
      }]);
    },
    expectedAgents: ["lead"],
  },
  {
    name: "duplicate session IDs",
    tree(rootId) {
      return makeTree(rootId, [
        {
          session_id: "duplicate-real",
          parent_session_id: rootId,
          agent: "developer",
        },
        {
          session_id: "duplicate-real",
          parent_session_id: rootId,
          agent: "reviewer",
        },
      ]);
    },
    expectedAgents: ["lead"],
  },
]) {
  test(`malformed exact tree ${treeCase.name} becomes a valid capture-incomplete report`, async () => {
    const source = makeHarnessSource();
    const scenario = {
      ...freeformScenario,
      forbidden_agents: [],
      maximum_delegation_budget: 3,
    };
    const { deps } = makeDeps({
      collectExecutionTreeByRoot: async (dbPath, rootId) => treeCase.tree(rootId),
    });
    try {
      const result = await runLiveReplay({
        ...validOptions(source),
        scenarios: [scenario],
      }, deps);
      assert.equal(result.exitCode, 3);
      assert.ok(result.report);
      assert.equal(result.observation.observation_coverage.session_events, "partial");
      assert.ok(result.observation.events.some(
        (event) => event.type === "run_error" && event.code === "capture-incomplete",
      ));
      assert.deepEqual(result.report.scenario_results[0].observed_agents, treeCase.expectedAgents);
      const starts = result.observation.events.filter(
        (event) => event.type === "session_started",
      );
      assert.equal(new Set(starts.map((event) => event.session_id)).size, starts.length);
      assert.equal(starts.some((event) => event.parent_session_id === undefined), false);
    } finally {
      fs.rmSync(source, { recursive: true, force: true });
    }
  });
}

test("exact tree children and explicit completion events normalize without real IDs", async () => {
  const source = makeHarnessSource();
  const developerScenario = scenarios.find((row) => row.id === "freeform-tiny-direct-fix");
  const raw = [
    rootLine(),
    JSON.stringify({
      type: "session.completed",
      properties: { sessionID: "child-real", agent: "developer" },
    }),
    stopLine("task-completed"),
    coverageLine(),
  ].join("\n");
  const { deps } = makeDeps({
    spawnProcess: async () => ({
      exitCode: 0,
      stdout: `${raw}\n`,
      stderr: "",
      timedOut: false,
      cancelled: false,
    }),
    collectExecutionTreeByRoot: async (dbPath, rootId) => makeTree(rootId, [
      {
        session_id: "child-real",
        parent_session_id: rootId,
        agent: "developer",
      },
    ]),
  });
  try {
    const result = await runLiveReplay(validOptions(source, developerScenario), deps);
    assert.ok(result.observation.events.some(
      (event) => event.type === "session_completed"
        && event.session_id === "session-2"
        && event.agent === "developer",
    ));
    assert.equal(JSON.stringify(result.report).includes("child-real"), false);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("exact-tree sessions are normalized in parent-before-child order", async () => {
  const source = makeHarnessSource();
  const { deps } = makeDeps({
    collectExecutionTreeByRoot: async (dbPath, rootId) => makeTree(rootId, [
      {
        session_id: "grandchild-real",
        parent_session_id: "child-real",
        agent: "reviewer",
      },
      {
        session_id: "child-real",
        parent_session_id: rootId,
        agent: "developer",
      },
    ]),
  });
  try {
    const result = await runLiveReplay(validOptions(source), deps);
    const starts = result.observation.events.filter((event) => event.type === "session_started");
    assert.deepEqual(
      starts.map((event) => [event.session_id, event.parent_session_id]),
      [
        ["session-1", null],
        ["session-2", "session-1"],
        ["session-3", "session-2"],
      ],
    );
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("explicit portable run errors are normalized without raw details", async () => {
  const source = makeHarnessSource();
  const { deps } = makeDeps({
    spawnProcess: async () => ({
      exitCode: 0,
      stdout: [
        rootLine(),
        JSON.stringify({
          type: "run.error",
          properties: {
            code: "cancelled",
            message: "/private/model failure",
          },
        }),
      ].join("\n"),
      stderr: "",
      timedOut: false,
      cancelled: false,
    }),
  });
  try {
    const result = await runLiveReplay(validOptions(source), deps);
    assert.ok(result.observation.events.some(
      (event) => event.type === "run_error" && event.code === "cancelled",
    ));
    assert.equal(JSON.stringify(result.report).includes("/private/"), false);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("tracked changes after the run produce git_snapshot changed and observable exit 1", async () => {
  const source = makeHarnessSource();
  const { deps, calls } = makeDeps({
    spawnProcess: async (command, args, options) => {
      calls.spawn.push({ command, args, options });
      fs.appendFileSync(path.join(options.cwd, "AGENTS.md"), "mutation\n");
      return {
        exitCode: 0,
        stdout: `${rootLine()}\n${stopLine()}\n${coverageLine()}\n`,
        stderr: "",
        timedOut: false,
        cancelled: false,
      };
    },
  });
  try {
    const result = await runLiveReplay(validOptions(source), deps);
    assert.equal(result.observation.git_snapshot, "changed");
    assert.equal(result.exitCode, 1);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("nested .opencode-live mutations are not hidden from the Git snapshot", async () => {
  const source = makeHarnessSource();
  const { deps } = makeDeps({
    spawnProcess: async (command, args, options) => {
      const nested = path.join(options.cwd, "agents", ".opencode-live");
      fs.mkdirSync(nested, { recursive: true });
      fs.writeFileSync(path.join(nested, "mutation.txt"), "observable mutation\n");
      return {
        exitCode: 0,
        stdout: `${rootLine()}\n${stopLine()}\n${coverageLine()}\n`,
        stderr: "",
        timedOut: false,
        cancelled: false,
      };
    },
  });
  try {
    const result = await runLiveReplay(validOptions(source), deps);
    assert.equal(result.observation.git_snapshot, "changed");
    assert.equal(result.exitCode, 1);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("raw capture files use mode 0600 before cleanup", async () => {
  const source = makeHarnessSource();
  let inspected = false;
  const { deps } = makeDeps({
    removeTree: async (target) => {
      for (const name of ["stdout.jsonl", "stderr.log"]) {
        assert.equal(
          fs.statSync(path.join(target, ".opencode-live", name)).mode & 0o777,
          0o600,
        );
      }
      inspected = true;
      fs.rmSync(target, { recursive: true, force: true });
    },
  });
  try {
    await runLiveReplay(validOptions(source), deps);
    assert.equal(inspected, true);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("spawn infrastructure errors exit 2 and still clean the temp repository", async () => {
  const source = makeHarnessSource();
  const { deps, calls } = makeDeps({
    spawnProcess: async () => {
      throw new Error("/private/executable missing");
    },
  });
  try {
    const result = await runLiveReplay(validOptions(source), deps);
    assert.equal(result.exitCode, 2);
    assert.equal(result.report, undefined);
    assert.equal(calls.remove.length, 1);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("timeout and cancellation become portable run errors", async () => {
  for (const resultShape of [
    { timedOut: true, cancelled: false, expected: "timeout" },
    { timedOut: false, cancelled: true, expected: "cancelled" },
  ]) {
    const source = makeHarnessSource();
    const { deps } = makeDeps({
      spawnProcess: async () => ({
        exitCode: null,
        stdout: `${rootLine()}\n`,
        stderr: "/private/error",
        timedOut: resultShape.timedOut,
        cancelled: resultShape.cancelled,
      }),
    });
    try {
      const result = await runLiveReplay(validOptions(source), deps);
      assert.equal(result.exitCode, 3);
      assert.ok(result.observation.events.some(
        (event) => event.type === "run_error" && event.code === resultShape.expected,
      ));
      assert.equal(JSON.stringify(result.report).includes("/private/"), false);
    } finally {
      fs.rmSync(source, { recursive: true, force: true });
    }
  }
});

test("default process control closes inherited descendant pipes at an absolute timeout", {
  skip: process.platform === "win32",
  timeout: 5_000,
}, async () => {
  const started = Date.now();
  const result = await spawnProcessWithTimeout(
    process.execPath,
    [
      "-e",
      [
        "const { spawn } = require('node:child_process');",
        "spawn(process.execPath, ['-e', 'setTimeout(() => {}, 3000)'],",
        "  { stdio: ['ignore', 'inherit', 'inherit'] });",
        "process.on('SIGTERM', () => {});",
        "setInterval(() => {}, 1000);",
      ].join(" "),
    ],
    {
      cwd: root,
      timeoutMs: 100,
      killGraceMs: 50,
      absoluteGraceMs: 50,
    },
  );
  assert.equal(result.timedOut, true);
  assert.equal(result.exitCode, null);
  assert.ok(Date.now() - started >= 100);
  assert.ok(Date.now() - started < 1_000);
});

test("stream callback failure terminates the process group before rejecting", {
  skip: process.platform === "win32",
  timeout: 5_000,
}, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "routing-live-stream-error-"));
  const marker = path.join(temp, "late-marker");
  const started = Date.now();
  try {
    await assert.rejects(
      spawnProcessWithTimeout(
        process.execPath,
        [
          "-e",
          [
            "const fs = require('node:fs');",
            `const marker = ${JSON.stringify(marker)};`,
            "process.stdout.write('trigger');",
            "setTimeout(() => fs.writeFileSync(marker, 'should-not-run'), 400);",
            "setInterval(() => {}, 1000);",
          ].join(" "),
        ],
        {
          cwd: root,
          timeoutMs: 2_000,
          killGraceMs: 50,
          absoluteGraceMs: 50,
          onStdoutChunk: () => {
            throw new Error("capture write failed");
          },
        },
      ),
      /capture write failed/,
    );
    assert.ok(Date.now() - started < 1_000);
    await new Promise((resolve) => setTimeout(resolve, 450));
    assert.equal(fs.existsSync(marker), false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("timeout still kills TERM-resistant descendants after the parent closes", {
  skip: process.platform === "win32",
  timeout: 5_000,
}, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "routing-live-descendant-"));
  const marker = path.join(temp, "descendant-survived");
  const started = Date.now();
  try {
    const result = await spawnProcessWithTimeout(
      process.execPath,
      [
        "-e",
        [
          "const { spawn } = require('node:child_process');",
          `const marker = ${JSON.stringify(marker)};`,
          "spawn(process.execPath, ['-e',",
          "  `const fs=require('node:fs');",
          "   process.on('SIGTERM',()=>{});",
          "   setTimeout(()=>{fs.writeFileSync(${JSON.stringify(marker)},'bad');process.exit(0)},400);",
          "   setInterval(()=>{},1000);`],",
          "  { stdio: 'ignore' });",
          "setInterval(() => {}, 1000);",
        ].join(" "),
      ],
      {
        cwd: root,
        timeoutMs: 100,
        killGraceMs: 50,
        absoluteGraceMs: 50,
      },
    );
    assert.equal(result.timedOut, true);
    assert.ok(Date.now() - started < 1_000);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(fs.existsSync(marker), false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("streaming capture preserves fragmented UTF-8 without accumulating process output", async () => {
  const source = makeHarnessSource();
  const line = `${rootLine()}\n${JSON.stringify({
    type: "thinking",
    sessionID: "root-real",
    properties: { text: "emoji-😀-discarded" },
  })}\n${stopLine()}\n`;
  const bytes = Buffer.from(line);
  const emojiOffset = bytes.indexOf(Buffer.from("😀"));
  const { deps, calls } = makeDeps({
    spawnProcess: async (command, args, options) => {
      calls.spawn.push({ command, args, options });
      for (const chunk of [
        bytes.subarray(0, emojiOffset + 1),
        bytes.subarray(emojiOffset + 1, emojiOffset + 3),
        bytes.subarray(emojiOffset + 3),
      ]) {
        options.onStdoutChunk(chunk);
      }
      options.onStderrChunk(Buffer.from("fragmented stderr"));
      return { exitCode: 0, timedOut: false, cancelled: false };
    },
  });
  try {
    const result = await runLiveReplay(validOptions(source), deps);
    assert.ok(result.report);
    assert.deepEqual(
      new Set(calls.collect.map((call) => call.rootId)),
      new Set(["root-real"]),
    );
    assert.equal(JSON.stringify(result.report).includes("😀"), false);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("bounded stdout capture reports capture-incomplete while retained raw stays complete", async () => {
  const source = makeHarnessSource();
  const destination = path.join(
    fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "routing-live-bounded-"))),
    "retained",
  );
  const raw = `${rootLine()}\n${"x".repeat(4_096)}\n${stopLine()}\n`;
  const { deps } = makeDeps({
    spawnProcess: async (command, args, options) => {
      for (let offset = 0; offset < raw.length; offset += 37) {
        options.onStdoutChunk(Buffer.from(raw.slice(offset, offset + 37)));
      }
      return { exitCode: 0, timedOut: false, cancelled: false };
    },
  });
  try {
    const result = await runLiveReplay({
      ...validOptions(source),
      captureLimitBytes: Buffer.byteLength(`${rootLine()}\n`) + 8,
      retainPrivateOutput: destination,
      writeStderr: () => {},
    }, deps);
    assert.equal(result.exitCode, 3);
    assert.ok(result.observation.events.some(
      (event) => event.type === "run_error" && event.code === "capture-incomplete",
    ));
    assert.equal(
      fs.readFileSync(path.join(destination, "stdout.jsonl"), "utf8"),
      raw,
    );
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(path.dirname(destination), { recursive: true, force: true });
  }
});

test("positive private retention copies only raw stdout and stderr after the run", async () => {
  const source = makeHarnessSource();
  const destination = path.join(
    fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "routing-live-retain-parent-"))),
    "retained",
  );
  let spawnFinished = false;
  const { deps, calls } = makeDeps({
    spawnProcess: async () => {
      spawnFinished = true;
      return {
        exitCode: 0,
        stdout: `${rootLine()}\n${stopLine()}\n`,
        stderr: "private stderr",
        timedOut: false,
        cancelled: false,
      };
    },
  });
  const warnings = [];
  try {
    const result = await runLiveReplay({
      ...validOptions(source),
      retainPrivateOutput: destination,
      writeStderr: (text) => warnings.push(text),
    }, deps);
    assert.equal(spawnFinished, true, result.error);
    assert.ok(fs.existsSync(destination));
    assert.equal(fs.statSync(destination).mode & 0o777, 0o700);
    assert.deepEqual(fs.readdirSync(destination).sort(), ["stderr.log", "stdout.jsonl"]);
    for (const file of fs.readdirSync(destination)) {
      assert.equal(fs.statSync(path.join(destination, file)).mode & 0o777, 0o600);
    }
    assert.equal(
      warnings.join(""),
      "Warning: retained live replay output may contain sensitive prompts, paths, model/provider metadata, or reasoning.\n",
    );
    assert.equal(JSON.stringify(result.report).includes(destination), false);
    assert.equal(calls.remove.length, 1);
    assert.equal(fs.existsSync(calls.remove[0]), false);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(path.dirname(destination), { recursive: true, force: true });
  }
});

test("retention is revalidated after the live run to close symlink races", async () => {
  const source = makeHarnessSource();
  const parent = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "routing-live-retain-race-")),
  );
  const destination = path.join(parent, "retained");
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "routing-live-retain-outside-"));
  const { deps } = makeDeps({
    spawnProcess: async () => {
      fs.symlinkSync(outside, destination);
      return {
        exitCode: 0,
        stdout: `${rootLine()}\n${stopLine()}\n`,
        stderr: "private",
        timedOut: false,
        cancelled: false,
      };
    },
  });
  try {
    const result = await runLiveReplay({
      ...validOptions(source),
      retainPrivateOutput: destination,
    }, deps);
    assert.equal(result.exitCode, 2);
    assert.ok(result.report);
    assert.deepEqual(fs.readdirSync(outside), []);
    assert.equal(JSON.stringify(result.report).includes(outside), false);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(parent, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("retention never follows a destination file symlink", async () => {
  const source = makeHarnessSource();
  const destination = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "routing-live-retain-file-race-")),
  );
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "routing-live-retain-file-target-"));
  const target = path.join(outside, "target.txt");
  fs.writeFileSync(target, "untouched");
  const { deps } = makeDeps({
    spawnProcess: async () => {
      fs.symlinkSync(target, path.join(destination, "stdout.jsonl"));
      return {
        exitCode: 0,
        stdout: `${rootLine()}\n${stopLine()}\n`,
        stderr: "private",
        timedOut: false,
        cancelled: false,
      };
    },
  });
  try {
    const result = await runLiveReplay({
      ...validOptions(source),
      retainPrivateOutput: destination,
    }, deps);
    assert.equal(result.exitCode, 2);
    assert.ok(result.report);
    assert.equal(fs.readFileSync(target, "utf8"), "untouched");
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(destination, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("retention never reopens a substituted regular raw file by pathname", async () => {
  const source = makeHarnessSource();
  const destination = path.join(
    fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "routing-live-raw-identity-"))),
    "retained",
  );
  const captured = `${rootLine()}\n${stopLine()}\n`;
  const { deps } = makeDeps({
    spawnProcess: async (command, args, options) => {
      options.onStdoutChunk(Buffer.from(captured));
      const stdoutPath = path.join(options.cwd, ".opencode-live", "stdout.jsonl");
      fs.unlinkSync(stdoutPath);
      fs.writeFileSync(stdoutPath, "substitute-regular-file");
      return { exitCode: 0, timedOut: false, cancelled: false };
    },
  });
  try {
    const result = await runLiveReplay({
      ...validOptions(source),
      retainPrivateOutput: destination,
      writeStderr: () => {},
    }, deps);
    assert.equal(result.exitCode, 2);
    const retainedStdout = path.join(destination, "stdout.jsonl");
    if (fs.existsSync(retainedStdout)) {
      assert.notEqual(fs.readFileSync(retainedStdout, "utf8"), "substitute-regular-file");
    }
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(path.dirname(destination), { recursive: true, force: true });
  }
});

test("cleanup failure preserves a sanitized report and forces operational exit 2", async () => {
  const source = makeHarnessSource();
  const { deps } = makeDeps({
    removeTree: async () => {
      throw new Error("/private/temp cleanup failed");
    },
  });
  try {
    const result = await runLiveReplay(validOptions(source), deps);
    assert.equal(result.exitCode, 2);
    assert.equal(result.report.operational_status, "cleanup-failed");
    assert.ok(result.report.scenario_results[0].limitations.some(
      (row) => row.code === "cleanup-failed",
    ));
    assert.equal(JSON.stringify(result.report).includes("/private/"), false);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("invalid injected executable proves tests do not launch a real OpenCode process", async () => {
  const source = makeHarnessSource();
  const { deps, calls } = makeDeps({
    spawnProcess: async (command, args, options) => {
      calls.spawn.push({ command, args, options });
      assert.equal(command, "definitely-not-a-real-opencode-executable");
      return {
        exitCode: 0,
        stdout: `${rootLine()}\n${stopLine()}\n`,
        stderr: "",
        timedOut: false,
        cancelled: false,
      };
    },
  });
  try {
    const result = await runLiveReplay({
      ...validOptions(source),
      executable: "definitely-not-a-real-opencode-executable",
    }, deps);
    assert.equal(result.report.mode, "live");
    assert.equal(calls.spawn.length, 1);
    assert.equal(collectStrings(result.report).some((value) => value.includes("real-opencode")), false);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});
