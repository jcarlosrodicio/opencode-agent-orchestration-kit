#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RUN_EVENT_TYPES = Object.freeze(["agent_session", "review", "runtime_verification", "verify", "delivery", "ci"]);
const SLUG = /^[A-Za-z0-9._-]{1,120}$/;
const KEY = /^[a-z][a-z0-9_]{0,40}$/;
// Events carry counts and symbolic values only: ids, enums, branch names.
const INTEGER = /^-?\d+$/;
const VALUE = /^(?:|[A-Za-z0-9][A-Za-z0-9._:/+-]{0,199})$/;
const KINDS = new Set(["production", "benchmark"]);
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

export class TaskRunError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TaskRunError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new TaskRunError(code, message);
}

function paths(root) {
  const resolved = fs.realpathSync(path.resolve(root));
  const dir = path.join(resolved, ".opencode", "runs");
  for (const candidate of [path.join(resolved, ".opencode"), dir]) {
    if (fs.existsSync(candidate) && (fs.lstatSync(candidate).isSymbolicLink() || !fs.lstatSync(candidate).isDirectory())) {
      fail("unsafe_path", `${path.relative(resolved, candidate)} must be a real directory`);
    }
  }
  return { root: resolved, dir, run: path.join(dir, "active.json"), events: path.join(dir, "active.events.jsonl") };
}

// lstat, not exists: a dangling symlink must be refused, not written through.
function requireRegularFile(file) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (stat && !stat.isFile()) fail("unsafe_path", `${path.basename(file)} must be a regular file`);
  return stat !== undefined;
}

function readRun(p) {
  requireRegularFile(p.events);
  if (!requireRegularFile(p.run)) return null;
  try {
    return JSON.parse(fs.readFileSync(p.run, "utf8"));
  } catch {
    fail("run_corrupt", ".opencode/runs/active.json is not valid JSON; a human must inspect and remove it");
  }
}

function readEvents(p) {
  if (!fs.existsSync(p.events)) return [];
  const lines = fs.readFileSync(p.events, "utf8").split("\n").filter(Boolean);
  try {
    return lines.map((line) => JSON.parse(line));
  } catch {
    fail("run_corrupt", ".opencode/runs/active.events.jsonl is not valid JSON lines");
  }
}

// The summary is written inside the root, never through a symlink that leaves
// it, and never into git's own directory.
function safeOutput(root, output) {
  const target = path.resolve(root, output);
  const relative = path.relative(root, target);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative) || relative.split(path.sep).includes(".git")) {
    fail("unsafe_path", "output must stay inside the root and outside .git");
  }
  let existing = path.dirname(target);
  while (!fs.existsSync(existing)) existing = path.dirname(existing);
  const realExisting = path.relative(root, fs.realpathSync(existing));
  if (realExisting.startsWith("..") || path.isAbsolute(realExisting) || realExisting.split(path.sep).includes(".git")) {
    fail("unsafe_path", "output must stay inside the root and outside .git");
  }
  requireRegularFile(target);
  return { target, relative };
}

function stamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function clean(value) {
  // Strip control characters so each event stays on one line.
  return String(value).replace(/[\u0000-\u001f\u007f]/g, "");
}

export function startRun({ root, slug, branch, kind = "production", now = () => new Date(), random = () => crypto.randomBytes(4) }) {
  if (typeof slug !== "string" || !SLUG.test(slug)) fail("invalid_argument", "slug must match [A-Za-z0-9._-]");
  if (!KINDS.has(kind)) fail("invalid_argument", "kind must be production or benchmark");
  if (typeof branch !== "string" || branch.length === 0) fail("invalid_argument", "branch is required");
  const p = paths(root);
  const existing = readRun(p);
  if (existing) {
    if (existing.branch === branch && existing.change === slug) return existing;
    if (existing.branch === branch) fail("run_open_for_other_change", `a run for change ${existing.change} is open on this branch; close it first`);
    fail("run_open_on_other_branch", `a run for branch ${existing.branch} is open; close it first`);
  }
  const date = now();
  const run = {
    schema: "oak.run/1",
    run_id: `oak_${stamp(date)}_${Buffer.from(random()).toString("hex").slice(0, 8)}`,
    kind,
    change: slug,
    branch,
    repo: path.basename(p.root),
    started_at: date.toISOString(),
  };
  fs.mkdirSync(p.dir, { recursive: true });
  // The run context is local state: keep it out of git in any repository.
  const ignore = path.join(p.dir, ".gitignore");
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, "*\n");
  fs.writeFileSync(p.run, `${JSON.stringify(run, null, 2)}\n`, { flag: "wx" });
  fs.writeFileSync(p.events, "");
  return run;
}

