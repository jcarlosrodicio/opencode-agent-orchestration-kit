#!/usr/bin/env node

import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { parseStableVersion, readCanonicalVersion, formatVersion, compareStableVersions } from "./version.mjs";

export const SCHEMA_VERSION = 1;
export const PROTECTED_ROOT_FILES = [
  "AGENTS.md",
  "opencode.json",
  "package.json",
  "package-lock.json",
  "tui.json",
];

const COMMAND_FLAGS = {
  install: new Set(["dryRun", "force", "target", "help"]),
  upgrade: new Set(["dryRun", "target", "help"]),
  doctor: new Set(["acceptPreserved", "target", "help"]),
  uninstall: new Set(["dryRun", "yes", "target", "help"]),
  rollback: new Set(["dryRun", "target", "help"]),
};

const USAGE = {
  install: "Usage: ./install.sh [--dry-run] [--force] [--target PATH]",
  upgrade: "Usage: ./upgrade.sh [--dry-run] [--target PATH]",
  doctor: "Usage: ./doctor.sh [--accept-preserved PATH] [--target PATH]",
  uninstall: "Usage: ./uninstall.sh [--dry-run] [--yes] [--target PATH]",
  rollback: "Usage: ./rollback.sh [--dry-run] [--target PATH]",
};

function invalid(message) {
  const error = new Error(message);
  error.code = "INVALID_INVOCATION";
  return error;
}

export function parseCliArgs(command, argv) {
  const allowed = COMMAND_FLAGS[command];
  if (!allowed) throw invalid(`Unknown command: ${command ?? ""}`);

  const options = {
    command,
    dryRun: false,
    force: false,
    yes: false,
    help: false,
    target: undefined,
    acceptPreserved: undefined,
  };

  const flagSpecs = {
    "--dry-run": ["dryRun", false],
    "--force": ["force", false],
    "--yes": ["yes", false],
    "-y": ["yes", false],
    "--help": ["help", false],
    "-h": ["help", false],
    "--target": ["target", true],
    "--accept-preserved": ["acceptPreserved", true],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const spec = flagSpecs[argument];
    if (!spec) throw invalid(`Unknown argument: ${argument}`);
    const [name, takesValue] = spec;
    if (!allowed.has(name)) throw invalid(`${argument} is not valid for ${command}`);
    if (takesValue) {
      if (index + 1 >= argv.length || argv[index + 1].startsWith("--")) {
        throw invalid(`${argument} requires a path`);
      }
      options[name] = argv[index + 1];
      index += 1;
    } else {
      options[name] = true;
    }
  }

  return options;
}

export function resolveTarget(options, env = process.env) {
  if (options.target !== undefined) {
    if (options.target.length === 0) throw invalid("--target must not be empty");
    return options.target;
  }
  if (Object.hasOwn(env, "OPENCODE_CONFIG_DIR")) {
    if (!env.OPENCODE_CONFIG_DIR) throw invalid("OPENCODE_CONFIG_DIR must not be empty");
    return env.OPENCODE_CONFIG_DIR;
  }
  if (!env.HOME) throw invalid("HOME is required when no target is configured");
  return path.join(env.HOME, ".config", "opencode");
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function normalizeManagedPath(value) {
  if (typeof value !== "string" || value.length === 0) throw invalid("managed path must be non-empty");
  if (/[\0-\x1f\x7f]/.test(value)) throw invalid("managed path contains control characters");
  if (value.includes("\\") || path.posix.isAbsolute(value)) throw invalid("managed path must be relative POSIX syntax");
  const normalized = path.posix.normalize(value);
  if (normalized !== value || value.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw invalid(`managed path is not normalized: ${value}`);
  }
  if (value === ".oak" || value.startsWith(".oak/")) throw invalid(`managed path uses reserved .oak namespace: ${value}`);
  return value;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function inventorySource(sourceRoot, deps = {}) {
  const fsOps = deps.fsOps ?? fs;
  const entries = [];

  function walk(directory, prefix = "") {
    const names = fsOps.readdirSync(directory).sort();
    for (const name of names) {
      if (prefix === "" && name === "node_modules") continue;
      const relative = prefix ? `${prefix}/${name}` : name;
      if (relative === ".oak" || relative.startsWith(".oak/")) {
        throw invalid(`source payload uses reserved .oak namespace: ${relative}`);
      }
      const fullPath = path.join(directory, name);
      const stat = fsOps.lstatSync(fullPath);
      if (stat.isSymbolicLink()) throw invalid(`source symlink is not allowed: ${relative}`);
      if (stat.isDirectory()) {
        walk(fullPath, relative);
        continue;
      }
      if (!stat.isFile()) throw invalid(`source entry is not a regular file: ${relative}`);
      const managedPath = normalizeManagedPath(relative);
      const bytes = fsOps.readFileSync(fullPath);
      entries.push({ path: managedPath, sha256: sha256(bytes), mode: stat.mode & 0o777 });
    }
  }

  const rootStat = fsOps.lstatSync(sourceRoot);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw invalid("source payload root must be a non-symlink directory");
  walk(sourceRoot);
  entries.sort((left, right) => left.path.localeCompare(right.path));
  return {
    entries,
    payloadSha256: sha256(Buffer.from(`${canonicalJson(entries)}\n`, "utf8")),
  };
}

function isInside(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function resolveExistingComponents(absolutePath, fsOps = fs) {
  let existing = absolutePath;
  const suffix = [];
  while (!lstatIfExists(existing, fsOps)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    suffix.unshift(path.basename(existing));
    existing = parent;
  }
  const resolved = fsOps.realpathSync(existing);
  return path.join(resolved, ...suffix);
}

export function assertSafeTarget({ targetRoot, repositoryRoot, sourceRoot, fsOps = fs }) {
  const target = resolveExistingComponents(path.resolve(targetRoot), fsOps);
  const repository = resolveExistingComponents(path.resolve(repositoryRoot), fsOps);
  const source = resolveExistingComponents(path.resolve(sourceRoot), fsOps);
  if (target === path.parse(target).root) throw invalid("target filesystem root is unsafe");

  if (target === repository || isInside(repository, target)) {
    throw invalid("target must not equal or contain the repository root");
  }
  const targetStat = lstatIfExists(target, fsOps);
  const sourceStat = lstatIfExists(source, fsOps);
  const sameSourceNode = targetStat && sourceStat && targetStat.dev === sourceStat.dev && targetStat.ino === sourceStat.ino;
  if (target === source || sameSourceNode || isInside(target, source) || isInside(source, target)) {
    throw invalid("target must not equal, contain, or be inside the source payload");
  }
  if (isInside(target, repository)) {
    throw invalid("target must not be inside the repository root");
  }
  return target;
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  const unknown = actual.filter((key) => !wanted.includes(key));
  const missing = wanted.filter((key) => !actual.includes(key));
  if (unknown.length > 0) throw invalid(`${label} has unknown field: ${unknown[0]}`);
  if (missing.length > 0) throw invalid(`${label} is missing field: ${missing[0]}`);
}

function assertHash(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) throw invalid(`${label} must be a lowercase SHA-256 digest`);
}

function assertMode(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0o777) throw invalid(`${label} mode must be an integer from 0000 through 0777`);
}

function assertTimestamp(value, label) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw invalid(`${label} must be an ISO-8601 timestamp`);
}

const MANIFEST_KEYS = [
  "schema_version", "manager", "kit_version", "payload_sha256", "created_at", "updated_at",
  "last_transaction_id", "owned_files", "preserved_files",
];
const OWNED_KEYS = ["path", "sha256", "mode"];
const PRESERVED_KEYS = [
  "path", "observed_sha256", "observed_mode", "source_sha256", "source_mode",
  "reason", "merge_acknowledgement",
];
const ACK_KEYS = [
  "target_sha256", "target_mode", "source_sha256", "source_mode", "acknowledged_at",
];

