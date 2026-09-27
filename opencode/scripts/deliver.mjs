#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inspectLoopState } from "./loop-state.mjs";
import { appendRunEvent } from "./task-run.mjs";

const PRIVATE_PATHS = [
  /(?:^|[\s("'`/:<[|=])\/(?:Users|home|root)\/[^\s)"'`]+/,
  /(?:^|[\s("'`])~\//,
  /[A-Za-z]:\\users\\/i,
];
// A conservative subset of git branch names. It rejects a leading "+" (a
// force refspec) or "-" (an option), and every sequence git gives meaning to.
const SAFE_BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
// OAK's own durable state may stay uncommitted; everything else must be clean.
const STATE_EXCLUDES = [":(exclude).opencode/loops", ":(exclude).opencode/runs"];

export class DeliverError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DeliverError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new DeliverError(code, message);
}

function defaultRunner(command, args, root) {
  return spawnSync(command, args, { cwd: root, shell: false, encoding: "utf8", timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
}

function run(runner, root, command, args) {
  const result = runner(command, args, root);
  if (result.status !== 0) {
    const reason = String(result.stderr ?? "").trim().split("\n")[0];
    fail("command_failed", `${command} ${args[0]} failed${reason ? `: ${reason}` : ""}`);
  }
  return String(result.stdout ?? "").trim();
}

function defaultBranch(runner, root) {
  const result = runner("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], root);
  return result.status === 0 ? String(result.stdout).trim().replace(/^origin\//, "") : "main";
}

function readAttestation(file) {
  try {
    if (!fs.lstatSync(file).isFile()) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function isSafeBranch(branch) {
  return SAFE_BRANCH.test(branch)
    && !branch.includes("..")
    && !branch.includes("//")
    && !branch.endsWith("/")
    && !branch.endsWith(".")
    && !branch.endsWith(".lock");
}

// Resolve the body through every symlink, keep it inside the root, and return
// its validated text so gh never re-reads a file that could change.
function readSafeBody(root, bodyFile) {
  if (typeof bodyFile !== "string" || bodyFile.length === 0) fail("unsafe_body", "body file is required");
  let real;
  try {
    real = fs.realpathSync(path.resolve(root, bodyFile));
  } catch {
    fail("unsafe_body", "body file must be a regular file inside the root");
  }
  const relative = path.relative(root, real);
  if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.statSync(real).isFile()) {
    fail("unsafe_body", "body file must be a regular file inside the root");
  }
  const text = fs.readFileSync(real, "utf8");
  if (PRIVATE_PATHS.some((pattern) => pattern.test(text))) fail("unsafe_body", "body file contains an absolute home path");
  return text;
}

export function deliver({ root, slug, title, bodyFile, runner = defaultRunner }) {
  const resolved = fs.realpathSync(path.resolve(root));
  const state = inspectLoopState({ root: resolved, slug });
  if (state.status !== "completed") fail("not_completed", "the loop must be completed before delivery");
  const attestation = readAttestation(path.join(resolved, ".opencode", "loops", `${slug}.review.json`));
  if (
    attestation?.schema_version !== 1
    || attestation.reviewer_agent !== "reviewer"
    || attestation.reviewer_verdict !== "APPROVE"
    || attestation.contract_hash !== state.approval.contract_hash
  ) {
    fail("attestation_missing", "delivery requires the reviewer attestation for this contract");
  }
  const branch = run(runner, resolved, "git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch !== "HEAD" && !isSafeBranch(branch)) fail("unsafe_branch", "branch name must be a plain feature branch name");
  const base = defaultBranch(runner, resolved);
  if (branch === base || branch === "main" || branch === "master" || branch === "HEAD") {
    fail("default_branch", "delivery never pushes the default branch");
  }
  if (run(runner, resolved, "git", ["status", "--porcelain", "--", ".", ...STATE_EXCLUDES]) !== "") {
    fail("dirty_tree", "commit or discard changes first");
  }
  if (Number(run(runner, resolved, "git", ["rev-list", "--count", `origin/${base}..HEAD`])) < 1) {
    fail("no_commits", "the branch has no commits ahead of its base");
  }
  const bodyText = readSafeBody(resolved, bodyFile);
  if (typeof title !== "string" || title.length === 0 || title.length > 200) fail("unsafe_body", "title must be 1-200 characters");

  // An explicit destination refspec: the branch name is never parsed as one.
  run(runner, resolved, "git", ["push", "--set-upstream", "origin", `HEAD:refs/heads/${branch}`]);
  // A later delivery (for example a CI fix) updates the open pull request.
  const existing = runner("gh", ["pr", "list", "--head", branch, "--state", "open", "--json", "url,isCrossRepository", "--jq", ".[] | select(.isCrossRepository | not) | .url"], resolved);
  const existingUrl = existing.status === 0 ? String(existing.stdout ?? "").trim().split("\n")[0] : "";
  let prUrl = existingUrl;
  if (!prUrl) {
    const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "oak-deliver-"));
    try {
      const body = path.join(privateDir, "body.md");
      fs.writeFileSync(body, bodyText, { mode: 0o600 });
      prUrl = run(runner, resolved, "gh", ["pr", "create", "--base", base, "--head", branch, "--title", title, "--body-file", body]);
    } finally {
      fs.rmSync(privateDir, { recursive: true, force: true });
    }
  }
  try {
    appendRunEvent({ root: resolved, type: "delivery", fields: { branch, base, outcome: existingUrl ? "pr_updated" : "pr_opened" } });
  } catch {
    // The run context is optional; delivery never fails because of it.
  }
  return { branch, base, pr_url: prUrl };
}

// gh exits with status 8 while checks are still pending; that is not an error.
export function prChecks({ root, pr, runner = defaultRunner }) {
  if (!/^\d+$/.test(String(pr))) fail("invalid_argument", "pr must be a number");
  const resolved = fs.realpathSync(path.resolve(root));
  const result = runner("gh", ["pr", "checks", String(pr), "--json", "name,state,bucket,link"], resolved);
  if (result.status !== 0 && result.status !== 8) fail("command_failed", "gh pr checks failed");
  return JSON.parse(String(result.stdout || "[]"));
}

export function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let index = 0; index < rest.length; index += 2) {
    const token = rest[index];
    if (!token.startsWith("--") || rest[index + 1] === undefined) fail("invalid_argument", `unexpected argument ${token}`);
    flags[token.slice(2)] = rest[index + 1];
  }
  if (!flags.root) fail("invalid_argument", "--root is required");
  let result;
  if (command === "pr") {
    result = deliver({ root: flags.root, slug: flags.slug, title: flags.title, bodyFile: flags["body-file"] });
  } else if (command === "checks") {
    result = prChecks({ root: flags.root, pr: flags.pr });
  } else {
    fail("invalid_argument", "command must be pr or checks");
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    const known = error instanceof DeliverError || error?.name === "LoopStateError";
    process.stderr.write(`${known ? error.code : "error"}: ${error.message}\n`);
    process.exit(known ? 2 : 1);
  }
}
