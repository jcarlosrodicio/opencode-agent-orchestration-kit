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
const STATIC_MATRIX_STATUSES = [
  ["Node.js 20 and EOL/odd lines", "unsupported"],
  ["Ubuntu GitHub runner", "tested"],
  ["macOS GitHub runner", "tested"],
  ["Other mainstream Linux/macOS environments", "supported"],
  ["WSL2", "experimental"],
  ["Native Windows", "unsupported"],
  ["Token usage plugin", "experimental"],
  ["Open Design Docker adapter", "experimental"],
  ["Superpowers", "experimental"],
  ["Impeccable", "experimental"],
];

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

function parseNodeEngineMajors(value) {
  if (typeof value !== "string") {
    throw invalid("node.engines must list caret stable versions separated by ||");
  }
  const ranges = value.split(" || ");
  if (ranges.length === 0 || ranges.some((range) => !range.startsWith("^"))) {
    throw invalid("node.engines must list caret stable versions separated by ||");
  }
  try {
    return ranges.map((range) => parseStableVersion(range.slice(1)).major);
  } catch {
    throw invalid("node.engines must list caret MAJOR.MINOR.PATCH versions separated by ||");
  }
}

function expectedMatrixStatuses(data) {
  const openTuiSurface = data.sdk.opentui_core === data.sdk.opentui_solid
    ? `OpenTUI core/solid ${data.sdk.opentui_core}`
    : `OpenTUI core ${data.sdk.opentui_core} / solid ${data.sdk.opentui_solid}`;
  return new Map([
    ...data.node.blocking_majors.map((major) => [`Node.js ${major}`, "supported"]),
    [`Node.js ${data.node.canary_major}`, "experimental"],
    [`OpenCode ${data.opencode.minimum_tested}`, "tested"],
    [`OpenCode ${data.opencode.stable_tested}`, "tested"],
    [`OpenCode ${data.opencode.supported_range}`, "supported"],
    [`OpenCode <${data.opencode.minimum_tested} or >=2.0.0`, "unsupported"],
    [`@opencode-ai/plugin ${data.sdk.opencode_plugin}`, "tested"],
    [openTuiSurface, "tested"],
    ...STATIC_MATRIX_STATUSES,
  ]);
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
  const engineMajors = parseNodeEngineMajors(data.node.engines);
  if (
    !Array.isArray(data.node.blocking_majors)
    || data.node.blocking_majors.length === 0
    || data.node.blocking_majors.some((major) => !Number.isSafeInteger(major) || major < 1)
    || new Set(data.node.blocking_majors).size !== data.node.blocking_majors.length
  ) {
    throw invalid("node.blocking_majors must contain unique positive integers");
  }
  if (JSON.stringify(engineMajors) !== JSON.stringify(data.node.blocking_majors)) {
    throw invalid("node.blocking_majors must match node.engines majors in order");
  }
  if (
    !Number.isSafeInteger(data.node.canary_major)
    || data.node.canary_major <= Math.max(...data.node.blocking_majors)
  ) {
    throw invalid("node.canary_major must be an integer greater than every blocking major");
  }
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
  if (data.opencode.supported_range !== `>=${data.opencode.minimum_tested} <2.0.0`) {
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

  const packagedLock = readJson(root, "opencode/package-lock.json", fsOps);
  const lockRoot = packagedLock.packages?.[""];
  if (!lockRoot || typeof lockRoot !== "object" || Array.isArray(lockRoot)) {
    throw invalid("opencode/package-lock.json packages[''] must be an object");
  }
  if (lockRoot.engines?.node !== data.node.engines) {
    throw invalid("opencode/package-lock.json engines.node must match compatibility.json node.engines");
  }
  for (const [dependency, sdkField] of [
    ["@opencode-ai/plugin", "opencode_plugin"],
    ["@opentui/core", "opentui_core"],
    ["@opentui/solid", "opentui_solid"],
  ]) {
    if (lockRoot.dependencies?.[dependency] !== data.sdk[sdkField]) {
      throw invalid(
        `opencode/package-lock.json dependency ${dependency} must match compatibility.json sdk.${sdkField}`,
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
    if (start.includes("opencode-boundaries")) {
      throw invalid("workflow must contain exactly one OpenCode boundary job marker pair");
    }
    if (start.includes("compatibility-canary")) {
      throw invalid("compatibility canary must contain exactly one marker pair");
    }
    throw invalid("workflow must contain exactly one compatibility blocking marker pair");
  }
  if (last <= first) {
    if (start.includes("compatibility-matrix")) {
      throw invalid("docs/compatibility.md matrix markers must be in order");
    }
    if (start.includes("opencode-boundaries")) {
      throw invalid("workflow OpenCode boundary job markers must be in order");
    }
    if (start.includes("compatibility-canary")) {
      throw invalid("compatibility canary markers must be in order");
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

  for (const [surface, expectedStatus] of expectedMatrixStatuses(data)) {
    if (rows.get(surface) !== expectedStatus) {
      throw invalid(`docs/compatibility.md must classify ${surface} as ${expectedStatus}`);
    }
  }

  for (const token of [
    data.node.engines,
    data.opencode.supported_range,
    data.opencode.minimum_tested,
    data.opencode.stable_tested,
    ...data.node.blocking_majors.map((major) => `Node.js ${major}`),
    `Node.js ${data.node.canary_major}`,
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

function extractJobsBody(
  workflow,
  message = "workflow must contain exactly one unambiguous jobs.check body",
) {
  const jobsHeaders = [...workflow.matchAll(/^jobs:\s*$/gm)];
  if (jobsHeaders.length !== 1) {
    throw invalid(message);
  }
  const jobsStart = jobsHeaders[0].index + jobsHeaders[0][0].length;
  const afterJobs = workflow.slice(jobsStart);
  const nextTopLevel = afterJobs.match(/^\S[^\n]*:\s*$/m);
  return afterJobs.slice(0, nextTopLevel?.index ?? afterJobs.length);
}

function extractUniqueJob(jobsBody, name, message) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headers = [...jobsBody.matchAll(new RegExp(`^  ${escaped}:\\s*$`, "gm"))];
  if (headers.length !== 1) throw invalid(message);
  const jobStart = headers[0].index;
  const afterHeader = jobsBody.slice(jobStart + headers[0][0].length);
  const nextJob = afterHeader.match(/^  [A-Za-z0-9_-]+:\s*$/m);
  const jobEnd = jobStart + headers[0][0].length
    + (nextJob?.index ?? afterHeader.length);
  return { body: jobsBody.slice(jobStart, jobEnd), start: jobStart };
}

function extractBlockingJob(workflow) {
  return extractUniqueJob(
    extractJobsBody(workflow),
    "check",
    "workflow must contain exactly one unambiguous jobs.check body",
  ).body;
}

function rejectJobLevelPermissions(job) {
  if (/^    permissions\s*:/m.test(job)) {
    throw invalid("workflow job-level permissions are forbidden; jobs must inherit top-level permissions");
  }
}

function rejectOpenCodeBoundaryHazards(job) {
  rejectJobLevelPermissions(job);
  if (/^    continue-on-error\s*:/m.test(job)) {
    throw invalid("OpenCode boundary job must remain blocking");
  }
  if (/\$\{\{\s*secrets\./.test(job)) {
    throw invalid("OpenCode boundary job must not use secrets");
  }
  if (
    /^\s*(?:run:\s*)?.*\b(?:npm|pnpm|yarn)\s+publish\b/m.test(job)
    || /\bgh\s+release\s+create\b/.test(job)
  ) {
    throw invalid("OpenCode boundary job must not publish");
  }
}

function validateOpenCodeBoundaryJob(workflow, data) {
  const marked = extractMarkedSection(
    workflow,
    "# opencode-boundaries:start",
    "# opencode-boundaries:end",
  );
  const versions = [data.opencode.minimum_tested, data.opencode.stable_tested]
    .sort(compareStableVersions);
  const expectedJob = [
    "  opencode-compatibility:",
    "    runs-on: ubuntu-latest",
    "    strategy:",
    "      fail-fast: false",
    "      matrix:",
    "        opencode:",
    ...versions.map((version) => `          - "${version}"`),
    "    steps:",
    "      - name: Checkout",
    "        uses: actions/checkout@v4",
    "",
    "      - name: Setup Node",
    "        uses: actions/setup-node@v4",
    "        with:",
    "          node-version: 24",
    "",
    "      - name: Smoke OpenCode boundary",
    '        run: bash scripts/opencode-compat-smoke.sh "${{ matrix.opencode }}"',
  ].join("\n");
  const actualJob = marked.replace(/^\n/, "").replace(/\n  $/, "");
  const jobsBody = extractJobsBody(workflow);
  const completeJob = extractUniqueJob(
    jobsBody,
    "opencode-compatibility",
    "OpenCode boundary job must be one separate exact job under jobs",
  );
  const expectedCompleteJob = `${expectedJob}\n  # opencode-boundaries:end`;
  const markerPrefix = "  # opencode-boundaries:start\n";
  rejectOpenCodeBoundaryHazards(completeJob.body);

  if (
    actualJob !== expectedJob
    || !jobsBody.slice(0, completeJob.start).endsWith(markerPrefix)
    || completeJob.body.trimEnd() !== expectedCompleteJob
  ) {
    throw invalid(
      `OpenCode boundary job must exactly test ${versions.join(", ")} on Node 24 through the isolated matrix wrapper`,
    );
  }
}

function validateWorkflow(root, data, fsOps) {
  const workflow = readRegularText(root, ".github/workflows/check.yml", fsOps);
  const blockingJob = extractBlockingJob(workflow);
  rejectJobLevelPermissions(blockingJob);
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

  validateOpenCodeBoundaryJob(workflow, data);

  if (!/^permissions:\n  contents: read$/m.test(workflow) || /^\s*[^#\n]+:\s*(?:write|write-all)\s*$/m.test(workflow)) {
    throw invalid("workflow must use read-only permissions");
  }
  if (/^\s*(?:run:\s*)?.*\b(?:npm|pnpm|yarn)\s+publish\b/m.test(workflow) || /\bgh\s+release\s+create\b/.test(workflow)) {
    throw invalid("workflow must not publish");
  }
}

function validateCompatibilityCanary(root, data, fsOps) {
  const workflow = readRegularText(
    root,
    ".github/workflows/compatibility-canary.yml",
    fsOps,
  );
  const jobMessage = "compatibility canary must contain exactly one unambiguous jobs.latest body";
  const marked = extractMarkedSection(
    workflow,
    "# compatibility-canary:start",
    "# compatibility-canary:end",
  );
  const jobsBody = extractJobsBody(workflow, jobMessage);
  const completeJob = extractUniqueJob(jobsBody, "latest", jobMessage);
  const expectedJob = [
    "  latest:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - name: Checkout",
    "        uses: actions/checkout@v4",
    "        with:",
    "          persist-credentials: false",
    "",
    "      - name: Setup Node",
    "        uses: actions/setup-node@v4",
    "        with:",
    `          node-version: ${data.node.canary_major}`,
    "",
    "      - name: Smoke latest OpenCode",
    `        run: bash scripts/opencode-compat-smoke.sh ${data.opencode.canary}`,
  ].join("\n");
  const expectedWorkflow = [
    "name: Compatibility Canary",
    "",
    "on:",
    "  workflow_dispatch:",
    "  schedule:",
    '    - cron: "17 6 * * 1"',
    "",
    "permissions:",
    "  contents: read",
    "",
    "jobs:",
    "  # compatibility-canary:start",
    expectedJob,
    "  # compatibility-canary:end",
    "",
  ].join("\n");
  const actualJob = marked.replace(/^\n/, "").replace(/\n  $/, "");
  const markerPrefix = "  # compatibility-canary:start\n";
  const expectedCompleteJob = `${expectedJob}\n  # compatibility-canary:end`;

  if (/^    permissions\s*:/m.test(completeJob.body)) {
    throw invalid("compatibility canary job-level permissions are forbidden");
  }
  if (/\bcontinue-on-error\s*:/.test(workflow)) {
    throw invalid("compatibility canary failures must remain red");
  }
  if (/\$\{\{\s*secrets\./.test(workflow) || /\b(?:token|password|credential|api[_-]?key)\b/i.test(workflow)) {
    throw invalid("compatibility canary must not use secrets or credentials");
  }
  if (
    /\b(?:npm|pnpm|yarn)\s+publish\b/.test(workflow)
    || /\bgh\s+(?:release|issue)\s+create\b/.test(workflow)
    || /\bgit\s+(?:tag|push|commit)\b/.test(workflow)
    || /\b(?:npm|pnpm)\s+(?:ci|install|update)\b/.test(workflow)
    || /\byarn\s+(?:install|upgrade)\b/.test(workflow)
    || /actions\/(?:cache|upload-artifact|download-artifact)@/.test(workflow)
  ) {
    throw invalid("compatibility canary must not publish, mutate, cache, or use artifacts");
  }
  if (
    actualJob !== expectedJob
    || !jobsBody.slice(0, completeJob.start).endsWith(markerPrefix)
    || completeJob.body.trimEnd() !== expectedCompleteJob
    || workflow !== expectedWorkflow
  ) {
    throw invalid(
      `compatibility canary must exactly smoke ${data.opencode.canary} on Ubuntu Node ${data.node.canary_major} from schedule and workflow_dispatch only`,
    );
  }
}

function validateSurfaces(root, data, fsOps) {
  validatePackages(root, data, fsOps);
  validateDocumentation(root, data, fsOps);
  validateWorkflow(root, data, fsOps);
  validateCompatibilityCanary(root, data, fsOps);
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
