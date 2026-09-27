import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { acquireLoop, attestReview, initLoopState, recordLoopAction } from "./loop-state.mjs";
import { DeliverError, deliver, prChecks } from "./deliver.mjs";

function completedLoop({ attest = true, complete = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oak-deliver-"));
  fs.mkdirSync(path.join(root, ".opencode/loops"), { recursive: true });
  const contractPath = path.join(root, ".opencode/loops/task.md");
  fs.writeFileSync(contractPath, "# Contract\n");
  initLoopState({ root, slug: "task", contractPath, gitBaseline: "abc", sessionId: "s1", actionId: "a1", plannedIterations: 2 });
  acquireLoop({ root, slug: "task", contractPath, sessionId: "s1", actionId: "a2" });
  if (attest) attestReview({ root, slug: "task", reviewerSessionId: "child", reviewerAgent: "reviewer", reviewerVerdict: "APPROVE" });
  if (complete) recordLoopAction({ root, slug: "task", sessionId: "s1", actionId: "a3", iteration: 1, completedStep: "reviewer_approved", blockingCause: null, status: "completed" });
  fs.writeFileSync(path.join(root, "pr-body.md"), "## What\nA change.\n");
  return root;
}

function fakeRunner(overrides = {}) {
  const calls = [];
  const replies = {
    "git rev-parse": "feat/x",
    "git symbolic-ref": "origin/main",
    "git status": "",
    "git rev-list": "2",
    "git push": "",
    "gh pr create": "https://github.com/example/repo/pull/7",
    ...overrides,
  };
  const runner = (command, args) => {
    calls.push([command, args]);
    const key = command === "gh" ? `${command} ${args[0]} ${args[1]}` : `${command} ${args[0]}`;
    const reply = replies[key];
    return reply === undefined ? { status: 1, stdout: "", stderr: "unexpected" } : { status: 0, stdout: `${reply}\n`, stderr: "" };
  };
  return { runner, calls };
}

const pushedOrOpened = (calls) => calls.some(([command, args]) => (command === "git" && args[0] === "push") || command === "gh");

function refusal(t, code, { loop = {}, runner = {}, input = {} } = {}) {
  const root = completedLoop(loop);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fake = fakeRunner(runner);
  assert.throws(
    () => deliver({ root, slug: "task", title: "Add x", bodyFile: "pr-body.md", runner: fake.runner, ...input }),
    (error) => error instanceof DeliverError && error.code === code,
  );
  assert.equal(pushedOrOpened(fake.calls), false);
}

test("refuses when the loop is not completed", (t) => {
  const root = completedLoop({ complete: false });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fake = fakeRunner();
  assert.throws(() => deliver({ root, slug: "task", title: "Add x", bodyFile: "pr-body.md", runner: fake.runner }), (error) => error.code === "not_completed");
  assert.equal(fake.calls.length, 0);
});
test("refuses on the default branch", (t) => refusal(t, "default_branch", { runner: { "git rev-parse": "main" } }));
test("refuses master even when origin/HEAD is unknown", (t) => refusal(t, "default_branch", { runner: { "git rev-parse": "master", "git symbolic-ref": undefined } }));
test("refuses a dirty tree", (t) => refusal(t, "dirty_tree", { runner: { "git status": " M src/a.js" } }));
test("refuses a branch with no commits ahead of base", (t) => refusal(t, "no_commits", { runner: { "git rev-list": "0" } }));
test("refuses a body file outside the root", (t) => refusal(t, "unsafe_body", { input: { bodyFile: "../outside.md" } }));

test("refuses a body that leaks an absolute home path", (t) => {
  const root = completedLoop();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "pr-body.md"), "Evidence at /home/someone/tmp/shot.png\n");
  const fake = fakeRunner();
  assert.throws(() => deliver({ root, slug: "task", title: "Add x", bodyFile: "pr-body.md", runner: fake.runner }), (error) => error.code === "unsafe_body");
  assert.equal(pushedOrOpened(fake.calls), false);
});

test("pushes without force and opens the PR against the default branch", (t) => {
  const root = completedLoop();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fake = fakeRunner();
  const result = deliver({ root, slug: "task", title: "Add x", bodyFile: "pr-body.md", runner: fake.runner });
  assert.deepEqual(result, { branch: "feat/x", base: "main", pr_url: "https://github.com/example/repo/pull/7" });
  assert.deepEqual(fake.calls.find(([command, args]) => command === "git" && args[0] === "push"), ["git", ["push", "--set-upstream", "origin", "HEAD:refs/heads/feat/x"]]);
  const pr = fake.calls.find(([command, args]) => command === "gh" && args[1] === "create");
  assert.deepEqual(pr[1].slice(0, 8), ["pr", "create", "--base", "main", "--head", "feat/x", "--title", "Add x"]);
  const flat = fake.calls.flatMap(([command, args]) => [command, ...args]);
  for (const forbidden of ["--force", "--force-with-lease", "merge", "--auto"]) assert.equal(flat.includes(forbidden), false, forbidden);
});

test("checks returns gh JSON, tolerates pending status 8 and never merges", (t) => {
  const root = completedLoop();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const calls = [];
  const runner = (command, args) => {
    calls.push([command, args]);
    return { status: 8, stdout: '[{"name":"check","state":"PENDING","bucket":"pending","link":"https://example.test"}]', stderr: "" };
  };
  assert.deepEqual(prChecks({ root, pr: 7, runner }), [{ name: "check", state: "PENDING", bucket: "pending", link: "https://example.test" }]);
  assert.deepEqual(calls, [["gh", ["pr", "checks", "7", "--json", "name,state,bucket,link"]]]);
  assert.throws(() => prChecks({ root, pr: "7; rm -rf /", runner }), /pr must be a number/);
});

