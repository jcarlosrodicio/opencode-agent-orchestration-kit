#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.dirname(path.dirname(SCRIPT_PATH));
const REQUIRED_FILES = [
  "package/package.json",
  "package/supply-chain.json",
  "package/install.sh",
  "package/scripts/manage-installation.mjs",
  "package/scripts/package-smoke.sh",
  "package/scripts/package-smoke.mjs",
  "package/opencode/opencode.json",
  "package/opencode/package.json",
  "package/opencode/package-lock.json",
  "package/opencode/agents/lead.md",
  "package/docs/installation.md",
  "package/LICENSE",
  "package/NOTICE.md",
];

function smokeError(message) {
  const error = new Error(message);
  error.code = "INVALID_PACKAGE";
  return error;
}

export function parseChecksumFile(text, basename) {
  if (typeof text !== "string" || typeof basename !== "string" || path.basename(basename) !== basename) {
    throw smokeError("checksum basename is invalid");
  }
  const match = text.match(/^([0-9a-f]{64})  ([^\s/\\]+)\n?$/);
  if (!match) throw smokeError("checksum file must contain one canonical SHA-256 line");
  if (match[2] !== basename) throw smokeError("checksum basename does not match the tarball basename");
  return match[1];
}

function archiveNames(text) {
  return text.split("\n").filter((line) => line !== "");
}

export function validateArchiveEntries(names, verboseLines) {
  if (!Array.isArray(names) || !Array.isArray(verboseLines) || names.length !== verboseLines.length) {
    throw smokeError("archive name and verbose listings disagree");
  }
  if (names.length === 0) throw smokeError("archive listing is empty");

  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    const type = verboseLines[index]?.[0];
    if (typeof name !== "string" || name.includes("\\") || name.includes("\0")) {
      throw smokeError("archive contains an unsafe entry name");
    }
    const components = name.split("/");
    if (
      name.startsWith("/")
      || /^[A-Za-z]:/.test(name)
      || components.includes("..")
      || (name !== "package" && name !== "package/" && !name.startsWith("package/"))
    ) {
      throw smokeError("archive entry must stay below the single package/ root");
    }
    if (type !== "-" && type !== "d") {
      throw smokeError(`archive entry type is forbidden for ${name}`);
    }
    if (type === "d" && !name.endsWith("/")) {
      throw smokeError(`archive directory entry is malformed for ${name}`);
    }
  }
}

function forbiddenPackedName(name) {
  const relative = name.startsWith("package/") ? name.slice("package/".length) : name;
  const components = relative.split("/").filter(Boolean);
  if (["dist", "release", "releases", "artifacts"].includes(components[0]?.toLowerCase())) return true;
  return components.some((component) => {
    const lower = component.toLowerCase();
    return lower === ".env"
      || (lower.startsWith(".env.") && lower !== ".env.example")
      || lower.includes("credential")
      || lower === ".npmrc"
      || lower === ".gitignore"
      || lower === ".npmignore"
      || lower.includes("npm-token")
      || lower === ".git"
      || lower === ".github"
      || lower === ".oak"
      || lower === "node_modules"
      || lower === ".cache"
      || lower === "cache"
      || lower === "caches"
      || lower === ".npm"
      || lower === "npm-cache"
      || lower === ".pnpm-store"
      || lower === "dist";
  });
}

export function validatePackedFileSet(names) {
  const files = new Set(names.filter((name) => !name.endsWith("/")));
  for (const required of REQUIRED_FILES) {
    if (!files.has(required)) throw smokeError(`packed file set is missing ${required.slice("package/".length)}`);
  }
  for (const name of names) {
    if (forbiddenPackedName(name)) throw smokeError(`packed file set contains forbidden state: ${name}`);
  }
}

function inspectRegularFile(file) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch {
    throw smokeError(`${path.basename(file)} must be an existing regular file`);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw smokeError(`${path.basename(file)} must be a regular non-symlink file`);
  }
  return stat;
}

