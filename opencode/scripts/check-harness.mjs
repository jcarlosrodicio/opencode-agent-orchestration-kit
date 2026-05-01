#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const errors = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function listMarkdown(dir) {
  return fs
    .readdirSync(path.join(root, dir))
    .filter((file) => file.endsWith(".md"))
    .map((file) => path.join(dir, file));
}

function fail(message) {
  errors.push(message);
}

function parseJson(rel) {
  try {
    return JSON.parse(read(rel));
  } catch (error) {
    fail(`${rel}: invalid JSON (${error.message})`);
    return null;
  }
}

function parseFrontmatter(rel) {
  const text = read(rel);
  if (!text.startsWith("---\n")) {
    fail(`${rel}: missing frontmatter`);
    return {};
  }

  const end = text.indexOf("\n---", 4);
  if (end === -1) {
    fail(`${rel}: unclosed frontmatter`);
    return {};
  }

  const data = {};
  const block = text.slice(4, end).split("\n");
  for (const line of block) {
    if (!line.trim()) continue;
    if (/^\s/.test(line)) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!match) {
      fail(`${rel}: malformed frontmatter line "${line}"`);
      continue;
    }
    data[match[1]] = match[2].replace(/^"(.*)"$/, "$1");
  }
  return data;
}

function requireFields(rel, object, fields) {
  for (const field of fields) {
    if (!object[field]) fail(`${rel}: missing ${field}`);
  }
}

function checkConfig() {
  const config = parseJson("opencode.json");
  if (!config) return;
  if (config.default_agent !== "developer") {
    fail("opencode.json: default_agent must remain developer");
  }
}

function checkFrontmatter() {
  for (const rel of listMarkdown("agents")) {
    requireFields(rel, parseFrontmatter(rel), ["description", "mode"]);
  }
  for (const rel of listMarkdown("commands")) {
    requireFields(rel, parseFrontmatter(rel), ["description", "agent"]);
  }
}

function checkFeatureContract() {
  const text = read("commands/feature.md");
  const requiredFlow =
    "lead -> designer if applicable -> researcher -> specifier -> developer -> reviewer";
  if (!text.includes(requiredFlow)) {
    fail("commands/feature.md: missing exact base feature flow");
  }

  const flowSection = text.split("## Mandatory flow")[1]?.split("AHE sidecars")[0] || "";
  if (/\b(evaluator|debugger|evolver)\b/.test(flowSection)) {
    fail("commands/feature.md: sidecar appears in mandatory feature flow");
  }
}

function checkHarnessDocs() {
  const required = [
    "docs/ai/harness/README.md",
    "docs/ai/harness/agents.md",
    "docs/ai/harness/commands.md",
    "docs/ai/harness/evidence.md",
    "docs/ai/harness/checks.md",
    "docs/ai/evolution/README.md",
    "docs/ai/evolution/evolution_history.md",
    "docs/ai/evolution/benchmarks/manual-scenarios.md",
  ];
  for (const rel of required) {
    if (!exists(rel)) fail(`${rel}: missing harness doc`);
  }

  if (exists("docs/ai/evolution/benchmarks/manual-scenarios.md")) {
    const text = read("docs/ai/evolution/benchmarks/manual-scenarios.md");
    for (const token of [
      "opencode run --format json --thinking",
      "static_contract",
      "transcript_replay",
      "live_smoke",
      "manual_oracle",
    ]) {
      if (!text.includes(token)) {
        fail(`docs/ai/evolution/benchmarks/manual-scenarios.md: missing ${token}`);
      }
    }
  }
}

function validateManifest(rel) {
  const manifest = parseJson(rel);
  if (!manifest) return;
  if (!Array.isArray(manifest.changes) || manifest.changes.length === 0) {
    fail(`${rel}: changes must be a non-empty array`);
    return;
  }
  for (const [index, change] of manifest.changes.entries()) {
    const prefix = `${rel}: changes[${index}]`;
    for (const field of [
      "id",
      "type",
      "description",
      "files",
      "failure_pattern",
      "evidence",
      "predicted_fixes",
      "risk_tasks",
      "constraint_level",
      "why_this_component",
    ]) {
      if (change[field] === undefined) fail(`${prefix}: missing ${field}`);
    }
  }
}

function checkEvolutionRuns() {
  const runsDir = path.join(root, "docs/ai/evolution/runs");
  if (!fs.existsSync(runsDir)) return;

  for (const name of fs.readdirSync(runsDir)) {
    const runPath = path.join(runsDir, name);
    if (!fs.statSync(runPath).isDirectory()) continue;
    const rel = `docs/ai/evolution/runs/${name}`;
    if (!exists(`${rel}/evaluation.md`)) fail(`${rel}: missing evaluation.md`);
    if (!exists(`${rel}/analysis/overview.md`)) fail(`${rel}: missing analysis/overview.md`);
    if (exists(`${rel}/change_manifest.json`)) validateManifest(`${rel}/change_manifest.json`);
    if (exists(`${rel}/change_manifest.json`) && !exists(`${rel}/change_evaluation.json`)) {
      fail(`${rel}: manifest exists without change_evaluation.json`);
    }
    if (exists(`${rel}/change_evaluation.json`)) parseJson(`${rel}/change_evaluation.json`);
  }
}

checkConfig();
checkFrontmatter();
checkFeatureContract();
checkHarnessDocs();
checkEvolutionRuns();

if (errors.length > 0) {
  console.error("Harness check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Harness check passed.");
