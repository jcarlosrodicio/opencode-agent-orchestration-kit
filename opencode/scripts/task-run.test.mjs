import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { TaskRunError, appendRunEvent, closeRun, currentBranch, runStatus, startRun } from "./task-run.mjs";

const NOW = () => new Date("2026-09-26T10:00:00Z");
const RANDOM = () => Buffer.from("a1b2c3d4", "hex");

function withRoot(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oak-task-run-"));
  try {
    return callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("start writes the run file and is idempotent on the same branch", () => withRoot((root) => {
  const run = startRun({ root, slug: "add-login", branch: "feat/add-login", now: NOW, random: RANDOM });
  assert.equal(run.run_id, "oak_20260926T100000Z_a1b2c3d4");
  assert.deepEqual(Object.keys(run), ["schema", "run_id", "kind", "change", "branch", "repo", "started_at"]);
  assert.equal(run.repo, path.basename(root));
  assert.equal(fs.readFileSync(path.join(root, ".opencode/runs/.gitignore"), "utf8"), "*\n");
  const again = startRun({ root, slug: "add-login", branch: "feat/add-login", now: NOW, random: () => Buffer.from("ffffffff", "hex") });
  assert.equal(again.run_id, run.run_id);
}));

test("start refuses while a run from another branch is open", () => withRoot((root) => {
  startRun({ root, slug: "a", branch: "feat/a", now: NOW, random: RANDOM });
  assert.throws(() => startRun({ root, slug: "b", branch: "feat/b", now: NOW, random: RANDOM }),
    (error) => error instanceof TaskRunError && error.code === "run_open_on_other_branch");
}));

test("rejects unsafe slugs, kinds, event types and keys", () => withRoot((root) => {
  assert.throws(() => startRun({ root, slug: "../x", branch: "b", now: NOW, random: RANDOM }), /slug/);
  assert.throws(() => startRun({ root, slug: "x", branch: "b", kind: "prod", now: NOW, random: RANDOM }), /kind/);
  startRun({ root, slug: "x", branch: "b", now: NOW, random: RANDOM });
  assert.throws(() => appendRunEvent({ root, type: "Review", fields: {} }), /type/);
  assert.throws(() => appendRunEvent({ root, type: "review", fields: { Verdict: "x" } }), /key/);
}));

test("events keep integers bare, dates as strings and strip control characters", () => withRoot((root) => {
  startRun({ root, slug: "x", branch: "b", now: NOW, random: RANDOM });
  appendRunEvent({ root, type: "review", fields: { blocking: "0", nit: "-2", day: "2026-09-26", note: "a\u0007b" }, now: NOW });
  const [line] = fs.readFileSync(path.join(root, ".opencode/runs/active.events.jsonl"), "utf8").trim().split("\n");
  const event = JSON.parse(line);
  assert.equal(event.schema, "oak.event/1");
  assert.equal(event.blocking, 0);
  assert.equal(event.nit, -2);
  assert.equal(event.day, "2026-09-26");
  assert.equal(event.note, "ab");
}));

test("without a run, event and status are no-ops that succeed", () => withRoot((root) => {
  assert.equal(appendRunEvent({ root, type: "review", fields: {} }), null);
  assert.deepEqual(runStatus({ root }), { active: false });
}));

test("status flags stale runs by branch and by age", () => withRoot((root) => {
  startRun({ root, slug: "x", branch: "b", now: NOW, random: RANDOM });
  assert.equal(runStatus({ root, branch: "other", now: NOW }).stale, true);
  assert.equal(runStatus({ root, branch: "b", now: () => new Date("2026-10-04T10:00:01Z") }).stale, true);
  assert.equal(runStatus({ root, branch: "b", now: NOW }).stale, false);
}));

test("close writes the summary inside the root and removes the context", () => withRoot((root) => {
  startRun({ root, slug: "x", branch: "b", now: NOW, random: RANDOM });
  appendRunEvent({ root, type: "review", fields: { verdict: "safe_to_commit" }, now: NOW });
  const out = closeRun({ root, output: "docs/ai/runs/2026-09-26-x/run-summary.json", now: NOW });
  const summary = JSON.parse(fs.readFileSync(path.join(root, out.path), "utf8"));
  assert.equal(summary.schema, "oak.run.summary/1");
  assert.equal(summary.events.length, 1);
  assert.equal(fs.existsSync(path.join(root, ".opencode/runs/active.json")), false);
}));

test("close refuses an output path outside the root and keeps the run open", () => withRoot((root) => {
  startRun({ root, slug: "x", branch: "b", now: NOW, random: RANDOM });
  assert.throws(() => closeRun({ root, output: "../escape.json", now: NOW }), /inside the root/);
  assert.equal(runStatus({ root, branch: "b", now: NOW }).active, true);
}));

test("current branch reads HEAD in a checkout and in a linked worktree", () => withRoot((root) => {
  const main = path.join(root, "main");
  fs.mkdirSync(path.join(main, ".git"), { recursive: true });
  fs.writeFileSync(path.join(main, ".git", "HEAD"), "ref: refs/heads/feat/main\n");
  assert.equal(currentBranch(main), "feat/main");

  const gitdir = path.join(main, ".git", "worktrees", "linked");
  fs.mkdirSync(gitdir, { recursive: true });
  fs.writeFileSync(path.join(gitdir, "HEAD"), "ref: refs/heads/feat/linked\n");
  const linked = path.join(root, "linked");
  fs.mkdirSync(linked);
  fs.writeFileSync(path.join(linked, ".git"), `gitdir: ${path.relative(linked, gitdir)}\n`);
  assert.equal(currentBranch(linked), "feat/linked");
}));

test("event types come from the closed list", () => withRoot((root) => {
  startRun({ root, slug: "x", branch: "b", now: NOW, random: RANDOM });
  assert.throws(() => appendRunEvent({ root, type: "deploy", fields: {} }), /event type must be one of/);
}));

test("event values are symbolic: no prose, no absolute paths", () => withRoot((root) => {
  startRun({ root, slug: "x", branch: "b", now: NOW, random: RANDOM });
  for (const value of ["/home/someone/secret", "free text prose", "a".repeat(201)]) {
    assert.throws(() => appendRunEvent({ root, type: "review", fields: { note: value } }), /value/);
  }
  const event = appendRunEvent({ root, type: "delivery", fields: { branch: "feat/x-1", parent_session_id: "", verdict: "safe_to_commit" }, now: NOW });
  assert.equal(event.branch, "feat/x-1");
}));

test("start refuses a different change on the same branch", () => withRoot((root) => {
  startRun({ root, slug: "a", branch: "b", now: NOW, random: RANDOM });
  assert.throws(() => startRun({ root, slug: "other", branch: "b", now: NOW, random: RANDOM }),
    (error) => error.code === "run_open_for_other_change");
}));

test("run files and the summary never follow symlinks out of place", () => withRoot((root) => {
  startRun({ root, slug: "x", branch: "b", now: NOW, random: RANDOM });
  const outside = path.join(root, "outside.jsonl");
  fs.writeFileSync(outside, "");
  const events = path.join(root, ".opencode/runs/active.events.jsonl");
  fs.rmSync(events);
  fs.symlinkSync(outside, events);
  assert.throws(() => appendRunEvent({ root, type: "review", fields: {} }), (error) => error.code === "unsafe_path");
  assert.equal(fs.readFileSync(outside, "utf8"), "");
  fs.rmSync(events);
  fs.writeFileSync(events, "");

  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "oak-task-run-outside-"));
  fs.symlinkSync(elsewhere, path.join(root, "linked"));
  try {
    assert.throws(() => closeRun({ root, output: "linked/new/summary.json", now: NOW }), (error) => error.code === "unsafe_path");
    assert.deepEqual(fs.readdirSync(elsewhere), []);
  } finally {
    fs.rmSync(elsewhere, { recursive: true, force: true });
  }
  assert.throws(() => closeRun({ root, output: ".git/hooks/pre-commit", now: NOW }), (error) => error.code === "unsafe_path");
  assert.equal(runStatus({ root, branch: "b", now: NOW }).active, true);
}));

