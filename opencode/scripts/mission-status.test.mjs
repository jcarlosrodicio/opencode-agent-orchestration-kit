import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  LoopStateError,
  acquireLoop,
  initLoopState,
  recordLoopAction,
  releaseLoop,
} from "./loop-state.mjs";
import {
  parseArguments,
  readMissionStatus,
  renderHuman,
} from "./mission-status.mjs";

const scriptPath = fileURLToPath(new URL("./mission-status.mjs", import.meta.url));

function withRepo(callback, plannedIterations = 3) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-mission-status-"));
  const loopsDir = path.join(root, ".opencode", "loops");
  fs.mkdirSync(loopsDir, { recursive: true });
  const contractPath = path.join(loopsDir, "example.md");
  fs.writeFileSync(contractPath, "# Approved loop\n\nObjective: ship safely.\n");
  initLoopState({
    root,
    slug: "example",
    contractPath,
    gitBaseline: "abc123",
    sessionId: "session-1",
    actionId: "approve-1",
    plannedIterations,
  });
  try {
    return callback({
      root,
      contractPath,
      statePath: path.join(loopsDir, "example.json"),
      historyPath: path.join(loopsDir, "example.history.jsonl"),
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function runStatus(root, args) {
  return spawnSync(process.execPath, [scriptPath, "--root", root, ...args], {
    encoding: "utf8",
    timeout: 10000,
  });
}

test("projects approved state without writing canonical files", () => {
  withRepo(({ root, statePath, historyPath }) => {
    const before = [fs.readFileSync(statePath), fs.readFileSync(historyPath)];
    const mission = readMissionStatus({ root, slug: "example" });

    assert.equal(mission.schema_version, 1);
    assert.equal(mission.slug, "example");
    assert.equal(mission.status, "approved");
    assert.equal(mission.current_iteration, 0);
    assert.equal(mission.planned_iterations, 3);
    assert.equal(mission.last_completed_step, null);
    assert.equal(mission.blocking_cause, null);
    assert.equal(mission.session_id, "session-1");
    assert.equal(typeof mission.updated_at, "string");
    assert.equal(mission.next_action, "resume after confirming the approved contract");
    assert.deepEqual([fs.readFileSync(statePath), fs.readFileSync(historyPath)], before);
  });
});

test("projects running, blocked, paused, and completed transitions", () => {
  withRepo(({ root, contractPath }) => {
    acquireLoop({
      root,
      slug: "example",
      contractPath,
      sessionId: "session-1",
      actionId: "resume-1",
    });
    assert.equal(readMissionStatus({ root, slug: "example" }).status, "running");

    recordLoopAction({
      root,
      slug: "example",
      sessionId: "session-1",
      actionId: "blocked-1",
      iteration: 1,
      completedStep: "developer_change",
      blockingCause: "reviewer requested a focused fix",
      status: "blocked",
    });
    let mission = readMissionStatus({ root, slug: "example" });
    assert.equal(mission.status, "blocked");
    assert.equal(mission.blocking_cause, "reviewer requested a focused fix");
    assert.match(mission.next_action, /blocking cause/);

    recordLoopAction({
      root,
      slug: "example",
      sessionId: "session-1",
      actionId: "paused-1",
      iteration: 1,
      completedStep: "developer_change",
      blockingCause: null,
      status: "paused",
    });
    mission = readMissionStatus({ root, slug: "example" });
    assert.equal(mission.status, "paused");
    assert.match(mission.next_action, /resume explicitly/);

    recordLoopAction({
      root,
      slug: "example",
      sessionId: "session-1",
      actionId: "completed-1",
      iteration: 3,
      completedStep: "review_passed",
      blockingCause: null,
      status: "completed",
    });
    releaseLoop({ root, slug: "example", sessionId: "session-1", actionId: "release-1" });
    mission = readMissionStatus({ root, slug: "example" });
    assert.equal(mission.status, "completed");
    assert.equal(mission.current_iteration, 3);
    assert.match(mission.next_action, /no further action/);
  });
});

test("JSON and human CLI output expose the same projection", () => {
  withRepo(({ root }) => {
    const jsonResult = runStatus(root, ["--slug", "example", "--json"]);
    assert.equal(jsonResult.status, 0, jsonResult.stderr);
    const json = JSON.parse(jsonResult.stdout);
    assert.equal(json.status, "approved");
    assert.equal(json.current_iteration, 0);

    const humanResult = runStatus(root, ["--slug", "example"]);
    assert.equal(humanResult.status, 0, humanResult.stderr);
    assert.match(humanResult.stdout, /Mission: example/);
    assert.match(humanResult.stdout, /Iteration: 0\/3/);
    assert.match(humanResult.stdout, /Next action:/);
    assert.equal(renderHuman(json), humanResult.stdout.trim());
  });
});

test("corrupt history and stale snapshots remain visible errors", () => {
  withRepo(({ root, statePath, historyPath }) => {
    fs.appendFileSync(historyPath, "not-json\n");
    assert.throws(
      () => readMissionStatus({ root, slug: "example" }),
      (error) => error instanceof LoopStateError && error.code === "history_corrupt",
    );
  });

  withRepo(({ root, contractPath, statePath }) => {
    const initial = JSON.parse(fs.readFileSync(statePath, "utf8"));
    acquireLoop({
      root,
      slug: "example",
      contractPath,
      sessionId: "session-1",
      actionId: "resume-1",
    });
    fs.writeFileSync(statePath, `${JSON.stringify(initial, null, 2)}\n`);
    assert.throws(
      () => readMissionStatus({ root, slug: "example" }),
      (error) => error instanceof LoopStateError && error.code === "snapshot_stale",
    );
  });
});

test("CLI rejects missing loops, invalid slugs, and relative roots", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-mission-cli-"));
  try {
    const missing = runStatus(root, ["--slug", "example"]);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /^state_missing:/);

    assert.throws(
      () => parseArguments(["--slug", "../unsafe"]),
      (error) => error instanceof LoopStateError && error.code === "invalid_argument",
    );
    assert.throws(
      () => parseArguments(["--root", ".", "--slug", "example"]),
      (error) => error instanceof LoopStateError && error.code === "invalid_argument",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
