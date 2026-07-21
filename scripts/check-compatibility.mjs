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
  const realRoot = fsOps.realpathSync(root);
  const realFull = fsOps.realpathSync(full);
  const resolvedRelative = path.relative(realRoot, realFull);
  if (
    resolvedRelative === ".." ||
    resolvedRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(resolvedRelative)
  ) {
    throw invalid(`${relative} must be a safe regular file`);
  }
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

export function extractMarkedSection(text, start, end) {
  const startCount = text.split(start).length - 1;
  const endCount = text.split(end).length - 1;
  const first = text.indexOf(start);
  const last = text.indexOf(end);
  if (startCount !== 1 || endCount !== 1) {
    if (start.includes("compatibility-matrix")) {
      throw invalid("docs/compatibility.md must contain exactly one start and one end marker");
    }
    throw invalid("workflow must contain exactly one compatibility blocking marker pair");
  }
  if (last <= first) {
    if (start.includes("compatibility-matrix")) {
      throw invalid("docs/compatibility.md matrix markers must be in order");
    }
    throw invalid("workflow compatibility blocking markers must be in order");
  }
  return text.slice(first + start.length, last);
}

function validateDocumentation(root, data, fsOps) {
  const docs = readRegularText(root, "docs/compatibility.md", fsOps);
  const readme = readRegularText(root, "README.md", fsOps);
  const installation = readRegularText(root, "docs/installation.md", fsOps);
  const matrix = extractMarkedSection(
    docs,
    "<!-- compatibility-matrix:start -->",
    "<!-- compatibility-matrix:end -->",
  );
  const rows = new Map();

  for (const line of matrix.split("\n")) {
    if (!line.startsWith("|") || line.includes("---") || line.includes("Status")) continue;
    const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
    if (cells.length >= 2 && !STATUS_TERMS.has(cells[1])) {
      throw invalid(`unknown compatibility status: ${cells[1]}`);
    }
    if (cells.length >= 3) {
      const surface = cells[0].replaceAll("`", "");
      if (rows.has(surface)) {
        throw invalid(`docs/compatibility.md must not duplicate surface ${surface}`);
      }
      rows.set(surface, cells[1]);
    }
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

function extractWorkflowStep(workflow, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = workflow.match(
    new RegExp(`^      - name: ${escaped}\\n([\\s\\S]*?)(?=^      - name: |(?![\\s\\S]))`, "m"),
  );
  return match?.[0] ?? "";
}

function extractBlockingJob(workflow) {
  const jobsHeaders = [...workflow.matchAll(/^jobs:\s*$/gm)];
  if (jobsHeaders.length !== 1) {
    throw invalid("workflow must contain exactly one unambiguous jobs.check body");
  }
  const jobsStart = jobsHeaders[0].index + jobsHeaders[0][0].length;
  const afterJobs = workflow.slice(jobsStart);
  const nextTopLevel = afterJobs.match(/^\S[^\n]*:\s*$/m);
  const jobsBody = afterJobs.slice(0, nextTopLevel?.index ?? afterJobs.length);
  const checkHeaders = [...jobsBody.matchAll(/^  check:\s*$/gm)];
  if (checkHeaders.length !== 1) {
    throw invalid("workflow must contain exactly one unambiguous jobs.check body");
  }
  const checkStart = checkHeaders[0].index;
  const afterCheckHeader = jobsBody.slice(checkStart + checkHeaders[0][0].length);
  const nextJob = afterCheckHeader.match(/^  [A-Za-z0-9_-]+:\s*$/m);
  const checkEnd = checkStart + checkHeaders[0][0].length
    + (nextJob?.index ?? afterCheckHeader.length);
  return jobsBody.slice(checkStart, checkEnd);
}

function validateWorkflow(root, data, fsOps) {
  const workflow = readRegularText(root, ".github/workflows/check.yml", fsOps);
  const blockingJob = extractBlockingJob(workflow);
  const marked = extractMarkedSection(
    blockingJob,
    "# compatibility-blocking:start",
    "# compatibility-blocking:end",
  );
  const section = marked
    .replace(/^\n/, "")
    .replace(/\n    $/, "")
    .split("\n")
    .map((line) => line.replace(/^    /, ""))
    .join("\n");
  const canonicalMajor = Math.max(...data.node.blocking_majors);
  const expectedEntries = [
    ...data.node.blocking_majors.map((node) => ({
      os: "ubuntu-latest",
      node,
      canonical: node === canonicalMajor,
    })),
    { os: "macos-latest", node: canonicalMajor, canonical: false },
  ];
  const expectedSection = [
    "strategy:",
    "  fail-fast: false",
    "  matrix:",
    "    include:",
    ...expectedEntries.flatMap(({ os, node, canonical }) => [
      `      - os: ${os}`,
      `        node: ${node}`,
      `        canonical: ${canonical}`,
    ]),
  ].join("\n");
  const entries = [...section.matchAll(
    /^      - os: (ubuntu-latest|macos-latest)\n        node: (\d+)\n        canonical: (true|false)$/gm,
  )].map((match) => ({
    os: match[1],
    node: Number(match[2]),
    canonical: match[3] === "true",
  }));

  if (!section.includes("  fail-fast: false")) {
    throw invalid("workflow strategy must set fail-fast to false");
  }
  if (section !== expectedSection || JSON.stringify(entries) !== JSON.stringify(expectedEntries)) {
    throw invalid(
      `workflow blocking matrix must be exactly ${expectedEntries.map(({ os, node, canonical }) => `${os}/${node}/canonical=${canonical}`).join(", ")}`,
    );
  }
  if (!/^    runs-on: \$\{\{ matrix\.os \}\}$/m.test(blockingJob)) {
    throw invalid("workflow blocking job must run on matrix.os");
  }
  if (!/^          node-version: \$\{\{ matrix\.node \}\}$/m.test(blockingJob)) {
    throw invalid("workflow setup-node must use matrix.node");
  }

  const tagStep = extractWorkflowStep(blockingJob, "Validate release tag");
  if (JSON.stringify(tagStep.match(/^        if:.*$/gm)) !== JSON.stringify([
    "        if: matrix.canonical && startsWith(github.ref, 'refs/tags/')",
  ])) {
    throw invalid("workflow tag validation guard must be exact");
  }
  const auditStep = extractWorkflowStep(blockingJob, "Audit OpenCode tool dependencies");
  if (JSON.stringify(auditStep.match(/^        if:.*$/gm)) !== JSON.stringify([
    "        if: matrix.canonical",
  ])) {
    throw invalid("workflow dependency audit guard must be exact");
  }

  for (const [snippet, label] of [
    ["working-directory: opencode\n        run: npm ci", "install OpenCode tool dependencies"],
    ["run: npm run contract-check", "contract check"],
    ["run: npm run unit-and-script-tests", "unit and script tests"],
    ["run: npm run typecheck", "token plugin typecheck"],
    ["run: npm run installation-smoke", "installation smoke"],
  ]) {
    if (!blockingJob.includes(snippet)) {
      throw invalid(`workflow blocking job must retain ${label}`);
    }
  }

  const evidenceStep = extractWorkflowStep(blockingJob, "Record runner evidence");
  for (const token of [
    "uname -a || true",
    "node --version",
    "npm --version",
    "arch:process.arch",
    "platform:process.platform",
    'p.dependencies["@opencode-ai/plugin"]',
    'p.dependencies["@opentui/core"]',
    'p.dependencies["@opentui/solid"]',
  ]) {
    if (!evidenceStep.includes(token)) {
      throw invalid(`workflow runner evidence must include ${token}`);
    }
  }

  if (!/^permissions:\n  contents: read$/m.test(workflow) || /^\s*[^#\n]+:\s*(?:write|write-all)\s*$/m.test(workflow)) {
    throw invalid("workflow must use read-only permissions");
  }
  if (/^\s*(?:run:\s*)?.*\b(?:npm|pnpm|yarn)\s+publish\b/m.test(workflow) || /\bgh\s+release\s+create\b/.test(workflow)) {
    throw invalid("workflow must not publish");
  }
}

function validateSurfaces(root, data, fsOps) {
  validatePackages(root, data, fsOps);
  validateDocumentation(root, data, fsOps);
  validateWorkflow(root, data, fsOps);
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
