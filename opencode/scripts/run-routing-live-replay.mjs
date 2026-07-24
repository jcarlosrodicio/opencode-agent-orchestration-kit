#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";

import { collectExecutionTreeByRoot } from "./collect-session-evidence.mjs";
import {
  evaluateReplay,
  serializeReport,
  validateScenarios,
} from "./replay-routing.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.dirname(scriptDir);
const defaultCorpus = path.join(
  repositoryRoot,
  "docs",
  "ai",
  "evolution",
  "benchmarks",
  "router-scenarios.jsonl",
);
const coverageChannels = [
  "session_events",
  "skill_events",
  "tool_events",
  "review_events",
  "stop_events",
];
const portableRoots = ["AGENTS.md", "agents", "commands", "skills", "tools", "references"];
const excludedNames = new Set([
  ".git",
  ".opencode",
  ".opencode-live",
  "node_modules",
  "artifacts",
  "raw",
  "opencode.json",
  "opencode.jsonc",
]);
const ignoredRawEventTypes = new Set([
  "text",
  "thinking",
  "message.part.updated",
  "step_start",
  "step_finish",
]);
const sessionScopedEventTypes = new Set([
  ...ignoredRawEventTypes,
  "session.completed",
  "skill.selected",
  "tool.completed",
  "review.completed",
  "stop.observed",
]);
const sensitiveWarning =
  "Warning: retained live replay output may contain sensitive prompts, paths, model/provider metadata, or reasoning.\n";

export const runtimeConfig = Object.freeze({
  $schema: "https://opencode.ai/config.json",
  default_agent: "lead",
  share: "disabled",
  permission: Object.freeze({
    read: "allow",
    glob: "allow",
    grep: "allow",
    list: "allow",
    lsp: "allow",
    edit: "ask",
    bash: "ask",
    webfetch: "deny",
    websearch: "deny",
    external_directory: "deny",
  }),
});

export class LiveReplayError extends Error {
  constructor(message) {
    super(message);
    this.name = "LiveReplayError";
  }
}

function requireValue(argv, index, option) {
  const value = argv[index + 1];
  if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) {
    throw new LiveReplayError(`${option} requires a value.`);
  }
  return value;
}

export function parseLiveArguments(argv) {
  const options = {};
  const forbidden = new Set([
    "--model",
    "--provider",
    "--variant",
    "--auto",
    "--attach",
    "--password",
    "--username",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (forbidden.has(option)) {
      throw new LiveReplayError(`${option} is forbidden for live replay.`);
    }
    if (option === "--confirm-live") {
      if (options.confirmLive) throw new LiveReplayError(`${option} was provided twice.`);
      options.confirmLive = true;
      continue;
    }
    if (!["--scenario", "--timeout-ms", "--retain-private-output"].includes(option)) {
      throw new LiveReplayError(`Unknown argument: ${option ?? ""}`);
    }
    const value = requireValue(argv, index, option);
    index += 1;
    const key = option === "--scenario"
      ? "scenarioId"
      : option === "--timeout-ms"
        ? "timeoutMs"
        : "retainPrivateOutput";
    if (Object.hasOwn(options, key)) throw new LiveReplayError(`${option} was provided twice.`);
    options[key] = value;
  }
  if (!options.scenarioId) throw new LiveReplayError("--scenario is required.");
  if (!options.confirmLive) throw new LiveReplayError("--confirm-live is required.");
  if (options.timeoutMs !== undefined) {
    if (!/^[1-9][0-9]*$/.test(options.timeoutMs)) {
      throw new LiveReplayError("--timeout-ms must be a positive integer.");
    }
    options.timeoutMs = Number(options.timeoutMs);
    if (!Number.isSafeInteger(options.timeoutMs)) {
      throw new LiveReplayError("--timeout-ms must be a positive safe integer.");
    }
  }
  if (options.retainPrivateOutput !== undefined
      && !path.isAbsolute(options.retainPrivateOutput)) {
    throw new LiveReplayError("--retain-private-output must be an absolute path.");
  }
  return options;
}

function canonicalPath(candidate) {
  return fs.realpathSync(candidate);
}

function isWithin(candidate, root) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function existingAncestor(candidate) {
  let current = path.resolve(candidate);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) throw new LiveReplayError("Path has no existing ancestor.");
    current = parent;
  }
  return current;
}

function assertNoSymlinkComponents(candidate) {
  const resolved = path.resolve(candidate);
  const ancestor = existingAncestor(resolved);
  let current = path.parse(ancestor).root;
  for (const component of ancestor.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    if (fs.lstatSync(current).isSymbolicLink()) {
      throw new LiveReplayError("Path contains a symbolic link.");
    }
  }
}

