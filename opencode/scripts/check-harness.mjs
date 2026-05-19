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

function stripMarkdownExtension(rel) {
  return path.basename(rel, ".md");
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

function frontmatterBlock(rel) {
  const text = read(rel);
  if (!text.startsWith("---\n")) return "";
  const end = text.indexOf("\n---", 4);
  if (end === -1) return "";
  return text.slice(4, end);
}

function requireFields(rel, object, fields) {
  for (const field of fields) {
    if (!object[field]) fail(`${rel}: missing ${field}`);
  }
}

function checkAgentsIndex() {
  const text = read("AGENTS.md");
  const nonBlankLines = text.split("\n").filter((line) => line.trim()).length;
  const maxNonBlankLines = 120;

  if (nonBlankLines > maxNonBlankLines) {
    fail(`AGENTS.md: must stay a short index (${nonBlankLines}/${maxNonBlankLines} non-blank lines)`);
  }

  for (const token of ["docs/ai/harness/", "docs/ai/evolution/"]) {
    if (!text.includes(token)) fail(`AGENTS.md: missing index reference ${token}`);
  }
}

function checkAgentDocsCoverage() {
  const docs = read("docs/ai/harness/agents.md");
  for (const rel of listMarkdown("agents")) {
    const agent = stripMarkdownExtension(rel);
    if (!docs.includes(`\`${agent}\``)) {
      fail(`docs/ai/harness/agents.md: missing documented agent \`${agent}\``);
    }
  }
}

function checkCommandDocsCoverage() {
  const docs = read("docs/ai/harness/commands.md");
  for (const rel of listMarkdown("commands")) {
    const command = stripMarkdownExtension(rel);
    if (!docs.includes(`/${command}`)) {
      fail(`docs/ai/harness/commands.md: missing documented command /${command}`);
    }
  }
}

function checkConfig() {
  const config = parseJson("opencode.json");
  if (!config) return;
  if (config.default_agent !== "lead") {
    fail("opencode.json: default_agent must remain lead");
  }
}

/**
 * Verify that all given regex patterns match the text.
 * Each pattern is either a RegExp, a string treated as literal, or an object
 * with a regex and optional literal fallbacks.
 */
function checkSemantic(text, patterns, label) {
  for (let i = 0; i < patterns.length; i++) {
    const p = patterns[i];
    const re =
      p instanceof RegExp
        ? p
        : p.regex instanceof RegExp
          ? p.regex
          : new RegExp("\\b" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
    const fallbackLiterals = p.fallbackLiterals ?? [];
    if (!re.test(text) && !fallbackLiterals.some((token) => text.includes(token))) {
      const desc = p instanceof RegExp ? p.source : p.description ?? p.regex?.source ?? p;
      fail(`${label}[${i}]: no match for /${desc}/`);
    }
  }
}

function checkLeadRouterContract() {
  const text = read("agents/lead.md");
  const frontmatter = frontmatterBlock("agents/lead.md");

  if (!/^\s*edit:\s*deny\s*$/m.test(frontmatter)) {
    fail("agents/lead.md: lead edit permission must remain deny");
  }

  for (const command of [
    '"cd": allow',
    '"cd *": allow',
    '"which": allow',
    '"which *": allow',
  ]) {
    if (!frontmatter.includes(command)) {
      fail(`agents/lead.md: missing bash allow ${command}`);
    }
  }

  for (const token of [
    "developer",
    "researcher",
    "designer",
    "specifier",
    "`researcher`",
    "`reviewer`",
  ]) {
    if (!text.includes(token)) fail(`agents/lead.md: missing ${token}`);
  }

  checkSemantic(text, [
    /\b(fast|quick|rapid|agile|lightweight)\s+router\b/i,
    /\b(ask|consult)\s+the\s+user\b/i,
    /\b(real|genuine|material|meaningful)\s+ambiguity\b/i,
    {
      regex: /\bdo\s+not\s+(edit|modify|change|alter)\s+code\b/i,
      fallbackLiterals: ["Do not edit code"],
    },
    /\b(whole|entire)\s+(loop|cycle)\s+of\s+the\s+same\s+free-form\s+request\b/i,
    /\b(send|return|route|pass)\s+a\s+bounded\s+(task|correction)\s+back\s+to\s+\`developer\`/i,
    /\b(implementation\s+)?(correction|fix|adjustment|change)\s+goes\s+back\s+to\s+\`developer\`/i,
    {
      regex: /\bdoes\s+not\s+(develop|code|implement|program)\b/i,
      fallbackLiterals: ["does not develop"],
    },
    {
      regex: /\bdoes\s+not\s+(deeply\s+)?(investigate|inspect|analyze|analyse)\s+code\b/i,
      fallbackLiterals: ["does not deeply"],
    },
    /\bminimum\s+context\s+needed\s+to\b/i,
    /\bdelegate\s+to\s+\`researcher\`/i,
    /\bdo\s+not\s+(mentally\s+)?(implement|design|solve|build)\s+the\s+(solution|problem)\s+before\s+delegating\b/i,
    /\bhandoff\s+to\s+another\b/i,
    /\bmust\s+be\s+self-contained\b/i,
    /\bdo\s+not\s+(review|inspect)\s+a\s+diff\s+yourself\b/i,
  ], "agents/lead.md semantic invariant");

  const docs = read("docs/ai/harness/agents.md");
  if (!docs.includes("belongs to `reviewer`")) {
    fail("docs/ai/harness/agents.md: missing belongs to `reviewer`");
  }

  checkSemantic(docs, [
    /\`lead\`\s+does\s+not\s+(edit|modify|change|alter)\s+files\b/i,
    /\b(later|subsequent)\s+(adjustments|corrections|fixes|changes)\s+for\s+that\s+same\s+free-form\s+request\s+go\s+back\s+to\s+\`developer\`/i,
    /\`lead\`\s+does\s+not\s+(develop|code|implement|program)\b/i,
    /\bdelegates\s+(substantive|meaningful|deep)\s+discovery\s+to\s+\`researcher\`/i,
    /\bevery\s+\`lead\`\s+handoff\s+to\s+another\s+agent\s+must\s+be\s+self-contained\b/i,
  ], "docs/ai/harness/agents.md semantic invariant");

  const commandDocs = read("docs/ai/harness/commands.md");
  checkSemantic(commandDocs, [
    /\bunderstand\s+(code\s+behavior|how\s+the\s+code\s+works|the\s+code)\b/i,
    /\bdelegates\s+to\s+\`researcher\`/i,
    /\bdelegate\s+review\s+to\s+\`reviewer\`/i,
    /\`lead\`\s+does\s+not\s+replace\s+\`reviewer\`/i,
  ], "docs/ai/harness/commands.md semantic invariant");
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

function checkPlanContract() {
  const rel = "commands/plan.md";
  if (!exists(rel)) {
    fail(`${rel}: missing plan command`);
    return;
  }

  const text = read(rel);
  for (const token of [
    "lead -> researcher -> specifier -> reviewer",
    "Do not invoke developer",
    "1 correction pass",
  ]) {
    if (!text.includes(token)) fail(`${rel}: missing ${token}`);
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

function collectReferencedPathStrings(value, strings = [], key = "") {
  if (typeof value === "string") {
    if (key === "files" || key === "evidence") strings.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectReferencedPathStrings(item, strings, key);
  } else if (value && typeof value === "object") {
    for (const [childKey, item] of Object.entries(value)) {
      collectReferencedPathStrings(item, strings, childKey);
    }
  }
  return strings;
}

function localPathFromString(value) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.+?\.(?:md|json|mjs|js|ts|tsx|txt))(?:[:#,].*)?$/);
  if (!match) return null;

  const rel = match[1];
  if (rel.startsWith("http://") || rel.startsWith("https://")) return null;
  if (rel.startsWith("/")) return null;
  return rel;
}

function checkReferencedJsonPaths(rel, json) {
  if (!json) return;
  const runRel = path.dirname(rel);

  for (const value of collectReferencedPathStrings(json)) {
    const localPath = localPathFromString(value);
    if (!localPath) continue;

    const candidates = localPath.startsWith("docs/")
      ? [localPath]
      : [path.join(runRel, localPath), localPath];
    if (!candidates.some((candidate) => exists(candidate))) {
      fail(`${rel}: referenced local path does not exist: ${localPath}`);
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
  checkReferencedJsonPaths(rel, manifest);
}

function checkEvolutionRuns() {
  const runsDir = path.join(root, "docs/ai/evolution/runs");
  if (!fs.existsSync(runsDir)) return;

  for (const name of fs.readdirSync(runsDir)) {
    const runPath = path.join(runsDir, name);
    if (!fs.statSync(runPath).isDirectory()) continue;
    const rel = `docs/ai/evolution/runs/${name}`;
    const hasEvaluation = exists(`${rel}/evaluation.md`);
    const hasAnalysis = exists(`${rel}/analysis/overview.md`);
    const hasManifest = exists(`${rel}/change_manifest.json`);

    if (!hasEvaluation) fail(`${rel}: missing evaluation.md`);
    if (hasManifest && !hasAnalysis) fail(`${rel}: missing analysis/overview.md`);
    if (hasManifest) validateManifest(`${rel}/change_manifest.json`);
    if (hasManifest && !exists(`${rel}/change_evaluation.json`)) {
      fail(`${rel}: manifest exists without change_evaluation.json`);
    }
    if (exists(`${rel}/change_evaluation.json`)) {
      checkReferencedJsonPaths(`${rel}/change_evaluation.json`, parseJson(`${rel}/change_evaluation.json`));
    }
  }
}

checkConfig();
checkAgentsIndex();
checkFrontmatter();
checkAgentDocsCoverage();
checkCommandDocsCoverage();
checkLeadRouterContract();
checkFeatureContract();
checkPlanContract();
checkHarnessDocs();
checkEvolutionRuns();

if (errors.length > 0) {
  console.error("Harness check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Harness check passed.");