export function validateManifest(manifest) {
  assertExactKeys(manifest, MANIFEST_KEYS, "manifest");
  if (manifest.schema_version !== SCHEMA_VERSION) throw invalid("manifest schema_version must be 1");
  if (manifest.manager !== "opencode-agent-orchestration-kit") throw invalid("manifest manager is invalid");
  try {
    parseStableVersion(manifest.kit_version);
  } catch (error) {
    throw invalid(`manifest kit_version is invalid: ${error.message}`);
  }
  assertHash(manifest.payload_sha256, "manifest payload_sha256");
  assertTimestamp(manifest.created_at, "manifest created_at");
  assertTimestamp(manifest.updated_at, "manifest updated_at");
  if (typeof manifest.last_transaction_id !== "string" || manifest.last_transaction_id.length === 0) {
    throw invalid("manifest last_transaction_id must be non-empty");
  }
  if (!Array.isArray(manifest.owned_files) || !Array.isArray(manifest.preserved_files)) {
    throw invalid("manifest ownership lists must be arrays");
  }

  const allPaths = new Set();
  let previousPath = null;
  for (const entry of manifest.owned_files) {
    assertExactKeys(entry, OWNED_KEYS, "owned_files entry");
    normalizeManagedPath(entry.path);
    if (previousPath !== null && previousPath.localeCompare(entry.path) >= 0) {
      throw invalid(previousPath === entry.path ? `duplicate manifest path: ${entry.path}` : "owned_files must be sorted by path");
    }
    previousPath = entry.path;
    allPaths.add(entry.path);
    assertHash(entry.sha256, `owned_files ${entry.path} sha256`);
    assertMode(entry.mode, `owned_files ${entry.path}`);
  }

  previousPath = null;
  for (const entry of manifest.preserved_files) {
    assertExactKeys(entry, PRESERVED_KEYS, "preserved_files entry");
    normalizeManagedPath(entry.path);
    if (previousPath !== null && previousPath.localeCompare(entry.path) >= 0) {
      throw invalid(previousPath === entry.path ? `duplicate manifest path: ${entry.path}` : "preserved_files must be sorted by path");
    }
    previousPath = entry.path;
    if (allPaths.has(entry.path)) throw invalid(`owned and preserved paths overlap: ${entry.path}`);
    allPaths.add(entry.path);
    assertHash(entry.observed_sha256, `preserved_files ${entry.path} observed_sha256`);
    assertMode(entry.observed_mode, `preserved_files ${entry.path} observed`);
    assertHash(entry.source_sha256, `preserved_files ${entry.path} source_sha256`);
    assertMode(entry.source_mode, `preserved_files ${entry.path} source`);
    if (!["preexisting-user-file", "preexisting-exact-match"].includes(entry.reason)) {
      throw invalid(`preserved_files ${entry.path} reason is invalid`);
    }
    if (entry.merge_acknowledgement !== null) {
      assertExactKeys(entry.merge_acknowledgement, ACK_KEYS, "merge_acknowledgement");
      assertHash(entry.merge_acknowledgement.target_sha256, "merge_acknowledgement target_sha256");
      assertMode(entry.merge_acknowledgement.target_mode, "merge_acknowledgement target");
      assertHash(entry.merge_acknowledgement.source_sha256, "merge_acknowledgement source_sha256");
      assertMode(entry.merge_acknowledgement.source_mode, "merge_acknowledgement source");
      assertTimestamp(entry.merge_acknowledgement.acknowledged_at, "merge_acknowledgement acknowledged_at");
    }
  }
  return manifest;
}

export function canonicalManifestBytes(manifest) {
  validateManifest(manifest);
  return Buffer.from(`${canonicalJson(manifest)}\n`, "utf8");
}

const TRANSACTION_KEYS = [
  "schema_version", "transaction_id", "command", "status", "rollback_origin",
  "created_at", "source_payload_sha256", "previous_manifest", "next_manifest",
  "previous_manifest_sha256", "next_manifest_sha256", "lock", "operations",
  "completed_operation_indexes", "rollback_completed_operation_indexes",
  "manifest_write_completed", "rollback_manifest_write_completed",
];
const LOCK_KEYS = ["transaction_id", "pid", "command", "created_at"];
const OPERATION_KEYS = [
  "index", "kind", "path", "before_sha256", "before_mode", "after_sha256",
  "after_mode", "backup_path",
];

function assertNullableStatePair(hash, mode, label) {
  if ((hash === null) !== (mode === null)) throw invalid(`${label} hash and mode must both be null or both be present`);
  if (hash !== null) {
    assertHash(hash, `${label} hash`);
    assertMode(mode, label);
  }
}

