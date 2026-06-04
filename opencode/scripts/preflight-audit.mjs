#!/usr/bin/env node

/**
 * preflight-audit.mjs
 *
 * Produces a harness preflight audit artifact for a given AHE iteration.
 * This is a mechanical, heuristics-based audit that reads docs/contracts
 * and staged artifacts to produce an objective baseline before proposing
 * harness changes.
 *
 * Usage:
 *   node scripts/preflight-audit.mjs --iteration iteration-XXX
 *
 * Output:
 *   docs/ai/evolution/runs/iteration-XXX/preflight-audit.json
 */

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--iteration") {
      args.iteration = argv[++i];
    } else if (argv[i] === "--output-dir") {
      args.outputDir = argv[++i];
    }
  }
  if (!args.iteration) {
    console.error("Usage: node scripts/preflight-audit.mjs --iteration iteration-XXX");
    process.exit(1);
  }
  return args;
}

// ---------------------------------------------------------------------------
// FS helpers
// ---------------------------------------------------------------------------

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function listMarkdown(dir) {
  const dirPath = path.join(root, dir);
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

// ---------------------------------------------------------------------------
// JSONL helpers
// ---------------------------------------------------------------------------

/**
 * Parse a JSONL file and return parsed objects for each valid line.
 * Used instead of raw substring matching to detect structured agent/command
 * references in execution trees and normalized sessions.
 *
 * Heuristic: we check fields `agent`, `agentName`, `type`, `command`,
 * `commandName` on each parsed line. If the JSONL has no stable schema,
 * this heuristic is documented and tested to reduce false positives.
 */
function parseJsonlFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const records = [];
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        records.push(JSON.parse(trimmed));
      } catch {
        // skip malformed lines
      }
    }
    return records;
  } catch {
    return [];
  }
}

const EVIDENCE_FIELDS = ["agent", "agentName", "type", "command", "commandName"];

