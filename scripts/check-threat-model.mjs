#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.dirname(path.dirname(SCRIPT_PATH));
const MODEL_PATH = path.join(ROOT, "docs/threat-model.md");
const AGENTS_PATH = path.join(ROOT, "opencode/agents");
const SCENARIOS_PATH = path.join(
  ROOT,
  "opencode/docs/ai/evolution/benchmarks/adversarial-scenarios.jsonl",
);

const REQUIRED_SECTIONS = [
  "Scope and security objectives",
  "Actors",
  "Assets",
  "Trust boundaries",
  "Agent capabilities",
  "External surfaces",
  "Persistence surfaces",
  "Data flows",
  "Risk register",
  "Adversarial traceability",
  "Residual risks and assumptions",
  "Private and public boundary",
];
const SEVERITIES = new Set(["high", "medium", "low"]);
const STATUSES = new Set([
  "mitigated",
  "partially-mitigated",
  "accepted",
  "out-of-scope",
]);
const EVIDENCE_PREFIXES = ["test:", "check:", "limitation:"];
const PRIVATE_MARKERS = [
  ["", "Users", ""].join("/"),
  [".config", "opencode"].join("/"),
  ["auth", "json"].join("."),
  ["OPENAI", "API", "KEY"].join("_"),
  ["synology", "me"].join("."),
];

const TABLES = {
  Actors: ["ID", "Actor", "Trust", "Capabilities"],
  Assets: ["ID", "Asset", "Protection"],
  "Trust boundaries": ["ID", "Boundary", "Flow"],
  "Agent capabilities": [
    "Agent",
    "Edit",
    "Shell",
    "Network",
    "External directory",
    "Delegation",
    "Role",
    "Source",
  ],
  "External surfaces": ["Surface", "Boundary", "Controls or limitations"],
  "Persistence surfaces": [
    "Surface",
    "Owner",
    "Sensitivity",
    "Lifecycle",
    "Controls or limitations",
  ],
  "Risk register": [
    "ID",
    "Title",
    "Actor or input",
    "Assets",
    "Boundaries",
    "Abuse",
    "Severity",
    "Controls",
    "Evidence",
    "Status",
    "Residual",
    "Authority",
    "Review trigger",
  ],
  "Adversarial traceability": ["Scenario ID", "Risk ID", "Evidence"],
};

function modelError(message) {
  const error = new Error(message);
  error.code = "INVALID_THREAT_MODEL";
  return error;
}

function cleanCell(value) {
  const trimmed = value.trim();
  const match = trimmed.match(/^`([^`]+)`$/);
  return match ? match[1] : trimmed;
}

function parseTableLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    throw modelError("Markdown table rows must start and end with |");
  }
  return trimmed
    .slice(1, -1)
    .split("|")
    .map(cleanCell);
}

export function parseMarkdownTable(text, heading, expectedHeaders) {
  if (typeof text !== "string") throw modelError("threat model must be text");
  const lines = text.split(/\r?\n/);
  const headingLine = `## ${heading}`;
  const headingIndex = lines.findIndex((line) => line.trim() === headingLine);
  if (headingIndex === -1) throw modelError(`missing section: ${heading}`);

  let tableIndex = -1;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line.startsWith("## ")) break;
    if (line.startsWith("|")) {
      tableIndex = index;
      break;
    }
  }
  if (tableIndex === -1) throw modelError(`${heading}: missing Markdown table`);

  const headers = parseTableLine(lines[tableIndex]);
  if (JSON.stringify(headers) !== JSON.stringify(expectedHeaders)) {
    throw modelError(
      `${heading}: expected headers ${expectedHeaders.join(", ")}`,
    );
  }
  const separator = parseTableLine(lines[tableIndex + 1] ?? "");
  if (
    separator.length !== headers.length
    || separator.some((cell) => !/^:?-{3,}:?$/.test(cell))
  ) {
    throw modelError(`${heading}: invalid Markdown table separator`);
  }

  const rows = [];
  for (let index = tableIndex + 2; index < lines.length; index += 1) {
    if (!lines[index].trim().startsWith("|")) break;
    const cells = parseTableLine(lines[index]);
    if (cells.length !== headers.length) {
      throw modelError(`${heading}: row ${rows.length + 1} has wrong column count`);
    }
    rows.push(Object.fromEntries(headers.map((header, cell) => [
      header,
      cells[cell],
    ])));
  }
  if (rows.length === 0) throw modelError(`${heading}: table must not be empty`);
  return rows;
}

