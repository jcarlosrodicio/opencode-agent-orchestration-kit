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
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isEntrypoint) process.exitCode = dispatchOak(process.argv.slice(2));