function hasStructuredEvidence(records, name) {
  for (const rec of records) {
    if (!rec || typeof rec !== "object") continue;
    for (const field of EVIDENCE_FIELDS) {
      if (typeof rec[field] === "string" && rec[field] === name) return true;
    }
    // Recurse into children arrays (e.g. execution tree nodes)
    if (Array.isArray(rec.children)) {
      if (hasStructuredEvidence(rec.children, name)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Harness surfaces
// ---------------------------------------------------------------------------

function discoverAgents() {
  return listMarkdown("agents");
}

function discoverCommands() {
  return listMarkdown("commands");
}

// ---------------------------------------------------------------------------
// Staged artifacts
// ---------------------------------------------------------------------------

function findStagedArtifacts(iteration) {
  const rawDir = path.join(root, "docs/ai/evolution/runs", iteration, "raw");
  const artifacts = {};

  if (!fs.existsSync(rawDir)) return artifacts;

  const knownArtifacts = [
    "execution-trees.jsonl",
    "normalized-sessions.jsonl",
    "session-sources.summary.json",
    "cursor.json",
  ];

  for (const name of knownArtifacts) {
    const p = path.join(rawDir, name);
    if (fs.existsSync(p)) {
      artifacts[name] = p;
    }
  }

  return artifacts;
}

// ---------------------------------------------------------------------------
// Matrix: doc-runtime alignment per surface
// ---------------------------------------------------------------------------

function buildDocRuntimeMatrix(agents, commands, stagedArtifacts) {
  const matrix = [];

  // Pre-parse JSONL artifacts once for structured evidence detection
  const treesRecords = stagedArtifacts["execution-trees.jsonl"]
    ? parseJsonlFile(stagedArtifacts["execution-trees.jsonl"])
    : [];
  const sessionsRecords = stagedArtifacts["normalized-sessions.jsonl"]
    ? parseJsonlFile(stagedArtifacts["normalized-sessions.jsonl"])
    : [];

  // Agents
  for (const agent of agents) {
    const docPath = `agents/${agent}.md`;
    const docExists = exists(docPath);
    // Structured evidence: parse JSONL and check agent/agentName/type fields
    // instead of raw substring match which can produce false positives
    const hasRuntimeEvidence =
      hasStructuredEvidence(treesRecords, agent) ||
      hasStructuredEvidence(sessionsRecords, agent);

    const aligned = docExists && hasRuntimeEvidence;
    matrix.push({
      type: "agent",
      name: agent,
      doc_exists: docExists,
      runtime_evidence_exists: hasRuntimeEvidence,
      aligned,
    });
  }

  // Commands
  for (const command of commands) {
    const docPath = `commands/${command}.md`;
    const docExists = exists(docPath);
    // Structured evidence: check command/commandName fields in JSONL records
    const hasRuntimeEvidence =
      hasStructuredEvidence(treesRecords, command) ||
      hasStructuredEvidence(sessionsRecords, command);

    const aligned = docExists && hasRuntimeEvidence;
    matrix.push({
      type: "command",
      name: command,
      doc_exists: docExists,
      runtime_evidence_exists: hasRuntimeEvidence,
      aligned,
    });
  }

  // Workflow surfaces (harness-level contracts)
  const workflowDocs = [
    { name: "evolve", path: "commands/evolve.md" },
    { name: "feature", path: "commands/feature.md" },
    { name: "plan", path: "commands/plan.md" },
    { name: "scope", path: "commands/scope.md" },
  ];
  for (const wf of workflowDocs) {
    const docExists = exists(wf.path);
    matrix.push({
      type: "workflow",
      name: wf.name,
      doc_exists: docExists,
      runtime_evidence_exists: false,
      aligned: docExists,
    });
  }

  // Evidence surfaces
  const evidenceDocs = [
    { name: "evidence", path: "docs/ai/harness/evidence.md" },
    { name: "session-sources", path: "docs/ai/evolution/session-sources.md" },
  ];
  for (const ev of evidenceDocs) {
    const docExists = exists(ev.path);
    matrix.push({
      type: "evidence",
      name: ev.name,
      doc_exists: docExists,
      runtime_evidence_exists: false,
      aligned: docExists,
    });
  }

  return matrix;
}

// ---------------------------------------------------------------------------
// Drift detection
// ---------------------------------------------------------------------------

function detectDrifts(matrix, stagedArtifacts) {
  const drifts = [];

  // Drift type 1: Documented agent with no runtime evidence
  for (const entry of matrix) {
    if (entry.type === "agent" && entry.doc_exists && !entry.runtime_evidence_exists) {
      drifts.push({
        surface: entry.name,
        type: "missing_evidence",
        description: `Agent \`${entry.name}\` is documented but has no runtime evidence in staged artifacts`,
        severity: "medium",
      });
    }
  }

  // Drift type 2: Documented command with no runtime evidence
  for (const entry of matrix) {
    if (entry.type === "command" && entry.doc_exists && !entry.runtime_evidence_exists) {
      drifts.push({
        surface: entry.name,
        type: "missing_evidence",
        description: `Command \`${entry.name}\` is documented but has no runtime evidence in staged artifacts`,
        severity: "low",
      });
    }
  }

  // Drift type 3: Missing documentation for discovered surface
  for (const entry of matrix) {
    if (!entry.doc_exists) {
      drifts.push({
        surface: entry.name,
        type: "missing_docs",
        description: `${entry.type} \`${entry.name}\` exists but has no documentation`,
        severity: entry.type === "agent" ? "high" : "medium",
      });
    }
  }

  // Drift type 4: Missing staged artifacts entirely
  const hasTrees = "execution-trees.jsonl" in stagedArtifacts;
  const hasCursor = "cursor.json" in stagedArtifacts;
  if (!hasTrees && !hasCursor) {
    drifts.push({
      surface: "session_sources",
      type: "missing_staging",
      description: "No staged session artifacts (execution-trees.jsonl, cursor.json) found for this iteration",
      severity: "medium",
    });
  }

  // Drift type 5: Runtime contradicts contract (heuristic: agent appears in trees
  // but the flow order documented in evolve.md is violated)
  if (hasTrees) {
    try {
      const trees = fs.readFileSync(stagedArtifacts["execution-trees.jsonl"], "utf8");
      // Simple heuristic: check if sidecar agents appear where they shouldn't
      const sidecars = ["evaluator", "debugger", "evolver"];
      const featureFlow = exists("commands/feature.md") ? read("commands/feature.md") : "";
      if (featureFlow.includes("Flujo obligatorio")) {
        const flowSection = featureFlow.split("## Flujo obligatorio")[1]?.split("## Reglas")[0] || "";
        for (const sidecar of sidecars) {
          if (flowSection.includes(sidecar)) {
            drifts.push({
              surface: "feature_flow",
              type: "runtime_contradiction",
              description: `Sidecar \`${sidecar}\` appears in mandatory feature flow, contradicting AHE sidecar-only contract`,
              severity: "high",
            });
          }
        }
      }
    } catch {
      // ignore read errors
    }
  }

  return drifts;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function computeScores(matrix, drifts) {
  const total = matrix.length;
  if (total === 0) {
    return {
      contract_coverage: 0,
      runtime_evidence_coverage: 0,
      doc_runtime_alignment: 0,
      drift_severity: "none",
    };
  }

  const docsPresent = matrix.filter((m) => m.doc_exists).length;
  const evidencePresent = matrix.filter((m) => m.runtime_evidence_exists).length;
  const aligned = matrix.filter((m) => m.aligned).length;

  const contract_coverage = docsPresent / total;
  const runtime_evidence_coverage = evidencePresent / total;
  const doc_runtime_alignment = aligned / total;

  // Drift severity: worst among all drifts
  let drift_severity = "none";
  for (const d of drifts) {
    if (d.severity === "high") { drift_severity = "high"; break; }
    if (d.severity === "medium" && drift_severity !== "high") drift_severity = "medium";
    if (d.severity === "low" && drift_severity === "none") drift_severity = "low";
  }

  return { contract_coverage, runtime_evidence_coverage, doc_runtime_alignment, drift_severity };
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

function generateRecommendations(matrix, drifts, scores) {
  const recs = [];

  // From drifts
  for (const drift of drifts) {
    if (drift.type === "runtime_contradiction") {
      recs.push({
        priority: "high",
        description: `Resolve runtime contradiction: ${drift.description}`,
        surface: drift.surface,
      });
    } else if (drift.type === "missing_docs") {
      recs.push({
        priority: drift.severity === "high" ? "high" : "medium",
        description: `Add documentation for ${drift.type.replace(/_/g, " ")}: \`${drift.surface}\``,
        surface: drift.surface,
      });
    } else if (drift.type === "missing_staging") {
      recs.push({
        priority: "medium",
        description: "Run `node scripts/collect-session-evidence.mjs --iteration <iteration>` to produce staged artifacts",
        surface: "session_sources",
      });
    } else if (drift.type === "missing_evidence") {
      recs.push({
        priority: "low",
        description: `Collect runtime evidence for documented surface: \`${drift.surface}\``,
        surface: drift.surface,
      });
    }
  }

  // From scores
  if (scores.contract_coverage < 0.8) {
    recs.push({
      priority: "medium",
      description: `Contract coverage is low (${(scores.contract_coverage * 100).toFixed(0)}%): ensure all agents and commands have documentation`,
      surface: "harness",
    });
  }

  if (scores.runtime_evidence_coverage < 0.3) {
    recs.push({
      priority: "low",
      description: `Runtime evidence coverage is low (${(scores.runtime_evidence_coverage * 100).toFixed(0)}%): consider collecting more session evidence`,
      surface: "session_sources",
    });
  }

  // Sort by priority
  const order = { high: 0, medium: 1, low: 2 };
  recs.sort((a, b) => order[a.priority] - order[b.priority]);

  return recs;
}

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

function computeConfidence(scores, drifts, hasStagedArtifacts) {
  if (scores.drift_severity === "high") return "low";
  if (!hasStagedArtifacts) return "low";
  if (drifts.length === 0 && scores.contract_coverage > 0.9) return "high";
  if (scores.contract_coverage > 0.7 && scores.drift_severity !== "high") return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv);
  const iteration = args.iteration;

  // Discover surfaces
  const agents = discoverAgents();
  const commands = discoverCommands();

  // Find staged artifacts
  const stagedArtifacts = findStagedArtifacts(iteration);
  const hasStagedArtifacts = Object.keys(stagedArtifacts).length > 0;

  // Build matrix
  const docRuntimeMatrix = buildDocRuntimeMatrix(agents, commands, stagedArtifacts);

  // Detect drifts
  const drifts = detectDrifts(docRuntimeMatrix, stagedArtifacts);

  // Compute scores
  const scores = computeScores(docRuntimeMatrix, drifts);

  // Generate recommendations
  const recommendations = generateRecommendations(docRuntimeMatrix, drifts, scores);

  // Compute confidence
  const confidence = computeConfidence(scores, drifts, hasStagedArtifacts);

  // Build artifact
  const artifact = {
    iteration,
    timestamp: new Date().toISOString(),
    scores,
    doc_runtime_matrix: docRuntimeMatrix,
    drifts,
    recommendations,
    coverage: {
      agents_scanned: agents.length,
      commands_scanned: commands.length,
      surfaces_total: docRuntimeMatrix.length,
      staged_artifacts_found: Object.keys(stagedArtifacts),
    },
    confidence,
  };

  // Write output
  const outDir = args.outputDir
    ? path.resolve(root, args.outputDir)
    : path.join(root, "docs/ai/evolution/runs", iteration);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "preflight-audit.json");
  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2) + "\n");

  console.log(`Preflight audit written to ${outPath}`);
  console.log(`  confidence: ${confidence}`);
  console.log(`  drifts: ${drifts.length}`);
  console.log(`  recommendations: ${recommendations.length}`);
}

main();