function splitCell(value, label) {
  const values = value.split("<br>").map(cleanCell);
  if (values.some((item) => item === "")) {
    throw modelError(`${label}: empty list item`);
  }
  return values;
}

function requireNonEmpty(row, fields, id) {
  for (const field of fields) {
    if (typeof row[field] !== "string" || row[field].trim() === "") {
      throw modelError(`${id}: ${field} must not be empty`);
    }
  }
}

function requireExactSet(actual, expected, label) {
  const duplicates = actual.filter((value, index) => actual.indexOf(value) !== index);
  if (duplicates.length > 0) {
    throw modelError(`${label}: duplicate ${duplicates[0]}`);
  }
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = [...expectedSet].filter((value) => !actualSet.has(value));
  const extra = [...actualSet].filter((value) => !expectedSet.has(value));
  if (missing.length > 0 || extra.length > 0) {
    throw modelError(
      `${label}: inventory mismatch; missing=${missing.join(",") || "none"}; extra=${extra.join(",") || "none"}`,
    );
  }
}

function requiredRange(prefix, count) {
  return Array.from(
    { length: count },
    (_, index) => `${prefix}-${String(index + 1).padStart(3, "0")}`,
  );
}

function requireIds(rows, pattern, required, label) {
  const ids = rows.map((row) => row.ID);
  for (const id of ids) {
    if (!pattern.test(id)) throw modelError(`${label}: invalid ID ${id}`);
  }
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) {
    throw modelError(`${label}: duplicate ${duplicates[0]}`);
  }
  const missing = required.filter((id) => !ids.includes(id));
  if (missing.length > 0) {
    throw modelError(`${label}: missing required IDs ${missing.join(", ")}`);
  }
  return new Set(ids);
}

function requireKnownReferences(value, known, label) {
  for (const reference of splitCell(value, label)) {
    if (!known.has(reference)) {
      throw modelError(`${label}: unknown reference ${reference}`);
    }
  }
}

function requireEvidence(value, label) {
  for (const evidence of splitCell(value, label)) {
    if (!EVIDENCE_PREFIXES.some((prefix) => evidence.startsWith(prefix))) {
      throw modelError(
        `${label}: evidence must start with test:, check:, or limitation:`,
      );
    }
  }
}

