#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { resolveTarget } from "./manage-installation.mjs";

export const OAK_COMMANDS = [
  "install",
  "upgrade",
  "doctor",
  "check",
  "replay",
  "state",
  "uninstall",
  "rollback",
  "version",
];

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.dirname(path.dirname(SCRIPT_PATH));

export const OAK_ENTRYPOINTS = Object.freeze({
  manager: path.join(REPOSITORY_ROOT, "scripts", "manage-installation.mjs"),
  version: path.join(REPOSITORY_ROOT, "scripts", "version.mjs"),
  check: path.join(REPOSITORY_ROOT, "opencode", "scripts", "check-harness.mjs"),
  replay: path.join(REPOSITORY_ROOT, "opencode", "scripts", "replay-routing.mjs"),
  state: path.join(REPOSITORY_ROOT, "opencode", "scripts", "loop-state.mjs"),
});

export const OAK_REPLAY_DEFAULTS = Object.freeze({
  corpus: path.join(
    REPOSITORY_ROOT,
    "opencode",
    "docs",
    "ai",
    "evolution",
    "benchmarks",
    "router-scenarios.jsonl",
  ),
  fixtures: path.join(
    REPOSITORY_ROOT,
    "opencode",
    "docs",
    "ai",
    "evolution",
    "benchmarks",
    "replay-fixtures.jsonl",
  ),
});

const HELP = {
  install: "Usage: oak install [--dry-run] [--force] [--target PATH]",
  upgrade: "Usage: oak upgrade [--dry-run] [--target PATH]",
  doctor: "Usage: oak doctor [--accept-preserved PATH] [--target PATH]",
  check: "Usage: oak check [--target PATH]",
  replay: "Usage: oak replay [--corpus PATH] [--fixtures PATH] [--output PATH]",
  state: "Usage: oak state <init|resume|record|release|inspect|attest-review|repair|migrate> --root PATH [options]",
  uninstall: "Usage: oak uninstall [--dry-run] [--yes] [--target PATH]",
  rollback: "Usage: oak rollback [--dry-run] [--target PATH]",
  version: "Usage: oak version",
};
const LIFECYCLE_COMMANDS = new Set([
  "install",
  "upgrade",
  "doctor",
  "uninstall",
  "rollback",
]);

export function renderOakHelp(command) {
  if (command) return `${HELP[command]}\n`;
  return `Usage: oak <command> [options]

Commands:
${OAK_COMMANDS.map((name) => `  ${name}`).join("\n")}
`;
}

function runNode(entrypoint, args, options, runtime) {
  const result = runtime.run(process.execPath, [entrypoint, ...args], {
    cwd: options.cwd,
    env: options.env,
    stdio: "inherit",
    shell: false,
  });
  if (result?.error || result?.signal || !Number.isInteger(result?.status)) {
    runtime.stderr.write(`oak: unable to run ${options.label}\n`);
    return 2;
  }
  return result.status;
}

function invalid(stderr, message) {
  stderr.write(`oak: ${message}\n`);
  return 2;
}

export function resolveCheckTarget(options, env = process.env) {
  return resolveTarget(options, env);
}

function dispatchCheck(args, runtime) {
  let target;
  if (args.length === 0) {
    target = undefined;
  } else if (args.length === 2 && args[0] === "--target" && args[1] && !args[1].startsWith("--")) {
    target = args[1];
  } else {
    return invalid(runtime.stderr, "invalid check arguments");
  }
  let absoluteTarget;
  let stat;
  try {
    absoluteTarget = path.resolve(resolveCheckTarget({ target }, runtime.env));
    stat = runtime.fsOps.lstatSync(absoluteTarget);
  } catch {
    return invalid(runtime.stderr, "check target is unavailable");
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    return invalid(runtime.stderr, "check target must be a non-symlink directory");
  }
  return runNode(
    OAK_ENTRYPOINTS.check,
    [],
    { cwd: absoluteTarget, env: runtime.env, label: "check" },
    runtime,
  );
}

