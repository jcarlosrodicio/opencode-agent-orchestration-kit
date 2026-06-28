import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

import {
  DEFAULT_BUDGETS,
  buildExecutionPlan,
  cleanupWorkspace,
  parseArgs,
  prepareReviewWorkspace,
  recordReviewerResult,
} from "./review-orchestrated-prepare.mjs";

function run(cwd, command, args) {
  return execFileSync(command, args, { cwd, encoding: "utf8" });
}

function makeRepo() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "review-orchestrated-fixture-"));
  run(cwd, "git", ["init"]);
  run(cwd, "git", ["config", "user.email", "review@example.test"]);
  run(cwd, "git", ["config", "user.name", "Review Test"]);
  fs.writeFileSync(path.join(cwd, "README.md"), "# Fixture\n");
  run(cwd, "git", ["add", "README.md"]);
  run(cwd, "git", ["commit", "-m", "initial"]);
  return cwd;
}

function writeFile(cwd, rel, content) {
  const full = path.join(cwd, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function prepare(cwd, extra = {}) {
  return prepareReviewWorkspace({
    base: "HEAD",
    staged: false,
    includeUntracked: false,
    dryRun: false,
    retain: true,
    workspace: fs.mkdtempSync(path.join(os.tmpdir(), "review-workspace-")),
    cwd,
    budgets: { ...DEFAULT_BUDGETS },
    ...extra,
  });
}

function prepareDefaultWorkspace(cwd, extra = {}) {
  return prepareReviewWorkspace({
    base: "HEAD",
    staged: false,
    includeUntracked: false,
    dryRun: false,
    retain: true,
    cwd,
    budgets: { ...DEFAULT_BUDGETS },
    ...extra,
  });
}

test("doc-only changes are skipped without launching reviewers", () => {
  const cwd = makeRepo();
  try {
    fs.appendFileSync(path.join(cwd, "README.md"), "\nMore docs.\n");
    const manifest = prepare(cwd);

    assert.equal(manifest.classification, "skipped");
    assert.deepEqual(manifest.selected_reviewers, []);
    assert.match(manifest.skipped_reason, /No review agents launched/);
    assert.ok(fs.existsSync(path.join(manifest.workspace, "manifest.json")));
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("normal implementation change selects quality reviewer", () => {
  const cwd = makeRepo();
  try {
    writeFile(cwd, "src/app.js", "export function value() { return 1 }\n");
    run(cwd, "git", ["add", "src/app.js"]);
    run(cwd, "git", ["commit", "-m", "add app"]);
    writeFile(cwd, "src/app.js", "export function value() { return 2 }\n");

    const manifest = prepare(cwd);

    assert.equal(manifest.classification, "trivial");
    assert.deepEqual(manifest.selected_reviewers, ["review_quality"]);
    assert.equal(manifest.patches.length, 1);
    const patch = fs.readFileSync(path.join(manifest.workspace, manifest.patches[0].path), "utf8");
    assert.match(patch, /BEGIN_UNTRUSTED_PATCH_DATA/);
    assert.match(patch, /END_UNTRUSTED_PATCH_DATA/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("security and api paths select specialized reviewers", () => {
  const cwd = makeRepo();
  try {
    writeFile(cwd, "src/auth/session.js", "export const token = 'old'\n");
    writeFile(cwd, "src/api/schema.graphql", "type Query { old: String }\n");
    run(cwd, "git", ["add", "."]);
    run(cwd, "git", ["commit", "-m", "add sensitive files"]);
    writeFile(cwd, "src/auth/session.js", "export const token = process.env.TOKEN\n");
    writeFile(cwd, "src/api/schema.graphql", "type Query { old: String, next: String }\n");

    const manifest = prepare(cwd, {
      budgets: {
        ...DEFAULT_BUDGETS,
        max_reviewers: 4,
      },
    });

    assert.equal(manifest.classification, "full");
    assert.ok(manifest.risk_flags.includes("security"));
    assert.ok(manifest.risk_flags.includes("api"));
    assert.ok(manifest.selected_reviewers.includes("review_security"));
    assert.ok(manifest.selected_reviewers.includes("review_api"));
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("tests-only risk stays lite and does not select api reviewer", () => {
  const cwd = makeRepo();
  try {
    writeFile(cwd, "scripts/check-harness.test.mjs", "test('old', () => {})\n");
    writeFile(cwd, "src/tool.mjs", "export const value = 1\n");
    run(cwd, "git", ["add", "."]);
    run(cwd, "git", ["commit", "-m", "add tests"]);
    writeFile(cwd, "scripts/check-harness.test.mjs", "test('new', () => {})\n");
    writeFile(cwd, "src/tool.mjs", "export const value = 2\n");

    const manifest = prepare(cwd);

    assert.equal(manifest.classification, "lite");
    assert.deepEqual(manifest.selected_reviewers, ["review_quality", "review_tests"]);
    assert.deepEqual(manifest.recommended_reviewers, ["review_quality", "review_tests"]);
    assert.equal(manifest.execution_plan.mode, "preflight");
    assert.equal(manifest.execution_plan.ai_review, "not_run");
    assert.deepEqual(manifest.execution_plan.planned_reviewers, []);
    assert.ok(manifest.omitted_reviewers.includes("review_api"));
    assert.deepEqual(
      manifest.reviewer_patch_sets.review_tests.patches.map((patch) => patch.file),
      ["scripts/check-harness.test.mjs"],
    );
    assert.deepEqual(
      manifest.reviewer_patch_sets.review_quality.patches.map((patch) => patch.file),
      ["scripts/check-harness.test.mjs", "src/tool.mjs"],
    );
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("dry-run is a preflight-compatible alias without reviewer execution", () => {
  const options = parseArgs(["--dry-run", "--retain", "--reviewer-timeout-ms", "5000"]);
  assert.equal(options.dryRun, true);
  assert.equal(options.agents, false);
  assert.equal(options.fullAgents, false);
  assert.equal(options.budgets.reviewer_timeout_ms, 5000);

  const plan = buildExecutionPlan("lite", ["review_quality", "review_tests"], options);
  assert.equal(plan.mode, "preflight");
  assert.equal(plan.dry_run_alias, true);
  assert.equal(plan.ai_review, "not_run");
  assert.deepEqual(plan.planned_reviewers, []);
});

test("combined command arguments are parsed without a retry", () => {
  const options = parseArgs(["--agents --retain"]);

  assert.equal(options.agents, true);
  assert.equal(options.retain, true);
  assert.equal(options.fullAgents, false);
});

test("--agents mode plans at most one focused reviewer for lite changes", () => {
  const cwd = makeRepo();
  try {
    writeFile(cwd, "scripts/check-harness.test.mjs", "test('old', () => {})\n");
    writeFile(cwd, "src/tool.mjs", "export const value = 1\n");
    run(cwd, "git", ["add", "."]);
    run(cwd, "git", ["commit", "-m", "add tests"]);
    writeFile(cwd, "scripts/check-harness.test.mjs", "test('new', () => {})\n");
    writeFile(cwd, "src/tool.mjs", "export const value = 2\n");

    const manifest = prepare(cwd, { agents: true });

    assert.equal(manifest.classification, "lite");
    assert.equal(manifest.execution_plan.mode, "agents");
    assert.equal(manifest.execution_plan.ai_review, "coordinator_focused");
    assert.deepEqual(manifest.execution_plan.planned_reviewers, ["review_tests"]);
    assert.equal(manifest.execution_plan.max_reviewers_to_execute, 1);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("small api-only changes stay lite and plan one api reviewer", () => {
  const cwd = makeRepo();
  try {
    writeFile(cwd, "src/api/users.js", "export function parseLimit(value) { return Number(value); }\n");
    run(cwd, "git", ["add", "."]);
    run(cwd, "git", ["commit", "-m", "add public api"]);
    writeFile(
      cwd,
      "src/api/users.js",
      "export function parseLimit(value) {\n  const parsed = Number(value);\n  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) throw new RangeError('limit');\n  return parsed;\n}\n",
    );

    const manifest = prepare(cwd, { agents: true });

    assert.equal(manifest.classification, "lite");
    assert.deepEqual(manifest.risk_flags, ["api"]);
    assert.deepEqual(manifest.execution_plan.planned_reviewers, ["review_api"]);
    assert.equal(manifest.execution_plan.max_reviewers_to_execute, 1);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("auth permission changes plan the security reviewer", () => {
  const cwd = makeRepo();
  try {
    writeFile(cwd, "src/auth/permissions.js", "export const canDelete = role => role === 'admin'\n");
    run(cwd, "git", ["add", "."]);
    run(cwd, "git", ["commit", "-m", "add permissions"]);
    writeFile(cwd, "src/auth/permissions.js", "export const canDelete = role => role === 'admin' || role === 'member'\n");

    const manifest = prepare(cwd, { agents: true });

    assert.equal(manifest.classification, "full");
    assert.ok(manifest.risk_flags.includes("permissions"));
    assert.deepEqual(manifest.execution_plan.planned_reviewers, ["review_security"]);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("dependency manifests select security while lockfiles stay filtered", () => {
  const cwd = makeRepo();
  try {
    writeFile(cwd, "package.json", '{"dependencies":{"example-lib":"1.0.0"}}\n');
    writeFile(cwd, "package-lock.json", '{"lockfileVersion":3,"packages":{}}\n');
    run(cwd, "git", ["add", "."]);
    run(cwd, "git", ["commit", "-m", "add dependency"]);
    writeFile(cwd, "package.json", '{"dependencies":{"example-lib":"2.0.0"}}\n');
    writeFile(cwd, "package-lock.json", '{"lockfileVersion":3,"packages":{"node_modules/example-lib":{"version":"2.0.0"}}}\n');

    const manifest = prepare(cwd, { agents: true });

    assert.equal(manifest.classification, "full");
    assert.ok(manifest.risk_flags.includes("deps"));
    assert.ok(manifest.risk_flags.includes("lockfiles"));
    assert.deepEqual(manifest.execution_plan.planned_reviewers, ["review_security"]);
    assert.deepEqual(manifest.filtered_files, ["package-lock.json"]);
    assert.deepEqual(manifest.patches.map((patch) => patch.file), ["package.json"]);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("deleted regression tests plan the tests reviewer", () => {
  const cwd = makeRepo();
  try {
    writeFile(cwd, "src/discount.js", "export const discount = value => value\n");
    writeFile(cwd, "test/discount.test.js", "test('discount', () => {})\n");
    run(cwd, "git", ["add", "."]);
    run(cwd, "git", ["commit", "-m", "add discount tests"]);
    writeFile(cwd, "src/discount.js", "export const discount = value => Math.max(value, 0)\n");
    fs.rmSync(path.join(cwd, "test/discount.test.js"));

    const manifest = prepare(cwd, { agents: true });

    assert.equal(manifest.classification, "lite");
    assert.ok(manifest.risk_flags.includes("tests"));
    assert.deepEqual(manifest.execution_plan.planned_reviewers, ["review_tests"]);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("--full-agents mode caps planned specialized reviewers at four", () => {
  const options = parseArgs(["--full-agents", "--max-reviewers", "9"]);
  const plan = buildExecutionPlan("full", ["review_quality", "review_security", "review_tests", "review_api", "extra"], options);

  assert.equal(plan.mode, "full-agents");
  assert.equal(plan.ai_review, "experimental_specialized_agents");
  assert.deepEqual(plan.planned_reviewers, ["review_quality", "review_security", "review_tests", "review_api"]);
  assert.equal(plan.max_reviewers_to_execute, 4);
});

test("reviewer timeout and failure statuses are recorded as partial results", () => {
  const manifest = {
    failed_reviewers: [],
    timed_out_reviewers: [],
    execution_plan: {
      reviewer_results: {},
    },
  };

  const timedOut = recordReviewerResult(manifest, "review_tests", "timed_out", { elapsed_ms: 90001 });
  assert.deepEqual(timedOut.timed_out_reviewers, ["review_tests"]);
  assert.equal(timedOut.execution_plan.reviewer_results.review_tests.status, "timed_out");

  const failed = recordReviewerResult(timedOut, "review_security", "failed", { error: "no findings written" });
  assert.deepEqual(failed.failed_reviewers, ["review_security"]);
  assert.equal(failed.execution_plan.reviewer_results.review_security.error, "no findings written");
});

test("moderate multi-file review stays lite without high risk flags", () => {
  const cwd = makeRepo();
  try {
    for (let index = 0; index < 14; index++) {
      writeFile(cwd, `src/file-${index}.mjs`, `export const value${index} = 1\n`);
    }
    writeFile(cwd, "scripts/check-harness.test.mjs", "test('old', () => {})\n");
    run(cwd, "git", ["add", "."]);
    run(cwd, "git", ["commit", "-m", "add files"]);
    for (let index = 0; index < 14; index++) {
      writeFile(cwd, `src/file-${index}.mjs`, `export const value${index} = 2\n`);
    }
    writeFile(cwd, "scripts/check-harness.test.mjs", "test('new', () => {})\n");

    const manifest = prepare(cwd);

    assert.equal(manifest.classification, "lite");
    assert.deepEqual(manifest.selected_reviewers, ["review_quality", "review_tests"]);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("lockfiles and generated files are filtered but kept as risk signals", () => {
  const cwd = makeRepo();
  try {
    writeFile(cwd, "package-lock.json", "{\"lockfileVersion\":1}\n");
    writeFile(cwd, "src/generated/client.generated.ts", "export const x = 1\n");
    run(cwd, "git", ["add", "."]);
    run(cwd, "git", ["commit", "-m", "add generated"]);
    writeFile(cwd, "package-lock.json", "{\"lockfileVersion\":2}\n");
    writeFile(cwd, "src/generated/client.generated.ts", "export const x = 2\n");

    const manifest = prepare(cwd);

    assert.equal(manifest.classification, "full");
    assert.deepEqual(manifest.patches, []);
    assert.ok(manifest.filtered_files.includes("package-lock.json"));
    assert.ok(manifest.filtered_files.includes("src/generated/client.generated.ts"));
    assert.ok(manifest.risk_flags.includes("lockfiles"));
    assert.ok(manifest.risk_flags.includes("generated"));
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("database migrations are not automatically filtered", () => {
  const cwd = makeRepo();
  try {
    writeFile(cwd, "db/migrations/001_init.sql", "select 1;\n");
    run(cwd, "git", ["add", "."]);
    run(cwd, "git", ["commit", "-m", "add migration"]);
    writeFile(cwd, "db/migrations/001_init.sql", "select 2;\n");

    const manifest = prepare(cwd);

    assert.ok(manifest.risk_flags.includes("migrations"));
    assert.equal(manifest.filtered_files.includes("db/migrations/001_init.sql"), false);
    assert.equal(manifest.patches.length, 1);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("untracked files are listed but not reviewed by default", () => {
  const cwd = makeRepo();
  try {
    writeFile(cwd, "src/new.js", "export const created = true\n");
    const manifest = prepare(cwd);

    assert.deepEqual(manifest.diff_scope.untracked_files, ["src/new.js"]);
    assert.equal(manifest.diff_scope.untracked_reviewed, false);
    assert.equal(manifest.changed_files.length, 0);
    assert.equal(manifest.classification, "skipped");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("include-untracked adds untracked files to review patches", () => {
  const cwd = makeRepo();
  try {
    writeFile(cwd, "src/new.js", "export const created = true\n");
    const manifest = prepare(cwd, { includeUntracked: true });

    assert.equal(manifest.diff_scope.untracked_reviewed, true);
    assert.equal(manifest.changed_files[0].path, "src/new.js");
    assert.equal(manifest.patches.length, 1);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("retained review workspaces are filtered when untracked are included", () => {
  const cwd = makeRepo();
  try {
    for (let index = 0; index < 25; index++) {
      writeFile(cwd, `.opencode-review-/run-old/artifact-${index}.json`, "{}\n");
    }
    writeFile(cwd, ".opencode-review-/run-old/manifest.json", "{}\n");
    writeFile(cwd, "src/new.js", "export const created = true\n");
    const manifest = prepare(cwd, { includeUntracked: true });

    assert.ok(manifest.filtered_files.includes(".opencode-review-/run-old/manifest.json"));
    assert.ok(manifest.generated_files.includes(".opencode-review-/run-old/manifest.json"));
    assert.deepEqual(manifest.patches.map((patch) => patch.file), ["src/new.js"]);
    assert.equal(manifest.classification, "lite");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("budget overflow is recorded in the manifest", () => {
  const cwd = makeRepo();
  try {
    writeFile(cwd, "src/large.js", "export const value = 1\n");
    run(cwd, "git", ["add", "."]);
    run(cwd, "git", ["commit", "-m", "add large"]);
    writeFile(cwd, "src/large.js", `export const value = \`${"x".repeat(2000)}\`\n`);

    const manifest = prepare(cwd, {
      budgets: {
        max_reviewers: 3,
        max_patch_bytes_per_reviewer: 500,
        max_total_patch_bytes: 500,
      },
    });

    assert.equal(manifest.budgets.budget_exceeded, true);
    assert.equal(manifest.patches.length, 0);
    assert.equal(manifest.dropped_patches.length, 1);
    assert.ok(manifest.budgets.written_patch_bytes <= manifest.budgets.max_total_patch_bytes);
    assert.match(manifest.budgets.exceeded_behavior, /manual review/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("per-reviewer patch budget records omitted reviewer patches", () => {
  const cwd = makeRepo();
  try {
    writeFile(cwd, "scripts/check-harness.test.mjs", "test('old', () => {})\n");
    run(cwd, "git", ["add", "."]);
    run(cwd, "git", ["commit", "-m", "add tests"]);
    writeFile(cwd, "scripts/check-harness.test.mjs", "test('new', () => {})\n");

    const manifest = prepare(cwd, {
      budgets: {
        max_reviewers: 3,
        max_patch_bytes_per_reviewer: 1,
        max_total_patch_bytes: 50_000,
      },
    });

    assert.equal(manifest.patches.length, 1);
    assert.equal(manifest.reviewer_patch_sets.review_tests.patches.length, 0);
    assert.equal(manifest.reviewer_patch_sets.review_tests.omitted_patches.length, 1);
    assert.equal(manifest.reviewer_patch_sets.review_tests.omitted_patches[0].reason, "max_patch_bytes_per_reviewer");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("parseArgs rejects invalid invocation shapes", () => {
  assert.throws(() => parseArgs(["--unknown"]), /Unknown argument/);
  assert.throws(() => parseArgs(["--base"]), /--base requires a value/);
  assert.throws(() => parseArgs(["--max-reviewers", "0"]), /max_reviewers must be a positive number/);
});

test("cleanup removes workspace unless retained", () => {
  const cwd = makeRepo();
  try {
    fs.appendFileSync(path.join(cwd, "README.md"), "\nMore docs.\n");
    const cleanupManifest = prepare(cwd, { retain: false });
    assert.equal(cleanupManifest.workspace_retention, "cleanup");
    cleanupWorkspace(cleanupManifest);
    assert.equal(fs.existsSync(cleanupManifest.workspace), false);

    const retainedManifest = prepare(cwd, { retain: true });
    assert.equal(retainedManifest.workspace_retention, "retain");
    cleanupWorkspace(retainedManifest);
    assert.equal(fs.existsSync(retainedManifest.workspace), true);
    fs.rmSync(retainedManifest.workspace, { recursive: true, force: true });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("default workspace is created inside the repo", () => {
  const cwd = makeRepo();
  try {
    fs.appendFileSync(path.join(cwd, "README.md"), "\nMore docs.\n");
    const manifest = prepareDefaultWorkspace(cwd);

    assert.ok(manifest.workspace.startsWith(path.join(cwd, ".opencode-review-")));
    assert.ok(fs.existsSync(path.join(manifest.workspace, "manifest.json")));
    fs.rmSync(manifest.workspace, { recursive: true, force: true });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
