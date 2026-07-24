import assert from "node:assert/strict";
import test from "node:test";

import {
  OAK_COMMANDS,
  OAK_ENTRYPOINTS,
  dispatchOak,
} from "./oak.mjs";

function capture() {
  let value = "";
  return {
    write(chunk) {
      value += String(chunk);
    },
    read() {
      return value;
    },
  };
}

function runnerDeps(calls = [], result = { status: 0, signal: null, error: null }) {
  return {
    run(command, args, options) {
      calls.push({ command, args, options });
      return result;
    },
    stdout: capture(),
    stderr: capture(),
    env: { HOME: "/home/test" },
    cwd: "/workspace",
  };
}

test("[O001] command set is closed and ordered", () => {
  assert.deepEqual(OAK_COMMANDS, [
    "install",
    "upgrade",
    "doctor",
    "check",
    "replay",
    "uninstall",
    "rollback",
    "version",
  ]);
});

test("[O002] global and command help are deterministic", () => {
  for (const argv of [["--help"], ["help"]]) {
    const deps = runnerDeps();
    assert.equal(dispatchOak(argv, deps), 0);
    assert.match(deps.stdout.read(), /^Usage: oak <command>/);
    assert.equal(deps.stderr.read(), "");
  }

  const deps = runnerDeps();
  assert.equal(dispatchOak(["doctor", "--help"], deps), 0);
  assert.match(deps.stdout.read(), /^Usage: oak doctor /);
  assert.equal(deps.stderr.read(), "");
});

test("[O003] missing, unknown, and ambiguous commands fail closed", () => {
  for (const argv of [
    [],
    ["benchmark"],
    ["live"],
    ["--version", "anything"],
    ["version", "anything"],
  ]) {
    const deps = runnerDeps();
    assert.equal(dispatchOak(argv, deps), 2);
    assert.match(deps.stderr.read(), /^oak: /);
    assert.equal(deps.stderr.read().trim().split("\n").length, 1);
  }
});

test("[O004] version forms delegate to the canonical version entrypoint", () => {
  for (const argv of [["--version"], ["version"]]) {
    const calls = [];
    const deps = runnerDeps(calls);
    assert.equal(dispatchOak(argv, deps), 0);
    assert.deepEqual(calls[0].args, [OAK_ENTRYPOINTS.version]);
    assert.equal(calls[0].options.shell, false);
    assert.equal(calls[0].options.stdio, "inherit");
  }
});

test("[O005] lifecycle commands delegate exact argv and exit state", () => {
  const cases = [
    ["install", ["--dry-run", "--target", "/tmp/oak-target"]],
    ["upgrade", ["--dry-run"]],
    ["doctor", ["--target", "/tmp/oak-target"]],
    ["uninstall", ["--dry-run", "--yes"]],
    ["rollback", ["--dry-run"]],
  ];
  for (const [command, args] of cases) {
    const calls = [];
    const deps = runnerDeps(calls);
    assert.equal(dispatchOak([command, ...args], deps), 0);
    assert.deepEqual(calls[0].args, [OAK_ENTRYPOINTS.manager, command, ...args]);
    assert.equal(calls[0].options.shell, false);
    assert.equal(calls[0].options.stdio, "inherit");
  }

  for (const status of [1, 2]) {
    const deps = runnerDeps([], { status, signal: null, error: null });
    assert.equal(dispatchOak(["doctor"], deps), status);
  }
  assert.equal(dispatchOak(
    ["install"],
    runnerDeps([], { status: null, signal: null, error: new Error("spawn") }),
  ), 2);
  assert.equal(dispatchOak(
    ["upgrade"],
    runnerDeps([], { status: null, signal: "SIGTERM", error: null }),
  ), 2);
});