export function runStatus({ root, branch, now = () => new Date() }) {
  const p = paths(root);
  const run = readRun(p);
  if (!run) return { active: false };
  const age = now().getTime() - Date.parse(run.started_at);
  const stale = (branch !== undefined && branch !== run.branch) || (Number.isFinite(age) && age > STALE_MS);
  const events = readEvents(p).length;
  return { active: true, run, stale, events };
}

export function appendRunEvent({ root, type, fields = {}, now = () => new Date() }) {
  if (!RUN_EVENT_TYPES.includes(type)) fail("invalid_argument", `event type must be one of ${RUN_EVENT_TYPES.join(", ")}`);
  for (const key of Object.keys(fields)) {
    if (!KEY.test(key)) fail("invalid_argument", `event key ${key} must start with a lowercase letter`);
  }
  const p = paths(root);
  const run = readRun(p);
  if (!run) return null;
  const event = { schema: "oak.event/1", run_id: run.run_id, at: now().toISOString(), type };
  for (const [key, raw] of Object.entries(fields)) {
    const value = clean(raw);
    if (INTEGER.test(value)) {
      event[key] = Number(value);
      continue;
    }
    if (!VALUE.test(value)) fail("invalid_argument", `event value for ${key} must be a count or a symbolic value`);
    event[key] = value;
  }
  fs.appendFileSync(p.events, `${JSON.stringify(event)}\n`);
  return event;
}

export function closeRun({ root, output, now = () => new Date() }) {
  const p = paths(root);
  const run = readRun(p);
  if (!run) return { active: false };
  const events = readEvents(p);
  const summary = { schema: "oak.run.summary/1", run, closed_at: now().toISOString(), events };
  let written = null;
  if (output !== undefined) {
    const { target, relative } = safeOutput(p.root, output);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(summary, null, 2)}\n`);
    written = relative;
  }
  fs.rmSync(p.run, { force: true });
  fs.rmSync(p.events, { force: true });
  return written ? { run_id: run.run_id, path: written } : { run_id: run.run_id, summary };
}

// Read HEAD directly instead of spawning git. In a linked worktree `.git` is a
// file that points at the worktree's own git directory.
export function currentBranch(root) {
  let gitDir = path.join(root, ".git");
  if (fs.statSync(gitDir).isFile()) {
    const pointer = fs.readFileSync(gitDir, "utf8").trim();
    if (!pointer.startsWith("gitdir: ")) fail("invalid_repository", ".git file must start with gitdir:");
    gitDir = path.resolve(root, pointer.slice("gitdir: ".length));
  }
  const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
  return head.startsWith("ref: refs/heads/") ? head.slice("ref: refs/heads/".length) : head;
}

export function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const flags = {};
  const pairs = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token.startsWith("--")) {
      flags[token.slice(2)] = rest[index + 1];
      index += 1;
    } else {
      const eq = token.indexOf("=");
      if (eq <= 0) fail("invalid_argument", `expected key=value, got ${token}`);
      pairs[token.slice(0, eq)] = token.slice(eq + 1);
    }
  }
  const root = flags.root;
  if (!root) fail("invalid_argument", "--root is required");
  let result;
  if (command === "start") result = startRun({ root, slug: flags.slug, branch: currentBranch(path.resolve(root)), kind: flags.kind });
  else if (command === "status") result = runStatus({ root, branch: currentBranch(path.resolve(root)) });
  else if (command === "event") result = appendRunEvent({ root, type: flags.type, fields: pairs });
  else if (command === "close") result = closeRun({ root, output: flags.output });
  else fail("invalid_argument", "command must be start, status, event or close");
  if (result?.stale) process.stderr.write("warning: run context is stale\n");
  process.stdout.write(`${JSON.stringify(result ?? null, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof TaskRunError ? error.code : "error"}: ${error.message}\n`);
    process.exit(error instanceof TaskRunError ? 2 : 1);
  }
}
