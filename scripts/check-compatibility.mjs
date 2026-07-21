#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compareStableVersions, parseStableVersion } from "./version.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.dirname(path.dirname(SCRIPT_PATH));
const EXACT_KEYS = {
  root: ["schema_version", "node", "opencode", "sdk"],
  node: ["engines", "blocking_majors", "canary_major"],
  opencode: ["supported_range", "minimum_tested", "stable_tested", "canary"],
  sdk: ["opencode_plugin", "opentui_core", "opentui_solid"],
};
const STATUS_TERMS = new Set(["tested", "supported", "experimental", "unsupported"]);
const EXPECTED_MATRIX_STATUSES = new Map([
  ["Node.js 22", "supported"],
  ["Node.js 24", "supported"],
  ["Node.js 26", "experimental"],
  ["Node.js 20 and EOL/odd lines", "unsupported"],
  ["OpenCode 1.14.41", "tested"],
  ["OpenCode 1.18.4", "tested"],
  ["OpenCode >=1.14.41 <2.0.0", "supported"],
  ["OpenCode <1.14.41 or >=2.0.0", "unsupported"],
  ["@opencode-ai/plugin 1.14.41", "tested"],
  ["OpenTUI core/solid 0.2.5", "tested"],
  ["Ubuntu GitHub runner", "tested"],
  ["macOS GitHub runner", "tested"],
  ["Other mainstream Linux/macOS environments", "supported"],
  ["WSL2", "experimental"],
  ["Native Windows", "unsupported"],
  ["Token usage plugin", "experimental"],
  ["Open Design Docker adapter", "experimental"],
  ["Superpowers", "experimental"],
  ["Impeccable", "experimental"],
]);

function invalid(message) {
  const error = new Error(message);
  error.code = "INVALID_COMPATIBILITY";
  return error;
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw invalid(`${label} keys must be exactly: ${wanted.join(", ")}`);
  }
}

function readRegularText(root, relative, fsOps = fs) {
  const full = path.join(root, relative);
  const stat = fsOps.lstatSync(full);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw invalid(`${relative} must be a safe regular file`);
  }
  return fsOps.readFileSync(full, "utf8");
}

function readJson(root, relative, fsOps = fs) {
  try {
    return JSON.parse(readRegularText(root, relative, fsOps));
  } catch (error) {
    if (error.code === "INVALID_COMPATIBILITY") throw error;
    throw invalid(`${relative} is invalid JSON: ${error.message}`);
  }
}

function validateCanonicalData(data) {
  assertExactKeys(data, EXACT_KEYS.root, "compatibility");
  assertExactKeys(data.node, EXACT_KEYS.node, "node");
  assertExactKeys(data.opencode, EXACT_KEYS.opencode, "opencode");
  assertExactKeys(data.sdk, EXACT_KEYS.sdk, "sdk");
  if (data.schema_version !== 1) throw invalid("schema_version must be 1");
  if (data.node.engines !== "^22.9.0 || ^24.0.0") {
    throw invalid("node.engines must be ^22.9.0 || ^24.0.0");
  }
  if (JSON.stringify(data.node.blocking_majors) !== JSON.stringify([22, 24])) {
    throw invalid("node.blocking_majors must be [22,24]");
  }
  if (data.node.canary_major !== 26) throw invalid("node.canary_major must be 26");
  for (const field of ["minimum_tested", "stable_tested"]) {
    try {
      parseStableVersion(data.opencode[field]);
    } catch {
      throw invalid(`${field} must use MAJOR.MINOR.PATCH`);
    }
  }
  if (compareStableVersions(data.opencode.minimum_tested, data.opencode.stable_tested) >= 0) {
    throw invalid("minimum_tested must be older than stable_tested");
  }
  if (data.opencode.minimum_tested !== "1.14.41") {
    throw invalid("minimum_tested must be 1.14.41");
  }
  if (data.opencode.stable_tested !== "1.18.4") {
    throw invalid("stable_tested must be 1.18.4");
  }
  if (data.opencode.supported_range !== ">=1.14.41 <2.0.0") {
    throw invalid("supported_range must begin at minimum_tested and end before 2.0.0");
  }
  if (data.opencode.canary !== "latest") throw invalid("opencode.canary must be latest");
  for (const [field, value] of Object.entries(data.sdk)) {
    try {
      parseStableVersion(value);
    } catch {
      throw invalid(`sdk.${field} must use MAJOR.MINOR.PATCH`);
    }
  }
  if (data.sdk.opencode_plugin !== "1.14.41") {
    throw invalid("sdk.opencode_plugin must be 1.14.41");
  }
  if (data.sdk.opentui_core !== "0.2.5") {
    throw invalid("sdk.opentui_core must be 0.2.5");
  }
  if (data.sdk.opentui_solid !== "0.2.5") {
    throw invalid("sdk.opentui_solid must be 0.2.5");
  }
  return data;
}

