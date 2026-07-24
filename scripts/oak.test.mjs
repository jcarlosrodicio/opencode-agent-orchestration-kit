import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  OAK_COMMANDS,
  OAK_ENTRYPOINTS,
  OAK_REPLAY_DEFAULTS,
  dispatchOak,
  resolveCheckTarget,
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

function tempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oak-cli-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function snapshotTree(root) {
  const result = [];
  function walk(directory, prefix = "") {
    for (const name of fs.readdirSync(directory).sort()) {
      const relative = prefix ? `${prefix}/${name}` : name;
      const fullPath = path.join(directory, name);
      const stat = fs.lstatSync(fullPath);
      if (stat.isDirectory()) {
        result.push([relative, "directory", stat.mode & 0o777]);
        walk(fullPath, relative);
      } else if (stat.isFile()) {
        result.push([
          relative,
          "file",
          stat.mode & 0o777,
          crypto.createHash("sha256").update(fs.readFileSync(fullPath)).digest("hex"),
        ]);
      } else if (stat.isSymbolicLink()) {
        result.push([relative, "symlink", fs.readlinkSync(fullPath)]);
      }
    }
  }
  walk(root);
  return result;
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

test("[O006] check target precedence matches lifecycle", () => {
  assert.equal(resolveCheckTarget({ target: "/explicit" }, {
    OPENCODE_CONFIG_DIR: "/environment",
    HOME: "/home/test",
  }), "/explicit");
  assert.equal(resolveCheckTarget({}, {
    OPENCODE_CONFIG_DIR: "/environment",
    HOME: "/home/test",
  }), "/environment");
  assert.equal(resolveCheckTarget({}, {
    HOME: "/home/test",
  }), "/home/test/.config/opencode");
  assert.throws(() => resolveCheckTarget({}, {}), /HOME/);
  assert.throws(() => resolveCheckTarget({}, { OPENCODE_CONFIG_DIR: "" }), /must not be empty/);
});

test("[O007] check runs the packaged checker against a safe target", (t) => {
  const root = tempRoot(t);
  const target = path.join(root, "target");
  fs.mkdirSync(target);
  fs.mkdirSync(path.join(target, "scripts"));
  fs.writeFileSync(path.join(target, "scripts", "check-harness.mjs"), "throw new Error('must not run')\n");

  const calls = [];
  const deps = { ...runnerDeps(calls), fsOps: fs };
  assert.equal(dispatchOak(["check", "--target", target], deps), 0);
  assert.deepEqual(calls[0].args, [OAK_ENTRYPOINTS.check]);
  assert.equal(calls[0].options.cwd, path.resolve(target));
  assert.notEqual(calls[0].args[0], path.join(target, "scripts", "check-harness.mjs"));

  for (const argv of [
    ["check", "--target"],
    ["check", "--target", target, "--target", target],
    ["check", "--unknown"],
  ]) {
    assert.equal(dispatchOak(argv, { ...runnerDeps(), fsOps: fs }), 2);
  }

  const file = path.join(root, "file");
  fs.writeFileSync(file, "file\n");
  assert.equal(dispatchOak(["check", "--target", file], { ...runnerDeps(), fsOps: fs }), 2);
  assert.equal(dispatchOak(["check", "--target", path.join(root, "missing")], { ...runnerDeps(), fsOps: fs }), 2);

  const symlink = path.join(root, "link");
  fs.symlinkSync(target, symlink);
  assert.equal(dispatchOak(["check", "--target", symlink], { ...runnerDeps(), fsOps: fs }), 2);
});

test("[O007] check dispatch is read-only", (t) => {
  const root = tempRoot(t);
  const target = path.join(root, "target");
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, "canary.txt"), "unchanged\n");
  const before = snapshotTree(target);
  assert.equal(dispatchOak(["check", "--target", target], {
    ...runnerDeps(),
    fsOps: fs,
  }), 0);
  assert.deepEqual(snapshotTree(target), before);
});

test("[O008] replay defaults to packaged static evidence", () => {
  const calls = [];
  const deps = runnerDeps(calls);
  assert.equal(dispatchOak(["replay"], deps), 0);
  assert.deepEqual(calls[0].args, [
    OAK_ENTRYPOINTS.replay,
    "--corpus",
    OAK_REPLAY_DEFAULTS.corpus,
    "--fixtures",
    OAK_REPLAY_DEFAULTS.fixtures,
  ]);
  assert.equal(path.isAbsolute(OAK_REPLAY_DEFAULTS.corpus), true);
  assert.equal(path.isAbsolute(OAK_REPLAY_DEFAULTS.fixtures), true);
});

test("[O009] replay overrides paths and preserves closed exit codes", () => {
  const calls = [];
  const deps = runnerDeps(calls);
  assert.equal(dispatchOak([
    "replay",
    "--output", "result.json",
    "--fixtures", "custom-fixtures.jsonl",
    "--corpus", "custom-corpus.jsonl",
  ], deps), 0);
  assert.deepEqual(calls[0].args, [
    OAK_ENTRYPOINTS.replay,
    "--corpus", "custom-corpus.jsonl",
    "--fixtures", "custom-fixtures.jsonl",
    "--output", "result.json",
  ]);

  for (const status of [0, 1, 2, 3]) {
    assert.equal(dispatchOak(
      ["replay"],
      runnerDeps([], { status, signal: null, error: null }),
    ), status);
  }
  for (const argv of [
    ["replay", "--corpus"],
    ["replay", "--unknown", "x"],
    ["replay", "--corpus", "a", "--corpus", "b"],
    ["benchmark"],
  ]) {
    assert.equal(dispatchOak(argv, runnerDeps()), 2);
  }
});