function resolveForContainment(candidate) {
  const absolute = path.resolve(candidate);
  const ancestor = existingAncestor(absolute);
  const ancestorReal = canonicalPath(ancestor);
  return path.join(ancestorReal, path.relative(ancestor, absolute));
}

function validateRetainPath(candidate, protectedRoots, { requireEmpty = true } = {}) {
  if (!path.isAbsolute(candidate)) {
    throw new LiveReplayError("Retention path must be absolute.");
  }
  assertNoSymlinkComponents(candidate);
  const resolved = resolveForContainment(candidate);
  for (const protectedRoot of protectedRoots) {
    if (!fs.existsSync(protectedRoot)) continue;
    const protectedResolved = canonicalPath(protectedRoot);
    if (isWithin(resolved, protectedResolved)) {
      throw new LiveReplayError("Retention path overlaps a protected repository.");
    }
  }
  let ancestor = existingAncestor(resolved);
  while (true) {
    if (fs.existsSync(path.join(ancestor, ".git"))) {
      throw new LiveReplayError("Retention path must be outside every Git worktree.");
    }
    const parent = path.dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  if (fs.existsSync(candidate)) {
    const stat = fs.lstatSync(candidate);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new LiveReplayError("Retention path must be a directory without symlinks.");
    }
    if (requireEmpty && fs.readdirSync(candidate).length !== 0) {
      throw new LiveReplayError("Retention directory must be empty.");
    }
  }
  return resolved;
}

function assertSafeTempPath(tempPath, sourceRoot, protectedRoots) {
  if (!fs.existsSync(tempPath)) throw new LiveReplayError("Temporary path does not exist.");
  const stat = fs.lstatSync(tempPath);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new LiveReplayError("Temporary path must be a real directory.");
  }
  const resolved = canonicalPath(tempPath);
  const tempBase = canonicalPath(os.tmpdir());
  if (!isWithin(resolved, tempBase) || resolved === tempBase) {
    throw new LiveReplayError("Temporary path must be a unique child of the system temp directory.");
  }
  if (fs.readdirSync(resolved).length !== 0) {
    throw new LiveReplayError("Temporary path must be newly created and empty.");
  }
  const roots = [sourceRoot, ...protectedRoots];
  for (const protectedRoot of roots) {
    if (!fs.existsSync(protectedRoot)) continue;
    const protectedResolved = canonicalPath(protectedRoot);
    if (isWithin(resolved, protectedResolved) || isWithin(protectedResolved, resolved)) {
      throw new LiveReplayError("Temporary path overlaps a protected repository.");
    }
  }
  return resolved;
}

function copyPortableEntry(source, destination) {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) {
    throw new LiveReplayError("Portable harness source contains a symbolic link.");
  }
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      if (excludedNames.has(entry.name)) continue;
      copyPortableEntry(path.join(source, entry.name), path.join(destination, entry.name));
    }
    return;
  }
  if (!stat.isFile()) {
    throw new LiveReplayError("Portable harness source contains an unsupported entry.");
  }
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
}

function assertContainedPathWithoutSymlinks(sourceRoot, candidate) {
  const sourceAbsolute = path.resolve(sourceRoot);
  const candidateAbsolute = path.resolve(candidate);
  if (!isWithin(candidateAbsolute, sourceAbsolute)) {
    throw new LiveReplayError("Portable source path escapes the source repository.");
  }
  let current = sourceAbsolute;
  for (const component of path.relative(sourceAbsolute, candidateAbsolute).split(path.sep)) {
    if (!component) continue;
    current = path.join(current, component);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new LiveReplayError("Portable harness source contains a symbolic link.");
    }
  }
  const sourceResolved = fs.realpathSync(sourceAbsolute);
  const candidateResolved = fs.realpathSync(candidateAbsolute);
  if (!isWithin(candidateResolved, sourceResolved)) {
    throw new LiveReplayError("Portable source path escapes the source repository.");
  }
}