test("the dirty-tree check ignores OAK's own loop and run state", (t) => {
  const root = completedLoop();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fake = fakeRunner();
  deliver({ root, slug: "task", title: "Add x", bodyFile: "pr-body.md", runner: fake.runner });
  const status = fake.calls.find(([command, args]) => command === "git" && args[0] === "status");
  assert.deepEqual(status[1], ["status", "--porcelain", "--", ".", ":(exclude).opencode/loops", ":(exclude).opencode/runs"]);
});

test("refuses a malformed attestation file", (t) => {
  const root = completedLoop();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, ".opencode/loops/task.review.json"), "{not json");
  const fake = fakeRunner();
  assert.throws(() => deliver({ root, slug: "task", title: "Add x", bodyFile: "pr-body.md", runner: fake.runner }), (error) => error.code === "attestation_missing");
  assert.equal(fake.calls.length, 0);
});

test("refuses a missing body file", (t) => refusal(t, "unsafe_body", { input: { bodyFile: "missing.md" } }));

test("a second delivery pushes to the existing pull request instead of opening another", (t) => {
  const root = completedLoop();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fake = fakeRunner({ "gh pr list": "https://github.com/example/repo/pull/7" });
  const result = deliver({ root, slug: "task", title: "Add x", bodyFile: "pr-body.md", runner: fake.runner });
  assert.equal(result.pr_url, "https://github.com/example/repo/pull/7");
  assert.equal(fake.calls.some(([command, args]) => command === "gh" && args[1] === "create"), false);
  assert.deepEqual(fake.calls.find(([command, args]) => command === "gh" && args[1] === "list")[1], ["pr", "list", "--head", "feat/x", "--state", "open", "--json", "url", "--jq", ".[].url"]);
  assert.ok(fake.calls.some(([command, args]) => command === "git" && args[0] === "push"));
});

for (const branch of ["+main", "-f", "feat/../main", "feat x", "feat/x.lock", "feat//x", "feat/x/", "@{-1}"]) {
  test(`refuses the unsafe branch name ${JSON.stringify(branch)}`, (t) => refusal(t, "unsafe_branch", { runner: { "git rev-parse": branch } }));
}

test("refuses a body file reached through a symlinked directory outside the root", (t) => {
  const root = completedLoop();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "oak-deliver-outside-"));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });
  fs.writeFileSync(path.join(outside, "body.md"), "## What\nOutside.\n");
  fs.symlinkSync(outside, path.join(root, "sub"));
  const fake = fakeRunner();
  assert.throws(() => deliver({ root, slug: "task", title: "Add x", bodyFile: "sub/body.md", runner: fake.runner }), (error) => error.code === "unsafe_body");
  assert.equal(pushedOrOpened(fake.calls), false);
});

for (const leak of ["file:///home/someone/x.png", "see ~/notes.md", "at /root/secret", "C:\\Users\\someone\\x"]) {
  test(`refuses a body that leaks ${JSON.stringify(leak)}`, (t) => {
    const root = completedLoop();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.writeFileSync(path.join(root, "pr-body.md"), `Evidence ${leak}\n`);
    const fake = fakeRunner();
    assert.throws(() => deliver({ root, slug: "task", title: "Add x", bodyFile: "pr-body.md", runner: fake.runner }), (error) => error.code === "unsafe_body");
    assert.equal(pushedOrOpened(fake.calls), false);
  });
}

test("gh receives a private copy of the validated body, not the repository file", (t) => {
  const root = completedLoop();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let seen = null;
  const fake = fakeRunner();
  const runner = (command, args, cwd) => {
    if (command === "gh" && args[1] === "create") {
      const file = args[args.indexOf("--body-file") + 1];
      seen = { file, text: fs.readFileSync(file, "utf8") };
    }
    return fake.runner(command, args, cwd);
  };
  deliver({ root, slug: "task", title: "Add x", bodyFile: "pr-body.md", runner });
  assert.equal(seen.text, "## What\nA change.\n");
  assert.notEqual(path.dirname(seen.file), root);
  assert.equal(fs.existsSync(seen.file), false, "the private copy is removed after delivery");
});

test("refuses an attestation with the wrong schema or reached through a symlink", (t) => {
  const root = completedLoop();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, ".opencode/loops/task.review.json");
  const valid = JSON.parse(fs.readFileSync(file, "utf8"));
  fs.writeFileSync(file, JSON.stringify({ ...valid, schema_version: 2 }));
  assert.throws(() => deliver({ root, slug: "task", title: "Add x", bodyFile: "pr-body.md", runner: fakeRunner().runner }), (error) => error.code === "attestation_missing");
  const elsewhere = path.join(root, "elsewhere.json");
  fs.writeFileSync(elsewhere, JSON.stringify(valid));
  fs.rmSync(file);
  fs.symlinkSync(elsewhere, file);
  assert.throws(() => deliver({ root, slug: "task", title: "Add x", bodyFile: "pr-body.md", runner: fakeRunner().runner }), (error) => error.code === "attestation_missing");
});

test("a failed command reports its first stderr line", (t) => {
  const root = completedLoop();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runner = (command, args) => (command === "git" && args[0] === "rev-parse"
    ? { status: 128, stdout: "", stderr: "fatal: not a git repository\nmore" }
    : { status: 0, stdout: "" });
  assert.throws(() => deliver({ root, slug: "task", title: "Add x", bodyFile: "pr-body.md", runner }), /git rev-parse failed: fatal: not a git repository$/);
});
