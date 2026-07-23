#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseStableVersion } from "./version.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.dirname(path.dirname(SCRIPT_PATH));
const EXACT_KEYS = {
  root: ["schema_version", "external_refs", "npm_overrides"],
  externalRefs: [
    "superpowers",
    "actions_checkout",
    "actions_setup_node",
    "open_design",
    "node_image",
    "pnpm",
    "opencode_ai",
  ],
  integration: ["release", "commit"],
  action: ["release", "commit"],
  commit: ["commit"],
  image: ["tag", "digest"],
  version: ["version"],
  overrides: ["@babel/core", "uuid"],
};

const COMMIT = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ACTION_RELEASE = /^v[1-9][0-9]*$/;
const NODE_IMAGE_TAG = /^[1-9][0-9]*-bookworm-slim$/;
const PACKAGE_FILES = [
  "CODE_OF_CONDUCT.md", "CONTRIBUTING.md", "NOTICE.md", "README.md",
  "SECURITY.md", "compatibility.json", "docker/", "docs/", "doctor.sh",
  "env.example", "install.sh", "opencode/", "rollback.sh", "scripts/",
  "supply-chain.json", "uninstall.sh", "upgrade.sh",
];

function invalid(message) {
  const error = new Error(message);
  error.code = "INVALID_SUPPLY_CHAIN";
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

function assertCommit(value, field) {
  if (typeof value !== "string" || !COMMIT.test(value)) {
    throw invalid(`${field} must be a lowercase 40-character commit`);
  }
}

function assertStableVersion(value, field) {
  try {
    parseStableVersion(value);
  } catch {
    throw invalid(`${field} must use canonical MAJOR.MINOR.PATCH syntax`);
  }
}

export function validateSupplyChainData(data) {
  assertExactKeys(data, EXACT_KEYS.root, "supply chain");
  assertExactKeys(data.external_refs, EXACT_KEYS.externalRefs, "external_refs");
  assertExactKeys(data.external_refs.superpowers, EXACT_KEYS.integration, "external_refs.superpowers");
  assertExactKeys(data.external_refs.actions_checkout, EXACT_KEYS.action, "external_refs.actions_checkout");
  assertExactKeys(data.external_refs.actions_setup_node, EXACT_KEYS.action, "external_refs.actions_setup_node");
  assertExactKeys(data.external_refs.open_design, EXACT_KEYS.commit, "external_refs.open_design");
  assertExactKeys(data.external_refs.node_image, EXACT_KEYS.image, "external_refs.node_image");
  assertExactKeys(data.external_refs.pnpm, EXACT_KEYS.version, "external_refs.pnpm");
  assertExactKeys(data.external_refs.opencode_ai, EXACT_KEYS.version, "external_refs.opencode_ai");
  assertExactKeys(data.npm_overrides, EXACT_KEYS.overrides, "npm_overrides");

  if (data.schema_version !== 1) throw invalid("schema_version must be 1");

  const superpowers = data.external_refs.superpowers;
  if (typeof superpowers.release !== "string" || !superpowers.release.startsWith("v")) {
    throw invalid("external_refs.superpowers.release must use canonical vMAJOR.MINOR.PATCH syntax");
  }
  try {
    parseStableVersion(superpowers.release.slice(1));
  } catch {
    throw invalid("external_refs.superpowers.release must use canonical vMAJOR.MINOR.PATCH syntax");
  }
  assertCommit(superpowers.commit, "external_refs.superpowers.commit");

  for (const field of ["actions_checkout", "actions_setup_node"]) {
    const action = data.external_refs[field];
    if (typeof action.release !== "string" || !ACTION_RELEASE.test(action.release)) {
      throw invalid(`external_refs.${field}.release must use v<positive major>`);
    }
    assertCommit(action.commit, `external_refs.${field}.commit`);
  }

  assertCommit(data.external_refs.open_design.commit, "external_refs.open_design.commit");

  const image = data.external_refs.node_image;
  if (typeof image.tag !== "string" || !NODE_IMAGE_TAG.test(image.tag)) {
    throw invalid("external_refs.node_image.tag must use <positive major>-bookworm-slim");
  }
  if (typeof image.digest !== "string" || !DIGEST.test(image.digest)) {
    throw invalid("external_refs.node_image.digest must use sha256 plus 64 lowercase hexadecimal characters");
  }

  assertStableVersion(data.external_refs.pnpm.version, "external_refs.pnpm.version");
  assertStableVersion(data.external_refs.opencode_ai.version, "external_refs.opencode_ai.version");
  assertStableVersion(data.npm_overrides["@babel/core"], "npm_overrides.@babel/core");
  assertStableVersion(data.npm_overrides.uuid, "npm_overrides.uuid");
  return data;
}

function readSupplyChain(root, fsOps) {
  const relative = "supply-chain.json";
  const full = path.join(root, relative);
  let stat;
  try {
    stat = fsOps.lstatSync(full);
  } catch (error) {
    if (error.code === "ENOENT") throw invalid(`${relative} is missing`);
    throw invalid(`${relative} could not be inspected${error.code ? `: ${error.code}` : ""}`);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw invalid(`${relative} must be a safe regular file`);
  }

  try {
    const realRoot = fsOps.realpathSync(root);
    const realFull = fsOps.realpathSync(full);
    const resolvedRelative = path.relative(realRoot, realFull);
    if (
      resolvedRelative === ".."
      || resolvedRelative.startsWith(`..${path.sep}`)
      || path.isAbsolute(resolvedRelative)
    ) {
      throw invalid(`${relative} must be a safe regular file`);
    }
  } catch (error) {
    if (error.code === "INVALID_SUPPLY_CHAIN") throw error;
    if (error.code === "ENOENT") throw invalid(`${relative} is missing`);
    throw invalid(`${relative} could not be resolved${error.code ? `: ${error.code}` : ""}`);
  }

  let contents;
  try {
    contents = fsOps.readFileSync(full, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") throw invalid(`${relative} is missing`);
    throw invalid(`${relative} could not be read${error.code ? `: ${error.code}` : ""}`);
  }
  try {
    return JSON.parse(contents);
  } catch (error) {
    throw invalid(`${relative} is invalid JSON: ${error.message}`);
  }
}

function readJson(root, relative, fsOps) {
  try {
    return JSON.parse(fsOps.readFileSync(path.join(root, relative), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") throw invalid(`${relative} is missing`);
    throw invalid(`${relative} is invalid JSON: ${error.message}`);
  }
}

function readText(root, relative, fsOps) {
  try {
    return fsOps.readFileSync(path.join(root, relative), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") throw invalid(`${relative} is missing`);
    throw invalid(`${relative} could not be read${error.code ? `: ${error.code}` : ""}`);
  }
}

function validatePackages(root, data, fsOps) {
  const rootPackage = readJson(root, "package.json", fsOps);
  if (JSON.stringify(rootPackage.files) !== JSON.stringify(PACKAGE_FILES)) {
    throw invalid(`package.json files must be exactly: ${PACKAGE_FILES.join(", ")}`);
  }
  for (const [script, command] of [
    ["dependency-audit", "npm --prefix opencode audit --omit=dev --audit-level=low"],
    ["dependency-signature-audit", "npm --prefix opencode audit signatures"],
    ["package-smoke", "bash scripts/package-smoke.sh"],
  ]) {
    if (rootPackage.scripts?.[script] !== command) {
      throw invalid(`package.json ${script} must be exactly: ${command}`);
    }
  }
  for (const hook of ["prepack", "prepare", "prepublish", "prepublishOnly"]) {
    if (Object.hasOwn(rootPackage.scripts ?? {}, hook)) {
      throw invalid(`package.json contains forbidden root lifecycle hook ${hook}`);
    }
  }
  for (const relative of ["scripts/package-smoke.sh", "scripts/package-smoke.mjs"]) {
    let stat;
    try {
      stat = fsOps.lstatSync(path.join(root, relative));
    } catch (error) {
      if (error.code === "ENOENT") throw invalid(`${relative} is missing`);
      throw error;
    }
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw invalid(`${relative} must be a regular non-symlink file`);
    }
    if (relative.endsWith(".sh") && !(stat.mode & 0o111)) {
      throw invalid(`${relative} must be executable`);
    }
  }
  for (const [script, command] of Object.entries(rootPackage.scripts ?? {})) {
    validateInstallLine(command, `package.json#scripts.${script}`);
  }

  const packaged = readJson(root, "opencode/package.json", fsOps);
  assertExactKeys(packaged.overrides, EXACT_KEYS.overrides, "opencode/package.json overrides");
  for (const dependency of EXACT_KEYS.overrides) {
    if (packaged.overrides[dependency] !== data.npm_overrides[dependency]) {
      throw invalid(
        `opencode/package.json override ${dependency} must be exactly ${data.npm_overrides[dependency]}`,
      );
    }
  }

  const lock = readJson(root, "opencode/package-lock.json", fsOps);
  if (!lock.packages || typeof lock.packages !== "object" || Array.isArray(lock.packages)) {
    throw invalid("opencode/package-lock.json packages must be an object");
  }
  for (const [name, entry] of Object.entries(lock.packages)) {
    if (name === "") continue;
    if (
      !entry
      || typeof entry !== "object"
      || typeof entry.resolved !== "string"
      || !/^https:\/\/registry\.npmjs\.org\/[^?#\s]+$/.test(entry.resolved)
    ) {
      throw invalid(`opencode/package-lock.json ${name} must include a canonical npm registry resolved URL`);
    }
    if (typeof entry.integrity !== "string" || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(entry.integrity)) {
      throw invalid(`opencode/package-lock.json ${name} must include non-empty sha512 integrity`);
    }
  }
  for (const dependency of EXACT_KEYS.overrides) {
    const entry = lock.packages?.[`node_modules/${dependency}`];
    if (entry?.version !== data.npm_overrides[dependency]) {
      throw invalid(
        `opencode/package-lock.json ${dependency} must resolve to ${data.npm_overrides[dependency]}`,
      );
    }
    if (typeof entry.resolved !== "string" || !entry.resolved.startsWith("https://registry.npmjs.org/")) {
      throw invalid(`opencode/package-lock.json ${dependency} must use the npm registry`);
    }
    if (typeof entry.integrity !== "string" || !entry.integrity.startsWith("sha512-")) {
      throw invalid(`opencode/package-lock.json ${dependency} must include sha512 integrity`);
    }
  }
}

function maskQuotedData(line) {
  let quote;
  let escaped = false;
  let masked = "";
  for (const character of line) {
    if (quote) {
      if (character === "\n") {
        escaped = false;
        masked += character;
      } else if (escaped) {
        escaped = false;
        masked += "_";
      } else if (quote === '"' && character === "\\") {
        escaped = true;
        masked += "_";
      } else if (character === quote) {
        quote = undefined;
        masked += character;
      } else {
        masked += "_";
      }
    } else if (character === "'" || character === '"') {
      quote = character;
      masked += character;
    } else {
      masked += character;
    }
  }
  return masked;
}

function activeLine(line, { preserveQuoted = false } = {}) {
  const masked = maskQuotedData(line);
  const comment = masked.indexOf("#");
  const end = comment === -1 ? line.length : comment;
  return (preserveQuoted ? line : masked).slice(0, end);
}

function containsActiveToken(contents, token) {
  return activeLogicalLines(contents).some((line) => activeLine(line).includes(token));
}

function activeLogicalLines(contents) {
  const maskedPhysical = maskQuotedData(contents).split(/\r?\n/);
  const logical = [];
  for (let index = 0; index < maskedPhysical.length; index += 1) {
    let line = maskedPhysical[index];
    let comment = line.indexOf("#");
    let active = line.slice(0, comment === -1 ? line.length : comment);
    while (index + 1 < maskedPhysical.length && comment === -1 && active.endsWith("\\")) {
      index += 1;
      line = active.slice(0, -1) + maskedPhysical[index];
      comment = line.indexOf("#");
      active = line.slice(0, comment === -1 ? line.length : comment);
    }
    logical.push(active);
  }
  return logical;
}

function validateInstallLine(line, relative) {
  let command = maskQuotedData(line).trim();
  if (!command || command.startsWith("#")) return;
  if (command.startsWith("run:")) command = command.slice("run:".length).trim();
  command = command.replace(/\s+#.*$/, "");
  for (const match of command.matchAll(/\bnpm(?:\s+--prefix\s+\S+)?\s+(ci|install)\b([^;&|]*)/g)) {
    const prefix = command.slice(0, match.index);
    if (!/(?:^|&&|\|\||;|\bthen\b|\bdo\b)\s*(?:if\s+)?(?:!\s*)?(?:[A-Za-z_][A-Za-z0-9_]*=[^\s;&|]*\s+)*(?:run_isolated\s+)?$/.test(prefix)) {
      continue;
    }
    if (match[1] === "install") {
      throw invalid(`${relative}: automated npm install is forbidden; use npm ci --ignore-scripts`);
    }
    if (!/(?:^|\s)--ignore-scripts(?:\s|$)/.test(match[2])) {
      throw invalid(`${relative}: automated npm ci must include --ignore-scripts`);
    }
  }
}

function validateAutomatedInstalls(root, fsOps) {
  for (const relative of activeCommandFiles(root, fsOps)) {
    const contents = fsOps.readFileSync(path.join(root, relative), "utf8");
    for (const line of activeLogicalLines(contents)) validateInstallLine(line, relative);
  }
}

function activeCommandFiles(root, fsOps) {
  const files = [];
  const collect = (relative, executableOnly) => {
    const full = path.join(root, relative);
    let entries;
    try {
      entries = fsOps.readdirSync(full, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) collect(child, executableOnly);
      else if (entry.isFile() && (!executableOnly || (fsOps.statSync(path.join(root, child)).mode & 0o111))) {
        files.push(child);
      }
    }
  };
  collect(".github/workflows", false);
  collect("scripts", true);
  return files;
}

function validateStarterConfig(root, data, fsOps) {
  const relative = "opencode/opencode.json";
  const config = readJson(root, relative, fsOps);
  const expected = `superpowers@git+https://github.com/obra/superpowers.git#${data.external_refs.superpowers.commit}`;
  if (!Array.isArray(config.plugin)) {
    throw invalid(`${relative} plugin must be an array containing the exact Superpowers full reviewed commit`);
  }
  if (config.plugin.filter((plugin) => plugin === expected).length !== 1) {
    throw invalid(`${relative} superpowers plugin must use the exact full reviewed commit ${data.external_refs.superpowers.commit}`);
  }
  for (const plugin of config.plugin) {
    if (typeof plugin !== "string") throw invalid(`${relative} plugin entries must be strings`);
    if (plugin.includes("git+https") && plugin !== expected) {
      throw invalid(`${relative} git+https plugin must use the exact full reviewed commit`);
    }
    if (plugin.includes("@latest")) {
      throw invalid(`${relative} must not use @latest in a stable input`);
    }
  }
}

function validateWorkflowActions(root, data, fsOps) {
  const approved = new Map([
    ["actions/checkout", data.external_refs.actions_checkout],
    ["actions/setup-node", data.external_refs.actions_setup_node],
  ]);
  for (const relative of [
    ".github/workflows/check.yml",
    ".github/workflows/compatibility-canary.yml",
  ]) {
    const workflow = readText(root, relative, fsOps);
    const seen = new Map([...approved.keys()].map((action) => [action, 0]));
    for (const line of workflow.split("\n")) {
      const match = line.match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)(?:\s+#\s+(\S.*?))?\s*$/);
      if (/^\s*(?:-\s*)?uses\s*:/.test(line) && !match) {
        throw invalid(`${relative} Action uses syntax must include a full commit and release comment`);
      }
      if (!match) continue;
      const use = match[1];
      const separator = use.lastIndexOf("@");
      const action = separator === -1 ? use : use.slice(0, separator);
      const ref = separator === -1 ? "" : use.slice(separator + 1);
      const inventory = approved.get(action);
      if (!COMMIT.test(ref)) {
        throw invalid(`${relative} Action ${action || use} must use a lowercase full commit`);
      }
      if (!inventory) {
        throw invalid(`${relative} Action ${action} is not present in supply-chain.json`);
      }
      if (ref !== inventory.commit) {
        throw invalid(`${relative} Action ${action} must match its supply-chain.json commit`);
      }
      if (match[2] !== inventory.release) {
        throw invalid(`${relative} Action ${action} release comment must be exactly ${inventory.release}`);
      }
      seen.set(action, seen.get(action) + 1);
    }
    for (const [action, count] of seen) {
      if (count === 0) throw invalid(`${relative} must use approved Action ${action}`);
    }
    if (containsActiveToken(workflow, "@latest")) {
      throw invalid(`${relative} must not use @latest in a stable input`);
    }
  }
}

function validateStableWorkflowCommands(root, fsOps) {
  for (const relative of activeCommandFiles(root, fsOps)) {
    const contents = readText(root, relative, fsOps);
    for (const line of activeLogicalLines(contents)) {
      const command = activeLine(line);
      const clone = command.match(/\bgit\s+clone\b.*?(?:--branch(?:=|\s+)|-b\s+)([^\s;&|]+)/);
      if (clone && !COMMIT.test(clone[1])) {
        throw invalid(`${relative} must not use a mutable git clone --branch value`);
      }
      const mutableNpmCli = command.match(
        /\b(npm\s+exec|npx)\s+(?:--\s+)?(?:@[^\s/@]+\/)?[^\s@/]+@v[1-9][0-9]*(?=\s|$)/,
      );
      if (mutableNpmCli) {
        throw invalid(`${relative} ${mutableNpmCli[1]} must not use a mutable major tag`);
      }
    }
  }
}

function validateDockerfile(root, data, fsOps) {
  const relative = "docker/open-design/Dockerfile";
  const dockerfile = readText(root, relative, fsOps);
  const activeDockerfile = dockerfile
    .split("\n")
    .map((line) => activeLine(line, { preserveQuoted: true }))
    .filter((line) => line.trim())
    .join("\n");
  const fromLines = activeDockerfile.match(/^FROM\s+\S+[^\S\r\n]*$/gm) ?? [];
  if (fromLines.length !== 1) {
    throw invalid(`${relative} must contain exactly one FROM`);
  }
  const expectedFrom = `FROM node:${data.external_refs.node_image.tag}@${data.external_refs.node_image.digest}`;
  if (fromLines[0].trimEnd() !== expectedFrom) {
    throw invalid(`${relative} FROM must use the exact reviewed tag and digest`);
  }

  for (const [pattern, expected, label] of [
    [/^ARG OPEN_DESIGN_REF=\S+[^\S\r\n]*$/gm, `ARG OPEN_DESIGN_REF=${data.external_refs.open_design.commit}`, "OPEN_DESIGN_REF"],
    [/\bgit checkout\b[^\n]*/g, 'git checkout "$OPEN_DESIGN_REF"', "Open Design checkout"],
    [/^ARG OPENCODE_AI_VERSION=\S+[^\S\r\n]*$/gm, `ARG OPENCODE_AI_VERSION=${data.external_refs.opencode_ai.version}`, "OPENCODE_AI_VERSION"],
    [/\bnpm install -g\b[^\n]*/g, 'npm install -g "opencode-ai@$OPENCODE_AI_VERSION"', "OpenCode install"],
    [/\bcorepack prepare pnpm@\S+ --activate\b/g, `corepack prepare pnpm@${data.external_refs.pnpm.version} --activate`, "pnpm version"],
    [/\bpnpm install\b[^\n]*/g, "pnpm install --frozen-lockfile", "pnpm install must use exactly --frozen-lockfile"],
  ]) {
    const matches = activeDockerfile.match(pattern) ?? [];
    const normalized = matches[0]?.trim().replace(/\s+\\$/, "");
    if (matches.length !== 1 || normalized !== expected) {
      throw invalid(`${relative} must contain exactly one approved ${label}`);
    }
  }
  if (containsActiveToken(dockerfile, "@latest")) {
    throw invalid(`${relative} must not use @latest in a stable input`);
  }
}

function canonicalDocumentationPinBlock(data) {
  return `<!-- supply-chain-pins:start -->
| Surface | Reviewed label | Immutable identifier |
|---|---|---|
| Superpowers | ${data.external_refs.superpowers.release} | \`${data.external_refs.superpowers.commit}\` |
| actions/checkout | ${data.external_refs.actions_checkout.release} | \`${data.external_refs.actions_checkout.commit}\` |
| actions/setup-node | ${data.external_refs.actions_setup_node.release} | \`${data.external_refs.actions_setup_node.commit}\` |
| Open Design | reviewed commit | \`${data.external_refs.open_design.commit}\` |
| Node image | ${data.external_refs.node_image.tag} | \`${data.external_refs.node_image.digest}\` |
| pnpm | ${data.external_refs.pnpm.version} | exact version |
| opencode-ai | ${data.external_refs.opencode_ai.version} | exact version |
| @babel/core override | ${data.npm_overrides["@babel/core"]} | exact version |
| uuid override | ${data.npm_overrides.uuid} | exact version |
<!-- supply-chain-pins:end -->`;
}

function validateDocumentation(root, data, fsOps) {
  const relative = "docs/supply-chain.md";
  const policy = readText(root, relative, fsOps);
  const start = "<!-- supply-chain-pins:start -->";
  const end = "<!-- supply-chain-pins:end -->";
  const starts = policy.match(/<!-- supply-chain-pins:start -->/g) ?? [];
  const ends = policy.match(/<!-- supply-chain-pins:end -->/g) ?? [];
  const startIndex = policy.indexOf(start);
  const endIndex = policy.indexOf(end);
  if (starts.length !== 1 || ends.length !== 1 || startIndex >= endIndex) {
    throw invalid(`${relative} must contain one ordered supply-chain-pins block`);
  }
  const actualBlock = policy.slice(startIndex, endIndex + end.length);
  if (actualBlock !== canonicalDocumentationPinBlock(data)) {
    const rowPositions = [
      "| Superpowers |",
      "| actions/checkout |",
      "| actions/setup-node |",
      "| Open Design |",
      "| Node image |",
      "| pnpm |",
      "| opencode-ai |",
      "| @babel/core override |",
      "| uuid override |",
    ].map((row) => actualBlock.indexOf(row));
    const rowsAreOrdered = rowPositions.every(
      (position, index) => position >= 0 && (index === 0 || position > rowPositions[index - 1]),
    );
    if (!rowsAreOrdered) {
      throw invalid(`${relative} must contain one ordered supply-chain-pins block`);
    }
    throw invalid(`${relative} canonical pins must exactly match supply-chain.json in declared order`);
  }

  for (const [required, message] of [
    ["npm ci --ignore-scripts", `${relative} must state the frozen install policy`],
    [
      "<64 lowercase hexadecimal characters>  opencode-agent-orchestration-kit-<version>.tgz",
      `${relative} must state the canonical checksum format`,
    ],
    [
      "Publication is never performed by checks and requires separate explicit authorization.",
      `${relative} must warn that publication requires separate explicit authorization`,
    ],
  ]) {
    if (!policy.includes(required)) throw invalid(message);
  }

  const expected = `superpowers@git+https://github.com/obra/superpowers.git#${data.external_refs.superpowers.commit}`;
  const referencePattern = /superpowers@git\+https:\/\/github\.com\/obra\/superpowers\.git(?:#[A-Za-z0-9._-]+)?/g;
  for (const activeDoc of ["README.md", "docs/superpowers.md"]) {
    const references = readText(root, activeDoc, fsOps).match(referencePattern) ?? [];
    if (references.length === 0 || references.some((reference) => reference !== expected)) {
      throw invalid(`${activeDoc} active Superpowers reference must use the full reviewed commit`);
    }
  }

  const documentationRequirements = new Map([
    ["README.md", [["npm ci --ignore-scripts", "frozen install command"]]],
    ["docs/installation.md", [["npm ci --ignore-scripts", "frozen install command"]]],
    ["docs/quickstart.md", [
      ["npm ci --ignore-scripts", "frozen install command"],
      ["npm run check:release", "release gate"],
    ]],
    ["docs/compatibility.md", [
      ["core smoke", "core smoke contract"],
      ["default-config smoke", "default-config smoke contract"],
    ]],
    ["docs/security.md", [
      ["npm audit signatures", "signature audit"],
      ["package-smoked tarball", "package-smoked tarball"],
      ["SHA-256", "SHA-256 checksum"],
    ]],
    ["docs/workflows.md", [
      ["package artifact", "package artifact"],
      ["checksum", "checksum verification"],
      ["post-publication verification", "post-publication verification"],
    ]],
    ["docs/docker-open-design.md", [
      [`node:${data.external_refs.node_image.tag}@${data.external_refs.node_image.digest}`, "Node image digest"],
      [`OPEN_DESIGN_REF=${data.external_refs.open_design.commit}`, "Open Design commit"],
      [`OPENCODE_AI_VERSION=${data.external_refs.opencode_ai.version}`, "OpenCode version"],
      [`pnpm@${data.external_refs.pnpm.version}`, "pnpm version"],
      ["pnpm install --frozen-lockfile", "frozen pnpm install"],
    ]],
  ]);
  for (const [activeDoc, requirements] of documentationRequirements) {
    const contents = readText(root, activeDoc, fsOps);
    for (const [fragment, label] of requirements) {
      if (!contents.includes(fragment)) throw invalid(`${activeDoc} must retain its canonical ${label}`);
    }
  }
}

function validateSurfaces(root, data, fsOps) {
  validatePackages(root, data, fsOps);
  validateAutomatedInstalls(root, fsOps);
  validateStarterConfig(root, data, fsOps);
  validateWorkflowActions(root, data, fsOps);
  validateStableWorkflowCommands(root, fsOps);
  validateDockerfile(root, data, fsOps);
  validateDocumentation(root, data, fsOps);
}

export function checkSupplyChain(
  root = REPOSITORY_ROOT,
  { fsOps = fs, surfaces = true } = {},
) {
  const data = validateSupplyChainData(readSupplyChain(root, fsOps));
  if (surfaces) validateSurfaces(root, data, fsOps);
  return data;
}

if (path.resolve(process.argv[1] ?? "") === SCRIPT_PATH) {
  try {
    checkSupplyChain(REPOSITORY_ROOT);
    console.log("supply chain contract ok: immutable external refs and exact npm overrides");
  } catch (error) {
    console.error(`supply chain contract invalid: ${error.message}`);
    process.exitCode = 1;
  }
}