export function checkCompatibility(
  repositoryRoot = REPOSITORY_ROOT,
  { fsOps = fs, surfaces = true } = {},
) {
  const data = validateCanonicalData(readJson(repositoryRoot, "compatibility.json", fsOps));
  if (surfaces) validateSurfaces(repositoryRoot, data, fsOps);
  return data;
}

function validatePackages(root, data, fsOps) {
  const rootPackage = readJson(root, "package.json", fsOps);
  if (rootPackage.engines?.node !== data.node.engines) {
    throw invalid("package.json engines.node must match compatibility.json node.engines");
  }

  const packagedPackage = readJson(root, "opencode/package.json", fsOps);
  if (packagedPackage.engines?.node !== data.node.engines) {
    throw invalid("opencode/package.json engines.node must match compatibility.json node.engines");
  }

  for (const [dependency, sdkField] of [
    ["@opencode-ai/plugin", "opencode_plugin"],
    ["@opentui/core", "opentui_core"],
    ["@opentui/solid", "opentui_solid"],
  ]) {
    if (packagedPackage.dependencies?.[dependency] !== data.sdk[sdkField]) {
      throw invalid(
        `opencode/package.json dependency ${dependency} must match compatibility.json sdk.${sdkField}`,
      );
    }
  }
}

function extractMarkedMatrix(text) {
  const start = "<!-- compatibility-matrix:start -->";
  const end = "<!-- compatibility-matrix:end -->";
  const first = text.indexOf(start);
  const last = text.indexOf(end);
  if (first < 0 || last <= first) {
    throw invalid("docs/compatibility.md matrix markers are missing");
  }
  return text.slice(first + start.length, last);
}

function validateDocumentation(root, data, fsOps) {
  const docs = readRegularText(root, "docs/compatibility.md", fsOps);
  const readme = readRegularText(root, "README.md", fsOps);
  const installation = readRegularText(root, "docs/installation.md", fsOps);
  const matrix = extractMarkedMatrix(docs);
  const rows = new Map();

  for (const line of matrix.split("\n")) {
    if (!line.startsWith("|") || line.includes("---") || line.includes("Status")) continue;
    const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
    if (cells.length >= 2 && !STATUS_TERMS.has(cells[1])) {
      throw invalid(`unknown compatibility status: ${cells[1]}`);
    }
    if (cells.length >= 3) rows.set(cells[0].replaceAll("`", ""), cells[1]);
  }

  for (const [surface, expectedStatus] of EXPECTED_MATRIX_STATUSES) {
    if (rows.get(surface) !== expectedStatus) {
      throw invalid(`docs/compatibility.md must classify ${surface} as ${expectedStatus}`);
    }
  }

  for (const token of [
    data.node.engines,
    data.opencode.supported_range,
    data.opencode.minimum_tested,
    data.opencode.stable_tested,
    "Node.js 22",
    "Node.js 24",
    "Node.js 26",
    "WSL2",
    "Native Windows",
    "Token usage plugin",
    "Open Design Docker adapter",
    "Superpowers",
    "Impeccable",
  ]) {
    if (!matrix.includes(token) && !docs.includes(token)) {
      throw invalid(`docs/compatibility.md must declare ${token}`);
    }
  }

  if (!readme.includes("docs/compatibility.md")) {
    throw invalid("README.md must link docs/compatibility.md");
  }
  if (!installation.includes(data.node.engines)) {
    throw invalid("docs/installation.md must declare the canonical Node engine");
  }
}

function validateSurfaces(root, data, fsOps) {
  validatePackages(root, data, fsOps);
  validateDocumentation(root, data, fsOps);
}

if (path.resolve(process.argv[1] ?? "") === SCRIPT_PATH) {
  try {
    const data = checkCompatibility();
    console.log(
      `compatibility contract ok: Node ${data.node.blocking_majors.join("/")} OpenCode ${data.opencode.supported_range}`,
    );
  } catch (error) {
    console.error(`compatibility contract invalid: ${error.message}`);
    process.exitCode = 1;
  }
}