export function validateThreatModel(text, { agentIds, scenarioIds }) {
  if (!Array.isArray(agentIds) || !Array.isArray(scenarioIds)) {
    throw modelError("agentIds and scenarioIds must be arrays");
  }
  for (const section of REQUIRED_SECTIONS) {
    const matches = text
      .split(/\r?\n/)
      .filter((line) => line.trim() === `## ${section}`);
    if (matches.length !== 1) {
      throw modelError(
        `${section}: required exactly once, found ${matches.length}`,
      );
    }
  }
  for (const marker of PRIVATE_MARKERS) {
    if (text.includes(marker)) {
      throw modelError(`private marker is forbidden in threat model: ${marker}`);
    }
  }

  const tables = Object.fromEntries(
    Object.entries(TABLES).map(([heading, headers]) => [
      heading,
      parseMarkdownTable(text, heading, headers),
    ]),
  );
  const actorIds = requireIds(
    tables.Actors,
    /^AC-\d{3}$/,
    requiredRange("AC", 6),
    "actors",
  );
  const assetIds = requireIds(
    tables.Assets,
    /^A-\d{3}$/,
    requiredRange("A", 10),
    "assets",
  );
  const boundaryIds = requireIds(
    tables["Trust boundaries"],
    /^TB-\d{3}$/,
    requiredRange("TB", 9),
    "trust boundaries",
  );
  const riskIds = requireIds(
    tables["Risk register"],
    /^TM-\d{3}$/,
    requiredRange("TM", 20),
    "risks",
  );

  for (const row of tables.Actors) {
    requireNonEmpty(row, TABLES.Actors, row.ID);
  }
  for (const row of tables.Assets) {
    requireNonEmpty(row, TABLES.Assets, row.ID);
  }
  for (const row of tables["Trust boundaries"]) {
    requireNonEmpty(row, TABLES["Trust boundaries"], row.ID);
  }

  const documentedAgents = tables["Agent capabilities"].map((row) => row.Agent);
  requireExactSet(documentedAgents, agentIds, "agents");
  for (const row of tables["Agent capabilities"]) {
    requireNonEmpty(row, TABLES["Agent capabilities"], row.Agent);
    if (row.Source !== `opencode/agents/${row.Agent}.md`) {
      throw modelError(`${row.Agent}: source must point to its public agent file`);
    }
  }

  for (const row of tables["External surfaces"]) {
    requireNonEmpty(row, TABLES["External surfaces"], row.Surface);
    requireKnownReferences(
      row.Boundary,
      boundaryIds,
      `${row.Surface} boundary`,
    );
  }
  for (const row of tables["Persistence surfaces"]) {
    requireNonEmpty(row, TABLES["Persistence surfaces"], row.Surface);
  }

  for (const row of tables["Risk register"]) {
    requireNonEmpty(row, TABLES["Risk register"], row.ID);
    requireKnownReferences(
      row["Actor or input"],
      actorIds,
      `${row.ID} actor or input`,
    );
    requireKnownReferences(row.Assets, assetIds, `${row.ID} assets`);
    requireKnownReferences(row.Boundaries, boundaryIds, `${row.ID} boundaries`);
    if (!SEVERITIES.has(row.Severity)) {
      throw modelError(`${row.ID}: invalid severity ${row.Severity}`);
    }
    if (!STATUSES.has(row.Status)) {
      throw modelError(`${row.ID}: invalid status ${row.Status}`);
    }
    requireEvidence(row.Evidence, `${row.ID} evidence`);
    if (
      row.Status === "accepted"
      && (
        row.Authority !== "maintainer"
        || row["Review trigger"].toLowerCase() === "none"
      )
    ) {
      throw modelError(
        `${row.ID}: accepted risk requires maintainer authority and a review trigger`,
      );
    }
  }

  const traceRows = tables["Adversarial traceability"];
  const documentedScenarios = traceRows.map((row) => row["Scenario ID"]);
  requireExactSet(documentedScenarios, scenarioIds, "scenarios");
  for (const row of traceRows) {
    requireNonEmpty(row, TABLES["Adversarial traceability"], row["Scenario ID"]);
    if (!riskIds.has(row["Risk ID"])) {
      throw modelError(
        `${row["Scenario ID"]}: unknown risk ${row["Risk ID"]}`,
      );
    }
    requireEvidence(row.Evidence, `${row["Scenario ID"]} evidence`);
  }

  return {
    actors: tables.Actors.length,
    assets: tables.Assets.length,
    boundaries: tables["Trust boundaries"].length,
    agents: documentedAgents.length,
    risks: tables["Risk register"].length,
    scenarios: documentedScenarios.length,
  };
}

function readRegularFile(file, label) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch {
    throw modelError(`${label} is missing`);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw modelError(`${label} must be a regular non-symlink file`);
  }
  return fs.readFileSync(file, "utf8");
}

function loadScenarioIds() {
  const text = readRegularFile(SCENARIOS_PATH, "adversarial scenario corpus");
  if (text.trim() === "") throw modelError("adversarial scenario corpus is empty");
  return text.trim().split("\n").map((line, index) => {
    let scenario;
    try {
      scenario = JSON.parse(line);
    } catch {
      throw modelError(`adversarial scenario line ${index + 1} is invalid JSON`);
    }
    if (typeof scenario.id !== "string" || scenario.id === "") {
      throw modelError(`adversarial scenario line ${index + 1} is missing id`);
    }
    return scenario.id;
  }).sort();
}

function loadAgentIds() {
  return fs.readdirSync(AGENTS_PATH, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.basename(entry.name, ".md"))
    .sort();
}

function runCli() {
  const summary = validateThreatModel(
    readRegularFile(MODEL_PATH, "canonical threat model"),
    {
      agentIds: loadAgentIds(),
      scenarioIds: loadScenarioIds(),
    },
  );
  console.log(
    `Threat model check passed: ${summary.actors} actors, ${summary.assets} assets, ${summary.boundaries} boundaries, ${summary.agents} agents, ${summary.risks} risks, ${summary.scenarios} adversarial scenarios.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