function captureRegularFile(source, destination) {
  let sourceFd;
  let destinationFd;
  try {
    const initialStat = fs.lstatSync(source);
    if (initialStat.isSymbolicLink() || !initialStat.isFile()) {
      throw smokeError(`${path.basename(source)} must be a regular non-symlink file`);
    }
    sourceFd = fs.openSync(
      source,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
    );
    const stat = fs.fstatSync(sourceFd);
    if (!stat.isFile() || stat.dev !== initialStat.dev || stat.ino !== initialStat.ino) {
      throw smokeError(`${path.basename(source)} changed before it could be captured safely`);
    }
    destinationFd = fs.openSync(
      destination,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
      0o600,
    );
    const buffer = Buffer.allocUnsafe(64 * 1024);
    for (;;) {
      const bytesRead = fs.readSync(sourceFd, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      let written = 0;
      while (written < bytesRead) {
        written += fs.writeSync(destinationFd, buffer, written, bytesRead - written);
      }
    }
    return fs.fstatSync(destinationFd);
  } catch (error) {
    if (error.code === "INVALID_PACKAGE") throw error;
    throw smokeError(`${path.basename(source)} must be an existing regular non-symlink file`);
  } finally {
    if (destinationFd !== undefined) fs.closeSync(destinationFd);
    if (sourceFd !== undefined) fs.closeSync(sourceFd);
  }
}

function hashFile(file) {
  const contents = fs.readFileSync(file);
  return {
    sha256: crypto.createHash("sha256").update(contents).digest("hex"),
    sha1: crypto.createHash("sha1").update(contents).digest("hex"),
    sha512: crypto.createHash("sha512").update(contents).digest("hex"),
  };
}

function safeEnvironment(tempRoot) {
  const home = path.join(tempRoot, "home");
  const cache = path.join(tempRoot, "npm-cache");
  fs.mkdirSync(home);
  fs.mkdirSync(cache);
  fs.writeFileSync(path.join(home, ".npmrc"), "");
  return {
    PATH: process.env.PATH ?? "",
    HOME: home,
    npm_config_cache: cache,
    npm_config_userconfig: path.join(home, ".npmrc"),
    CI: "true",
    LANG: process.env.LANG ?? "C",
  };
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) throw smokeError(options.label ?? `${command} failed`);
  return { stdout: result.stdout, stderr: result.stderr };
}

function makeTempRoot() {
  const parent = (process.env.TMPDIR ?? os.tmpdir()).replace(/\/$/, "");
  const root = fs.mkdtempSync(path.join(parent, "oak-package-smoke."));
  return { parent, root };
}

function removeTempRoot(parent, root) {
  const relative = path.relative(parent, root);
  if (!relative.startsWith("oak-package-smoke.") || relative.includes(path.sep) || path.isAbsolute(relative)) {
    throw smokeError("refusing unsafe package smoke cleanup");
  }
  fs.rmSync(root, { recursive: true, force: true });
}

function readRootPackage(repositoryRoot) {
  try {
    return JSON.parse(fs.readFileSync(path.join(repositoryRoot, "package.json"), "utf8"));
  } catch {
    throw smokeError("canonical package.json could not be read");
  }
}