function dispatchReplay(args, runtime) {
  const values = new Map();
  const allowed = new Set(["--corpus", "--fixtures", "--output"]);
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!allowed.has(flag) || values.has(flag) || !value || value.startsWith("--")) {
      return invalid(runtime.stderr, "invalid replay arguments");
    }
    values.set(flag, value);
  }
  const replayArgs = [
    "--corpus",
    values.get("--corpus") ?? OAK_REPLAY_DEFAULTS.corpus,
    "--fixtures",
    values.get("--fixtures") ?? OAK_REPLAY_DEFAULTS.fixtures,
  ];
  if (values.has("--output")) replayArgs.push("--output", values.get("--output"));
  return runNode(
    OAK_ENTRYPOINTS.replay,
    replayArgs,
    { cwd: runtime.cwd, env: runtime.env, label: "replay" },
    runtime,
  );
}

function dispatchState(args, runtime) {
  const [action, ...options] = args;
  const actions = new Set(["init", "resume", "record", "release", "inspect", "attest-review", "repair", "migrate"]);
  const valueFlags = new Set([
    "--root",
    "--slug",
    "--contract",
    "--git-baseline",
    "--session-id",
    "--action-id",
    "--iteration",
    "--completed-step",
    "--blocking-cause",
    "--status",
    "--approval-status",
    "--reviewer-session-id",
    "--reviewer-agent",
    "--reviewer-verdict",
  ]);
  const booleanFlags = new Set(["--release-lock", "--truncate-tail"]);
  if (!actions.has(action)) return invalid(runtime.stderr, "invalid state action");

  let root;
  for (let index = 0; index < options.length; index += 1) {
    const flag = options[index];
    if (booleanFlags.has(flag)) continue;
    if (!valueFlags.has(flag)) return invalid(runtime.stderr, "invalid state arguments");
    const value = options[index + 1];
    if (!value || value.startsWith("--")) return invalid(runtime.stderr, "invalid state arguments");
    if (flag === "--root") {
      if (root !== undefined) return invalid(runtime.stderr, "invalid state arguments");
      root = value;
    }
    index += 1;
  }
  if (root === undefined) return invalid(runtime.stderr, "state requires --root PATH");
  return runNode(
    OAK_ENTRYPOINTS.state,
    args,
    { cwd: path.resolve(root), env: runtime.env, label: "state" },
    runtime,
  );
}

export function dispatchOak(argv, deps = {}) {
  const runtime = {
    run: deps.run ?? spawnSync,
    stdout: deps.stdout ?? process.stdout,
    stderr: deps.stderr ?? process.stderr,
    env: deps.env ?? process.env,
    cwd: deps.cwd ?? process.cwd(),
    fsOps: deps.fsOps ?? fs,
  };

  if (argv.length === 1 && ["--help", "help"].includes(argv[0])) {
    runtime.stdout.write(renderOakHelp());
    return 0;
  }
  if (argv.length === 1 && ["--version", "version"].includes(argv[0])) {
    return runNode(
      OAK_ENTRYPOINTS.version,
      [],
      { cwd: runtime.cwd, env: runtime.env, label: "version" },
      runtime,
    );
  }
  const [command, ...rest] = argv;
  if (!OAK_COMMANDS.includes(command)) return invalid(runtime.stderr, "unknown or missing command");
  if (rest.length === 1 && rest[0] === "--help") {
    runtime.stdout.write(renderOakHelp(command));
    return 0;
  }
  if (command === "version") return invalid(runtime.stderr, "version accepts no arguments");
  if (command === "check") return dispatchCheck(rest, runtime);
  if (command === "replay") return dispatchReplay(rest, runtime);
  if (command === "state") return dispatchState(rest, runtime);
  if (LIFECYCLE_COMMANDS.has(command)) {
    return runNode(
      OAK_ENTRYPOINTS.manager,
      [command, ...rest],
      { cwd: runtime.cwd, env: runtime.env, label: command },
      runtime,
    );
  }
  return invalid(runtime.stderr, `${command} is not implemented`);
}

const isEntrypoint = process.argv[1]
  && fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1]);
if (isEntrypoint) process.exitCode = dispatchOak(process.argv.slice(2));
