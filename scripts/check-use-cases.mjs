import {
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CASE_IDS = ["direct-label-change", "feature-tag-normalizer"];
const VARIANT_IDS = ["harness", "reduced"];
const RESULTS = new Set(["pass", "fail", "inconclusive"]);
const VALIDATION_STATUSES = new Set(["pass", "fail", "not-run"]);
const TOKEN_STATUSES = new Set(["measured", "unavailable"]);
const FORBIDDEN_FLAGS = new Set([
  "--auto",
  "--share",
  "--attach",
  "--continue",
  "--session",
  "--model",
  "--provider",
  "--variant",
  "--username",
  "--password",
]);
const AGENTS = new Set([
  "debugger",
  "designer",
  "developer",
  "evaluator",
  "evolver",
  "lead",
  "researcher",
  "review_api",
  "review_coordinator",
  "review_quality",
  "review_security",
  "review_tests",
  "reviewer",
  "scoper",
  "specifier",
]);
const README_HEADINGS = [
  "Objective",
  "Why this workflow",
  "Initial tree",
  "Expected change",
  "Isolated preparation",
  "Harness command",
  "Reduced command",
  "Expected and observed agents",
  "Validation",
  "Human intervention",
  "Invocations and correction cycles",
  "Tokens and cost",
  "Result",
  "Comparison",
  "Limitations",
  "Cleanup",
];
const PRIVATE_MARKERS = [
  ["", "Users", ""].join("/"),
  [".config", "opencode"].join("/"),
  ["auth", "json"].join("."),
  ["OPENAI", "API", "KEY"].join("_"),
  ["NAN", "API", "KEY"].join("_"),
  ["nan", "web", "search"].join("-"),
  ["sear", "xng"].join(""),
  ["SEAR", "XNG", "URL"].join("_"),
  ["syn", "ology", ".", "me"].join(""),
];
const TOP_KEYS = [
  "schema_version",
  "id",
  "objective",
  "prompt",
  "workflow",
  "observation",
  "fixture",
  "variants",
  "comparison",
];
const OBSERVATION_KEYS = [
  "date",
  "opencode_version",
  "same_model_selection",
  "model_provider_identity",
];
const FIXTURE_KEYS = ["before", "expected", "validation"];
const VARIANT_KEYS = [
  "id",
  "command",
  "expected_agents",
  "observed_agents",
  "human_interventions",
  "top_level_invocations",
  "correction_cycles",
  "validation_results",
  "tokens",
  "result",
  "limitations",
];
const VALIDATION_KEYS = ["command", "status"];
const TOKEN_KEYS = ["status", "value", "reason"];
const COMPARISON_KEYS = [
  "outcome",
  "orchestration",
  "evidence",
  "limitations",
];
const VALIDATIONS = ["npm test", "git diff --check"];

function fail(message) {
  throw new Error(message);
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
}

function assertExactKeys(value, expected, label) {
  assertObject(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(`${label} has missing or unknown keys`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${label} must be a non-empty string`);
  }
}

function assertStringArray(value, label, { allowEmpty = false } = {}) {
  if (
    !Array.isArray(value) ||
    (!allowEmpty && value.length === 0) ||
    value.some((item) => typeof item !== "string" || item.trim() === "")
  ) {
    fail(`${label} must be ${allowEmpty ? "an" : "a non-empty"} string array`);
  }
}

function expectedCommand(caseId, variantId, prompt) {
  if (variantId === "reduced") {
    return [
      "opencode",
      "run",
      "--agent",
      "developer",
      "--format",
      "json",
      "--thinking",
      "--dir",
      "<case-dir>",
      prompt,
    ];
  }
  if (caseId === "feature-tag-normalizer") {
    return [
      "opencode",
      "run",
      "--command",
      "feature",
      "--format",
      "json",
      "--thinking",
      "--dir",
      "<case-dir>",
      prompt,
    ];
  }
  return [
    "opencode",
    "run",
    "--format",
    "json",
    "--thinking",
    "--dir",
    "<case-dir>",
    prompt,
  ];
}

function validateAgents(agents, label) {
  assertStringArray(agents, label, { allowEmpty: label.includes("observed") });
  for (const agent of agents) {
    if (!AGENTS.has(agent)) {
      fail(`${label} contains unknown agent`);
    }
  }
}

function validateValidationResults(results, label) {
  if (!Array.isArray(results) || results.length !== VALIDATIONS.length) {
    fail(`${label} has incomplete validation results`);
  }
  results.forEach((entry, index) => {
    assertExactKeys(entry, VALIDATION_KEYS, `${label}[${index}]`);
    if (entry.command !== VALIDATIONS[index]) {
      fail(`${label} has unexpected validation results`);
    }
    if (!VALIDATION_STATUSES.has(entry.status)) {
      fail(`${label} has invalid validation status`);
    }
  });
}

function validateTokens(tokens, label) {
  assertExactKeys(tokens, TOKEN_KEYS, label);
  if (!TOKEN_STATUSES.has(tokens.status)) {
    fail(`${label} has invalid token status`);
  }
  assertNonEmptyString(tokens.reason, `${label}.reason`);
  if (tokens.status === "unavailable" && tokens.value !== null) {
    fail(`${label} unavailable token value must be null`);
  }
  if (
    tokens.status === "measured" &&
    (!Number.isInteger(tokens.value) || tokens.value < 0)
  ) {
    fail(`${label} measured token value must be a non-negative integer`);
  }
}

export function validateCaseManifest(manifest, context) {
  const caseId = context?.caseId;
  if (!CASE_IDS.includes(caseId)) {
    fail("unknown case ID");
  }
  assertExactKeys(manifest, TOP_KEYS, `${caseId} manifest`);
  if (manifest.schema_version !== 1 || manifest.id !== caseId) {
    fail(`${caseId} has invalid schema version or ID`);
  }
  assertNonEmptyString(manifest.objective, `${caseId} objective`);
  assertNonEmptyString(manifest.prompt, `${caseId} prompt`);
  const expectedWorkflow =
    caseId === "direct-label-change" ? "direct-development" : "feature";
  if (manifest.workflow !== expectedWorkflow) {
    fail(`${caseId} has invalid workflow`);
  }

  assertExactKeys(
    manifest.observation,
    OBSERVATION_KEYS,
    `${caseId} observation`,
  );
  if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest.observation.date)) {
    fail(`${caseId} observation has invalid date`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(manifest.observation.opencode_version)) {
    fail(`${caseId} observation has invalid OpenCode version`);
  }
  if (
    manifest.observation.same_model_selection !== true ||
    manifest.observation.model_provider_identity !== "omitted"
  ) {
    fail(`${caseId} observation violates model privacy or comparability`);
  }

  assertExactKeys(manifest.fixture, FIXTURE_KEYS, `${caseId} fixture`);
  if (
    manifest.fixture.before !== "before" ||
    manifest.fixture.expected !== "expected" ||
    JSON.stringify(manifest.fixture.validation) !== JSON.stringify(VALIDATIONS)
  ) {
    fail(`${caseId} has invalid fixture contract`);
  }

  if (!Array.isArray(manifest.variants)) {
    fail(`${caseId} variants must be an array`);
  }
  const variantIds = manifest.variants.map((variant) => variant?.id).sort();
  if (JSON.stringify(variantIds) !== JSON.stringify([...VARIANT_IDS].sort())) {
    fail(`${caseId} must have exact unique variant IDs`);
  }

  for (const variant of manifest.variants) {
    const label = `${caseId} ${variant.id}`;
    assertExactKeys(variant, VARIANT_KEYS, label);
    if (
      !Array.isArray(variant.command) ||
      variant.command.some((part) => typeof part !== "string")
    ) {
      fail(`${label} command must be string argv`);
    }
    const forbidden = variant.command.find((part) => FORBIDDEN_FLAGS.has(part));
    if (forbidden) {
      fail(`${label} contains forbidden flag`);
    }
    if (
      JSON.stringify(variant.command) !==
      JSON.stringify(expectedCommand(caseId, variant.id, manifest.prompt))
    ) {
      fail(`${label} command shape or prompt is invalid`);
    }

    const expectedAgents =
      variant.id === "reduced"
        ? ["developer"]
        : caseId === "direct-label-change"
          ? ["lead", "developer"]
          : ["lead", "specifier", "developer", "reviewer"];
    if (
      JSON.stringify(variant.expected_agents) !==
      JSON.stringify(expectedAgents)
    ) {
      fail(`${label} expected agents are invalid`);
    }
    validateAgents(variant.expected_agents, `${label} expected agents`);
    validateAgents(variant.observed_agents, `${label} observed agents`);
    assertStringArray(variant.human_interventions, `${label} interventions`, {
      allowEmpty: true,
    });
    if (
      !Number.isInteger(variant.top_level_invocations) ||
      variant.top_level_invocations < 0 ||
      !Number.isInteger(variant.correction_cycles) ||
      variant.correction_cycles < 0
    ) {
      fail(`${label} has invalid invocation counts`);
    }
    validateValidationResults(
      variant.validation_results,
      `${label} validation results`,
    );
    validateTokens(variant.tokens, `${label} tokens`);
    if (!RESULTS.has(variant.result)) {
      fail(`${label} has invalid result`);
    }
    assertStringArray(variant.limitations, `${label} limitations`);
  }

  assertExactKeys(manifest.comparison, COMPARISON_KEYS, `${caseId} comparison`);
  assertNonEmptyString(manifest.comparison.outcome, `${caseId} outcome`);
  assertNonEmptyString(
    manifest.comparison.orchestration,
    `${caseId} orchestration`,
  );
  if (manifest.comparison.evidence !== "live_smoke") {
    fail(`${caseId} comparison evidence must be live_smoke`);
  }
  assertStringArray(
    manifest.comparison.limitations,
    `${caseId} comparison limitations`,
  );

  const serialized = JSON.stringify(manifest);
  if (PRIVATE_MARKERS.some((marker) => serialized.includes(marker))) {
    fail(`${caseId} manifest contains a private marker`);
  }
}

function walkRegularFiles(directory, root = directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const status = lstatSync(path);
    if (status.isSymbolicLink()) {
      fail(`use-case tree contains a symlink at ${relative(root, path)}`);
    }
    if (status.isDirectory()) {
      files.push(...walkRegularFiles(path, root));
    } else if (status.isFile()) {
      files.push(path);
    } else {
      fail("use-case tree contains a non-regular entry");
    }
  }
  return files;
}

function validateFixture(caseRoot, caseId, state, runFixtures) {
  const fixtureRoot = join(caseRoot, state);
  const expectedStem =
    caseId === "direct-label-change" ? "settings-label" : "normalize-tags";
  const expectedFiles = [
    "package.json",
    `src/${expectedStem}.mjs`,
    `test/${expectedStem}.test.mjs`,
  ];
  const actualFiles = walkRegularFiles(fixtureRoot, fixtureRoot)
    .map((path) => relative(fixtureRoot, path))
    .sort();
  if (
    JSON.stringify(actualFiles) !== JSON.stringify([...expectedFiles].sort())
  ) {
    fail(`${caseId} ${state} fixture files are invalid`);
  }

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(join(fixtureRoot, "package.json"), "utf8"));
  } catch {
    fail(`${caseId} ${state} package must be valid JSON`);
  }
  for (const key of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    if (key in pkg) {
      fail(`${caseId} ${state} fixture must not declare dependencies`);
    }
  }
  if (pkg.private !== true || pkg.type !== "module") {
    fail(`${caseId} ${state} fixture package contract is invalid`);
  }
  if (
    !pkg.scripts ||
    Object.keys(pkg.scripts).length !== 1 ||
    pkg.scripts.test !== "node --test"
  ) {
    fail(`${caseId} ${state} fixture test script must be node --test`);
  }

  if (runFixtures) {
    const result = spawnSync("npm", ["test"], {
      cwd: fixtureRoot,
      encoding: "utf8",
      shell: false,
      timeout: 30_000,
      env: {
        PATH: process.env.PATH ?? "",
        CI: "1",
        LANG: "C",
        LC_ALL: "C",
      },
    });
    if (result.status !== 0) {
      fail(`${caseId} ${state} fixture tests failed`);
    }
  }
}

export function loadAndValidateUseCases(root, options = {}) {
  const useCasesRoot = join(root, "docs", "use-cases");
  const rootEntries = readdirSync(useCasesRoot, { withFileTypes: true });
  const caseDirectories = rootEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (
    JSON.stringify(caseDirectories) !== JSON.stringify([...CASE_IDS].sort())
  ) {
    fail("use-case index must contain the exact case directories");
  }
  const files = walkRegularFiles(useCasesRoot);
  for (const path of files) {
    const content = readFileSync(path, "utf8");
    if (PRIVATE_MARKERS.some((marker) => content.includes(marker))) {
      fail("use-case tree contains a private marker");
    }
  }

  for (const caseId of CASE_IDS) {
    const caseRoot = join(useCasesRoot, caseId);
    const readme = readFileSync(join(caseRoot, "README.md"), "utf8");
    for (const heading of README_HEADINGS) {
      if (!readme.includes(`## ${heading}\n`)) {
        fail(`${caseId} README heading is missing`);
      }
    }
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(caseRoot, "case.json"), "utf8"));
    } catch {
      fail(`${caseId} manifest must be valid JSON`);
    }
    validateCaseManifest(manifest, { caseId });
    for (const state of ["before", "expected"]) {
      validateFixture(caseRoot, caseId, state, options.runFixtures !== false);
    }
  }

  return {
    cases: CASE_IDS.length,
    variants: CASE_IDS.length * VARIANT_IDS.length,
    fixtureRepositories: CASE_IDS.length * 2,
  };
}

const scriptPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (scriptPath === fileURLToPath(import.meta.url)) {
  try {
    const root = dirname(dirname(fileURLToPath(import.meta.url)));
    const summary = loadAndValidateUseCases(root);
    console.log(
      `Use-case check passed: ${summary.cases} cases, ${summary.variants} variants, ${summary.fixtureRepositories} fixture repositories.`,
    );
  } catch (error) {
    console.error(`Use-case check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
