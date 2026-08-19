import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  OAK_COMMANDS,
  OAK_ENTRYPOINTS,
  OAK_REPLAY_DEFAULTS,
  dispatchOak,
  resolveCheckTarget,
} from "./oak.mjs";

const REPOSITORY_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

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
    "state",
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

test("[O010] state delegates only an explicit loop-state command and root", () => {
  const calls = [];
  const deps = runnerDeps(calls);
  const args = [
    "state",
    "init",
    "--root",
    "/tmp/oak-target",
    "--slug",
    "example",
    "--contract",
    ".opencode/loops/example.md",
    "--git-baseline",
    "abc123",
    "--session-id",
    "session-1",
    "--action-id",
    "approve-1",
    "--planned-iterations",
    "3",
  ];

  assert.equal(dispatchOak(args, deps), 0);
  assert.deepEqual(calls[0].args, [OAK_ENTRYPOINTS.state, ...args.slice(1)]);
  assert.equal(calls[0].options.cwd, "/tmp/oak-target");
  assert.equal(calls[0].options.shell, false);

  for (const argv of [
    ["state"],
    ["state", "unknown", "--root", "/tmp/oak-target"],
    ["state", "attest-review", "--root", "/tmp/oak-target"],
    ["state", "init", "--slug", "example"],
    ["state", "init", "--root", "/tmp/oak-target", "--root", "/tmp/other"],
    ["state", "init", "--root"],
  ]) {
    assert.equal(dispatchOak(argv, runnerDeps()), 2);
  }
});

test("[O011] symlinked oak executable runs its CLI", (t) => {
  const root = tempRoot(t);
  const executable = path.join(root, "oak");
  fs.symlinkSync(path.join(REPOSITORY_ROOT, "scripts", "oak.mjs"), executable);

  const result = spawnSync(executable, ["state", "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^Usage: oak state /);
  assert.equal(result.stderr, "");
});

test("[O012] package exposes the executable oak and oc-switch binaries", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(REPOSITORY_ROOT, "package.json"), "utf8"),
  );
  assert.deepEqual(packageJson.bin, {
    oak: "scripts/oak.mjs",
    "oc-switch": "scripts/oc-switch.mjs",
  });
  const stat = fs.lstatSync(path.join(REPOSITORY_ROOT, packageJson.bin.oak));
  assert.equal(stat.isFile(), true);
  assert.equal(stat.isSymbolicLink(), false);
  assert.notEqual(stat.mode & 0o111, 0);
  const switchStat = fs.lstatSync(path.join(REPOSITORY_ROOT, packageJson.bin["oc-switch"]));
  assert.equal(switchStat.isFile(), true);
  assert.equal(switchStat.isSymbolicLink(), false);
  assert.notEqual(switchStat.mode & 0o111, 0);
});