function runGit(tempRoot, args) {
  const result = spawnSync("git", args, {
    cwd: tempRoot,
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0) {
    throw new LiveReplayError("Unable to initialize disposable Git repository.");
  }
  return result.stdout;
}

function materializeRepository(tempRoot, sourceRoot) {
  for (const name of portableRoots) {
    const source = path.join(sourceRoot, name);
    if (!fs.existsSync(source)) continue;
    copyPortableEntry(source, path.join(tempRoot, name));
  }
  const corpusSource = path.join(
    sourceRoot,
    "docs",
    "ai",
    "evolution",
    "benchmarks",
    "router-scenarios.jsonl",
  );
  assertContainedPathWithoutSymlinks(sourceRoot, corpusSource);
  const corpusDestination = path.join(
    tempRoot,
    "docs",
    "ai",
    "evolution",
    "benchmarks",
    "router-scenarios.jsonl",
  );
  fs.mkdirSync(path.dirname(corpusDestination), { recursive: true, mode: 0o700 });
  copyPortableEntry(corpusSource, corpusDestination);
  fs.writeFileSync(
    path.join(tempRoot, "opencode.json"),
    `${JSON.stringify(runtimeConfig, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  fs.writeFileSync(path.join(tempRoot, ".gitignore"), "/.opencode-live/\n", "utf8");
  runGit(tempRoot, ["init", "--quiet"]);
  runGit(tempRoot, ["add", "."]);
  runGit(tempRoot, [
    "-c",
    "user.name=Routing Replay",
    "-c",
    "user.email=routing-replay.invalid",
    "commit",
    "--quiet",
    "-m",
    "baseline",
  ]);
  if (runGit(tempRoot, ["status", "--porcelain=v1"]).trim() !== "") {
    throw new LiveReplayError("Disposable repository baseline is not clean.");
  }
}

export function spawnProcessWithTimeout(command, args, options) {
  return new Promise((resolve, reject) => {
    const useProcessGroup = process.platform !== "win32";
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      detached: useProcessGroup,
    });
    let settled = false;
    let timedOut = false;
    let terminating = false;
    let terminationError = null;
    let closeResult = null;
    let killTimer;
    let absoluteTimer;
    const stdoutHandler = (chunk) => {
      try {
        options.onStdoutChunk?.(chunk);
      } catch (error) {
        terminateThenReject(error);
      }
    };
    const stderrHandler = (chunk) => {
      try {
        options.onStderrChunk?.(chunk);
      } catch (error) {
        terminateThenReject(error);
      }
    };

    function signalProcess(signal) {
      try {
        if (useProcessGroup && child.pid) {
          process.kill(-child.pid, signal);
        } else {
          child.kill(signal);
        }
      } catch {
        try {
          child.kill(signal);
        } catch {
          // The process already exited.
        }
      }
    }

    function cleanup({ destroyStreams = false } = {}) {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      if (absoluteTimer) clearTimeout(absoluteTimer);
      child.stdout?.off("data", stdoutHandler);
      child.stderr?.off("data", stderrHandler);
      child.removeListener("error", spawnErrorHandler);
      child.removeListener("close", closeHandler);
      if (destroyStreams) {
        child.stdout?.destroy();
        child.stderr?.destroy();
        child.unref();
      }
    }

    function finish(result, { destroyStreams = false } = {}) {
      if (settled) return;
      settled = true;
      cleanup({ destroyStreams });
      resolve(result);
    }

    function rejectAfterTermination() {
      if (settled) return;
      signalProcess("SIGKILL");
      settled = true;
      cleanup({ destroyStreams: true });
      reject(terminationError);
    }

    function scheduleForcedTermination() {
      killTimer = setTimeout(() => {
        signalProcess("SIGKILL");
        if (terminationError) {
          rejectAfterTermination();
          return;
        }
        finish(closeResult ?? {
          exitCode: null,
          timedOut: true,
          cancelled: false,
        }, { destroyStreams: true });
      }, options.killGraceMs ?? 2_000);
      absoluteTimer = setTimeout(() => {
        if (terminationError) {
          rejectAfterTermination();
          return;
        }
        signalProcess("SIGKILL");
        finish(closeResult ?? {
          exitCode: null,
          timedOut: true,
          cancelled: false,
        }, { destroyStreams: true });
      }, (options.killGraceMs ?? 2_000) + (options.absoluteGraceMs ?? 2_000));
    }

    function terminateThenReject(error) {
      if (settled || terminating) return;
      terminating = true;
      terminationError = error;
      clearTimeout(timeout);
      signalProcess("SIGTERM");
      scheduleForcedTermination();
    }

    const timeout = setTimeout(() => {
      if (settled || terminating) return;
      terminating = true;
      timedOut = true;
      signalProcess("SIGTERM");
      scheduleForcedTermination();
    }, options.timeoutMs);

    function spawnErrorHandler(error) {
      if (settled) return;
      if (terminating) return;
      cleanup({ destroyStreams: true });
      settled = true;
      reject(error);
    }

    function closeHandler(exitCode, signal) {
      closeResult = {
        exitCode,
        timedOut,
        cancelled: !timedOut && signal !== null,
      };
      if (terminating) return;
      finish({
        exitCode,
        timedOut,
        cancelled: !timedOut && signal !== null,
      });
    }

    child.stdout.on("data", stdoutHandler);
    child.stderr.on("data", stderrHandler);
    child.on("error", spawnErrorHandler);
    child.on("close", closeHandler);
  });
}

const defaultDeps = {
  spawnProcess: spawnProcessWithTimeout,
  makeTempDir: async () => fs.mkdtempSync(path.join(os.tmpdir(), "routing-live-run-")),
  collectExecutionTreeByRoot,
  readOpenCodeDbPath: async () => path.join(
    os.homedir(),
    ".local",
    "share",
    "opencode",
    "opencode.db",
  ),
  removeTree: async (target) => fs.rmSync(target, { recursive: true, force: true }),
  wait: async (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

async function collectStableTree(deps, dbPath, rootId) {
  let previousSignature = null;
  let previousTree = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    let tree;
    try {
      tree = await deps.collectExecutionTreeByRoot(dbPath, rootId);
    } catch {
      return { tree: null, failed: true };
    }
    const signature = tree === null ? null : JSON.stringify(tree);
    if (tree !== null && signature === previousSignature) {
      return { tree, failed: false };
    }
    previousTree = tree;
    previousSignature = signature;
    if (attempt < 5) await (deps.wait ?? defaultDeps.wait)(250);
  }
  return { tree: previousTree, failed: true };
}

function parseRawLines(stdout) {
  const records = [];
  let malformed = false;
  for (const line of stdout.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const value = JSON.parse(line);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        records.push(value);
      } else {
        malformed = true;
      }
    } catch {
      malformed = true;
    }
  }
  return { records, malformed };
}

function explicitRootIds(records) {
  const explicitIds = [];
  const fallbackIds = [];
  for (const record of records) {
    if (record.type === "session.created"
        && record.properties?.info?.parentID === null
        && typeof record.properties.info.id === "string") {
      if (!explicitIds.includes(record.properties.info.id)) {
        explicitIds.push(record.properties.info.id);
      }
    } else if (record.type === "step_start" && typeof record.sessionID === "string"
        && !fallbackIds.includes(record.sessionID)) {
      fallbackIds.push(record.sessionID);
    }
  }
  return explicitIds.length > 0 ? explicitIds : fallbackIds;
}

function sessionRows(tree) {
  if (!tree) return { rows: [], incomplete: true };
  const root = tree.root_session;
  if (!root
      || typeof root.session_id !== "string"
      || root.session_id.length === 0
      || root.parent_session_id !== null
      || typeof root.agent !== "string"
      || root.agent.length === 0
      || tree.root_session_id !== root.session_id) {
    return { rows: [], incomplete: true };
  }
  const ordered = [root];
  const known = new Set([root.session_id]);
  const pending = [...(tree.child_sessions ?? [])];
  const childIdCounts = new Map();
  for (const row of pending) {
    if (typeof row?.session_id !== "string" || !row.session_id) continue;
    childIdCounts.set(row.session_id, (childIdCounts.get(row.session_id) ?? 0) + 1);
  }
  let incomplete = false;
  for (let index = pending.length - 1; index >= 0; index -= 1) {
    const row = pending[index];
    if (!row
        || typeof row.session_id !== "string"
        || !row.session_id
        || typeof row.parent_session_id !== "string"
        || !row.parent_session_id
        || typeof row.agent !== "string"
        || !row.agent
        || row.session_id === root.session_id
        || childIdCounts.get(row.session_id) !== 1) {
      pending.splice(index, 1);
      incomplete = true;
    }
  }
  while (pending.length > 0) {
    const nextIndex = pending.findIndex((row) => known.has(row.parent_session_id));
    if (nextIndex === -1) {
      incomplete = true;
      break;
    }
    const [next] = pending.splice(nextIndex, 1);
    ordered.push(next);
    known.add(next.session_id);
  }
  return { rows: ordered, incomplete };
}

function normalizedObservation({
  scenario,
  records,
  malformed,
  tree,
  rootError,
  processResult,
  gitSnapshot,
}) {
  const events = [];
  const coverage = Object.fromEntries(coverageChannels.map((channel) => [channel, "partial"]));
  const normalizedTree = sessionRows(tree);
  const rows = normalizedTree.rows;
  const idMap = new Map();
  const rowsById = new Map();
  for (const [index, row] of rows.entries()) {
    idMap.set(row.session_id, `session-${index + 1}`);
    rowsById.set(row.session_id, row);
  }
  let sequence = 1;
  const seenSessionIds = new Set();
  let sessionCaptureIncomplete = rows.length === 0 || normalizedTree.incomplete;
  for (const row of rows) {
    const agent = typeof row.agent === "string" && row.agent.length > 0
      ? row.agent
      : "unknown-agent";
    if (typeof row.session_id !== "string" || row.session_id.length === 0
        || (row.parent_session_id !== null && !seenSessionIds.has(row.parent_session_id))
        || agent === "unknown-agent") {
      sessionCaptureIncomplete = true;
    }
    events.push({
      sequence: sequence++,
      type: "session_started",
      session_id: idMap.get(row.session_id),
      parent_session_id: row.parent_session_id === null
        ? null
        : idMap.get(row.parent_session_id),
      agent,
    });
    seenSessionIds.add(row.session_id);
  }
  if (tree && !sessionCaptureIncomplete) coverage.session_events = "complete";

  const degradedChannels = new Set();
  const explicitRunErrors = [];
  if (malformed) {
    for (const channel of coverageChannels.filter((name) => name !== "session_events")) {
      degradedChannels.add(channel);
    }
  }
  for (const record of records) {
    const properties = record.properties ?? {};
    const scopedSessionId = properties.sessionID ?? record.sessionID;
    const mappedSession = idMap.get(scopedSessionId);
    if (record.type === "session.created") {
      const info = properties.info;
      const row = typeof info?.id === "string" ? rowsById.get(info.id) : undefined;
      if (!row
          || row.parent_session_id !== info.parentID
          || row.agent !== info.agent) {
        sessionCaptureIncomplete = true;
      }
      continue;
    }
    if (scopedSessionId !== undefined
        && sessionScopedEventTypes.has(record.type)
        && !mappedSession) {
      sessionCaptureIncomplete = true;
    }
    if (ignoredRawEventTypes.has(record.type)) continue;
    if (record.type === "capture.complete"
        && Array.isArray(properties.channels)
        && properties.channels.every(
          (channel) => coverageChannels.includes(channel) && channel !== "session_events",
        )) {
      for (const channel of properties.channels) coverage[channel] = "complete";
    } else if (record.type === "run.error") {
      const code = typeof properties.code === "string"
          && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(properties.code)
        ? properties.code
        : "runtime-error";
      explicitRunErrors.push(code);
    } else if (record.type === "session.completed") {
      const row = rowsById.get(scopedSessionId);
      if (mappedSession && row) {
        events.push({
          sequence: sequence++,
          type: "session_completed",
          session_id: mappedSession,
          agent: typeof row.agent === "string" && row.agent ? row.agent : "unknown-agent",
        });
      } else {
        sessionCaptureIncomplete = true;
      }
    } else if (record.type === "skill.selected") {
      const row = rowsById.get(scopedSessionId);
      if (mappedSession && row && typeof properties.skill === "string" && properties.skill) {
        events.push({
          sequence: sequence++,
          type: "skill_selected",
          session_id: mappedSession,
          agent: row.agent,
          skill: properties.skill,
        });
      } else {
        degradedChannels.add("skill_events");
      }
    } else if (record.type === "tool.completed") {
      const row = rowsById.get(scopedSessionId);
      if (mappedSession && row && typeof properties.tool === "string" && properties.tool) {
        events.push({
          sequence: sequence++,
          type: "tool_call_completed",
          session_id: mappedSession,
          agent: row.agent,
          tool: properties.tool,
          mutation: ["read", "write", "unknown"].includes(properties.mutation)
            ? properties.mutation
            : "unknown",
        });
      } else {
        degradedChannels.add("tool_events");
      }
    } else if (record.type === "review.completed") {
      const row = rowsById.get(scopedSessionId);
      if (mappedSession && row?.agent === "reviewer"
          && ["approved", "changes-requested", "blocked"].includes(properties.verdict)) {
        events.push({
          sequence: sequence++,
          type: "review_completed",
          session_id: mappedSession,
          agent: "reviewer",
          verdict: properties.verdict,
        });
      } else {
        degradedChannels.add("review_events");
      }
    } else if (record.type === "stop.observed") {
      if ((scopedSessionId === undefined || mappedSession)
          && typeof properties.condition === "string"
          && properties.condition) {
        events.push({
          sequence: sequence++,
          type: "stop_observed",
          condition: properties.condition,
        });
      } else {
        degradedChannels.add("stop_events");
      }
    } else {
      const prefix = typeof record.type === "string" ? record.type.split(".")[0] : "";
      const classified = {
        skill: "skill_events",
        tool: "tool_events",
        review: "review_events",
        stop: "stop_events",
      }[prefix];
      if (classified) {
        degradedChannels.add(classified);
      } else {
        for (const channel of coverageChannels.filter((name) => name !== "session_events")) {
          degradedChannels.add(channel);
        }
      }
    }
  }

  for (const channel of degradedChannels) coverage[channel] = "partial";
  if (sessionCaptureIncomplete) coverage.session_events = "partial";
  const errorCodes = [];
  if (rootError) errorCodes.push(rootError);
  if (sessionCaptureIncomplete && !rootError) errorCodes.push("capture-incomplete");
  if (degradedChannels.size > 0) errorCodes.push("unknown-live-event");
  errorCodes.push(...explicitRunErrors);
  if (processResult.timedOut) errorCodes.push("timeout");
  else if (processResult.cancelled) errorCodes.push("cancelled");
  else if (processResult.exitCode !== 0) errorCodes.push("opencode-exit");
  for (const code of errorCodes) {
    events.push({ sequence: sequence++, type: "run_error", code });
  }

  if (events.length === 0 || events[0].type !== "session_started") {
    events.unshift({
      sequence: 1,
      type: "session_started",
      session_id: "session-1",
      parent_session_id: null,
      agent: "unknown-agent",
    });
    for (let index = 1; index < events.length; index += 1) {
      events[index].sequence = index + 1;
    }
  }
  return {
    schema_version: 1,
    scenario_id: scenario.id,
    observation_coverage: coverage,
    git_snapshot: gitSnapshot,
    events,
  };
}

function writeAll(descriptor, chunk) {
  const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  let offset = 0;
  while (offset < buffer.length) {
    offset += fs.writeSync(descriptor, buffer, offset, buffer.length - offset);
  }
}

function openExclusiveRegular(file, { readable = false } = {}) {
  let descriptor;
  try {
    descriptor = fs.openSync(
      file,
      (readable ? fs.constants.O_RDWR : fs.constants.O_WRONLY)
        | fs.constants.O_CREAT
        | fs.constants.O_EXCL
        | (fs.constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile()) throw new LiveReplayError("Raw output must be a regular file.");
    fs.fchmodSync(descriptor, 0o600);
    return descriptor;
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (error instanceof LiveReplayError) throw error;
    throw new LiveReplayError("Unable to create a secure output file.");
  }
}

function createCaptureSink(descriptor, limitBytes) {
  const decoder = new StringDecoder("utf8");
  let captured = "";
  let capturedBytes = 0;
  let truncated = false;
  return {
    write(chunk) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      writeAll(descriptor, buffer);
      const remaining = Math.max(0, limitBytes - capturedBytes);
      if (remaining > 0) {
        const selected = buffer.subarray(0, remaining);
        captured += decoder.write(selected);
        capturedBytes += selected.length;
      }
      if (buffer.length > remaining) truncated = true;
    },
    finish() {
      captured += decoder.end();
      return { text: captured, truncated };
    },
  };
}

function assertRegularContainedFile(file, directory, expectedIdentity) {
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new LiveReplayError("Raw output path is not a regular file.");
  }
  if (expectedIdentity
      && (stat.dev !== expectedIdentity.dev || stat.ino !== expectedIdentity.ino)) {
    throw new LiveReplayError("Raw output file identity changed.");
  }
  if (!isWithin(fs.realpathSync(file), fs.realpathSync(directory))) {
    throw new LiveReplayError("Raw output path escaped its private directory.");
  }
}

function copyDescriptorSecure(sourceDescriptor, destination) {
  let destinationDescriptor;
  try {
    if (!fs.fstatSync(sourceDescriptor).isFile()) {
      throw new LiveReplayError("Retained source must be a regular file.");
    }
    destinationDescriptor = openExclusiveRegular(destination);
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let bytesRead;
    let position = 0;
    do {
      bytesRead = fs.readSync(sourceDescriptor, buffer, 0, buffer.length, position);
      if (bytesRead > 0) {
        writeAll(destinationDescriptor, buffer.subarray(0, bytesRead));
        position += bytesRead;
      }
    } while (bytesRead > 0);
    fs.fchmodSync(destinationDescriptor, 0o600);
  } catch (error) {
    if (error instanceof LiveReplayError) throw error;
    throw new LiveReplayError("Unable to retain private output securely.");
  } finally {
    if (destinationDescriptor !== undefined) fs.closeSync(destinationDescriptor);
  }
}

function assertRetentionDirectoryIdentity(destination, expectedResolved) {
  assertNoSymlinkComponents(destination);
  const stat = fs.lstatSync(destination);
  if (stat.isSymbolicLink() || !stat.isDirectory()
      || fs.realpathSync(destination) !== expectedResolved) {
    throw new LiveReplayError("Retention directory identity changed.");
  }
}

function retainPrivateOutput(destination, rawDescriptors) {
  if (!fs.existsSync(destination)) fs.mkdirSync(destination, { mode: 0o700 });
  const expectedResolved = fs.realpathSync(destination);
  assertRetentionDirectoryIdentity(destination, expectedResolved);
  let directoryDescriptor;
  try {
    directoryDescriptor = fs.openSync(
      destination,
      fs.constants.O_RDONLY
        | (fs.constants.O_DIRECTORY ?? 0)
        | (fs.constants.O_NOFOLLOW ?? 0),
    );
    if (!fs.fstatSync(directoryDescriptor).isDirectory()) {
      throw new LiveReplayError("Retention destination must remain a directory.");
    }
    fs.fchmodSync(directoryDescriptor, 0o700);
    copyDescriptorSecure(rawDescriptors.stdout, path.join(destination, "stdout.jsonl"));
    copyDescriptorSecure(rawDescriptors.stderr, path.join(destination, "stderr.log"));
    assertRetentionDirectoryIdentity(destination, expectedResolved);
  } finally {
    if (directoryDescriptor !== undefined) fs.closeSync(directoryDescriptor);
  }
}

function addLimitation(report, code) {
  for (const result of report.scenario_results) {
    if (!result.limitations.some((row) => row.code === code)) {
      result.limitations.push({
        code,
        channels: [],
      });
    }
  }
}

function addCleanupFailure(report) {
  report.operational_status = "cleanup-failed";
  addLimitation(report, "cleanup-failed");
}

function exitCodeForReport(report) {
  if (report.operational_status !== "ok") return 2;
  if (report.status === "pass") return 0;
  if (report.status === "fail") return 1;
  return 3;
}

function buildCommand(scenario, tempRoot) {
  const args = ["run", "--format", "json", "--thinking"];
  if (scenario.command_path !== "freeform") {
    args.push("--command", scenario.command_path.replace(/^\//, ""));
  } else if (scenario.expected_root_agent !== "lead") {
    throw new LiveReplayError("Freeform live replay requires lead as the expected root.");
  }
  args.push("--dir", tempRoot, scenario.prompt);
  return args;
}

export async function runLiveReplay(options, deps = defaultDeps) {
  let tempRoot;
  let report;
  let observation;
  let postEvaluationFailure = false;
  const rawDescriptors = {
    stdout: undefined,
    stderr: undefined,
  };
  try {
    if (!options || typeof options !== "object") throw new LiveReplayError("Options are required.");
    if (!options.scenarioId) throw new LiveReplayError("--scenario is required.");
    if (!options.confirmLive) throw new LiveReplayError("--confirm-live is required.");
    const timeoutMs = options.timeoutMs ?? 120_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
      throw new LiveReplayError("timeoutMs must be a positive integer.");
    }
    const scenarios = options.scenarios ?? [];
    try {
      validateScenarios(scenarios, { file: "live-corpus" });
    } catch {
      throw new LiveReplayError("Live replay corpus is invalid.");
    }
    const scenario = scenarios.find((row) => row.id === options.scenarioId);
    if (!scenario) throw new LiveReplayError("Unknown live replay scenario.");
    const sourceRoot = path.resolve(options.sourceRoot ?? repositoryRoot);
    const protectedRoots = [sourceRoot, ...(options.protectedRoots ?? [])];
    let retainDestination;
    if (options.retainPrivateOutput !== undefined) {
      retainDestination = validateRetainPath(options.retainPrivateOutput, protectedRoots);
    }

    const tempCandidate = await deps.makeTempDir();
    tempRoot = assertSafeTempPath(tempCandidate, sourceRoot, protectedRoots);
    materializeRepository(tempRoot, sourceRoot);
    const initialStatus = runGit(tempRoot, ["status", "--porcelain=v1"]);
    if (initialStatus.trim() !== "") {
      throw new LiveReplayError("Disposable repository is not clean before launch.");
    }

    const args = buildCommand(scenario, tempRoot);
    const rawDir = path.join(tempRoot, ".opencode-live");
    fs.mkdirSync(rawDir, { mode: 0o700 });
    const rawFiles = {
      stdout: path.join(rawDir, "stdout.jsonl"),
      stderr: path.join(rawDir, "stderr.log"),
    };
    let rawIdentities;
    let stdoutCapture;
    let stderrCapture;
    let processResult;
    try {
      rawDescriptors.stdout = openExclusiveRegular(rawFiles.stdout, { readable: true });
      rawDescriptors.stderr = openExclusiveRegular(rawFiles.stderr, { readable: true });
      rawIdentities = {
        stdout: fs.fstatSync(rawDescriptors.stdout),
        stderr: fs.fstatSync(rawDescriptors.stderr),
      };
      const captureLimitBytes = options.captureLimitBytes ?? 1024 * 1024;
      if (!Number.isSafeInteger(captureLimitBytes) || captureLimitBytes <= 0) {
        throw new LiveReplayError("captureLimitBytes must be a positive integer.");
      }
      stdoutCapture = createCaptureSink(rawDescriptors.stdout, captureLimitBytes);
      stderrCapture = createCaptureSink(
        rawDescriptors.stderr,
        Math.min(captureLimitBytes, 64 * 1024),
      );
      processResult = await deps.spawnProcess(
        options.executable ?? "opencode",
        args,
        {
          cwd: tempRoot,
          shell: false,
          timeoutMs,
          onStdoutChunk: (chunk) => stdoutCapture.write(chunk),
          onStderrChunk: (chunk) => stderrCapture.write(chunk),
        },
      );
      if (processResult.stdout !== undefined) stdoutCapture.write(processResult.stdout);
      if (processResult.stderr !== undefined) stderrCapture.write(processResult.stderr);
    } catch (error) {
      if (error instanceof LiveReplayError) throw error;
      throw new LiveReplayError("Unable to launch OpenCode.");
    }
    const rawStat = fs.lstatSync(rawDir);
    if (rawStat.isSymbolicLink() || !rawStat.isDirectory()
        || !isWithin(fs.realpathSync(rawDir), tempRoot)) {
      throw new LiveReplayError("Raw capture directory escaped the disposable repository.");
    }
    assertRegularContainedFile(rawFiles.stdout, rawDir, rawIdentities.stdout);
    assertRegularContainedFile(rawFiles.stderr, rawDir, rawIdentities.stderr);
    const stdoutResult = stdoutCapture.finish();
    stderrCapture.finish();
    processResult = {
      ...processResult,
      stdout: stdoutResult.text,
      captureTruncated: stdoutResult.truncated,
    };

    const parsed = parseRawLines(processResult.stdout);
    const roots = explicitRootIds(parsed.records);
    let tree = null;
    let rootError = processResult.captureTruncated ? "capture-incomplete" : null;
    if (roots.length === 1) {
      try {
        const dbPath = await deps.readOpenCodeDbPath();
        const collected = await collectStableTree(deps, dbPath, roots[0]);
        tree = collected.tree;
        if (!tree || collected.failed) rootError = "capture-incomplete";
      } catch {
        rootError = "capture-incomplete";
      }
    } else {
      if (!rootError) {
        rootError = roots.length === 0 ? "root-session-unresolved" : "capture-incomplete";
      }
    }
    const finalStatus = runGit(tempRoot, ["status", "--porcelain=v1"]);
    const gitSnapshot = finalStatus.trim() === "" ? "clean" : "changed";
    observation = normalizedObservation({
      scenario,
      records: parsed.records,
      malformed: parsed.malformed,
      tree,
      rootError,
      processResult,
      gitSnapshot,
    });
    report = evaluateReplay({
      scenarios: [scenario],
      observations: [observation],
      mode: "live",
    });

    if (retainDestination) {
      const checkedDestination = validateRetainPath(
        retainDestination,
        protectedRoots,
        { requireEmpty: false },
      );
      retainPrivateOutput(checkedDestination, rawDescriptors);
      (options.writeStderr ?? ((text) => process.stderr.write(text)))(sensitiveWarning);
    }
  } catch (error) {
    if (!report) {
      return {
        exitCode: 2,
        error: error instanceof LiveReplayError ? error.message : "Live replay runtime error.",
      };
    }
    postEvaluationFailure = true;
    addLimitation(report, "retention-failed");
  } finally {
    if (rawDescriptors.stdout !== undefined) fs.closeSync(rawDescriptors.stdout);
    if (rawDescriptors.stderr !== undefined) fs.closeSync(rawDescriptors.stderr);
    if (tempRoot) {
      try {
        await deps.removeTree(tempRoot);
      } catch {
        if (report) addCleanupFailure(report);
      }
    }
  }
  return {
    exitCode: postEvaluationFailure ? 2 : exitCodeForReport(report),
    report,
    observation,
  };
}

function loadScenarios(file) {
  const contents = fs.readFileSync(file, "utf8").trim();
  return contents ? contents.split("\n").map((line) => JSON.parse(line)) : [];
}

async function main() {
  try {
    const options = parseLiveArguments(process.argv.slice(2));
    const result = await runLiveReplay({
      ...options,
      sourceRoot: repositoryRoot,
      scenarios: loadScenarios(defaultCorpus),
      protectedRoots: [repositoryRoot],
    });
    if (result.report) process.stdout.write(serializeReport(result.report));
    if (result.error) process.stderr.write(`LiveReplayError: ${result.error}\n`);
    process.exitCode = result.exitCode;
  } catch (error) {
    const message = error instanceof LiveReplayError
      ? error.message
      : "Live replay input error.";
    process.stderr.write(`LiveReplayError: ${message}\n`);
    process.exitCode = 2;
  }
}

const entryPath = process.argv[1] === undefined ? null : fs.realpathSync(process.argv[1]);
if (entryPath === fs.realpathSync(fileURLToPath(import.meta.url))) {
  await main();
}
