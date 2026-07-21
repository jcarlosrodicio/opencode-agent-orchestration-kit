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

function validateSurfaces() {
  // Added incrementally by Tasks 2-7. The default CLI always calls this path.
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