function validateManifestPair(transaction, name) {
  const manifest = transaction[`${name}_manifest`];
  const digest = transaction[`${name}_manifest_sha256`];
  if (manifest === null) {
    if (digest !== null) throw invalid(`${name}_manifest_sha256 must be null when ${name}_manifest is null`);
    return false;
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw invalid(`${name}_manifest must be null or a complete manifest`);
  try {
    validateManifest(manifest);
  } catch (error) {
    throw invalid(`${name}_manifest is invalid: ${error.message}`);
  }
  assertHash(digest, `${name}_manifest_sha256`);
  if (sha256(canonicalManifestBytes(manifest)) !== digest) throw invalid(`${name}_manifest_sha256 does not match canonical manifest bytes`);
  return true;
}

function validateBackupPath(value, label) {
  if (typeof value !== "string" || !value.startsWith("files/")) throw invalid(`${label} backup must be below files/`);
  normalizeManagedPath(value);
  if (value.split("/").includes(".oak")) throw invalid(`${label} backup uses reserved .oak component`);
}

export function validateTransaction(transaction) {
  assertExactKeys(transaction, TRANSACTION_KEYS, "transaction");
  if (transaction.schema_version !== SCHEMA_VERSION) throw invalid("transaction schema_version must be 1");
  if (typeof transaction.transaction_id !== "string" || transaction.transaction_id.length === 0) throw invalid("transaction_id must be non-empty");
  if (!["install", "upgrade", "accept-preserved", "uninstall"].includes(transaction.command)) throw invalid("transaction command is invalid");
  assertTimestamp(transaction.created_at, "transaction created_at");
  assertHash(transaction.source_payload_sha256, "source_payload_sha256");

  const statusOrigins = new Set([
    "planned:none", "applying:none", "committed:none",
    "rolling-back:interrupted-forward", "rolled-back:interrupted-forward",
    "rolling-back:committed-operation", "rolled-back:committed-operation",
  ]);
  if (!statusOrigins.has(`${transaction.status}:${transaction.rollback_origin}`)) {
    throw invalid("transaction status and rollback_origin combination is invalid");
  }

  const hasPrevious = validateManifestPair(transaction, "previous");
  const hasNext = validateManifestPair(transaction, "next");
  const expectedPresence = {
    install: [false, true],
    upgrade: [true, true],
    "accept-preserved": [true, true],
    uninstall: [true, false],
  }[transaction.command];
  if (hasPrevious !== expectedPresence[0] || hasNext !== expectedPresence[1]) {
    throw invalid(`transaction manifest presence pair is invalid for ${transaction.command}`);
  }

  assertExactKeys(transaction.lock, LOCK_KEYS, "transaction lock");
  if (transaction.lock.transaction_id !== transaction.transaction_id) throw invalid("transaction lock transaction_id mismatch");
  if (!Number.isInteger(transaction.lock.pid) || transaction.lock.pid <= 0) throw invalid("transaction lock pid is invalid");
  if (![transaction.command, "rollback"].includes(transaction.lock.command)) throw invalid("transaction lock command is invalid");
  assertTimestamp(transaction.lock.created_at, "transaction lock created_at");

  if (!Array.isArray(transaction.operations)) throw invalid("transaction operations must be an array");
  const paths = new Set();
  for (let index = 0; index < transaction.operations.length; index += 1) {
    const operation = transaction.operations[index];
    assertExactKeys(operation, OPERATION_KEYS, "transaction operation");
    if (operation.index !== index) throw invalid("operation indexes must be unique and consecutive");
    if (!["add", "update", "remove"].includes(operation.kind)) throw invalid(`operation kind is invalid: ${operation.kind}`);
    normalizeManagedPath(operation.path);
    if (paths.has(operation.path)) throw invalid(`duplicate operation path: ${operation.path}`);
    paths.add(operation.path);
    assertNullableStatePair(operation.before_sha256, operation.before_mode, `${operation.kind} before-state`);
    assertNullableStatePair(operation.after_sha256, operation.after_mode, `${operation.kind} after-state`);
    if (operation.kind === "add") {
      if (operation.before_sha256 !== null) throw invalid("add before-state must be absent");
      if (operation.after_sha256 === null) throw invalid("add after-state is required");
      if (operation.backup_path !== null) throw invalid("add operation cannot have a backup");
    } else if (operation.kind === "update") {
      if (operation.before_sha256 === null || operation.after_sha256 === null) throw invalid("update before and after states are required");
      if (operation.backup_path === null) throw invalid("update operation requires a backup");
      validateBackupPath(operation.backup_path, "update");
    } else {
      if (operation.before_sha256 === null) throw invalid("remove before-state is required");
      if (operation.after_sha256 !== null) throw invalid("remove after-state must be absent");
      if (operation.backup_path === null) throw invalid("remove operation requires a backup");
      validateBackupPath(operation.backup_path, "remove");
    }
  }

  const validateIndexes = (values, label) => {
    if (!Array.isArray(values) || values.some((value) => !Number.isInteger(value))) throw invalid(`${label} must be an integer array`);
    if (new Set(values).size !== values.length || values.some((value) => value < 0 || value >= transaction.operations.length)) {
      throw invalid(`${label} contains invalid completed indexes`);
    }
  };
  validateIndexes(transaction.completed_operation_indexes, "completed_operation_indexes");
  validateIndexes(transaction.rollback_completed_operation_indexes, "rollback_completed_operation_indexes");
  if (transaction.rollback_completed_operation_indexes.some((value) => !transaction.completed_operation_indexes.includes(value))) {
    throw invalid("rollback progress may reference only forward-completed operations");
  }
  if (transaction.rollback_completed_operation_indexes.length > 0 && !["rolling-back", "rolled-back"].includes(transaction.status)) {
    throw invalid("rollback progress requires a rolling-back status");
  }
  if (typeof transaction.manifest_write_completed !== "boolean" || typeof transaction.rollback_manifest_write_completed !== "boolean") {
    throw invalid("manifest progress fields must be boolean");
  }
  if (transaction.rollback_manifest_write_completed && (!transaction.manifest_write_completed || !["rolling-back", "rolled-back"].includes(transaction.status))) {
    throw invalid("rollback manifest progress is inconsistent");
  }
  if (transaction.command === "accept-preserved") {
    if (transaction.operations.length !== 0) throw invalid("accept-preserved must be manifest-only");
    if (canonicalJson(transaction.previous_manifest.owned_files) !== canonicalJson(transaction.next_manifest.owned_files)) {
      throw invalid("accept-preserved cannot change owned files");
    }
    const previousByPath = new Map(transaction.previous_manifest.preserved_files.map((entry) => [entry.path, entry]));
    const changed = transaction.next_manifest.preserved_files.filter((entry) => canonicalJson(entry) !== canonicalJson(previousByPath.get(entry.path)));
    if (changed.length !== 1 || transaction.next_manifest.preserved_files.length !== transaction.previous_manifest.preserved_files.length) {
      throw invalid("accept-preserved must change exactly one preserved entry");
    }
    const nextEntry = changed[0];
    const previousEntry = previousByPath.get(nextEntry.path);
    const acknowledgement = nextEntry.merge_acknowledgement;
    if (!previousEntry || nextEntry.reason !== previousEntry.reason || !acknowledgement
      || acknowledgement.target_sha256 !== nextEntry.observed_sha256
      || acknowledgement.target_mode !== nextEntry.observed_mode
      || acknowledgement.source_sha256 !== nextEntry.source_sha256
      || acknowledgement.source_mode !== nextEntry.source_mode) {
      throw invalid("accept-preserved acknowledgement must match next-manifest baselines and preserve reason");
    }
  }
  return transaction;
}

function lstatIfExists(fullPath, fsOps = fs) {
  try {
    return fsOps.lstatSync(fullPath);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function inspectTargetPath(targetRoot, relative, fsOps = fs) {
  const parts = relative.split("/");
  let current = targetRoot;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    const stat = lstatIfExists(current, fsOps);
    if (!stat) return { kind: "absent" };
    if (stat.isSymbolicLink()) throw invalid(`target symlink is not allowed: ${relative}`);
    if (index < parts.length - 1) {
      if (!stat.isDirectory()) throw invalid(`target parent is not a directory: ${relative}`);
      continue;
    }
    if (stat.isDirectory()) return { kind: "directory" };
    if (!stat.isFile()) throw invalid(`target entry is not a regular file: ${relative}`);
    const bytes = fsOps.readFileSync(current);
    return { kind: "file", sha256: sha256(bytes), mode: stat.mode & 0o777 };
  }
  return { kind: "absent" };
}

function readManifest(targetRoot, fsOps = fs) {
  const oakPath = path.join(targetRoot, ".oak");
  const oakStat = lstatIfExists(oakPath, fsOps);
  if (!oakStat) return null;
  if (oakStat.isSymbolicLink() || !oakStat.isDirectory()) throw invalid("target .oak must be a non-symlink directory");
  const manifestPath = path.join(oakPath, "manifest.json");
  const manifestStat = lstatIfExists(manifestPath, fsOps);
  if (!manifestStat) return null;
  if (manifestStat.isSymbolicLink() || !manifestStat.isFile()) throw invalid("manifest.json must be a non-symlink regular file");
  let manifest;
  try {
    manifest = JSON.parse(fsOps.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw invalid(`manifest JSON is corrupt: ${error.message}`);
  }
  validateManifest(manifest);
  return manifest;
}

export function inspectInstallation({ sourceRoot, targetRoot, deps = {} }) {
  const fsOps = deps.fsOps ?? fs;
  const repositoryRoot = deps.repositoryRoot ?? path.dirname(sourceRoot);
  const safeTarget = assertSafeTarget({ targetRoot, repositoryRoot, sourceRoot, fsOps });
  const targetStat = lstatIfExists(safeTarget, fsOps);
  if (targetStat && (targetStat.isSymbolicLink() || !targetStat.isDirectory())) {
    throw invalid("target root must be a non-symlink directory or absent");
  }
  const source = inventorySource(sourceRoot, { fsOps });
  const manifest = targetStat ? readManifest(safeTarget, fsOps) : null;
  const paths = new Set(source.entries.map((entry) => entry.path));
  for (const entry of manifest?.owned_files ?? []) paths.add(entry.path);
  for (const entry of manifest?.preserved_files ?? []) paths.add(entry.path);
  const target = {};
  for (const relative of [...paths].sort()) target[relative] = targetStat ? inspectTargetPath(safeTarget, relative, fsOps) : { kind: "absent" };
  const fingerprint = sha256(Buffer.from(`${canonicalJson({ source, manifest, target })}\n`, "utf8"));
  return { sourceRoot, targetRoot: safeTarget, repositoryRoot, source, manifest, target, fingerprint };
}

function sameState(left, right) {
  return left?.kind === "file" && left.sha256 === right.sha256 && left.mode === right.mode;
}

function manifestEntryState(entry) {
  return { kind: "file", sha256: entry.sha256, mode: entry.mode };
}

function preservedEntry(source, target, reason) {
  return {
    path: source.path,
    observed_sha256: target.sha256,
    observed_mode: target.mode,
    source_sha256: source.sha256,
    source_mode: source.mode,
    reason,
    merge_acknowledgement: null,
  };
}

function makeNextManifest({ inspection, ownedFiles, preservedFiles, options }) {
  const now = (options.clock?.() ?? new Date()).toISOString();
  return {
    schema_version: SCHEMA_VERSION,
    manager: "opencode-agent-orchestration-kit",
    kit_version: parseStableVersion(options.kitVersion).canonical,
    payload_sha256: inspection.source.payloadSha256,
    created_at: inspection.manifest?.created_at ?? now,
    updated_at: now,
    last_transaction_id: options.transactionId ?? "pending",
    owned_files: ownedFiles.sort((left, right) => left.path.localeCompare(right.path)),
    preserved_files: preservedFiles.sort((left, right) => left.path.localeCompare(right.path)),
  };
}

function classifyVersionState(sourceVersion, manifest, sourcePayloadSha256) {
  const source = parseStableVersion(sourceVersion).canonical;
  if (!manifest) return "not-installed";
  const installed = parseStableVersion(manifest.kit_version).canonical;
  const comparison = compareStableVersions(source, installed);
  if (comparison > 0) return "upgrade-available";
  if (comparison < 0) return "source-older";
  return manifest.payload_sha256 === sourcePayloadSha256
    ? "current"
    : "same-version-different-payload";
}

export function buildPlan({ command, inspection, options = {} }) {
  if (!["install", "upgrade", "uninstall", "accept-preserved"].includes(command)) throw invalid(`cannot build plan for ${command}`);
  if (command === "install" && inspection.manifest) throw invalid("install requires absent manifest; use upgrade");
  if (command !== "install" && !inspection.manifest) throw invalid(`${command} requires a valid active manifest`);

  const sourceByPath = new Map(inspection.source.entries.map((entry) => [entry.path, entry]));
  const ownedByPath = new Map((inspection.manifest?.owned_files ?? []).map((entry) => [entry.path, entry]));
  const preservedByPath = new Map((inspection.manifest?.preserved_files ?? []).map((entry) => [entry.path, entry]));
  const entries = [];
  const blockers = [];
  const warnings = [];
  const nextOwned = [];
  const nextPreserved = [];
  const allPaths = new Set([...sourceByPath.keys(), ...ownedByPath.keys(), ...preservedByPath.keys()]);
  const versionState = command === "upgrade"
    ? classifyVersionState(options.kitVersion, inspection.manifest, inspection.source.payloadSha256)
    : null;
  if (versionState === "source-older" || versionState === "same-version-different-payload") {
    blockers.push({ path: "kit_version", classification: versionState });
  }

  for (const managedPath of [...allPaths].sort()) {
    const source = sourceByPath.get(managedPath);
    const owned = ownedByPath.get(managedPath);
    const preserved = preservedByPath.get(managedPath);
    const target = inspection.target[managedPath] ?? { kind: "absent" };

    if (command === "install") {
      if (target.kind === "absent") {
        entries.push({ kind: "add", path: managedPath, before: null, after: source, reason: "new" });
        nextOwned.push(source);
      } else if (target.kind !== "file") {
        blockers.push({ path: managedPath, classification: "unowned-conflict", reason: "structural-collision" });
      } else if (sameState(target, source)) {
        entries.push({ kind: "adopt", path: managedPath, before: target, after: source, reason: "unowned-match" });
        nextOwned.push(source);
      } else if (PROTECTED_ROOT_FILES.includes(managedPath)) {
        if (options.force) {
          entries.push({ kind: "update", path: managedPath, before: target, after: source, reason: "force-authorized" });
          nextOwned.push(source);
        } else {
          entries.push({ kind: "preserve", path: managedPath, before: target, after: target, reason: "preexisting-user-file" });
          nextPreserved.push(preservedEntry(source, target, "preexisting-user-file"));
          warnings.push({ path: managedPath, classification: "preserved-user" });
        }
      } else if (options.force) {
        entries.push({ kind: "update", path: managedPath, before: target, after: source, reason: "force-authorized" });
        nextOwned.push(source);
      } else {
        blockers.push({ path: managedPath, classification: "unowned-conflict" });
      }
      continue;
    }

    if (command === "uninstall") {
      if (owned) {
        if (sameState(target, manifestEntryState(owned))) {
          entries.push({ kind: "remove", path: managedPath, before: target, after: null, reason: "owned-unchanged" });
        } else {
          warnings.push({ path: managedPath, classification: target.kind === "absent" ? "owned-missing" : "owned-modified" });
        }
      } else if (preserved) {
        warnings.push({ path: managedPath, classification: "preserved-user" });
      }
      continue;
    }

    if (owned) {
      const installed = manifestEntryState(owned);
      if (!source) {
        if (sameState(target, installed)) {
          entries.push({ kind: "remove", path: managedPath, before: target, after: null, reason: "obsolete-unchanged" });
        } else {
          blockers.push({ path: managedPath, classification: target.kind === "absent" ? "owned-missing" : "obsolete-modified" });
          nextOwned.push(owned);
        }
      } else if (sameState(target, installed)) {
        if (sameState(target, source)) {
          nextOwned.push(source);
        } else {
          entries.push({ kind: "update", path: managedPath, before: target, after: source, reason: "owned-unchanged" });
          nextOwned.push(source);
        }
      } else {
        blockers.push({ path: managedPath, classification: target.kind === "absent" ? "owned-missing" : "owned-modified" });
        nextOwned.push(owned);
      }
      continue;
    }

    if (preserved) {
      if (!source) {
        entries.push({ kind: "preserve", path: managedPath, before: target, after: target, reason: "source-removed" });
        warnings.push({ path: managedPath, classification: target.kind === "absent" ? "obsolete-preserved-missing" : "obsolete-preserved-present" });
      } else {
        nextPreserved.push(preserved);
        const targetChanged = target.kind !== "file" || target.sha256 !== preserved.observed_sha256 || target.mode !== preserved.observed_mode;
        const sourceChanged = source.sha256 !== preserved.source_sha256 || source.mode !== preserved.source_mode;
        const classification = target.kind === "absent" ? "preserved-missing"
          : sourceChanged ? (targetChanged ? "preserved-both-changed" : "preserved-source-changed")
            : targetChanged ? "preserved-user-changed" : "preserved-stable";
        warnings.push({ path: managedPath, classification });
      }
      continue;
    }

    if (source) {
      if (target.kind === "absent") {
        entries.push({ kind: "add", path: managedPath, before: null, after: source, reason: "new" });
        nextOwned.push(source);
      } else if (target.kind === "file" && sameState(target, source)) {
        entries.push({ kind: "preserve", path: managedPath, before: target, after: target, reason: "preexisting-exact-match" });
        nextPreserved.push(preservedEntry(source, target, "preexisting-exact-match"));
        warnings.push({ path: managedPath, classification: "preserved-user" });
      } else {
        blockers.push({ path: managedPath, classification: "unowned-conflict" });
      }
    }
  }

  entries.sort((left, right) => left.path.localeCompare(right.path));
  blockers.sort((left, right) => left.path.localeCompare(right.path));
  warnings.sort((left, right) => left.path.localeCompare(right.path));
  const operations = entries.filter((entry) => ["add", "update", "remove"].includes(entry.kind));
  const nextManifest = command === "uninstall" ? null : makeNextManifest({ inspection, ownedFiles: nextOwned, preservedFiles: nextPreserved, options });
  const hasWork = command !== "upgrade"
    || entries.length > 0
    || inspection.manifest.payload_sha256 !== inspection.source.payloadSha256
    || versionState === "upgrade-available";
  return {
    command,
    entries,
    operations,
    blockers,
    warnings,
    canApply: blockers.length === 0,
    hasWork,
    previousManifest: inspection.manifest,
    nextManifest,
    fingerprint: inspection.fingerprint,
  };
}

function ensureDirectory(fullPath, mode, fsOps = fs) {
  const existing = lstatIfExists(fullPath, fsOps);
  if (existing) {
    if (existing.isSymbolicLink() || !existing.isDirectory()) throw invalid(`directory path is unsafe: ${fullPath}`);
    return;
  }
  fsOps.mkdirSync(fullPath, { recursive: true, mode });
  fsOps.chmodSync(fullPath, mode);
}

function fsyncDirectory(fullPath, fsOps = fs) {
  const descriptor = fsOps.openSync(fullPath, "r");
  try {
    while (true) {
      try {
        fsOps.fsyncSync(descriptor);
        break;
      } catch (error) {
        if (error.code !== "EINTR") throw error;
      }
    }
  } finally {
    fsOps.closeSync(descriptor);
  }
}

function durableUnlink(fullPath, fsOps = fs) {
  fsOps.unlinkSync(fullPath);
  fsyncDirectory(path.dirname(fullPath), fsOps);
}

function durableRmdir(fullPath, fsOps = fs) {
  fsOps.rmdirSync(fullPath);
  fsyncDirectory(path.dirname(fullPath), fsOps);
}

function durableRemoveTree(fullPath, fsOps = fs) {
  const stat = lstatIfExists(fullPath, fsOps);
  if (!stat) return;
  if (stat.isSymbolicLink()) throw invalid(`refusing to remove unsafe state symlink: ${fullPath}`);
  if (!stat.isDirectory()) {
    durableUnlink(fullPath, fsOps);
    return;
  }
  for (const entry of fsOps.readdirSync(fullPath)) durableRemoveTree(path.join(fullPath, entry), fsOps);
  durableRmdir(fullPath, fsOps);
}

function durableRename(from, to, fsOps = fs) {
  fsOps.renameSync(from, to);
  fsyncDirectory(path.dirname(to), fsOps);
  if (path.dirname(from) !== path.dirname(to)) fsyncDirectory(path.dirname(from), fsOps);
}

function atomicWrite(fullPath, bytes, mode, fsOps = fs) {
  const temporary = path.join(path.dirname(fullPath), `.${path.basename(fullPath)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  let descriptor;
  let renamed = false;
  try {
    descriptor = fsOps.openSync(temporary, "wx", mode);
    let offset = 0;
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    while (offset < buffer.length) offset += fsOps.writeSync(descriptor, buffer, offset, buffer.length - offset);
    fsOps.fsyncSync(descriptor);
    fsOps.closeSync(descriptor);
    descriptor = undefined;
    fsOps.chmodSync(temporary, mode);
    fsOps.renameSync(temporary, fullPath);
    renamed = true;
    fsyncDirectory(path.dirname(fullPath), fsOps);
  } catch (error) {
    if (descriptor !== undefined) {
      try { fsOps.closeSync(descriptor); } catch {}
    }
    if (!renamed && lstatIfExists(temporary, fsOps)) {
      try { durableUnlink(temporary, fsOps); } catch {}
    }
    throw error;
  }
}

function writeJsonState(fullPath, value, fsOps = fs) {
  atomicWrite(fullPath, Buffer.from(`${canonicalJson(value)}\n`, "utf8"), 0o600, fsOps);
}

function removeIfExists(fullPath, fsOps = fs) {
  try {
    durableRemoveTree(fullPath, fsOps);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function removeEmptyManagedParents(targetRoot, relative, fsOps = fs) {
  let current = path.dirname(path.join(targetRoot, relative));
  while (current !== targetRoot && isInside(current, targetRoot)) {
    try {
      durableRmdir(current, fsOps);
    } catch (error) {
      if (!["ENOTEMPTY", "ENOENT"].includes(error.code)) throw error;
      break;
    }
    current = path.dirname(current);
  }
}

function buildJournal({ command, plan, transactionId, lock, createdAt, targetRoot, fsOps }) {
  const operations = plan.operations.map((entry, index) => {
    const backupPath = entry.kind === "add" ? null : `files/${String(index).padStart(6, "0")}`;
    if (backupPath) {
      const sourcePath = path.join(targetRoot, entry.path);
      const backupFullPath = path.join(targetRoot, ".oak", "rollback.next", backupPath);
      ensureDirectory(path.dirname(backupFullPath), 0o700, fsOps);
      atomicWrite(backupFullPath, fsOps.readFileSync(sourcePath), 0o600, fsOps);
    }
    return {
      index,
      kind: entry.kind,
      path: entry.path,
      before_sha256: entry.before?.sha256 ?? null,
      before_mode: entry.before?.mode ?? null,
      after_sha256: entry.after?.sha256 ?? null,
      after_mode: entry.after?.mode ?? null,
      backup_path: backupPath,
    };
  });
  const previous = plan.previousManifest;
  const next = plan.nextManifest;
  return {
    schema_version: SCHEMA_VERSION,
    transaction_id: transactionId,
    command,
    status: "planned",
    rollback_origin: "none",
    created_at: createdAt,
    source_payload_sha256: plan.nextManifest?.payload_sha256 ?? plan.previousManifest.payload_sha256,
    previous_manifest: previous,
    next_manifest: next,
    previous_manifest_sha256: previous ? sha256(canonicalManifestBytes(previous)) : null,
    next_manifest_sha256: next ? sha256(canonicalManifestBytes(next)) : null,
    lock,
    operations,
    completed_operation_indexes: [],
    rollback_completed_operation_indexes: [],
    manifest_write_completed: false,
    rollback_manifest_write_completed: false,
  };
}

function writeManagedFile(targetRoot, sourceRoot, operation, fsOps = fs) {
  const destination = path.join(targetRoot, operation.path);
  const source = path.join(sourceRoot, operation.path);
  ensureDirectory(path.dirname(destination), 0o755, fsOps);
  atomicWrite(destination, fsOps.readFileSync(source), operation.after_mode, fsOps);
}

function applyForwardOperation(targetRoot, sourceRoot, operation, fsOps = fs) {
  if (operation.kind === "add" || operation.kind === "update") {
    writeManagedFile(targetRoot, sourceRoot, operation, fsOps);
  } else {
    durableUnlink(path.join(targetRoot, operation.path), fsOps);
    removeEmptyManagedParents(targetRoot, operation.path, fsOps);
  }
}

function readJsonState(fullPath, label, fsOps = fs) {
  const stat = lstatIfExists(fullPath, fsOps);
  if (!stat || stat.isSymbolicLink() || !stat.isFile()) throw invalid(`${label} is missing or unsafe`);
  try {
    return JSON.parse(fsOps.readFileSync(fullPath, "utf8"));
  } catch (error) {
    throw invalid(`${label} JSON is corrupt: ${error.message}`);
  }
}

function currentManifestDigest(targetRoot, fsOps = fs) {
  const fullPath = path.join(targetRoot, ".oak", "manifest.json");
  if (!lstatIfExists(fullPath, fsOps)) return null;
  const manifest = readJsonState(fullPath, "manifest", fsOps);
  validateManifest(manifest);
  return sha256(canonicalManifestBytes(manifest));
}

export function createInstallationManager(options) {
  const sourceRoot = options.sourceRoot;
  const fsOps = options.fsOps ?? fs;
  const clock = options.clock ?? (() => new Date());
  const newTransactionId = options.transactionId ?? (() => crypto.randomUUID());
  const failpoint = options.failpoint ?? (() => {});
  const pidProbe = options.pidProbe ?? ((lockPid) => {
    process.kill(lockPid, 0);
    return { alive: true };
  });
  const pid = options.pid ?? process.pid;
  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;
  const versionProvider = options.versionProvider ?? (() => {
    throw invalid("canonical kit version provider is required");
  });

  function currentKitVersion() {
    return parseStableVersion(versionProvider()).canonical;
  }

  function acquireLock(targetRoot, transactionId, command) {
    const oakPath = path.join(targetRoot, ".oak");
    ensureDirectory(oakPath, 0o700, fsOps);
    const lock = { transaction_id: transactionId, pid, command, created_at: clock().toISOString() };
    const lockPath = path.join(oakPath, "lock.json");
    const descriptor = fsOps.openSync(lockPath, "wx", 0o600);
    try {
      fsOps.writeFileSync(descriptor, `${canonicalJson(lock)}\n`);
      fsOps.fsyncSync(descriptor);
    } finally {
      fsOps.closeSync(descriptor);
    }
    fsyncDirectory(oakPath, fsOps);
    return lock;
  }

  function releaseLock(targetRoot) {
    const lockPath = path.join(targetRoot, ".oak", "lock.json");
    if (lstatIfExists(lockPath, fsOps)) {
      durableUnlink(lockPath, fsOps);
    }
  }

  function commitForward(command, targetRoot, plan, transactionId) {
    const oakPath = path.join(targetRoot, ".oak");
    const nextPath = path.join(oakPath, "rollback.next");
    const previousPath = path.join(oakPath, "rollback.previous");
    const rollbackPath = path.join(oakPath, "rollback");
    failpoint("before-journal-create");
    removeIfExists(nextPath, fsOps);
    ensureDirectory(path.join(nextPath, "files"), 0o700, fsOps);
    const lock = readJsonState(path.join(oakPath, "lock.json"), "lock", fsOps);
    const journal = buildJournal({
      command, plan, transactionId, lock, targetRoot, fsOps,
      createdAt: clock().toISOString(),
    });
    validateTransaction(journal);
    writeJsonState(path.join(oakPath, "transaction.json"), journal, fsOps);
    failpoint("after-journal-create");
    journal.status = "applying";
    writeJsonState(path.join(oakPath, "transaction.json"), journal, fsOps);
    for (const operation of journal.operations) {
      applyForwardOperation(targetRoot, sourceRoot, operation, fsOps);
      failpoint("after-operation-write-before-progress");
      journal.completed_operation_indexes.push(operation.index);
      writeJsonState(path.join(oakPath, "transaction.json"), journal, fsOps);
      failpoint("after-operation-progress");
    }
    const manifestPath = path.join(oakPath, "manifest.json");
    if (journal.next_manifest) atomicWrite(manifestPath, canonicalManifestBytes(journal.next_manifest), 0o600, fsOps);
    else if (lstatIfExists(manifestPath, fsOps)) durableUnlink(manifestPath, fsOps);
    journal.manifest_write_completed = true;
    writeJsonState(path.join(oakPath, "transaction.json"), journal, fsOps);

    const committed = { ...journal, status: "committed" };
    writeJsonState(path.join(nextPath, "transaction.json"), committed, fsOps);
    removeIfExists(previousPath, fsOps);
    if (lstatIfExists(rollbackPath, fsOps)) durableRename(rollbackPath, previousPath, fsOps);
    fsOps.cpSync(nextPath, rollbackPath, { recursive: true, errorOnExist: true, force: false });
    fsOps.chmodSync(rollbackPath, 0o700);
    fsOps.chmodSync(path.join(rollbackPath, "files"), 0o700);
    fsOps.chmodSync(path.join(rollbackPath, "transaction.json"), 0o600);
    for (const operation of committed.operations) {
      if (operation.backup_path) fsOps.chmodSync(path.join(rollbackPath, operation.backup_path), 0o600);
    }
    fsyncDirectory(oakPath, fsOps);
    failpoint("after-rollback-publication");
    durableUnlink(path.join(oakPath, "transaction.json"), fsOps);
    failpoint("after-commit-boundary");
    removeIfExists(previousPath, fsOps);
    removeIfExists(nextPath, fsOps);
    releaseLock(targetRoot);
    return committed;
  }

  function inverseOperation(targetRoot, rollbackRoot, operation) {
    const destination = path.join(targetRoot, operation.path);
    if (operation.kind === "add") {
      durableUnlink(destination, fsOps);
      removeEmptyManagedParents(targetRoot, operation.path, fsOps);
      return;
    }
    const backup = path.join(rollbackRoot, operation.backup_path);
    ensureDirectory(path.dirname(destination), 0o755, fsOps);
    atomicWrite(destination, fsOps.readFileSync(backup), operation.before_mode, fsOps);
  }

  function rollbackCommitted(targetRoot, dryRun) {
    const oakPath = path.join(targetRoot, ".oak");
    const rollbackRoot = path.join(oakPath, "rollback");
    const committed = readJsonState(path.join(rollbackRoot, "transaction.json"), "rollback transaction", fsOps);
    validateTransaction(committed);
    if (committed.status !== "committed") throw invalid("rollback transaction is not committed");
    const currentDigest = currentManifestDigest(targetRoot, fsOps);
    if (currentDigest !== committed.next_manifest_sha256) return { exitCode: 1, conflicts: ["manifest"] };
    for (const operation of committed.operations) {
      const current = inspectTargetPath(targetRoot, operation.path, fsOps);
      const expected = operation.after_sha256 === null ? { kind: "absent" } : { kind: "file", sha256: operation.after_sha256, mode: operation.after_mode };
      if (expected.kind === "absent" ? current.kind !== "absent" : !sameState(current, expected)) {
        return { exitCode: 1, conflicts: [operation.path] };
      }
    }
    if (dryRun) return { exitCode: 0, transaction: committed };
    const lock = acquireLock(targetRoot, committed.transaction_id, "rollback");
    const active = {
      ...committed,
      status: "rolling-back",
      rollback_origin: "committed-operation",
      lock,
      rollback_completed_operation_indexes: [],
      rollback_manifest_write_completed: false,
    };
    writeJsonState(path.join(oakPath, "transaction.json"), active, fsOps);
    failpoint("after-rollback-journal");
    for (const operation of [...active.operations].reverse()) {
      inverseOperation(targetRoot, rollbackRoot, operation);
      failpoint("after-inverse-write-before-progress");
      active.rollback_completed_operation_indexes.push(operation.index);
      writeJsonState(path.join(oakPath, "transaction.json"), active, fsOps);
    }
    const manifestPath = path.join(oakPath, "manifest.json");
    if (active.previous_manifest) atomicWrite(manifestPath, canonicalManifestBytes(active.previous_manifest), 0o600, fsOps);
    else if (lstatIfExists(manifestPath, fsOps)) durableUnlink(manifestPath, fsOps);
    active.rollback_manifest_write_completed = true;
    active.status = "rolled-back";
    writeJsonState(path.join(oakPath, "transaction.json"), active, fsOps);
    durableUnlink(path.join(oakPath, "transaction.json"), fsOps);
    removeIfExists(rollbackRoot, fsOps);
    removeIfExists(path.join(oakPath, "rollback.next"), fsOps);
    removeIfExists(path.join(oakPath, "rollback.previous"), fsOps);
    releaseLock(targetRoot);
    return { exitCode: 0, transaction: active };
  }

  function lockAppearsAlive(lock) {
    try {
      const result = pidProbe(lock.pid);
      if (result && typeof result === "object" && Object.hasOwn(result, "alive")) return result.alive !== false;
      return true;
    } catch (error) {
      if (error.code === "ESRCH") return false;
      return true;
    }
  }

  function validateLock(lock) {
    assertExactKeys(lock, LOCK_KEYS, "lock");
    if (typeof lock.transaction_id !== "string" || lock.transaction_id.length === 0) throw invalid("lock transaction_id is invalid");
    if (!Number.isInteger(lock.pid) || lock.pid <= 0) throw invalid("lock pid is invalid");
    if (!["install", "upgrade", "doctor", "accept-preserved", "uninstall", "rollback"].includes(lock.command)) throw invalid("lock command is invalid");
    assertTimestamp(lock.created_at, "lock created_at");
    return lock;
  }

  function operationalState(targetRoot) {
    const oakPath = path.join(targetRoot, ".oak");
    const oakStat = lstatIfExists(oakPath, fsOps);
    if (!oakStat) return { lock: null, transaction: null };
    if (oakStat.isSymbolicLink() || !oakStat.isDirectory()) throw invalid("target .oak is unsafe");
    const lockPath = path.join(oakPath, "lock.json");
    const transactionPath = path.join(oakPath, "transaction.json");
    const lock = lstatIfExists(lockPath, fsOps) ? validateLock(readJsonState(lockPath, "lock", fsOps)) : null;
    const transaction = lstatIfExists(transactionPath, fsOps) ? readJsonState(transactionPath, "active transaction", fsOps) : null;
    if (transaction) validateTransaction(transaction);
    return { lock, transaction };
  }

  function classifyExistingLock(lock) {
    if (!lock) return null;
    try {
      const result = pidProbe(lock.pid);
      if (result && typeof result === "object" && result.alive === false) return "stale";
      return "live";
    } catch (error) {
      if (error.code === "ESRCH") return "stale";
      if (error.code === "EPERM") return "live";
      throw invalid(`PID probe failed conservatively: ${error.code ?? error.message}`);
    }
  }

  function recoverInterrupted(targetRoot, dryRun) {
    const oakPath = path.join(targetRoot, ".oak");
    const activePath = path.join(oakPath, "transaction.json");
    const active = readJsonState(activePath, "active transaction", fsOps);
    validateTransaction(active);
    if (!["planned", "applying", "rolling-back"].includes(active.status)) throw invalid("active transaction is not recoverable");
    const committedRollback = active.status === "rolling-back" && active.rollback_origin === "committed-operation";
    if (active.status === "rolling-back" && !["interrupted-forward", "committed-operation"].includes(active.rollback_origin)) throw invalid("active transaction rollback origin is invalid");

    const expectedManifestDigest = active.rollback_manifest_write_completed
      ? active.previous_manifest_sha256
      : active.manifest_write_completed || committedRollback
        ? active.next_manifest_sha256
        : active.previous_manifest_sha256;
    if (currentManifestDigest(targetRoot, fsOps) !== expectedManifestDigest) {
      throw invalid("current manifest presence or digest does not match the recorded recovery phase");
    }

    if (!committedRollback && active.rollback_origin === "none") {
      for (const operation of active.operations) {
        if (active.completed_operation_indexes.includes(operation.index)) continue;
        const current = inspectTargetPath(targetRoot, operation.path, fsOps);
        const before = operation.before_sha256 === null ? { kind: "absent" } : { kind: "file", sha256: operation.before_sha256, mode: operation.before_mode };
        const after = operation.after_sha256 === null ? { kind: "absent" } : { kind: "file", sha256: operation.after_sha256, mode: operation.after_mode };
        const matches = (state, expected) => expected.kind === "absent" ? state.kind === "absent" : sameState(state, expected);
        if (matches(current, after)) active.completed_operation_indexes.push(operation.index);
        else if (!matches(current, before)) throw invalid(`operation state is inconsistent during recovery: ${operation.path}`);
      }
    }
    const staleLock = validateLock(readJsonState(path.join(oakPath, "lock.json"), "lock", fsOps));
    const exactSnapshot = canonicalJson(staleLock) === canonicalJson(active.lock);
    const successorSnapshot = !exactSnapshot
      && staleLock.transaction_id === active.transaction_id
      && staleLock.command === "rollback";
    if (!exactSnapshot && !successorSnapshot) throw invalid("stale lock and transaction lock snapshot do not match");
    if (lockAppearsAlive(staleLock)) return { exitCode: 1, state: "live-lock" };
    if (dryRun) return { exitCode: 0, transaction: active };
    if (successorSnapshot) {
      active.lock = staleLock;
      writeJsonState(activePath, active, fsOps);
    }
    durableUnlink(path.join(oakPath, "lock.json"), fsOps);
    const replacementLock = acquireLock(targetRoot, active.transaction_id, "rollback");
    active.lock = replacementLock;
    active.status = "rolling-back";
    active.rollback_origin = committedRollback ? "committed-operation" : "interrupted-forward";
    writeJsonState(activePath, active, fsOps);
    const backupRoot = path.join(oakPath, committedRollback ? "rollback" : "rollback.next");
    const completed = [...active.completed_operation_indexes].sort((left, right) => right - left);
    for (const index of completed) {
      if (active.rollback_completed_operation_indexes.includes(index)) continue;
      inverseOperation(targetRoot, backupRoot, active.operations[index]);
      failpoint("after-inverse-write-before-progress");
      active.rollback_completed_operation_indexes.push(index);
      writeJsonState(activePath, active, fsOps);
    }
    if (active.manifest_write_completed && !active.rollback_manifest_write_completed) {
      const manifestPath = path.join(oakPath, "manifest.json");
      if (active.previous_manifest) atomicWrite(manifestPath, canonicalManifestBytes(active.previous_manifest), 0o600, fsOps);
      else if (lstatIfExists(manifestPath, fsOps)) durableUnlink(manifestPath, fsOps);
      active.rollback_manifest_write_completed = true;
      writeJsonState(activePath, active, fsOps);
    }
    active.status = "rolled-back";
    writeJsonState(activePath, active, fsOps);
    durableUnlink(activePath, fsOps);
    const rollback = path.join(oakPath, "rollback");
    const previous = path.join(oakPath, "rollback.previous");
    if (committedRollback) {
      removeIfExists(rollback, fsOps);
      removeIfExists(previous, fsOps);
    } else if (lstatIfExists(previous, fsOps)) {
      removeIfExists(rollback, fsOps);
      durableRename(previous, rollback, fsOps);
    } else if (lstatIfExists(rollback, fsOps)) {
      const candidate = readJsonState(path.join(rollback, "transaction.json"), "rollback candidate", fsOps);
      if (candidate.transaction_id === active.transaction_id) removeIfExists(rollback, fsOps);
    }
    removeIfExists(path.join(oakPath, "rollback.next"), fsOps);
    releaseLock(targetRoot);
    return { exitCode: 0, transaction: active };
  }

  function doctorReport(targetRoot) {
    const oakPath = path.join(targetRoot, ".oak");
    const manifestPath = path.join(oakPath, "manifest.json");
    const manifestPresent = Boolean(lstatIfExists(manifestPath, fsOps));
    const operation = operationalState(targetRoot);
    const activeTransaction = operation.transaction;
    const activeLock = operation.lock;
    const residue = ["rollback.next", "rollback.previous"].filter((name) => lstatIfExists(path.join(oakPath, name), fsOps));
    const common = {
      blockers: [],
      warnings: [],
      activeTransaction: Boolean(activeTransaction),
      activeLock: activeLock ? classifyExistingLock(activeLock) : null,
      rollbackAvailable: Boolean(lstatIfExists(path.join(oakPath, "rollback", "transaction.json"), fsOps)),
      cleanupResidue: residue,
    };
    let sourceVersion = null;
    let sourceInvalid = false;
    try {
      sourceVersion = parseStableVersion(currentKitVersion()).canonical;
    } catch (error) {
      if (error.code !== "INVALID_VERSION") throw error;
      sourceInvalid = true;
    }
    let validatedManifest = null;
    try {
      validatedManifest = readManifest(targetRoot, fsOps);
    } catch (error) {
      if (!manifestPresent || error.code !== "INVALID_INVOCATION") throw error;
      return {
        exitCode: 2,
        report: {
          ...common,
          manifest: "invalid",
          blockers: [{ path: "kit_version", classification: "invalid-installed-version-state" }],
          sourceVersion,
          installedVersion: null,
          versionState: "invalid-version-state",
        },
      };
    }
    const installedVersion = validatedManifest?.kit_version ?? null;
    if (sourceInvalid) return {
      exitCode: 2,
      report: {
        ...common,
        manifest: validatedManifest ? "valid" : "absent",
        blockers: [{ path: "package.json", classification: "invalid-source-version-state" }],
        sourceVersion: null,
        installedVersion,
        versionState: "invalid-version-state",
      },
    };
    const inspection = inspectInstallation({ sourceRoot, targetRoot, deps: { fsOps } });
    if (!inspection.manifest) return {
      exitCode: 1,
      report: {
        ...common,
        manifest: "absent",
        sourceVersion,
        installedVersion: null,
        versionState: "not-installed",
      },
    };
    const versionState = classifyVersionState(sourceVersion, inspection.manifest, inspection.source.payloadSha256);
    const plan = buildPlan({ command: "upgrade", inspection, options: { clock, transactionId: "doctor-read-only", kitVersion: sourceVersion } });
    const actionableWarnings = new Set([
      "preserved-source-changed", "preserved-both-changed", "preserved-missing",
      "obsolete-preserved-present", "obsolete-preserved-missing",
    ]);
    const actionable = versionState !== "current"
      || plan.blockers.length > 0
      || plan.warnings.some((warning) => actionableWarnings.has(warning.classification))
      || activeTransaction || activeLock || residue.length > 0;
    return {
      exitCode: actionable ? 1 : 0,
      report: {
        manifest: "valid",
        blockers: plan.blockers,
        warnings: plan.warnings,
        activeTransaction: Boolean(activeTransaction),
        activeLock: activeLock ? classifyExistingLock(activeLock) : null,
        rollbackAvailable: Boolean(lstatIfExists(path.join(oakPath, "rollback", "transaction.json"), fsOps)),
        cleanupResidue: residue,
        sourceVersion,
        installedVersion,
        versionState,
      },
    };
  }

  async function readAuthorizationLine() {
    let collected = "";
    for await (const chunk of stdin) {
      collected += chunk.toString();
      const newline = collected.indexOf("\n");
      if (newline !== -1) return collected.slice(0, newline);
    }
    return collected.length === 0 ? null : collected;
  }

  async function acceptPreserved(targetRoot, preservedPath) {
    normalizeManagedPath(preservedPath);
    const transactionId = newTransactionId();
    const inspection = inspectInstallation({ sourceRoot, targetRoot, deps: { fsOps } });
    if (!inspection.manifest) throw invalid("accept-preserved requires a valid manifest");
    const versionState = classifyVersionState(currentKitVersion(), inspection.manifest, inspection.source.payloadSha256);
    if (versionState !== "current") return { exitCode: 1, versionState };
    const preserved = inspection.manifest.preserved_files.find((entry) => entry.path === preservedPath);
    if (!preserved) throw invalid("accept-preserved path is not preserved");
    const source = inspection.source.entries.find((entry) => entry.path === preservedPath);
    const target = inspection.target[preservedPath];
    if (!source || target?.kind !== "file") throw invalid("accept-preserved requires current regular target and source files");
    const mode = (value) => value.toString(8).padStart(4, "0");
    const authorization = `ACK-PRESERVED ${preservedPath} ${target.sha256} ${mode(target.mode)} ${source.sha256} ${mode(source.mode)}`;
    stdout.write(`${authorization}\n`);
    const supplied = await readAuthorizationLine();
    if (supplied !== authorization) return { exitCode: 1, authorization };
    failpoint("after-ack-confirmation");
    const globalPlan = buildPlan({ command: "upgrade", inspection, options: { clock, transactionId, kitVersion: currentKitVersion() } });
    if (!globalPlan.canApply) return { exitCode: 1, plan: globalPlan, authorization };
    acquireLock(targetRoot, transactionId, "accept-preserved");
    try {
      const lockedInspection = inspectInstallation({ sourceRoot, targetRoot, deps: { fsOps } });
      const lockedSource = lockedInspection.source.entries.find((entry) => entry.path === preservedPath);
      const lockedTarget = lockedInspection.target[preservedPath];
      if (lockedInspection.fingerprint !== inspection.fingerprint
        || !sameState(lockedTarget, target)
        || lockedSource.sha256 !== source.sha256 || lockedSource.mode !== source.mode) {
        releaseLock(targetRoot);
        return { exitCode: 1, authorization };
      }
      const nextManifest = structuredClone(lockedInspection.manifest);
      const nextEntry = nextManifest.preserved_files.find((entry) => entry.path === preservedPath);
      nextEntry.observed_sha256 = lockedTarget.sha256;
      nextEntry.observed_mode = lockedTarget.mode;
      nextEntry.source_sha256 = lockedSource.sha256;
      nextEntry.source_mode = lockedSource.mode;
      nextEntry.merge_acknowledgement = {
        target_sha256: lockedTarget.sha256,
        target_mode: lockedTarget.mode,
        source_sha256: lockedSource.sha256,
        source_mode: lockedSource.mode,
        acknowledged_at: clock().toISOString(),
      };
      nextManifest.payload_sha256 = lockedInspection.source.payloadSha256;
      nextManifest.updated_at = clock().toISOString();
      nextManifest.last_transaction_id = transactionId;
      validateManifest(nextManifest);
      const plan = {
        command: "accept-preserved",
        entries: [{ kind: "preserve", path: preservedPath, before: target, after: target, reason: "manual-merge-acknowledged" }],
        operations: [],
        blockers: [],
        warnings: globalPlan.warnings,
        canApply: true,
        previousManifest: lockedInspection.manifest,
        nextManifest,
        fingerprint: lockedInspection.fingerprint,
      };
      const transaction = commitForward("accept-preserved", targetRoot, plan, transactionId);
      return { exitCode: 0, plan, transaction, authorization };
    } catch (error) {
      const transactionPath = path.join(targetRoot, ".oak", "transaction.json");
      if (!lstatIfExists(transactionPath, fsOps)) {
        removeIfExists(path.join(targetRoot, ".oak", "rollback.next"), fsOps);
        releaseLock(targetRoot);
      }
      throw error;
    }
  }

  async function run(command, runOptions) {
    const targetRoot = runOptions.targetRoot;
    const targetExisted = Boolean(lstatIfExists(targetRoot, fsOps));
    const oakPath = path.join(targetRoot, ".oak");
    const oakExisted = Boolean(lstatIfExists(oakPath, fsOps));
    let invocationLockOwned = false;
    try {
      if (command === "doctor") {
        return runOptions.acceptPreserved
          ? await acceptPreserved(targetRoot, runOptions.acceptPreserved)
          : doctorReport(targetRoot);
      }
      if (command === "rollback") {
        const activePath = path.join(targetRoot, ".oak", "transaction.json");
        return lstatIfExists(activePath, fsOps)
          ? recoverInterrupted(targetRoot, runOptions.dryRun === true)
          : rollbackCommitted(targetRoot, runOptions.dryRun === true);
      }
      const state = operationalState(targetRoot);
      if (state.lock || state.transaction) {
        return { exitCode: 1, state: state.lock ? classifyExistingLock(state.lock) : "interrupted-transaction" };
      }
      const transactionId = newTransactionId();
      const inspection = inspectInstallation({ sourceRoot, targetRoot, deps: { fsOps } });
      const kitVersion = currentKitVersion();
      const plan = buildPlan({ command, inspection, options: { ...runOptions, clock, transactionId, kitVersion } });
      if (!plan.canApply) return { exitCode: 1, plan };
      if (runOptions.dryRun) return { exitCode: 0, plan };
      if (command === "upgrade" && !plan.hasWork) return { exitCode: 0, plan };
      ensureDirectory(targetRoot, 0o755, fsOps);
      acquireLock(targetRoot, transactionId, command);
      invocationLockOwned = true;
      const lockedInspection = inspectInstallation({ sourceRoot, targetRoot, deps: { fsOps } });
      const lockedPlan = buildPlan({ command, inspection: lockedInspection, options: { ...runOptions, clock, transactionId, kitVersion } });
      if (lockedPlan.fingerprint !== plan.fingerprint || !lockedPlan.canApply) {
        releaseLock(targetRoot);
        return { exitCode: 1, plan: lockedPlan };
      }
      const transaction = commitForward(command, targetRoot, lockedPlan, transactionId);
      invocationLockOwned = false;
      return { exitCode: 0, plan: lockedPlan, transaction };
    } catch (error) {
      try {
        const transactionPath = path.join(oakPath, "transaction.json");
        if (invocationLockOwned && lstatIfExists(oakPath, fsOps) && !lstatIfExists(transactionPath, fsOps)) {
          const rollbackNext = path.join(oakPath, "rollback.next");
          if (!lstatIfExists(path.join(rollbackNext, "transaction.json"), fsOps)) removeIfExists(rollbackNext, fsOps);
          releaseLock(targetRoot);
          if (!oakExisted && fsOps.readdirSync(oakPath).length === 0) {
            durableRmdir(oakPath, fsOps);
            try { failpoint("after-bootstrap-oak-rmdir"); } catch {}
          }
          if (!targetExisted && lstatIfExists(targetRoot, fsOps) && fsOps.readdirSync(targetRoot).length === 0) {
            durableRmdir(targetRoot, fsOps);
            try { failpoint("after-bootstrap-target-rmdir"); } catch {}
          }
        }
      } catch {
        // Preserve the original failure and any state needed for diagnosis.
      }
      return { exitCode: error.code === "INVALID_INVOCATION" ? 2 : 2, error };
    }
  }

  return { run };
}

export async function main(argv, options = {}) {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const input = options.stdin ?? process.stdin;
  try {
    const directVersion = argv[0] === "--version";
    const wrapperVersion = Object.hasOwn(USAGE, argv[0]) && argv[1] === "--version";
    if (directVersion || wrapperVersion) {
      const expectedLength = directVersion ? 1 : 2;
      if (argv.length !== expectedLength) throw invalid("--version must be used alone");
      const repositoryRoot = options.sourceRoot
        ? path.dirname(options.sourceRoot)
        : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
      const version = options.versionProvider?.() ?? readCanonicalVersion(repositoryRoot);
      stdout.write(`${formatVersion(version)}\n`);
      return 0;
    }
    const [command, ...arguments_] = argv;
    const parsed = parseCliArgs(command, arguments_);
    if (parsed.help) {
      stdout.write(`${USAGE[command]}\n`);
      return 0;
    }
    const targetRoot = resolveTarget(parsed, options.env ?? process.env);
    const sourceRoot = options.sourceRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "opencode");
    const repositoryRoot = path.dirname(sourceRoot);
    const manager = createInstallationManager({
      sourceRoot,
      versionProvider: options.versionProvider ?? (() => readCanonicalVersion(repositoryRoot)),
      clock: options.clock,
      transactionId: options.transactionId,
      pidProbe: options.pidProbe,
      failpoint: options.failpoint,
      fsOps: options.fsOps,
      stdin: input,
      stdout,
      stderr,
    });
    if (command === "uninstall" && !parsed.yes && !parsed.dryRun) {
      const preview = await manager.run(command, { ...parsed, targetRoot, dryRun: true });
      if (preview.exitCode !== 0) return preview.exitCode;
      stdout.write(`This will remove unchanged kit-owned files from: ${targetRoot}\nContinue? [y/N] `);
      let answer = "";
      for await (const chunk of input) {
        answer += chunk.toString();
        if (answer.includes("\n")) break;
      }
      answer = answer.split("\n", 1)[0];
      if (!new Set(["y", "Y", "yes", "YES"]).has(answer)) {
        stdout.write("Aborted.\n");
        return 0;
      }
      parsed.yes = true;
    }
    const result = await manager.run(command, { ...parsed, targetRoot });
    if (result.error) stderr.write(`${result.error.message}\n`);
    else if (result.exitCode === 1 && result.plan?.blockers?.length) {
      for (const blocker of result.plan.blockers) stderr.write(`Conflict: ${blocker.path} (${blocker.classification})\n`);
    } else if (command === "doctor" && !parsed.acceptPreserved && result.report) {
      const actions = {
        "not-installed": "run install --dry-run",
        current: "none",
        "upgrade-available": "run upgrade --dry-run",
        "source-older": "use a source checkout at least as new as the installation",
        "same-version-different-payload": "fix the release identity mismatch",
        "invalid-version-state": "repair the invalid version state",
      };
      stdout.write(`doctor: ${result.report.versionState}; source=${result.report.sourceVersion ?? "invalid"}; installed=${result.report.installedVersion ?? "none"}; action=${actions[result.report.versionState]}\n`);
    } else if (command !== "doctor" || !parsed.acceptPreserved) {
      const changes = result.plan?.entries?.length ?? 0;
      stdout.write(`${command}: ${result.exitCode === 0 ? "ok" : "action required"}${result.plan ? ` (${changes} planned changes)` : ""}\n`);
    }
    return result.exitCode;
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return error.code === "INVALID_INVOCATION" ? 2 : 2;
  }
}

const isEntrypoint = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isEntrypoint) {
  process.exitCode = await main(process.argv.slice(2));
}