export async function smokeTarball(options = {}) {
  const repositoryRoot = options.repositoryRoot ?? REPOSITORY_ROOT;
  const input = options.tarball;
  if (typeof input !== "string" || input === "") throw smokeError("tarball input is required");
  const basename = path.basename(input);
  const inspect = options.inspectRegularFile ?? inspectRegularFile;
  const capture = options.captureTarball ?? captureRegularFile;
  const hasher = options.hashFile ?? hashFile;
  const run = options.run ?? ((command, args, commandOptions = {}) => runCommand(command, args, commandOptions));

  const canonical = readRootPackage(repositoryRoot);
  const expectedBasename = `${canonical.name}-${canonical.version}.tgz`;
  if (basename !== expectedBasename) throw smokeError(`tarball filename must be ${expectedBasename}`);

  const temporary = makeTempRoot();
  try {
    const capturedTarball = path.join(temporary.root, "captured.tgz");
    const stat = capture(input, capturedTarball);
    const hashes = hasher(capturedTarball);

    if (options.checksumFile !== undefined) {
      inspect(options.checksumFile);
      let checksumText;
      try {
        checksumText = fs.readFileSync(options.checksumFile, "utf8");
      } catch {
        throw smokeError("checksum file could not be read");
      }
      const expected = parseChecksumFile(checksumText, basename);
      if (expected !== hashes.sha256) throw smokeError("checksum mismatch; archive was not inspected or extracted");
    }

    const listing = run("tar", ["-tzf", capturedTarball], { label: "archive listing failed" });
    const verbose = run("tar", ["-tvzf", capturedTarball], { label: "archive verbose listing failed" });
    const names = archiveNames(listing.stdout);
    const verboseLines = archiveNames(verbose.stdout);
    validateArchiveEntries(names, verboseLines);
    validatePackedFileSet(names);

    const extracted = path.join(temporary.root, "extracted");
    fs.mkdirSync(extracted);
    const environment = safeEnvironment(temporary.root);
    run("tar", ["-xzf", capturedTarball, "-C", extracted], { label: "archive extraction failed" });

    let packed;
    try {
      packed = JSON.parse(fs.readFileSync(path.join(extracted, "package/package.json"), "utf8"));
    } catch {
      throw smokeError("packed package.json could not be read");
    }
    if (packed.name !== canonical.name || packed.version !== canonical.version) {
      throw smokeError("packed package name and version must match the canonical package.json");
    }

    const packedRoot = path.join(extracted, "package");
    const opencodeRoot = path.join(packedRoot, "opencode");
    run("npm", ["ci", "--ignore-scripts"], {
      cwd: opencodeRoot,
      env: environment,
      label: "packed npm ci failed",
    });
    run(process.execPath, ["--input-type=module", "-e", "import('@opencode-ai/plugin')"], {
      cwd: opencodeRoot,
      env: environment,
      label: "packed SDK import failed",
    });
    run("bash", ["scripts/install-smoke.sh"], {
      cwd: packedRoot,
      env: environment,
      label: "packed installation smoke failed",
    });
    return {
      basename,
      size: stat.size,
      sha256: hashes.sha256,
      sha1: hashes.sha1,
      sha512: hashes.sha512,
    };
  } finally {
    removeTempRoot(temporary.parent, temporary.root);
  }
}

async function main(args) {
  if (!(args.length === 0 || args.length === 1 || (args.length === 3 && args[0] === "--checksum"))) {
    console.error("usage: package-smoke.sh [TARBALL | --checksum SHA256SUMS TARBALL]");
    process.exitCode = 2;
    return;
  }

  let temporary;
  try {
    let tarball;
    let checksumFile;
    if (args.length === 0) {
      temporary = makeTempRoot();
      const destination = path.join(temporary.root, "pack");
      fs.mkdirSync(destination);
      const environment = safeEnvironment(temporary.root);
      const result = runCommand("npm", ["pack", "--json", "--pack-destination", destination], {
        cwd: REPOSITORY_ROOT,
        env: environment,
        label: "npm pack failed",
      });
      let entries;
      try {
        entries = JSON.parse(result.stdout);
      } catch {
        throw smokeError("npm pack returned invalid JSON");
      }
      if (!Array.isArray(entries) || entries.length !== 1 || path.basename(entries[0]?.filename ?? "") !== entries[0]?.filename) {
        throw smokeError("npm pack must report exactly one public tarball basename");
      }
      tarball = path.join(destination, entries[0].filename);
    } else if (args.length === 1) {
      [tarball] = args;
    } else {
      [, checksumFile, tarball] = args;
    }
    const evidence = await smokeTarball({ repositoryRoot: REPOSITORY_ROOT, tarball, checksumFile });
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } catch (error) {
    console.error(`package smoke failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (temporary) removeTempRoot(temporary.parent, temporary.root);
  }
}

if (path.resolve(process.argv[1] ?? "") === SCRIPT_PATH) {
  await main(process.argv.slice(2));
}
