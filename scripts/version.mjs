#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_NAME = "opencode-agent-orchestration-kit";
const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const CONCRETE_STABLE_VERSION = /(?<![0-9])(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?![0-9])/g;
const OPERATIONAL_VERSION_SURFACES = [
  "scripts/version.mjs",
  "scripts/manage-installation.mjs",
  "install.sh",
  "upgrade.sh",
  "doctor.sh",
  "uninstall.sh",
  "rollback.sh",
  "scripts/check.sh",
  ".github/workflows/check.yml",
];

function invalid(message) {
  const error = new Error(message);
  error.code = "INVALID_VERSION";
  return error;
}

export function parseStableVersion(value) {
  if (typeof value !== "string") throw invalid("version must be a string");
  const match = STABLE_VERSION.exec(value);
  if (!match) throw invalid("version must use canonical MAJOR.MINOR.PATCH syntax");
  const components = match.slice(1).map(Number);
  if (components.some((component) => !Number.isSafeInteger(component))) {
    throw invalid("version component exceeds the safe integer range");
  }
  return {
    major: components[0],
    minor: components[1],
    patch: components[2],
    canonical: value,
  };
}

export function compareStableVersions(left, right) {
  const leftVersion = parseStableVersion(left);
  const rightVersion = parseStableVersion(right);
  for (const key of ["major", "minor", "patch"]) {
    if (leftVersion[key] < rightVersion[key]) return -1;
    if (leftVersion[key] > rightVersion[key]) return 1;
  }
  return 0;
}

export function readCanonicalVersion(repositoryRoot, fsOps = fs) {
  const packagePath = path.join(repositoryRoot, "package.json");
  const stat = fsOps.lstatSync(packagePath);
  if (stat.isSymbolicLink() || !stat.isFile()) throw invalid("package.json must be a safe regular file");
  const packageBytes = fsOps.readFileSync(packagePath, "utf8");
  let packageJson;
  try {
    packageJson = JSON.parse(packageBytes);
  } catch (error) {
    throw invalid(`package.json is invalid: ${error.message}`);
  }
  if (packageJson.name !== PACKAGE_NAME) throw invalid("canonical package name is invalid");
  return parseStableVersion(packageJson.version).canonical;
}

export function formatVersion(version) {
  return `${PACKAGE_NAME} ${parseStableVersion(version).canonical}`;
}

function readRegularFile(fullPath, label, fsOps) {
  let stat;
  try {
    stat = fsOps.lstatSync(fullPath);
  } catch (error) {
    if (error.code === "ENOENT") throw invalid(`${label} is missing`);
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw invalid(`${label} must be a safe regular file`);
  return fsOps.readFileSync(fullPath, "utf8");
}

function pathExists(fullPath, fsOps) {
  try {
    fsOps.lstatSync(fullPath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function isDeclaredNonKitVersion(relative, line) {
  return relative === "scripts/check.sh"
    && (/opencodePackage\.(?:dependencies|overrides)/.test(line)
      || /opencode\/package\.json must (?:pin|override)/.test(line));
}

function excludeOpenCodeBoundarySection(relative, contents) {
  if (relative !== ".github/workflows/check.yml") return contents;
  const start = "# opencode-boundaries:start";
  const end = "# opencode-boundaries:end";
  const startCount = contents.split(start).length - 1;
  const endCount = contents.split(end).length - 1;
  const startIndex = contents.indexOf(start);
  const endIndex = contents.indexOf(end);
  if (startCount !== 1 || endCount !== 1 || endIndex <= startIndex) return contents;
  return `${contents.slice(0, startIndex)}${contents.slice(endIndex + end.length)}`;
}

export function checkVersionContract(options = {}) {
  const repositoryRoot = options.repositoryRoot;
  const fsOps = options.fsOps ?? fs;
  if (typeof repositoryRoot !== "string" || repositoryRoot.length === 0) {
    throw invalid("repositoryRoot is required");
  }
  const version = readCanonicalVersion(repositoryRoot, fsOps);
  if (pathExists(path.join(repositoryRoot, "VERSION"), fsOps)) {
    throw invalid("competing root VERSION declaration is forbidden");
  }

  const opencodePackageText = readRegularFile(path.join(repositoryRoot, "opencode", "package.json"), "opencode/package.json", fsOps);
  let opencodePackage;
  try {
    opencodePackage = JSON.parse(opencodePackageText);
  } catch (error) {
    throw invalid(`opencode/package.json is invalid: ${error.message}`);
  }
  if (Object.hasOwn(opencodePackage, "version")) {
    throw invalid("opencode/package.json must not declare a version");
  }

  for (const relative of OPERATIONAL_VERSION_SURFACES) {
    const contents = readRegularFile(path.join(repositoryRoot, relative), relative, fsOps);
    const competing = excludeOpenCodeBoundarySection(relative, contents)
      .split(/\r?\n/).flatMap((line) => (
        isDeclaredNonKitVersion(relative, line)
          ? []
          : [...line.matchAll(CONCRETE_STABLE_VERSION)].map((match) => match[0])
      ));
    if (competing.length > 0) {
      throw invalid(`${relative} contains a competing stable version declaration`);
    }
  }

  const releaseNote = `docs/releases/v${version}.md`;
  const note = readRegularFile(path.join(repositoryRoot, releaseNote), "current release note", fsOps);
  const firstLine = note.split(/\r?\n/, 1)[0];
  const expectedHeading = `# v${version} - Safe lifecycle and canonical release identity`;
  if (firstLine !== expectedHeading) throw invalid("current release note heading is invalid");
  const noteLines = new Set(note.split(/\r?\n/));
  for (const heading of [
    "## Highlights",
    "## Installation or upgrade",
    "## Migration",
    "## Validation performed",
    "## Public safety boundary",
  ]) {
    if (!noteLines.has(heading)) throw invalid(`current release note is missing required section: ${heading}`);
  }

  const identity = { name: PACKAGE_NAME, version, releaseNote };
  if (options.tag !== undefined) {
    if (typeof options.tag !== "string" || !options.tag.startsWith("v")) throw invalid("tag must use canonical vMAJOR.MINOR.PATCH syntax");
    let taggedVersion;
    try {
      taggedVersion = parseStableVersion(options.tag.slice(1)).canonical;
    } catch {
      throw invalid("tag must use canonical vMAJOR.MINOR.PATCH syntax");
    }
    const expectedTag = `v${version}`;
    if (options.tag !== expectedTag || taggedVersion !== version) {
      throw invalid(`tag ${options.tag} does not match canonical version ${expectedTag}`);
    }
    identity.tag = options.tag;
  }
  return identity;
}

async function main(argv) {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  if (argv[0] === "--check") {
    if (argv.length !== 1) throw invalid("--check must be used alone");
    const identity = checkVersionContract({ repositoryRoot });
    process.stdout.write(`version contract ok: v${identity.version}\n`);
    return;
  }
  if (argv[0] === "--check-tag") {
    if (argv.length !== 2) throw invalid("--check-tag requires exactly one tag");
    const identity = checkVersionContract({ repositoryRoot, tag: argv[1] });
    process.stdout.write(`version tag ok: ${identity.tag}\n`);
    return;
  }
  if (argv.length !== 0) throw invalid(`unknown version argument: ${argv[0]}`);
  process.stdout.write(`${formatVersion(readCanonicalVersion(repositoryRoot))}\n`);
}

const isEntrypoint = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isEntrypoint) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
