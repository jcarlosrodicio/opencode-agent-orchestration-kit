import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(scriptDir, "project-capability-snapshot.mjs");

function runSnapshot(dir, extraArgs = []) {
  const args = [scriptPath, "--dir", dir, ...extraArgs];
  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    timeout: 10000,
  });
  return result;
}

function parseOutput(result) {
  assert.equal(result.status, 0, `Script failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function makeEmptyDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "opencode-snapshot-empty-"));
}

function makeRepoWith(files) {
  const tmp = makeEmptyDir();
  for (const [rel, content] of Object.entries(files)) {
    const fullPath = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
  return tmp;
}

// ── Test 1: Current repo detects Node/TypeScript/harness ────────────────

test("current repo detects node stack", () => {
  const repoRoot = path.resolve(scriptDir, "..");
  const result = runSnapshot(repoRoot);
  const snapshot = parseOutput(result);

  const stackIds = snapshot.stacks_detected.map((s) => s.id);
  assert.ok(stackIds.includes("node"), "should detect node stack");
});

test("current repo detects orchestration and documentation domains", () => {
  const repoRoot = path.resolve(scriptDir, "..");
  const result = runSnapshot(repoRoot);
  const snapshot = parseOutput(result);

  const domainIds = snapshot.domains_detected.map((d) => d.id);
  assert.ok(domainIds.includes("orchestration"), "should detect orchestration domain");
  assert.ok(domainIds.includes("documentation"), "should detect documentation domain");
});

test("current repo detects harness, skills-catalog surfaces", () => {
  const repoRoot = path.resolve(scriptDir, "..");
  const result = runSnapshot(repoRoot);
  const snapshot = parseOutput(result);

  const surfaceIds = snapshot.surfaces_detected.map((s) => s.id);
  assert.ok(surfaceIds.includes("harness"), "should detect harness surface");
  assert.ok(surfaceIds.includes("skills-catalog"), "should detect skills-catalog surface");
});

// ── Test 2: Empty repo produces empty arrays with unknowns ──────────────

test("empty repo produces snapshot with empty arrays and unknowns", () => {
  const tmp = makeEmptyDir();
  try {
    const result = runSnapshot(tmp);
    const snapshot = parseOutput(result);

    assert.equal(snapshot.stacks_detected.length, 0, "stacks should be empty");
    assert.equal(snapshot.domains_detected.length, 0, "domains should be empty");
    assert.equal(snapshot.surfaces_detected.length, 0, "surfaces should be empty");
    assert.ok(Array.isArray(snapshot.unknowns), "unknowns should be an array");
    assert.ok(snapshot.unknowns.length > 0, "unknowns should be populated for empty repo");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ── Test 3: Determinism ────────────────────────────────────────────────

test("two consecutive runs produce identical output except generated_at", () => {
  const repoRoot = path.resolve(scriptDir, "..");
  const result1 = runSnapshot(repoRoot);
  const result2 = runSnapshot(repoRoot);

  const snapshot1 = parseOutput(result1);
  const snapshot2 = parseOutput(result2);

  // Compare everything except generated_at
  const { generated_at: _, ...rest1 } = snapshot1;
  const { generated_at: __, ...rest2 } = snapshot2;

  // Sort arrays by id for stable comparison
  const sortById = (arr) => [...arr].sort((a, b) => (a.id || "").localeCompare(b.id || ""));
  const sortEvidence = (arr) =>
    [...arr].map((item) => ({
      ...item,
      evidence: [...(item.evidence || [])].sort(),
    }));

  assert.deepEqual(
    sortById(sortEvidence(rest1.stacks_detected)),
    sortById(sortEvidence(rest2.stacks_detected)),
    "stacks_detected should be deterministic",
  );
  assert.deepEqual(
    sortById(sortEvidence(rest1.domains_detected)),
    sortById(sortEvidence(rest2.domains_detected)),
    "domains_detected should be deterministic",
  );
  assert.deepEqual(
    sortById(sortEvidence(rest1.surfaces_detected)),
    sortById(sortEvidence(rest2.surfaces_detected)),
    "surfaces_detected should be deterministic",
  );
  assert.deepEqual(rest1.unknowns.sort(), rest2.unknowns.sort(), "unknowns should be deterministic");
});

// ── Test 4: Every detection has evidence ────────────────────────────────

test("every detection has at least one evidence file", () => {
  const repoRoot = path.resolve(scriptDir, "..");
  const result = runSnapshot(repoRoot);
  const snapshot = parseOutput(result);

  for (const item of snapshot.stacks_detected) {
    assert.ok(item.evidence && item.evidence.length > 0, `stack ${item.id} missing evidence`);
  }
  for (const item of snapshot.domains_detected) {
    assert.ok(item.evidence && item.evidence.length > 0, `domain ${item.id} missing evidence`);
  }
  for (const item of snapshot.surfaces_detected) {
    assert.ok(item.evidence && item.evidence.length > 0, `surface ${item.id} missing evidence`);
  }
});

// ── Test 5: Schema version is 1 ────────────────────────────────────────

test("snapshot has schema_version 1", () => {
  const repoRoot = path.resolve(scriptDir, "..");
  const result = runSnapshot(repoRoot);
  const snapshot = parseOutput(result);

  assert.equal(snapshot.schema_version, 1);
});

// ── Test 6: repo_root is absolute path ──────────────────────────────────

test("repo_root is an absolute path", () => {
  const repoRoot = path.resolve(scriptDir, "..");
  const result = runSnapshot(repoRoot);
  const snapshot = parseOutput(result);

  assert.ok(path.isAbsolute(snapshot.repo_root), "repo_root should be absolute");
  assert.equal(snapshot.repo_root, repoRoot);
});

// ── Test 7: Module export works ─────────────────────────────────────────

test("script exports generateSnapshot function", async () => {
  const mod = await import(scriptPath);
  assert.equal(typeof mod.generateSnapshot, "function");
});

// ── Test 8: Generated-by and generated-at ───────────────────────────────

test("snapshot has generated_by and generated_at fields", () => {
  const repoRoot = path.resolve(scriptDir, "..");
  const result = runSnapshot(repoRoot);
  const snapshot = parseOutput(result);

  assert.equal(typeof snapshot.generated_by, "string");
  assert.ok(snapshot.generated_by.length > 0, "generated_by should not be empty");
  assert.equal(typeof snapshot.generated_at, "string");
  // Validate ISO-8601-ish format
  assert.ok(!isNaN(Date.parse(snapshot.generated_at)), "generated_at should be a valid date");
});

// ── Test 9: Custom repo with Flutter signals ────────────────────────────

test("repo with pubspec.yaml detects flutter stack", () => {
  const tmp = makeRepoWith({
    "pubspec.yaml": "name: my_app\ndependencies:\n  flutter:\n    sdk: flutter\n",
  });
  try {
    const result = runSnapshot(tmp);
    const snapshot = parseOutput(result);

    const stackIds = snapshot.stacks_detected.map((s) => s.id);
    assert.ok(stackIds.includes("flutter"), "should detect flutter stack");

    const flutter = snapshot.stacks_detected.find((s) => s.id === "flutter");
    assert.equal(flutter.confidence, "high");
    assert.ok(flutter.evidence.includes("pubspec.yaml"));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ── Test 10: Custom repo with Go signals ────────────────────────────────

test("repo with go.mod detects go stack", () => {
  const tmp = makeRepoWith({
    "go.mod": "module example.com/foo\n\ngo 1.21\n",
  });
  try {
    const result = runSnapshot(tmp);
    const snapshot = parseOutput(result);

    const stackIds = snapshot.stacks_detected.map((s) => s.id);
    assert.ok(stackIds.includes("go"), "should detect go stack");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ── Test 11: Custom repo with test files detects testing domain ─────────

test("repo with test files detects testing domain", () => {
  const tmp = makeRepoWith({
    "src/utils.test.js": "test('works', () => {})",
  });
  try {
    const result = runSnapshot(tmp);
    const snapshot = parseOutput(result);

    const domainIds = snapshot.domains_detected.map((d) => d.id);
    assert.ok(domainIds.includes("testing"), "should detect testing domain");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("repo with docs/ai/specs detects specification domain", () => {
  const tmp = makeRepoWith({
    "docs/ai/specs/example.md": "# Example spec\n",
  });
  try {
    const result = runSnapshot(tmp);
    const snapshot = parseOutput(result);

    const domainIds = snapshot.domains_detected.map((d) => d.id);
    assert.ok(domainIds.includes("specification"), "should detect specification domain");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ── Test 11b: Custom repo with tsconfig detects typescript ─────────────

test("repo with tsconfig.json detects typescript stack", () => {
  const tmp = makeRepoWith({
    "tsconfig.json": '{"compilerOptions": {"target": "ES2020"}}',
    "src/index.ts": "export const x = 1;",
  });
  try {
    const result = runSnapshot(tmp);
    const snapshot = parseOutput(result);

    const stackIds = snapshot.stacks_detected.map((s) => s.id);
    assert.ok(stackIds.includes("typescript"), "should detect typescript stack");

    const ts = snapshot.stacks_detected.find((s) => s.id === "typescript");
    assert.equal(ts.confidence, "high");
    assert.ok(ts.evidence.includes("tsconfig.json"));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ── Test 12: Output written to file with --output ──────────────────────

test("--output writes JSON to file", () => {
  const repoRoot = path.resolve(scriptDir, "..");
  const outFile = path.join(os.tmpdir(), `opencode-snapshot-test-${Date.now()}.json`);
  try {
    const result = runSnapshot(repoRoot, ["--output", outFile]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(outFile), "output file should exist");

    const content = fs.readFileSync(outFile, "utf8");
    const snapshot = JSON.parse(content);
    assert.equal(snapshot.schema_version, 1);
  } finally {
    fs.rmSync(outFile, { force: true });
  }
});

// ── Test 13: Security domain detects SKILL.md in directory with keyword ──

test("security domain detects skills/security-and-hardening/SKILL.md", () => {
  const repoRoot = path.resolve(scriptDir, "..");
  const result = runSnapshot(repoRoot);
  const snapshot = parseOutput(result);

  const sec = snapshot.domains_detected.find((d) => d.id === "security");
  assert.ok(sec, "should detect security domain");
  const skillFiles = sec.evidence.filter((e) => e.includes("SKILL.md"));
  assert.ok(
    skillFiles.some((f) => f.includes("security-and-hardening")),
    `security domain should include SKILL.md from security-and-hardening directory, got: ${JSON.stringify(skillFiles)}`,
  );
});

// ── Test 14: Debugging domain detects SKILL.md in directory with keyword ──

test("debugging domain detects skills/debugging-and-error-recovery/SKILL.md", () => {
  const repoRoot = path.resolve(scriptDir, "..");
  const result = runSnapshot(repoRoot);
  const snapshot = parseOutput(result);

  const dbg = snapshot.domains_detected.find((d) => d.id === "debugging");
  assert.ok(dbg, "should detect debugging domain");
  const skillFiles = dbg.evidence.filter((e) => e.includes("SKILL.md"));
  assert.ok(
    skillFiles.some((f) => f.includes("debugging-and-error-recovery")),
    `debugging domain should include SKILL.md from debugging-and-error-recovery directory, got: ${JSON.stringify(skillFiles)}`,
  );
});

// ── Test 15: Documentation domain is not duplicated ───────────────────────

test("documentation domain appears exactly once in domains_detected", () => {
  const repoRoot = path.resolve(scriptDir, "..");
  const result = runSnapshot(repoRoot);
  const snapshot = parseOutput(result);

  const docCount = snapshot.domains_detected.filter((d) => d.id === "documentation").length;
  assert.equal(docCount, 1, "documentation should appear exactly once");
});

// ── Test 16: Custom repo with security dir detects security domain ────────

test("repo with security-and-hardening dir detects security domain with SKILL.md", () => {
  const tmp = makeRepoWith({
    "skills/security-and-hardening/SKILL.md": "# Security and Hardening",
  });
  try {
    const result = runSnapshot(tmp);
    const snapshot = parseOutput(result);

    const sec = snapshot.domains_detected.find((d) => d.id === "security");
    assert.ok(sec, "should detect security domain");
    assert.ok(
      sec.evidence.some((e) => e.includes("SKILL.md")),
      `security evidence should include SKILL.md, got: ${JSON.stringify(sec.evidence)}`,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ── Test 17: Custom repo with debugging dir detects debugging domain ──────

test("repo with debugging-and-error-recovery dir detects debugging domain with SKILL.md", () => {
  const tmp = makeRepoWith({
    "skills/debugging-and-error-recovery/SKILL.md": "# Debugging and Error Recovery",
  });
  try {
    const result = runSnapshot(tmp);
    const snapshot = parseOutput(result);

    const dbg = snapshot.domains_detected.find((d) => d.id === "debugging");
    assert.ok(dbg, "should detect debugging domain");
    assert.ok(
      dbg.evidence.some((e) => e.includes("SKILL.md")),
      `debugging evidence should include SKILL.md, got: ${JSON.stringify(dbg.evidence)}`,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