test("a corrupt run file is a named error, not a crash", () => withRoot((root) => {
  fs.mkdirSync(path.join(root, ".opencode/runs"), { recursive: true });
  fs.writeFileSync(path.join(root, ".opencode/runs/active.json"), "{not json");
  for (const call of [
    () => startRun({ root, slug: "x", branch: "b", now: NOW, random: RANDOM }),
    () => runStatus({ root }),
    () => closeRun({ root }),
  ]) {
    assert.throws(call, (error) => error instanceof TaskRunError && error.code === "run_corrupt");
  }
}));

test("a dangling events symlink is refused, not created through", () => withRoot((root) => {
  startRun({ root, slug: "x", branch: "b", now: NOW, random: RANDOM });
  const events = path.join(root, ".opencode/runs/active.events.jsonl");
  const target = path.join(root, "created-outside.jsonl");
  fs.rmSync(events);
  fs.symlinkSync(target, events);
  assert.throws(() => appendRunEvent({ root, type: "review", fields: {} }), (error) => error.code === "unsafe_path");
  assert.equal(fs.existsSync(target), false);
}));

test("the summary cannot land in git's directory under any letter case", () => withRoot((root) => {
  startRun({ root, slug: "x", branch: "b", now: NOW, random: RANDOM });
  for (const output of [".GIT/config", "sub/.Git/hooks/pre-commit"]) {
    assert.throws(() => closeRun({ root, output, now: NOW }), (error) => error.code === "unsafe_path");
  }
}));

test("start never writes the ignore file through a dangling symlink", () => withRoot((root) => {
  fs.mkdirSync(path.join(root, ".opencode/runs"), { recursive: true });
  const escaped = path.join(root, "escaped.txt");
  fs.symlinkSync(escaped, path.join(root, ".opencode/runs/.gitignore"));
  assert.throws(() => startRun({ root, slug: "x", branch: "b", now: NOW, random: RANDOM }), (error) => error.code === "unsafe_path");
  assert.equal(fs.existsSync(escaped), false);
}));
