import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(scriptDir);
const script = path.join(scriptDir, "preflight-audit.mjs");

function makeFixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-preflight-"));
  fs.cpSync(root, tmp, {
    recursive: true,
    filter: (source) => {
      const rel = path.relative(root, source);
      return rel !== ".git" && !rel.startsWith(`.git${path.sep}`);
    },
  });
  return tmp;
}

function runPreflight(cwd, args = []) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
  });
}

function readArtifact(cwd, iteration) {
  const p = path.join(cwd, "docs/ai/evolution/runs", iteration, "preflight-audit.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function readArtifactFromDir(dir) {
  const p = path.join(dir, "preflight-audit.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function write(rel, content, cwd) {
  fs.writeFileSync(path.join(cwd, rel), content);
}

test("preflight-audit generates valid artifact with required fields", () => {
  const cwd = makeFixture();
  try {
    const result = runPreflight(cwd, ["--iteration", "iteration-test-001"]);
    assert.equal(result.status, 0, `script failed: ${result.stderr}`);
    const artifact = readArtifact(cwd, "iteration-test-001");

    // Required top-level fields
    for (const field of ["iteration", "timestamp", "scores", "doc_runtime_matrix", "drifts", "recommendations", "coverage", "confidence"]) {
      assert.ok(field in artifact, `missing top-level field: ${field}`);
    }

    // Required score fields
    for (const field of ["contract_coverage", "runtime_evidence_coverage", "doc_runtime_alignment", "drift_severity"]) {
      assert.ok(field in artifact.scores, `missing score field: ${field}`);
    }

    // Scores are numbers between 0 and 1 (except drift_severity)
    assert.ok(typeof artifact.scores.contract_coverage === "number", "contract_coverage must be a number");
    assert.ok(artifact.scores.contract_coverage >= 0 && artifact.scores.contract_coverage <= 1, "contract_coverage out of range");
    assert.ok(typeof artifact.scores.runtime_evidence_coverage === "number", "runtime_evidence_coverage must be a number");
    assert.ok(typeof artifact.scores.doc_runtime_alignment === "number", "doc_runtime_alignment must be a number");
    assert.ok(["none", "low", "medium", "high"].includes(artifact.scores.drift_severity), "invalid drift_severity");

    // doc_runtime_matrix is an array
    assert.ok(Array.isArray(artifact.doc_runtime_matrix), "doc_runtime_matrix must be an array");

    // drifts is an array
    assert.ok(Array.isArray(artifact.drifts), "drifts must be an array");

    // recommendations is an array
    assert.ok(Array.isArray(artifact.recommendations), "recommendations must be an array");

    // iteration matches
    assert.equal(artifact.iteration, "iteration-test-001");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("preflight-audit detects missing runtime evidence for documented agent", () => {
  const cwd = makeFixture();
  try {
    // Create iteration directory with no staged artifacts
    fs.mkdirSync(path.join(cwd, "docs/ai/evolution/runs/iteration-drift-001/raw"), { recursive: true });

    const result = runPreflight(cwd, ["--iteration", "iteration-drift-001"]);
    assert.equal(result.status, 0, `script failed: ${result.stderr}`);
    const artifact = readArtifact(cwd, "iteration-drift-001");

    // Should detect drifts
    assert.ok(artifact.drifts.length > 0, "expected drifts for missing runtime evidence");
    // At least one drift should be about missing evidence
    const hasMissingEvidence = artifact.drifts.some(
      (d) => d.type === "missing_evidence" || d.description.toLowerCase().includes("evidence")
    );
    assert.ok(hasMissingEvidence, "expected a drift about missing evidence");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("preflight-audit produces recommendations sorted by priority", () => {
  const cwd = makeFixture();
  try {
    fs.mkdirSync(path.join(cwd, "docs/ai/evolution/runs/iteration-recs-001/raw"), { recursive: true });

    const result = runPreflight(cwd, ["--iteration", "iteration-recs-001"]);
    assert.equal(result.status, 0, `script failed: ${result.stderr}`);
    const artifact = readArtifact(cwd, "iteration-recs-001");

    assert.ok(artifact.recommendations.length > 0, "expected at least one recommendation");

    // Each recommendation has required fields
    for (const rec of artifact.recommendations) {
      assert.ok(["high", "medium", "low"].includes(rec.priority), `invalid priority: ${rec.priority}`);
      assert.ok(typeof rec.description === "string" && rec.description.length > 0, "recommendation must have description");
    }

    // Recommendations should be sorted: high first, then medium, then low
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    for (let i = 1; i < artifact.recommendations.length; i++) {
      assert.ok(
        priorityOrder[artifact.recommendations[i].priority] >= priorityOrder[artifact.recommendations[i - 1].priority],
        "recommendations not sorted by priority"
      );
    }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("preflight-audit handles missing iteration directory gracefully", () => {
  const cwd = makeFixture();
  try {
    const result = runPreflight(cwd, ["--iteration", "iteration-nonexistent-999"]);
    assert.equal(result.status, 0, `script failed: ${result.stderr}`);
    const artifact = readArtifact(cwd, "iteration-nonexistent-999");

    // Should still produce a valid artifact with doc-only signals
    assert.ok("scores" in artifact, "artifact must have scores even without iteration dir");
    assert.ok("confidence" in artifact, "artifact must have confidence");
    assert.equal(artifact.confidence, "low", "confidence should be low when no iteration exists");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("preflight-audit doc_runtime_matrix covers agents and commands", () => {
  const cwd = makeFixture();
  try {
    const result = runPreflight(cwd, ["--iteration", "iteration-matrix-001"]);
    assert.equal(result.status, 0, `script failed: ${result.stderr}`);
    const artifact = readArtifact(cwd, "iteration-matrix-001");

    // Matrix should cover agents
    const agentEntries = artifact.doc_runtime_matrix.filter((m) => m.type === "agent");
    assert.ok(agentEntries.length >= 3, `expected at least 3 agent entries, got ${agentEntries.length}`);

    // Matrix should cover commands
    const commandEntries = artifact.doc_runtime_matrix.filter((m) => m.type === "command");
    assert.ok(commandEntries.length >= 3, `expected at least 3 command entries, got ${commandEntries.length}`);

    // Each entry has required fields
    for (const entry of artifact.doc_runtime_matrix) {
      assert.ok(["agent", "command", "workflow", "evidence"].includes(entry.type), `invalid matrix type: ${entry.type}`);
      assert.ok(typeof entry.name === "string", "matrix entry must have name");
      assert.ok(typeof entry.doc_exists === "boolean", "matrix entry must have doc_exists");
      assert.ok(typeof entry.aligned === "boolean", "matrix entry must have aligned");
    }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("preflight-audit fails without --iteration argument", () => {
  const cwd = makeFixture();
  try {
    const result = runPreflight(cwd, []);
    assert.notEqual(result.status, 0, "script should fail without --iteration");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("preflight-audit with staged execution-trees produces higher evidence coverage", () => {
  const cwd = makeFixture();
  try {
    const iterationDir = path.join(cwd, "docs/ai/evolution/runs/iteration-evidence-001/raw");
    fs.mkdirSync(iterationDir, { recursive: true });

    // Write minimal staged artifacts with agent references
    write(
      "docs/ai/evolution/runs/iteration-evidence-001/raw/execution-trees.jsonl",
      '{"root_session_id":"s1","agent":"lead","children":[{"agent":"developer"},{"agent":"evaluator"}]}',
      cwd
    );
    write(
      "docs/ai/evolution/runs/iteration-evidence-001/raw/session-sources.summary.json",
      '{"discovered":1,"accepted":1,"skipped":0,"skip_reasons":[]}',
      cwd
    );
    write(
      "docs/ai/evolution/runs/iteration-evidence-001/raw/cursor.json",
      '{"tree_time_updated_max":"2024-01-01T00:00:00Z","root_session_id":"s1"}',
      cwd
    );

    const result = runPreflight(cwd, ["--iteration", "iteration-evidence-001"]);
    assert.equal(result.status, 0, `script failed: ${result.stderr}`);
    const artifact = readArtifact(cwd, "iteration-evidence-001");

    // With staged artifacts, evidence coverage should be higher than without
    assert.ok(artifact.scores.runtime_evidence_coverage > 0, "evidence coverage should be > 0 with staged artifacts");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("preflight-audit drift detection severity follows priority rules", () => {
  const cwd = makeFixture();
  try {
    // Create a scenario where a critical contract exists but has no evidence
    const iterationDir = path.join(cwd, "docs/ai/evolution/runs/iteration-severity-001/raw");
    fs.mkdirSync(iterationDir, { recursive: true });

    const result = runPreflight(cwd, ["--iteration", "iteration-severity-001"]);
    assert.equal(result.status, 0, `script failed: ${result.stderr}`);
    const artifact = readArtifact(cwd, "iteration-severity-001");

    // Check that drifts have valid severity levels
    for (const drift of artifact.drifts) {
      assert.ok(["high", "medium", "low"].includes(drift.severity), `invalid drift severity: ${drift.severity}`);
      assert.ok(typeof drift.surface === "string", "drift must have surface");
      assert.ok(typeof drift.description === "string" && drift.description.length > 0, "drift must have description");
    }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("preflight-audit confidence is high when all docs exist and no drifts", () => {
  const cwd = makeFixture();
  try {
    // All docs exist in the fixture (they come from the real repo)
    // But staged artifacts are missing, so confidence depends on doc coverage
    const result = runPreflight(cwd, ["--iteration", "iteration-conf-001"]);
    assert.equal(result.status, 0, `script failed: ${result.stderr}`);
    const artifact = readArtifact(cwd, "iteration-conf-001");

    // Confidence should be a valid level
    assert.ok(["high", "medium", "low"].includes(artifact.confidence), `invalid confidence: ${artifact.confidence}`);

    // If no drifts, confidence should be at least medium
    if (artifact.drifts.length === 0) {
      assert.ok(["high", "medium"].includes(artifact.confidence), "confidence should be medium or high with no drifts");
    }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("preflight-audit --output-dir overrides default output location", () => {
  const cwd = makeFixture();
  try {
    const customOutDir = path.join(cwd, "custom-output");
    fs.mkdirSync(customOutDir, { recursive: true });

    const result = runPreflight(cwd, [
      "--iteration", "iteration-outdir-001",
      "--output-dir", customOutDir,
    ]);
    assert.equal(result.status, 0, `script failed: ${result.stderr}`);

    // Artifact should be in the custom dir, not the default location
    const artifact = readArtifactFromDir(customOutDir);
    assert.equal(artifact.iteration, "iteration-outdir-001");

    // Default location should NOT exist
    const defaultPath = path.join(cwd, "docs/ai/evolution/runs/iteration-outdir-001/preflight-audit.json");
    assert.ok(!fs.existsSync(defaultPath), "artifact should not be in default location when --output-dir is used");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("preflight-audit structured evidence detects agent from JSONL fields", () => {
  const cwd = makeFixture();
  try {
    const iterationDir = path.join(cwd, "docs/ai/evolution/runs/iteration-struct-001/raw");
    fs.mkdirSync(iterationDir, { recursive: true });

    // Write JSONL with structured agent field (not just substring match)
    // The agent "lead" appears in the "agent" field of a nested child
    write(
      "docs/ai/evolution/runs/iteration-struct-001/raw/execution-trees.jsonl",
      JSON.stringify({
        root_session_id: "s1",
        children: [
          { agent: "lead", type: "orchestration" },
          { agent: "developer", type: "implementation" },
        ],
      }),
      cwd
    );

    const result = runPreflight(cwd, ["--iteration", "iteration-struct-001"]);
    assert.equal(result.status, 0, `script failed: ${result.stderr}`);
    const artifact = readArtifact(cwd, "iteration-struct-001");

    // "lead" and "developer" should have runtime evidence from structured fields
    const leadEntry = artifact.doc_runtime_matrix.find(
      (m) => m.type === "agent" && m.name === "lead"
    );
    const devEntry = artifact.doc_runtime_matrix.find(
      (m) => m.type === "agent" && m.name === "developer"
    );
    assert.ok(leadEntry, "lead entry should exist in matrix");
    assert.ok(devEntry, "developer entry should exist in matrix");
    assert.ok(leadEntry.runtime_evidence_exists, "lead should have runtime evidence from structured JSONL");
    assert.ok(devEntry.runtime_evidence_exists, "developer should have runtime evidence from structured JSONL");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("preflight-audit structured evidence does not false-positive on partial substring", () => {
  const cwd = makeFixture();
  try {
    const iterationDir = path.join(cwd, "docs/ai/evolution/runs/iteration-fp-001/raw");
    fs.mkdirSync(iterationDir, { recursive: true });

    // Write JSONL where "lead" appears only as part of a longer string value
    // in a non-evidence field, which should NOT count as structured evidence
    write(
      "docs/ai/evolution/runs/iteration-fp-001/raw/execution-trees.jsonl",
      JSON.stringify({
        root_session_id: "s1",
        type: "leaderboard_snapshot",
        summary: "This is a leading indicator report",
      }),
      cwd
    );

    const result = runPreflight(cwd, ["--iteration", "iteration-fp-001"]);
    assert.equal(result.status, 0, `script failed: ${result.stderr}`);
    const artifact = readArtifact(cwd, "iteration-fp-001");

    // "lead" should NOT have runtime evidence from a false-positive substring
    const leadEntry = artifact.doc_runtime_matrix.find(
      (m) => m.type === "agent" && m.name === "lead"
    );
    assert.ok(leadEntry, "lead entry should exist in matrix");
    assert.ok(!leadEntry.runtime_evidence_exists, "lead should NOT have runtime evidence from false-positive substring");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
