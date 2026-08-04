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
  inspectLoopState,
  migrateLoopState,
  recordLoopAction,
  releaseLoop,
  repairLoopState,
} from "./loop-state.mjs";

const scriptPath = fileURLToPath(new URL("./loop-state.mjs", import.meta.url));

function withRepo(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-loop-state-"));
  try {
    fs.mkdirSync(path.join(root, ".opencode/loops"), { recursive: true });
    const contractPath = path.join(root, ".opencode/loops/example.md");
    fs.writeFileSync(contractPath, "# Approved loop\n\nObjective: ship safely.\n");
    return callback({ root, contractPath });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function initExample(root, contractPath, plannedIterations = 6) {
  return initLoopState({
    root,
    slug: "example",
    contractPath,
    gitBaseline: "abc123",
    sessionId: "session-1",
    actionId: "approve-1",
    plannedIterations,
  });
}

test("initializes canonical state and append-only history without replacing markdown", () => {
  withRepo(({ root, contractPath }) => {
    const markdown = fs.readFileSync(contractPath, "utf8");
    const state = initExample(root, contractPath, 1);

    assert.equal(state.schema_version, 2);
    assert.equal(state.slug, "example");
    assert.match(state.contract_hash, /^sha256:[a-f0-9]{64}$/);
    assert.equal(state.approval.status, "approved");
    assert.equal(state.approval.contract_hash, state.contract_hash);
    assert.equal(state.git_baseline, "abc123");
    assert.equal(state.session_id, "session-1");
    assert.equal(state.lease, null);
    assert.equal(state.status, "approved");
    assert.equal(state.current_iteration, 0);
    assert.equal(state.planned_iterations, 1);
    assert.equal(state.last_completed_step, null);
    assert.equal(state.blocking_cause, null);
    assert.equal(state.last_action_id, "approve-1");
    assert.equal(fs.readFileSync(contractPath, "utf8"), markdown);

    const history = fs
      .readFileSync(path.join(root, ".opencode/loops/example.history.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.equal(history.length, 1);
    assert.equal(history[0].type, "initialized");
    assert.equal(history[0].action_id, "approve-1");
  });
});

test("acquires one durable lease and rejects a simultaneous resume", () => {
  withRepo(({ root, contractPath }) => {
    initExample(root, contractPath);
    acquireLoop({
      root,
      slug: "example",
      contractPath,
      sessionId: "session-1",
      actionId: "resume-1",
    });
    assert.equal(inspectLoopState({ root, slug: "example" }).status, "running");

    assert.throws(
      () => acquireLoop({
        root,
        slug: "example",
        contractPath,
        sessionId: "session-2",
        actionId: "resume-2",
      }),
      (error) => error instanceof LoopStateError && error.code === "loop_locked",
    );
  });
});

test("rejects action records above the persisted iteration budget", () => {
  withRepo(({ root, contractPath }) => {
    initExample(root, contractPath, 1);
    acquireLoop({
      root,
      slug: "example",
      contractPath,
      sessionId: "session-1",
      actionId: "resume-1",
    });

    assert.throws(
      () => recordLoopAction({
        root,
        slug: "example",
        sessionId: "session-1",
        actionId: "iteration-2",
        iteration: 2,
        completedStep: "developer_change",
        blockingCause: null,
      }),
      (error) => error instanceof LoopStateError && error.code === "iteration_budget_exceeded",
    );
  });
});

test("serializes transitions even when processes share the same session id", () => {
  withRepo(({ root, contractPath }) => {
    initExample(root, contractPath);
    acquireLoop({
      root,
      slug: "example",
      contractPath,
      sessionId: "session-1",
      actionId: "resume-1",
    });
    assert.throws(
      () => repairLoopState({ root, slug: "example" }),
      (error) => error instanceof LoopStateError && error.code === "loop_locked",
    );
    fs.writeFileSync(
      path.join(root, ".opencode/loops/example.lock/transition.lock"),
      '{"session_id":"session-1"}\n',
    );

    assert.throws(
      () => recordLoopAction({
        root,
        slug: "example",
        sessionId: "session-1",
        actionId: "iteration-1",
        iteration: 1,
        completedStep: "developer_change",
        blockingCause: null,
      }),
      (error) => error instanceof LoopStateError && error.code === "transition_locked",
    );

    const historyLines = fs
      .readFileSync(path.join(root, ".opencode/loops/example.history.jsonl"), "utf8")
      .trim()
      .split("\n");
    assert.equal(historyLines.length, 2);
  });
});

test("rejects approval bound to a changed contract", () => {
  withRepo(({ root, contractPath }) => {
    initExample(root, contractPath);
    acquireLoop({
      root,
      slug: "example",
      contractPath,
      sessionId: "session-1",
      actionId: "resume-1",
    });
    fs.appendFileSync(contractPath, "\nChanged after approval.\n");

    assert.throws(
      () => acquireLoop({
        root,
        slug: "example",
        contractPath,
        sessionId: "session-1",
        actionId: "resume-1",
      }),
      (error) => error instanceof LoopStateError && error.code === "contract_mismatch",
    );
  });
});

test("records actions idempotently and rejects action-id reuse with different content", () => {
  withRepo(({ root, contractPath }) => {
    initExample(root, contractPath);
    acquireLoop({
      root,
      slug: "example",
      contractPath,
      sessionId: "session-1",
      actionId: "resume-1",
    });
    const action = {
      root,
      slug: "example",
      sessionId: "session-1",
      actionId: "iteration-1",
      iteration: 1,
      completedStep: "developer_change",
      blockingCause: null,
    };

    const first = recordLoopAction(action);
    const duplicate = recordLoopAction(action);
    assert.deepEqual(duplicate, first);

    const later = recordLoopAction({
      ...action,
      actionId: "iteration-2",
      iteration: 2,
      completedStep: "reviewer_approved",
      status: "completed",
    });
    const delayedRetry = recordLoopAction(action);
    assert.deepEqual(delayedRetry, later);
    assert.equal(later.status, "completed");

    assert.throws(
      () => recordLoopAction({ ...action, completedStep: "reviewer_approved" }),
      (error) => error instanceof LoopStateError && error.code === "action_conflict",
    );

    const released = releaseLoop({
      root,
      slug: "example",
      sessionId: "session-1",
      actionId: "release-1",
    });
    assert.deepEqual(recordLoopAction(action), released);

    const historyLines = fs
      .readFileSync(path.join(root, ".opencode/loops/example.history.jsonl"), "utf8")
      .trim()
      .split("\n");
    assert.equal(historyLines.length, 5);
  });
});

test("recovers a snapshot left behind by a crash after the journal append", () => {
  withRepo(({ root, contractPath }) => {
    initExample(root, contractPath);
    acquireLoop({
      root,
      slug: "example",
      contractPath,
      sessionId: "session-1",
      actionId: "resume-1",
    });

    assert.throws(
      () => recordLoopAction({
        root,
        slug: "example",
        sessionId: "session-1",
        actionId: "iteration-1",
        iteration: 1,
        completedStep: "developer_change",
        blockingCause: null,
        failpoint: "after_journal",
      }),
      (error) => error instanceof LoopStateError && error.code === "simulated_crash",
    );

    const staleSnapshot = JSON.parse(
      fs.readFileSync(path.join(root, ".opencode/loops/example.json"), "utf8"),
    );
    assert.equal(staleSnapshot.current_iteration, 0);

    assert.throws(
      () => recordLoopAction({
        root,
        slug: "example",
        sessionId: "session-1",
        actionId: "iteration-1",
        iteration: 1,
        completedStep: "developer_change",
        blockingCause: null,
      }),
      (error) => error instanceof LoopStateError && error.code === "recovery_required",
    );

    const repaired = repairLoopState({
      root,
      slug: "example",
      releaseLock: true,
    });
    assert.equal(repaired.current_iteration, 1);
    assert.equal(repaired.last_completed_step, "developer_change");

    const resumed = acquireLoop({
      root,
      slug: "example",
      contractPath,
      sessionId: "session-2",
      actionId: "resume-2",
    });
    assert.equal(resumed.session_id, "session-2");
  });
});

test("does not report a release retry as committed while crash locks remain", () => {
  withRepo(({ root, contractPath }) => {
    initExample(root, contractPath);
    acquireLoop({
      root,
      slug: "example",
      contractPath,
      sessionId: "session-1",
      actionId: "resume-1",
    });

    assert.throws(
      () => releaseLoop({
        root,
        slug: "example",
        sessionId: "session-1",
        actionId: "release-1",
        failpoint: "after_snapshot",
      }),
      (error) => error instanceof LoopStateError && error.code === "simulated_crash",
    );
    assert.throws(
      () => releaseLoop({
        root,
        slug: "example",
        sessionId: "session-1",
        actionId: "release-1",
      }),
      (error) => error instanceof LoopStateError && error.code === "recovery_required",
    );
    fs.rmSync(
      path.join(root, ".opencode/loops/example.lock/transition.lock"),
    );
    assert.throws(
      () => releaseLoop({
        root,
        slug: "example",
        sessionId: "session-1",
        actionId: "release-1",
      }),
      (error) => error instanceof LoopStateError && error.code === "recovery_required",
    );
    assert.equal(
      fs.existsSync(path.join(root, ".opencode/loops/example.lock")),
      true,
    );

    const repaired = repairLoopState({
      root,
      slug: "example",
      releaseLock: true,
    });
    assert.equal(repaired.lease, null);
  });
});

test("detects corrupt snapshots and repairs them from intact history", () => {
  withRepo(({ root, contractPath }) => {
    initExample(root, contractPath);
    const statePath = path.join(root, ".opencode/loops/example.json");
    fs.writeFileSync(statePath, "{broken");

    assert.throws(
      () => inspectLoopState({ root, slug: "example" }),
      (error) => error instanceof LoopStateError && error.code === "state_corrupt",
    );

    const repaired = repairLoopState({ root, slug: "example" });
    assert.equal(repaired.slug, "example");
    assert.equal(repaired.last_action_id, "approve-1");
  });
});

test("rejects structurally valid history that changes immutable state", () => {
  withRepo(({ root, contractPath }) => {
    initExample(root, contractPath);
    acquireLoop({
      root,
      slug: "example",
      contractPath,
      sessionId: "session-1",
      actionId: "resume-1",
    });
    const historyPath = path.join(root, ".opencode/loops/example.history.jsonl");
    const events = fs
      .readFileSync(historyPath, "utf8")
      .trim()
      .split("\n")
      .map(JSON.parse);
    events[1].state_after.git_baseline = "tampered";
    fs.writeFileSync(
      historyPath,
      `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
    );

    assert.throws(
      () => repairLoopState({ root, slug: "example", releaseLock: true }),
      (error) => error instanceof LoopStateError && error.code === "history_corrupt",
    );
  });
});

test("repairs only an incomplete trailing journal record and rejects middle corruption", () => {
  withRepo(({ root, contractPath }) => {
    initExample(root, contractPath);
    const historyPath = path.join(root, ".opencode/loops/example.history.jsonl");
    fs.appendFileSync(historyPath, '{"sequence":2');

    const repaired = repairLoopState({ root, slug: "example", truncateTail: true });
    assert.equal(repaired.last_action_id, "approve-1");
    assert.ok(fs.readFileSync(historyPath, "utf8").endsWith("\n"));

    fs.writeFileSync(
      historyPath,
      '{"sequence":1,"broken":true}\n{"sequence":2}\n',
    );
    assert.throws(
      () => repairLoopState({ root, slug: "example", truncateTail: true }),
      (error) => error instanceof LoopStateError && error.code === "history_corrupt",
    );
  });
});

test("migrates a schema v0 snapshot only with explicit renewed approval", () => {
  withRepo(({ root, contractPath }) => {
    const statePath = path.join(root, ".opencode/loops/example.json");
    fs.writeFileSync(
      statePath,
      `${JSON.stringify({
        schema_version: 0,
        slug: "example",
        git_baseline: "old123",
        current_iteration: 2,
        last_completed_step: "reviewer_rejected",
        blocking_cause: "needs_changes",
      })}\n`,
    );

    assert.throws(
      () => migrateLoopState({
        root,
        slug: "example",
        contractPath,
        sessionId: "session-2",
        actionId: "migrate-1",
        approvalStatus: "pending",
        plannedIterations: 3,
      }),
      (error) => error instanceof LoopStateError && error.code === "approval_required",
    );

    const migrated = migrateLoopState({
      root,
      slug: "example",
      contractPath,
      sessionId: "session-2",
      actionId: "migrate-1",
      approvalStatus: "approved",
      plannedIterations: 3,
    });
    assert.equal(migrated.schema_version, 2);
    assert.equal(migrated.planned_iterations, 3);
    assert.equal(migrated.current_iteration, 2);
    assert.equal(migrated.last_completed_step, "reviewer_rejected");
    assert.equal(migrated.approval.status, "approved");
    assert.equal(migrated.status, "approved");
  });
});

test("migrates schema v1 only with renewed approval and an explicit budget", () => {
  withRepo(({ root, contractPath }) => {
    initExample(root, contractPath);
    const statePath = path.join(root, ".opencode/loops/example.json");
    const historyPath = path.join(root, ".opencode/loops/example.history.jsonl");
    const legacyState = JSON.parse(fs.readFileSync(statePath, "utf8"));
    legacyState.schema_version = 1;
    delete legacyState.planned_iterations;
    fs.writeFileSync(statePath, `${JSON.stringify(legacyState)}\n`);
    const [legacyEvent] = fs.readFileSync(historyPath, "utf8").trim().split("\n").map(JSON.parse);
    legacyEvent.schema_version = 1;
    legacyEvent.state_after = legacyState;
    fs.writeFileSync(historyPath, `${JSON.stringify(legacyEvent)}\n`);

    assert.throws(
      () => migrateLoopState({
        root,
        slug: "example",
        contractPath,
        sessionId: "session-2",
        actionId: "migrate-1",
        approvalStatus: "approved",
      }),
      (error) => error instanceof LoopStateError && error.code === "invalid_argument",
    );

    const migrated = migrateLoopState({
      root,
      slug: "example",
      contractPath,
      sessionId: "session-2",
      actionId: "migrate-1",
      approvalStatus: "approved",
      plannedIterations: 3,
    });
    assert.equal(migrated.schema_version, 2);
    assert.equal(migrated.planned_iterations, 3);
    assert.equal(inspectLoopState({ root, slug: "example" }).planned_iterations, 3);
  });
});

test("releases only the owning session lease", () => {
  withRepo(({ root, contractPath }) => {
    initExample(root, contractPath);
    acquireLoop({
      root,
      slug: "example",
      contractPath,
      sessionId: "session-1",
      actionId: "resume-1",
    });

    assert.throws(
      () => releaseLoop({
        root,
        slug: "example",
        sessionId: "session-2",
        actionId: "release-2",
      }),
      (error) => error instanceof LoopStateError && error.code === "lease_mismatch",
    );

    const released = releaseLoop({
      root,
      slug: "example",
      sessionId: "session-1",
      actionId: "release-1",
    });
    assert.equal(released.lease, null);
  });
});

test("exposes the durable operations through the portable CLI", () => {
  withRepo(({ root, contractPath }) => {
    const init = spawnSync(
      process.execPath,
      [
        scriptPath,
        "init",
        "--root",
        root,
        "--slug",
        "example",
        "--contract",
        contractPath,
        "--git-baseline",
        "abc123",
        "--session-id",
        "session-1",
        "--action-id",
        "approve-1",
        "--planned-iterations",
        "1",
      ],
      { encoding: "utf8" },
    );
    assert.equal(init.status, 0, init.stderr);
    assert.equal(JSON.parse(init.stdout).schema_version, 2);
    assert.equal(JSON.parse(init.stdout).planned_iterations, 1);

    const inspect = spawnSync(
      process.execPath,
      [scriptPath, "inspect", "--root", root, "--slug", "example"],
      { encoding: "utf8" },
    );
    assert.equal(inspect.status, 0, inspect.stderr);
    assert.equal(JSON.parse(inspect.stdout).last_action_id, "approve-1");
  });
});

test("rejects a symlinked state ancestor that escapes the root", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-loop-root-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-loop-outside-"));
  try {
    fs.mkdirSync(path.join(outside, "loops"));
    fs.writeFileSync(
      path.join(outside, "loops/example.md"),
      "# Approved loop\n",
    );
    fs.symlinkSync(outside, path.join(root, ".opencode"));

    assert.throws(
      () => initLoopState({
        root,
        slug: "example",
        contractPath: path.join(root, ".opencode/loops/example.md"),
        gitBaseline: "abc123",
        sessionId: "session-1",
        actionId: "approve-1",
        plannedIterations: 1,
      }),
      (error) => error instanceof LoopStateError && error.code === "unsafe_path",
    );
    assert.equal(
      fs.existsSync(path.join(outside, "loops/example.json")),
      false,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("does not follow a broken history symlink during initialization", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-loop-root-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-loop-outside-"));
  try {
    fs.mkdirSync(path.join(root, ".opencode/loops"), { recursive: true });
    const contractPath = path.join(root, ".opencode/loops/example.md");
    const outsideTarget = path.join(outside, "created.jsonl");
    fs.writeFileSync(contractPath, "# Approved loop\n");
    fs.symlinkSync(
      outsideTarget,
      path.join(root, ".opencode/loops/example.history.jsonl"),
    );

    assert.throws(
      () => initLoopState({
        root,
        slug: "example",
        contractPath,
        gitBaseline: "abc123",
        sessionId: "session-1",
        actionId: "approve-1",
        plannedIterations: 1,
      }),
      (error) => error instanceof LoopStateError && error.code === "state_exists",
    );
    assert.equal(fs.existsSync(outsideTarget), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});
