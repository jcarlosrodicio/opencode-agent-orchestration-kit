import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  assertSafeTarget,
  buildPlan,
  canonicalManifestBytes,
  createInstallationManager,
  inventorySource,
  inspectInstallation,
  main,
  normalizeManagedPath,
  parseCliArgs,
  resolveTarget,
  validateManifest,
  validateTransaction,
} from "./manage-installation.mjs";

function makeFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oak-manager-test-"));
  const sourceRoot = path.join(root, "repo", "opencode");
  const targetRoot = path.join(root, "target");
  fs.mkdirSync(sourceRoot, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, sourceRoot, targetRoot };
}

function deterministicDeps(overrides = {}) {
  return {
    clock: () => new Date("2026-07-20T00:00:00.000Z"),
    transactionId: () => "tx-0001",
    pidProbe: () => ({ alive: false, code: "ESRCH" }),
    failpoint: () => {},
    ...overrides,
  };
}

function capture() {
  let value = "";
  return {
    stream: { write(chunk) { value += String(chunk); return true; } },
    read: () => value,
  };
}

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const REPOSITORY_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function validManifest(overrides = {}) {
  return {
    schema_version: 1,
    manager: "opencode-agent-orchestration-kit",
    payload_sha256: HASH_A,
    created_at: "2026-07-20T00:00:00.000Z",
    updated_at: "2026-07-20T00:00:00.000Z",
    last_transaction_id: "tx-0001",
    owned_files: [{ path: "agents/lead.md", sha256: HASH_A, mode: 0o644 }],
    preserved_files: [{
      path: "opencode.json",
      observed_sha256: HASH_A,
      observed_mode: 0o600,
      source_sha256: HASH_B,
      source_mode: 0o644,
      reason: "preexisting-user-file",
      merge_acknowledgement: null,
    }],
    ...overrides,
  };
}

function manifestDigest(manifest) {
  return crypto.createHash("sha256").update(canonicalManifestBytes(manifest)).digest("hex");
}

function validTransaction({ command = "install", operation = null } = {}) {
  const previous = command === "install" ? null : validManifest();
  const next = command === "uninstall" ? null : validManifest();
  const operations = operation ? [{ index: 0, ...operation }] : [];
  return {
    schema_version: 1,
    transaction_id: "tx-0001",
    command,
    status: "planned",
    rollback_origin: "none",
    created_at: "2026-07-20T00:00:00.000Z",
    source_payload_sha256: HASH_A,
    previous_manifest: previous,
    next_manifest: next,
    previous_manifest_sha256: previous ? manifestDigest(previous) : null,
    next_manifest_sha256: next ? manifestDigest(next) : null,
    lock: {
      transaction_id: "tx-0001",
      pid: 1234,
      command,
      created_at: "2026-07-20T00:00:00.000Z",
    },
    operations,
    completed_operation_indexes: [],
    rollback_completed_operation_indexes: [],
    manifest_write_completed: false,
    rollback_manifest_write_completed: false,
  };
}

function validAcknowledgementTransaction() {
  const transaction = validTransaction({ command: "accept-preserved" });
  const next = structuredClone(transaction.next_manifest);
  const entry = next.preserved_files[0];
  entry.observed_sha256 = HASH_A;
  entry.observed_mode = 0o600;
  entry.source_sha256 = HASH_B;
  entry.source_mode = 0o644;
  entry.merge_acknowledgement = {
    target_sha256: HASH_A,
    target_mode: 0o600,
    source_sha256: HASH_B,
    source_mode: 0o644,
    acknowledged_at: "2026-07-20T00:00:00.000Z",
  };
  transaction.next_manifest = next;
  transaction.next_manifest_sha256 = manifestDigest(next);
  return transaction;
}

function put(root, relative, bytes, mode = 0o644) {
  const fullPath = path.join(root, relative);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, bytes);
  fs.chmodSync(fullPath, mode);
  return {
    path: relative,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    mode,
  };
}

function persistManifest(targetRoot, manifest) {
  fs.mkdirSync(path.join(targetRoot, ".oak"), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(targetRoot, ".oak", "manifest.json"), canonicalManifestBytes(manifest), { mode: 0o600 });
}

function planFixture(command, sourceRoot, targetRoot, options = {}) {
  const inspection = inspectInstallation({ sourceRoot, targetRoot });
  return buildPlan({
    command,
    inspection,
    options: {
      clock: () => new Date("2026-07-20T00:00:00.000Z"),
      transactionId: "tx-plan",
      ...options,
    },
  });
}

function managerFixture(sourceRoot, overrides = {}) {
  return createInstallationManager({
    sourceRoot,
    ...deterministicDeps(),
    ...overrides,
  });
}

test("[S020] CLI parsing, help, target precedence, and exit codes are deterministic", async (t) => {
  await t.test("explicit target wins without tilde expansion", () => {
    const parsed = parseCliArgs("install", ["--dry-run", "--target", "~/oak"]);
    assert.equal(parsed.dryRun, true);
    assert.equal(resolveTarget(parsed, { OPENCODE_CONFIG_DIR: "/env", HOME: "/home" }), "~/oak");
  });

  await t.test("environment target wins over HOME", () => {
    assert.equal(resolveTarget(parseCliArgs("doctor", []), {
      OPENCODE_CONFIG_DIR: "/env/config",
      HOME: "/home/user",
    }), "/env/config");
  });

  await t.test("HOME fallback is deterministic", () => {
    assert.equal(resolveTarget(parseCliArgs("rollback", []), { HOME: "/home/user" }), "/home/user/.config/opencode");
  });

  await t.test("empty configured target and missing HOME fail", () => {
    assert.throws(() => resolveTarget(parseCliArgs("install", []), {
      OPENCODE_CONFIG_DIR: "",
      HOME: "/home/user",
    }), /OPENCODE_CONFIG_DIR must not be empty/);
    assert.throws(() => resolveTarget(parseCliArgs("install", []), {}), /HOME is required/);
  });

  await t.test("command-specific flags are strict", () => {
    assert.equal(parseCliArgs("install", ["--force"]).force, true);
    assert.equal(parseCliArgs("uninstall", ["--yes"]).yes, true);
    assert.equal(parseCliArgs("doctor", ["--accept-preserved", "opencode.json"]).acceptPreserved, "opencode.json");
    assert.throws(() => parseCliArgs("upgrade", ["--force"]), /not valid for upgrade/);
    assert.throws(() => parseCliArgs("install", ["--yes"]), /not valid for install/);
    assert.throws(() => parseCliArgs("doctor", ["--target"]), /--target requires a path/);
    assert.throws(() => parseCliArgs("doctor", ["--wat"]), /Unknown argument/);
  });

  await t.test("help returns zero and invalid invocation returns two", async () => {
    const stdout = capture();
    const stderr = capture();
    assert.equal(await main(["install", "--help"], { stdout: stdout.stream, stderr: stderr.stream }), 0);
    assert.match(stdout.read(), /^Usage: \.\/install\.sh/);
    assert.equal(stderr.read(), "");

    const invalidError = capture();
    assert.equal(await main(["upgrade", "--force"], { stdout: capture().stream, stderr: invalidError.stream }), 2);
    assert.match(invalidError.read(), /not valid for upgrade/);
  });

  await t.test("all public wrappers are thin and propagate deterministic CLI exits", () => {
    const usages = {
      install: "Usage: ./install.sh [--dry-run] [--force] [--target PATH]",
      upgrade: "Usage: ./upgrade.sh [--dry-run] [--target PATH]",
      doctor: "Usage: ./doctor.sh [--accept-preserved PATH] [--target PATH]",
      uninstall: "Usage: ./uninstall.sh [--dry-run] [--yes] [--target PATH]",
      rollback: "Usage: ./rollback.sh [--dry-run] [--target PATH]",
    };
    for (const [command, usage] of Object.entries(usages)) {
      const wrapper = path.join(REPOSITORY_ROOT, `${command}.sh`);
      const help = spawnSync(wrapper, ["--help"], { cwd: REPOSITORY_ROOT, encoding: "utf8" });
      assert.equal(help.status, 0, `${command} help`);
      assert.equal(help.stdout.trim(), usage);
      const invalid = spawnSync(wrapper, ["--unknown"], { cwd: REPOSITORY_ROOT, encoding: "utf8" });
      assert.equal(invalid.status, 2, `${command} invalid exit`);
      const body = fs.readFileSync(wrapper, "utf8");
      assert.match(body, new RegExp(`manage-installation\\.mjs" ${command} "\\$@"`));
      assert.equal(body.includes("manifest.json"), false);
    }
  });
});

test("[S019] source symlinks are rejected without being followed", (t) => {
  const { sourceRoot } = makeFixture(t);
  fs.writeFileSync(path.join(sourceRoot, "real.md"), "safe");
  fs.symlinkSync("real.md", path.join(sourceRoot, "linked.md"));
  assert.throws(() => inventorySource(sourceRoot), /symlink.*linked\.md/i);
});

test("[S033] source inventory is sorted and preserves executable modes", (t) => {
  const { sourceRoot } = makeFixture(t);
  fs.mkdirSync(path.join(sourceRoot, "scripts"));
  fs.writeFileSync(path.join(sourceRoot, "z.md"), "z");
  fs.writeFileSync(path.join(sourceRoot, "scripts", "run.sh"), "#!/bin/sh\n");
  fs.mkdirSync(path.join(sourceRoot, "node_modules", ".bin"), { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, "node_modules", "package.js"), "ignored");
  fs.symlinkSync("../package.js", path.join(sourceRoot, "node_modules", ".bin", "package"));
  fs.chmodSync(path.join(sourceRoot, "z.md"), 0o640);
  fs.chmodSync(path.join(sourceRoot, "scripts", "run.sh"), 0o751);

  const inventory = inventorySource(sourceRoot);
  assert.deepEqual(inventory.entries.map((entry) => [entry.path, entry.mode]), [
    ["scripts/run.sh", 0o751],
    ["z.md", 0o640],
  ]);
  assert.match(inventory.entries[0].sha256, /^[0-9a-f]{64}$/);
  assert.match(inventory.payloadSha256, /^[0-9a-f]{64}$/);
  assert.equal(inventory.entries.some((entry) => entry.path.startsWith("node_modules/")), false);
});

test("[S061] every source payload entry under the reserved .oak namespace is rejected", (t) => {
  const { sourceRoot } = makeFixture(t);
  fs.mkdirSync(path.join(sourceRoot, ".oak"));
  fs.writeFileSync(path.join(sourceRoot, ".oak", "manifest.json"), "{}");
  assert.throws(() => inventorySource(sourceRoot), /reserved.*\.oak/i);
});

test("[S063] target equal to repository root is rejected", (t) => {
  const { root, sourceRoot } = makeFixture(t);
  const repositoryRoot = path.dirname(sourceRoot);
  assert.throws(() => assertSafeTarget({ targetRoot: repositoryRoot, repositoryRoot, sourceRoot }), /repository/i);
});

test("[S064] target ancestor of repository root is rejected", (t) => {
  const { root, sourceRoot } = makeFixture(t);
  assert.throws(() => assertSafeTarget({ targetRoot: root, repositoryRoot: path.dirname(sourceRoot), sourceRoot }), /repository/i);
});

test("[S065] target descendant of repository root is rejected", (t) => {
  const { sourceRoot } = makeFixture(t);
  const repositoryRoot = path.dirname(sourceRoot);
  assert.throws(() => assertSafeTarget({ targetRoot: path.join(repositoryRoot, "target"), repositoryRoot, sourceRoot }), /repository/i);
});

test("[S066] target related to source payload is rejected", (t) => {
  const { sourceRoot } = makeFixture(t);
  const repositoryRoot = path.dirname(sourceRoot);
  assert.throws(() => assertSafeTarget({ targetRoot: path.join(sourceRoot, "nested"), repositoryRoot, sourceRoot }), /source payload/i);
});

test("[S067] normalization cannot hide a dangerous target relationship", (t) => {
  const { sourceRoot } = makeFixture(t);
  const repositoryRoot = path.dirname(sourceRoot);
  const disguised = path.join(repositoryRoot, "outside", "..", "opencode", "nested");
  assert.throws(() => assertSafeTarget({ targetRoot: disguised, repositoryRoot, sourceRoot }), /source payload/i);
  assert.throws(() => normalizeManagedPath("agents/../secrets.md"), /normalized/i);
});

test("[S014] manifest validation rejects malformed and ambiguous ownership state", () => {
  assert.throws(() => validateManifest({}), /manifest/);
  assert.throws(() => validateManifest(validManifest({ schema_version: 2 })), /schema_version/);
  assert.throws(() => validateManifest(validManifest({ owned_files: [
    { path: "agents/lead.md", sha256: HASH_A, mode: 0o644 },
    { path: "agents/lead.md", sha256: HASH_A, mode: 0o644 },
  ] })), /duplicate/i);
  assert.throws(() => validateManifest(validManifest({ owned_files: [
    { path: "z.md", sha256: HASH_A, mode: 0o644 },
    { path: "a.md", sha256: HASH_A, mode: 0o644 },
  ] })), /sorted/i);
  assert.throws(() => validateManifest(validManifest({ owned_files: [
    { path: "opencode.json", sha256: HASH_A, mode: 0o644 },
  ] })), /overlap/i);
  assert.throws(() => validateManifest({ ...validManifest(), extra: true }), /unknown field/i);
});

test("[S046] persisted modes outside 0000 through 0777 fail closed", () => {
  assert.throws(() => validateManifest(validManifest({ owned_files: [
    { path: "agents/lead.md", sha256: HASH_A, mode: 0o1000 },
  ] })), /mode/i);
  assert.throws(() => validateManifest(validManifest({ owned_files: [
    { path: "agents/lead.md", sha256: HASH_A, mode: 420.5 },
  ] })), /mode/i);
});

test("[S062] manifest ownership cannot include the reserved .oak namespace", () => {
  assert.throws(() => validateManifest(validManifest({ owned_files: [
    { path: ".oak/manifest.json", sha256: HASH_A, mode: 0o600 },
  ] })), /reserved.*\.oak/i);
});

test("[S124] partial merge acknowledgement fails manifest validation", () => {
  const manifest = validManifest();
  manifest.preserved_files[0].merge_acknowledgement = { target_sha256: HASH_A };
  assert.throws(() => validateManifest(manifest), /merge_acknowledgement/i);
});

test("[S125] accept-preserved rejects acknowledgement tuples that differ from next baselines", () => {
  const transaction = validAcknowledgementTransaction();
  transaction.next_manifest.preserved_files[0].merge_acknowledgement.target_mode = 0o644;
  transaction.next_manifest_sha256 = manifestDigest(transaction.next_manifest);
  assert.throws(() => validateTransaction(transaction), /acknowledgement.*baseline/i);
});

test("[S128] canonical manifest bytes are stable, sorted, and newline terminated", () => {
  const manifest = validManifest();
  validateManifest(manifest);
  const first = canonicalManifestBytes(manifest);
  const second = canonicalManifestBytes(structuredClone(manifest));
  assert.deepEqual(first, second);
  assert.equal(first.at(-1), 0x0a);
  assert.equal(first.includes(Buffer.from("\n ")), false);
});

test("[S072] adopt is forbidden in transaction operations", () => {
  assert.throws(() => validateTransaction(validTransaction({ operation: {
    kind: "adopt", path: "agents/a.md", before_sha256: null, before_mode: null,
    after_sha256: HASH_A, after_mode: 0o644, backup_path: null,
  } })), /operation kind/i);
});

test("[S073] preserve is forbidden in transaction operations", () => {
  assert.throws(() => validateTransaction(validTransaction({ operation: {
    kind: "preserve", path: "agents/a.md", before_sha256: null, before_mode: null,
    after_sha256: HASH_A, after_mode: 0o644, backup_path: null,
  } })), /operation kind/i);
});

test("[S074] add cannot carry a backup", () => {
  assert.throws(() => validateTransaction(validTransaction({ operation: {
    kind: "add", path: "agents/a.md", before_sha256: null, before_mode: null,
    after_sha256: HASH_A, after_mode: 0o644, backup_path: "files/000000",
  } })), /add.*backup/i);
});

test("[S075] update requires a valid backup", () => {
  assert.throws(() => validateTransaction(validTransaction({ operation: {
    kind: "update", path: "agents/a.md", before_sha256: HASH_B, before_mode: 0o600,
    after_sha256: HASH_A, after_mode: 0o644, backup_path: null,
  } })), /update.*backup/i);
});

test("[S076] remove requires a valid backup", () => {
  assert.throws(() => validateTransaction(validTransaction({ operation: {
    kind: "remove", path: "agents/a.md", before_sha256: HASH_B, before_mode: 0o600,
    after_sha256: null, after_mode: null, backup_path: null,
  } })), /remove.*backup/i);
});

test("[S085] add requires an absent before-state", () => {
  assert.throws(() => validateTransaction(validTransaction({ operation: {
    kind: "add", path: "agents/a.md", before_sha256: HASH_B, before_mode: 0o600,
    after_sha256: HASH_A, after_mode: 0o644, backup_path: null,
  } })), /add.*before/i);
});

test("[S086] remove requires an absent after-state", () => {
  assert.throws(() => validateTransaction(validTransaction({ operation: {
    kind: "remove", path: "agents/a.md", before_sha256: HASH_B, before_mode: 0o600,
    after_sha256: HASH_A, after_mode: 0o644, backup_path: "files/000000",
  } })), /remove.*after/i);
});

test("[S087] update requires complete before and after pairs", () => {
  assert.throws(() => validateTransaction(validTransaction({ operation: {
    kind: "update", path: "agents/a.md", before_sha256: HASH_B, before_mode: null,
    after_sha256: HASH_A, after_mode: 0o644, backup_path: "files/000000",
  } })), /hash and mode/i);
});

test("[S088] every operation hash and mode form an inseparable pair", () => {
  assert.throws(() => validateTransaction(validTransaction({ operation: {
    kind: "add", path: "agents/a.md", before_sha256: null, before_mode: null,
    after_sha256: HASH_A, after_mode: null, backup_path: null,
  } })), /hash and mode/i);
});

test("[S089] unknown journal operation kinds fail closed", () => {
  assert.throws(() => validateTransaction(validTransaction({ operation: {
    kind: "copy", path: "agents/a.md", before_sha256: null, before_mode: null,
    after_sha256: HASH_A, after_mode: 0o644, backup_path: null,
  } })), /operation kind/i);
});

test("[S095] install transaction requires null previous and complete next manifest", () => {
  assert.doesNotThrow(() => validateTransaction(validTransaction({ command: "install" })));
});

test("[S096] uninstall transaction requires complete previous and null next manifest", () => {
  assert.doesNotThrow(() => validateTransaction(validTransaction({ command: "uninstall" })));
});

test("[S097] manifest objects cannot be paired with null digests", () => {
  const transaction = validTransaction({ command: "upgrade" });
  transaction.previous_manifest_sha256 = null;
  assert.throws(() => validateTransaction(transaction), /previous_manifest_sha256/i);
});

test("[S098] null manifests cannot be paired with non-null digests", () => {
  const transaction = validTransaction({ command: "install" });
  transaction.previous_manifest_sha256 = HASH_A;
  assert.throws(() => validateTransaction(transaction), /previous_manifest_sha256/i);
});

test("[S129] an empty object never represents an absent manifest", () => {
  const transaction = validTransaction({ command: "install" });
  transaction.previous_manifest = {};
  assert.throws(() => validateTransaction(transaction), /previous_manifest/i);
});

test("[S130] both transaction manifests cannot be null", () => {
  const transaction = validTransaction({ command: "uninstall" });
  transaction.previous_manifest = null;
  transaction.previous_manifest_sha256 = null;
  assert.throws(() => validateTransaction(transaction), /presence/i);
});

test("[S134] upgrade accepts only two complete matching manifests", () => {
  assert.doesNotThrow(() => validateTransaction(validTransaction({ command: "upgrade" })));
});

test("[S135] accept-preserved accepts valid complete matching manifests", () => {
  assert.doesNotThrow(() => validateTransaction(validAcknowledgementTransaction()));
});

test("[S136] every transaction command rejects undeclared manifest presence pairs", () => {
  for (const command of ["install", "upgrade", "accept-preserved", "uninstall"]) {
    const transaction = validTransaction({ command });
    transaction.previous_manifest = null;
    transaction.previous_manifest_sha256 = null;
    transaction.next_manifest = null;
    transaction.next_manifest_sha256 = null;
    assert.throws(() => validateTransaction(transaction), /presence/i);
  }
});

test("[S003] initial install preserves differing protected configuration", (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "opencode.json", "source\n");
  const user = put(targetRoot, "opencode.json", "user\n", 0o600);
  const plan = planFixture("install", sourceRoot, targetRoot);
  assert.equal(plan.blockers.length, 0);
  assert.deepEqual(plan.entries.map(({ kind, path: entryPath }) => [kind, entryPath]), [["preserve", "opencode.json"]]);
  assert.equal(plan.nextManifest.preserved_files[0].observed_sha256, user.sha256);
  assert.equal(plan.nextManifest.preserved_files[0].reason, "preexisting-user-file");
});

test("[S004] arbitrary unrelated target files and directory modes remain untouched", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "lead\n");
  put(targetRoot, "notes/private.txt", "mine\n");
  fs.chmodSync(targetRoot, 0o750);
  const plan = planFixture("install", sourceRoot, targetRoot);
  assert.equal(plan.entries.some((entry) => entry.path === "notes/private.txt"), false);
  assert.equal((await managerFixture(sourceRoot).run("install", { targetRoot })).exitCode, 0);
  assert.equal(fs.statSync(targetRoot).mode & 0o777, 0o750);
  assert.equal(fs.readFileSync(path.join(targetRoot, "notes/private.txt"), "utf8"), "mine\n");
});

test("[S005] an unowned differing managed collision blocks the whole install", (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "source\n");
  put(targetRoot, "agents/lead.md", "user\n");
  const before = fs.readFileSync(path.join(targetRoot, "agents/lead.md"));
  const plan = planFixture("install", sourceRoot, targetRoot);
  assert.deepEqual(plan.blockers.map((entry) => entry.classification), ["unowned-conflict"]);
  assert.deepEqual(fs.readFileSync(path.join(targetRoot, "agents/lead.md")), before);
  assert.equal(fs.existsSync(path.join(targetRoot, ".oak")), false);
});

test("[S007] exact initial matches are adopted without a file operation", (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  const existing = put(targetRoot, "agents/lead.md", "same\n", 0o640);
  put(sourceRoot, "agents/lead.md", "same\n", 0o640);
  const plan = planFixture("install", sourceRoot, targetRoot);
  assert.equal(plan.entries[0].kind, "adopt");
  assert.deepEqual(plan.operations, []);
  assert.deepEqual(plan.nextManifest.owned_files, [existing]);
});

test("[S008] upgrade plans sorted add, update, and remove operations", (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  const oldUpdate = put(targetRoot, "agents/update.md", "old\n");
  const oldRemove = put(targetRoot, "agents/remove.md", "remove\n");
  const newUpdate = put(sourceRoot, "agents/update.md", "new\n");
  const newAdd = put(sourceRoot, "agents/add.md", "add\n");
  persistManifest(targetRoot, validManifest({
    payload_sha256: HASH_A,
    owned_files: [oldRemove, oldUpdate],
    preserved_files: [],
  }));
  const plan = planFixture("upgrade", sourceRoot, targetRoot);
  assert.equal(plan.blockers.length, 0);
  assert.deepEqual(plan.operations.map(({ kind, path: entryPath }) => [kind, entryPath]), [
    ["add", newAdd.path],
    ["remove", oldRemove.path],
    ["update", newUpdate.path],
  ]);
});

test("[S009] modified owned files block every otherwise-safe upgrade operation", (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  const installed = put(targetRoot, "agents/lead.md", "installed\n");
  persistManifest(targetRoot, validManifest({ owned_files: [installed], preserved_files: [] }));
  put(sourceRoot, "agents/lead.md", "new\n");
  put(sourceRoot, "agents/other.md", "other\n");
  fs.writeFileSync(path.join(targetRoot, "agents/lead.md"), "user edit\n");
  const plan = planFixture("upgrade", sourceRoot, targetRoot);
  assert.deepEqual(plan.blockers.map((entry) => entry.classification), ["owned-modified"]);
  assert.equal(plan.canApply, false);
});

test("[S010] modified obsolete owned files block upgrade", (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  const installed = put(targetRoot, "agents/old.md", "installed\n");
  persistManifest(targetRoot, validManifest({ owned_files: [installed], preserved_files: [] }));
  fs.writeFileSync(path.join(targetRoot, "agents/old.md"), "user edit\n");
  const plan = planFixture("upgrade", sourceRoot, targetRoot);
  assert.deepEqual(plan.blockers.map((entry) => entry.classification), ["obsolete-modified"]);
});

test("[S024] upgrade leaves an exact pre-existing new path user-owned", (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  const exact = put(sourceRoot, "agents/new.md", "same\n");
  put(targetRoot, "agents/new.md", "same\n");
  persistManifest(targetRoot, validManifest({ owned_files: [], preserved_files: [] }));
  const plan = planFixture("upgrade", sourceRoot, targetRoot);
  assert.equal(plan.entries[0].kind, "preserve");
  assert.equal(plan.nextManifest.preserved_files[0].reason, "preexisting-exact-match");
  assert.equal(plan.nextManifest.preserved_files[0].source_sha256, exact.sha256);
});

test("[S001] clean install dry-run performs zero writes", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "lead\n");
  const result = await managerFixture(sourceRoot).run("install", { targetRoot, dryRun: true });
  assert.equal(result.exitCode, 0);
  assert.equal(result.plan.operations.length, 1);
  assert.equal(fs.existsSync(targetRoot), false);
});

test("[S002] clean install writes owned files and a valid sorted manifest", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  const lead = put(sourceRoot, "agents/lead.md", "lead\n", 0o640);
  put(sourceRoot, "commands/feature.md", "feature\n", 0o644);
  const result = await managerFixture(sourceRoot).run("install", { targetRoot });
  assert.equal(result.exitCode, 0);
  assert.equal(fs.readFileSync(path.join(targetRoot, "agents/lead.md"), "utf8"), "lead\n");
  assert.equal(fs.statSync(path.join(targetRoot, "agents/lead.md")).mode & 0o777, 0o640);
  const manifest = JSON.parse(fs.readFileSync(path.join(targetRoot, ".oak", "manifest.json"), "utf8"));
  validateManifest(manifest);
  assert.deepEqual(manifest.owned_files.map((entry) => entry.path), ["agents/lead.md", "commands/feature.md"]);
  assert.equal(manifest.owned_files[0].sha256, lead.sha256);
});

test("[S006] initial force captures rollback bytes before replacement", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "new\n");
  put(targetRoot, "agents/lead.md", "old-secret\n", 0o600);
  const result = await managerFixture(sourceRoot).run("install", { targetRoot, force: true });
  assert.equal(result.exitCode, 0);
  assert.equal(fs.readFileSync(path.join(targetRoot, "agents/lead.md"), "utf8"), "new\n");
  const journal = JSON.parse(fs.readFileSync(path.join(targetRoot, ".oak", "rollback", "transaction.json"), "utf8"));
  assert.equal(journal.operations[0].kind, "update");
  assert.equal(fs.readFileSync(path.join(targetRoot, ".oak", "rollback", journal.operations[0].backup_path), "utf8"), "old-secret\n");
});

test("[S011] uninstall removes unchanged owned files and preserves later user edits", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/keep.md", "original\n");
  put(sourceRoot, "agents/remove.md", "remove\n");
  const manager = managerFixture(sourceRoot);
  assert.equal((await manager.run("install", { targetRoot })).exitCode, 0);
  fs.writeFileSync(path.join(targetRoot, "agents/keep.md"), "user edit\n");
  assert.equal((await manager.run("uninstall", { targetRoot, yes: true })).exitCode, 0);
  assert.equal(fs.readFileSync(path.join(targetRoot, "agents/keep.md"), "utf8"), "user edit\n");
  assert.equal(fs.existsSync(path.join(targetRoot, "agents/remove.md")), false);
  assert.equal(fs.existsSync(path.join(targetRoot, ".oak", "manifest.json")), false);
});

test("[S012] one committed rollback reverses install, upgrade, and uninstall", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "v1\n");
  const manager = managerFixture(sourceRoot);
  await manager.run("install", { targetRoot });
  assert.equal((await manager.run("rollback", { targetRoot })).exitCode, 0);
  assert.equal(fs.existsSync(path.join(targetRoot, "agents/lead.md")), false);
  assert.equal(fs.existsSync(path.join(targetRoot, ".oak", "manifest.json")), false);

  await manager.run("install", { targetRoot });
  fs.writeFileSync(path.join(sourceRoot, "agents/lead.md"), "v2\n");
  await manager.run("upgrade", { targetRoot });
  assert.equal(fs.readFileSync(path.join(targetRoot, "agents/lead.md"), "utf8"), "v2\n");
  await manager.run("rollback", { targetRoot });
  assert.equal(fs.readFileSync(path.join(targetRoot, "agents/lead.md"), "utf8"), "v1\n");

  await manager.run("uninstall", { targetRoot, yes: true });
  await manager.run("rollback", { targetRoot });
  assert.equal(fs.readFileSync(path.join(targetRoot, "agents/lead.md"), "utf8"), "v1\n");
});

test("[S015] simulated interruption leaves a valid recoverable journal", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "lead\n");
  const manager = managerFixture(sourceRoot, {
    failpoint(name) { if (name === "after-journal-create") throw new Error("simulated crash"); },
  });
  const result = await manager.run("install", { targetRoot });
  assert.equal(result.exitCode, 2);
  const journal = JSON.parse(fs.readFileSync(path.join(targetRoot, ".oak", "transaction.json"), "utf8"));
  validateTransaction(journal);
  assert.equal(journal.status, "planned");
  assert.equal(fs.existsSync(path.join(targetRoot, ".oak", "lock.json")), true);
});

test("[S016] rollback recovers an interrupted forward operation to exact pre-state", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "lead\n");
  await managerFixture(sourceRoot, {
    failpoint(name) { if (name === "after-journal-create") throw new Error("simulated crash"); },
  }).run("install", { targetRoot });

  const result = await managerFixture(sourceRoot).run("rollback", { targetRoot });
  assert.equal(result.exitCode, 0);
  assert.equal(fs.existsSync(path.join(targetRoot, "agents/lead.md")), false);
  assert.equal(fs.existsSync(path.join(targetRoot, ".oak", "transaction.json")), false);
  assert.equal(fs.existsSync(path.join(targetRoot, ".oak", "lock.json")), false);
});

function preservedFixture(t) {
  const { sourceRoot, targetRoot } = makeFixture(t);
  const source = put(sourceRoot, "opencode.json", "source-v1\n", 0o644);
  const target = put(targetRoot, "opencode.json", "user-v1\n", 0o600);
  const manifest = validManifest({
    payload_sha256: HASH_A,
    owned_files: [],
    preserved_files: [{
      path: "opencode.json",
      observed_sha256: target.sha256,
      observed_mode: target.mode,
      source_sha256: source.sha256,
      source_mode: source.mode,
      reason: "preexisting-user-file",
      merge_acknowledgement: null,
    }],
  });
  persistManifest(targetRoot, manifest);
  return { sourceRoot, targetRoot, source, target, manifest };
}

function ackLine(source, target, relative = "opencode.json") {
  return `ACK-PRESERVED ${relative} ${target.sha256} ${target.mode.toString(8).padStart(4, "0")} ${source.sha256} ${source.mode.toString(8).padStart(4, "0")}`;
}

test("[S021] stable preserved configuration is doctor-healthy", async (t) => {
  const { sourceRoot, targetRoot } = preservedFixture(t);
  const result = await managerFixture(sourceRoot).run("doctor", { targetRoot });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.report.warnings.map((warning) => warning.classification), ["preserved-stable"]);
});

test("[S022] source-only protected change creates a manual-merge warning", async (t) => {
  const { sourceRoot, targetRoot } = preservedFixture(t);
  fs.writeFileSync(path.join(sourceRoot, "opencode.json"), "source-v2\n");
  const result = await managerFixture(sourceRoot).run("doctor", { targetRoot });
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.report.warnings.map((warning) => warning.classification), ["preserved-source-changed"]);
});

test("[S023] user and source changes remain merge-pending on both sides", async (t) => {
  const { sourceRoot, targetRoot } = preservedFixture(t);
  fs.writeFileSync(path.join(sourceRoot, "opencode.json"), "source-v2\n");
  fs.writeFileSync(path.join(targetRoot, "opencode.json"), "user-v2\n");
  const result = await managerFixture(sourceRoot).run("doctor", { targetRoot });
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.report.warnings.map((warning) => warning.classification), ["preserved-both-changed"]);
});

test("[S080] doctor reports user-only evolution without refreshing baselines", async (t) => {
  const { sourceRoot, targetRoot, manifest } = preservedFixture(t);
  fs.writeFileSync(path.join(targetRoot, "opencode.json"), "user-v2\n");
  const before = fs.readFileSync(path.join(targetRoot, ".oak", "manifest.json"));
  const result = await managerFixture(sourceRoot).run("doctor", { targetRoot });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.report.warnings.map((warning) => warning.classification), ["preserved-user-changed"]);
  assert.deepEqual(fs.readFileSync(path.join(targetRoot, ".oak", "manifest.json")), before);
  assert.equal(JSON.parse(before).preserved_files[0].observed_sha256, manifest.preserved_files[0].observed_sha256);
});

test("[S111] generic yes is not preserved-merge authorization", async (t) => {
  const { sourceRoot, targetRoot } = preservedFixture(t);
  const result = await managerFixture(sourceRoot, { stdin: Readable.from(["yes\n"]), stdout: capture().stream }).run("doctor", {
    targetRoot,
    acceptPreserved: "opencode.json",
  });
  assert.equal(result.exitCode, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(targetRoot, ".oak", "manifest.json"), "utf8")).preserved_files[0].merge_acknowledgement, null);
});

test("[S115] exact ACK through non-interactive stdin commits acknowledgement", async (t) => {
  const { sourceRoot, targetRoot, source, target } = preservedFixture(t);
  const line = `ACK-PRESERVED opencode.json ${target.sha256} 0600 ${source.sha256} 0644`;
  const stdout = capture();
  const manager = managerFixture(sourceRoot, { stdin: Readable.from([`${line}\n`]), stdout: stdout.stream });
  const result = await manager.run("doctor", { targetRoot, acceptPreserved: "opencode.json" });
  assert.equal(result.exitCode, 0);
  assert.match(stdout.read(), new RegExp(`${line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n`));
  const manifest = JSON.parse(fs.readFileSync(path.join(targetRoot, ".oak", "manifest.json"), "utf8"));
  assert.equal(manifest.preserved_files[0].reason, "preexisting-user-file");
  assert.deepEqual(manifest.preserved_files[0].merge_acknowledgement, {
    target_sha256: target.sha256,
    target_mode: 0o600,
    source_sha256: source.sha256,
    source_mode: 0o644,
    acknowledged_at: "2026-07-20T00:00:00.000Z",
  });
});

test("[S017] apparently live lock rejects a second mutation", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "lead\n");
  fs.mkdirSync(path.join(targetRoot, ".oak"), { recursive: true });
  fs.writeFileSync(path.join(targetRoot, ".oak", "lock.json"), JSON.stringify({
    transaction_id: "other",
    pid: 4321,
    command: "install",
    created_at: "2026-07-20T00:00:00.000Z",
  }));
  const result = await managerFixture(sourceRoot, { pidProbe: () => ({ alive: true }) }).run("install", { targetRoot });
  assert.equal(result.exitCode, 1);
  assert.equal(fs.existsSync(path.join(targetRoot, "agents/lead.md")), false);
});

test("[S018] stale lock plus corrupt transaction is reported without mutation", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "lead\n");
  fs.mkdirSync(path.join(targetRoot, ".oak"), { recursive: true });
  fs.writeFileSync(path.join(targetRoot, ".oak", "lock.json"), JSON.stringify({
    transaction_id: "other", pid: 4321, command: "install", created_at: "2026-07-20T00:00:00.000Z",
  }));
  fs.writeFileSync(path.join(targetRoot, ".oak", "transaction.json"), "{not-json");
  const result = await managerFixture(sourceRoot).run("doctor", { targetRoot });
  assert.equal(result.exitCode, 2);
  assert.equal(fs.existsSync(path.join(targetRoot, "agents/lead.md")), false);
});

test("[S079] EPERM from PID probe blocks conservatively", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "lead\n");
  fs.mkdirSync(path.join(targetRoot, ".oak"), { recursive: true });
  fs.writeFileSync(path.join(targetRoot, ".oak", "lock.json"), JSON.stringify({
    transaction_id: "other", pid: 4321, command: "install", created_at: "2026-07-20T00:00:00.000Z",
  }));
  const result = await managerFixture(sourceRoot, { pidProbe() { const error = new Error("denied"); error.code = "EPERM"; throw error; } }).run("install", { targetRoot });
  assert.equal(result.exitCode, 1);
});

test("[S094] ambiguous PID-probe errors fail closed", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "lead\n");
  fs.mkdirSync(path.join(targetRoot, ".oak"), { recursive: true });
  fs.writeFileSync(path.join(targetRoot, ".oak", "lock.json"), JSON.stringify({
    transaction_id: "other", pid: 4321, command: "install", created_at: "2026-07-20T00:00:00.000Z",
  }));
  const result = await managerFixture(sourceRoot, { pidProbe() { const error = new Error("ambiguous"); error.code = "EIO"; throw error; } }).run("install", { targetRoot });
  assert.equal(result.exitCode, 2);
  assert.equal(fs.existsSync(path.join(targetRoot, ".oak", "lock.json")), true);
});

test("[S043] failure before journal creation leaves zero persistent state", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "lead\n");
  const result = await managerFixture(sourceRoot, {
    failpoint(name) { if (name === "before-journal-create") throw new Error("stop"); },
  }).run("install", { targetRoot });
  assert.equal(result.exitCode, 2);
  assert.equal(fs.existsSync(targetRoot), false);

  const second = makeFixture(t);
  put(second.sourceRoot, "agents/lead.md", "new\n");
  put(second.targetRoot, "agents/lead.md", "old-secret\n");
  const failingFs = new Proxy(fs, {
    get(target, property) {
      if (property === "renameSync") {
        return (from, to) => {
          if (to === path.join(second.targetRoot, ".oak", "transaction.json")) throw Object.assign(new Error("journal rename failed"), { code: "EIO" });
          return target.renameSync(from, to);
        };
      }
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const failedPublication = await managerFixture(second.sourceRoot, { fsOps: failingFs }).run("install", {
    targetRoot: second.targetRoot,
    force: true,
  });
  assert.equal(failedPublication.exitCode, 2);
  assert.equal(fs.readFileSync(path.join(second.targetRoot, "agents/lead.md"), "utf8"), "old-secret\n");
  assert.equal(fs.existsSync(path.join(second.targetRoot, ".oak")), false);
});

test("[S092] no-op upgrade leaves manifest and preserved baselines byte-for-byte unchanged", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "same\n");
  const manager = managerFixture(sourceRoot);
  await manager.run("install", { targetRoot });
  const before = fs.readFileSync(path.join(targetRoot, ".oak", "manifest.json"));
  const result = await manager.run("upgrade", { targetRoot });
  assert.equal(result.exitCode, 0);
  assert.equal(result.plan.hasWork, false);
  assert.deepEqual(fs.readFileSync(path.join(targetRoot, ".oak", "manifest.json")), before);
});

test("[S103] obsolete preserved present is classified without becoming owned", (t) => {
  const { sourceRoot, targetRoot, manifest } = preservedFixture(t);
  fs.unlinkSync(path.join(sourceRoot, "opencode.json"));
  const plan = planFixture("upgrade", sourceRoot, targetRoot);
  assert.equal(plan.warnings[0].classification, "obsolete-preserved-present");
  assert.equal(plan.nextManifest.owned_files.some((entry) => entry.path === "opencode.json"), false);
});

test("[S104] obsolete preserved missing is classified distinctly", (t) => {
  const { sourceRoot, targetRoot } = preservedFixture(t);
  fs.unlinkSync(path.join(sourceRoot, "opencode.json"));
  fs.unlinkSync(path.join(targetRoot, "opencode.json"));
  const plan = planFixture("upgrade", sourceRoot, targetRoot);
  assert.equal(plan.warnings[0].classification, "obsolete-preserved-missing");
});

test("[S105] upgrade cleans obsolete-preserved metadata without touching present user bytes", async (t) => {
  const { sourceRoot, targetRoot } = preservedFixture(t);
  fs.unlinkSync(path.join(sourceRoot, "opencode.json"));
  const before = fs.readFileSync(path.join(targetRoot, "opencode.json"));
  const result = await managerFixture(sourceRoot).run("upgrade", { targetRoot });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(fs.readFileSync(path.join(targetRoot, "opencode.json")), before);
  const manifest = JSON.parse(fs.readFileSync(path.join(targetRoot, ".oak", "manifest.json"), "utf8"));
  assert.deepEqual(manifest.preserved_files, []);
});

test("[S106] upgrade cleans obsolete-preserved metadata without recreating a missing file", async (t) => {
  const { sourceRoot, targetRoot } = preservedFixture(t);
  fs.unlinkSync(path.join(sourceRoot, "opencode.json"));
  fs.unlinkSync(path.join(targetRoot, "opencode.json"));
  const result = await managerFixture(sourceRoot).run("upgrade", { targetRoot });
  assert.equal(result.exitCode, 0);
  assert.equal(fs.existsSync(path.join(targetRoot, "opencode.json")), false);
});

test("[S107] rollback of obsolete cleanup restores metadata only", async (t) => {
  const { sourceRoot, targetRoot } = preservedFixture(t);
  fs.unlinkSync(path.join(sourceRoot, "opencode.json"));
  const before = fs.readFileSync(path.join(targetRoot, "opencode.json"));
  const manager = managerFixture(sourceRoot);
  await manager.run("upgrade", { targetRoot });
  await manager.run("rollback", { targetRoot });
  assert.deepEqual(fs.readFileSync(path.join(targetRoot, "opencode.json")), before);
  const manifest = JSON.parse(fs.readFileSync(path.join(targetRoot, ".oak", "manifest.json"), "utf8"));
  assert.equal(manifest.preserved_files[0].path, "opencode.json");
});

test("[S108] doctor reports obsolete preservation as actionable and offers no ACK", async (t) => {
  const { sourceRoot, targetRoot } = preservedFixture(t);
  fs.unlinkSync(path.join(sourceRoot, "opencode.json"));
  const result = await managerFixture(sourceRoot).run("doctor", { targetRoot });
  assert.equal(result.exitCode, 1);
  assert.equal(result.report.warnings[0].classification, "obsolete-preserved-present");
});

test("[S109] obsolete cleanup commits as a manifest-only upgrade", async (t) => {
  const { sourceRoot, targetRoot } = preservedFixture(t);
  fs.unlinkSync(path.join(sourceRoot, "opencode.json"));
  const result = await managerFixture(sourceRoot).run("upgrade", { targetRoot });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.transaction.operations, []);
});

test("[S110] accept-preserved requires and displays the complete canonical ACK line", async (t) => {
  const { sourceRoot, targetRoot, source, target } = preservedFixture(t);
  const stdout = capture();
  const result = await managerFixture(sourceRoot, { stdin: Readable.from([]), stdout: stdout.stream }).run("doctor", {
    targetRoot, acceptPreserved: "opencode.json",
  });
  assert.equal(result.exitCode, 1);
  assert.equal(stdout.read(), `${ackLine(source, target)}\n`);
});

test("[S112] path-only preserved confirmation is rejected", async (t) => {
  const { sourceRoot, targetRoot } = preservedFixture(t);
  const result = await managerFixture(sourceRoot, { stdin: Readable.from(["opencode.json\n"]), stdout: capture().stream }).run("doctor", {
    targetRoot, acceptPreserved: "opencode.json",
  });
  assert.equal(result.exitCode, 1);
});

test("[S113] truncated hashes in preserved confirmation are rejected", async (t) => {
  const { sourceRoot, targetRoot, source, target } = preservedFixture(t);
  const result = await managerFixture(sourceRoot, { stdin: Readable.from([`${ackLine(source, target).slice(0, -8)}\n`]), stdout: capture().stream }).run("doctor", {
    targetRoot, acceptPreserved: "opencode.json",
  });
  assert.equal(result.exitCode, 1);
});

test("[S114] EOF cancels acknowledgement with zero persistent mutation", async (t) => {
  const { sourceRoot, targetRoot } = preservedFixture(t);
  const before = fs.readFileSync(path.join(targetRoot, ".oak", "manifest.json"));
  const result = await managerFixture(sourceRoot, { stdin: Readable.from([]), stdout: capture().stream }).run("doctor", {
    targetRoot, acceptPreserved: "opencode.json",
  });
  assert.equal(result.exitCode, 1);
  assert.deepEqual(fs.readFileSync(path.join(targetRoot, ".oak", "manifest.json")), before);
});

test("[S116] tuple change after confirmation aborts before transaction state", async (t) => {
  const { sourceRoot, targetRoot, source, target } = preservedFixture(t);
  const result = await managerFixture(sourceRoot, {
    stdin: Readable.from([`${ackLine(source, target)}\n`]),
    stdout: capture().stream,
    failpoint(name) {
      if (name === "after-ack-confirmation") fs.writeFileSync(path.join(targetRoot, "opencode.json"), "raced\n");
    },
  }).run("doctor", { targetRoot, acceptPreserved: "opencode.json" });
  assert.equal(result.exitCode, 1);
  assert.equal(fs.existsSync(path.join(targetRoot, ".oak", "transaction.json")), false);
});

test("[S117] acknowledgement path absent from preserved_files is invalid invocation", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  const source = put(sourceRoot, "agents/lead.md", "lead\n");
  put(targetRoot, "agents/lead.md", "lead\n");
  persistManifest(targetRoot, validManifest({ owned_files: [source], preserved_files: [] }));
  const result = await managerFixture(sourceRoot, { stdin: Readable.from([]), stdout: capture().stream }).run("doctor", {
    targetRoot, acceptPreserved: "agents/lead.md",
  });
  assert.equal(result.exitCode, 2);
});

test("[S118] unrelated owned drift blocks acknowledgement", async (t) => {
  const { sourceRoot, targetRoot, source, target, manifest } = preservedFixture(t);
  const owned = put(sourceRoot, "agents/lead.md", "owned\n");
  put(targetRoot, "agents/lead.md", "modified\n");
  manifest.owned_files = [owned];
  persistManifest(targetRoot, manifest);
  const result = await managerFixture(sourceRoot, { stdin: Readable.from([`${ackLine(source, target)}\n`]), stdout: capture().stream }).run("doctor", {
    targetRoot, acceptPreserved: "opencode.json",
  });
  assert.equal(result.exitCode, 1);
});

test("[S119] warning on another preserved file does not block acknowledgement", async (t) => {
  const { sourceRoot, targetRoot, source, target, manifest } = preservedFixture(t);
  const otherSource = put(sourceRoot, "tui.json", "source\n");
  manifest.preserved_files.push({
    path: "tui.json", observed_sha256: HASH_A, observed_mode: 0o600,
    source_sha256: otherSource.sha256, source_mode: otherSource.mode,
    reason: "preexisting-user-file", merge_acknowledgement: null,
  });
  persistManifest(targetRoot, manifest);
  const result = await managerFixture(sourceRoot, { stdin: Readable.from([`${ackLine(source, target)}\n`]), stdout: capture().stream }).run("doctor", {
    targetRoot, acceptPreserved: "opencode.json",
  });
  assert.equal(result.exitCode, 0);
});

test("[S120] acknowledgement preserves original provenance reason", async (t) => {
  const { sourceRoot, targetRoot, source, target } = preservedFixture(t);
  await managerFixture(sourceRoot, { stdin: Readable.from([`${ackLine(source, target)}\n`]), stdout: capture().stream }).run("doctor", {
    targetRoot, acceptPreserved: "opencode.json",
  });
  const manifest = JSON.parse(fs.readFileSync(path.join(targetRoot, ".oak", "manifest.json"), "utf8"));
  assert.equal(manifest.preserved_files[0].reason, "preexisting-user-file");
});

test("[S121] acknowledgement matches committed baselines", async (t) => {
  const { sourceRoot, targetRoot, source, target } = preservedFixture(t);
  await managerFixture(sourceRoot, { stdin: Readable.from([`${ackLine(source, target)}\n`]), stdout: capture().stream }).run("doctor", {
    targetRoot, acceptPreserved: "opencode.json",
  });
  const entry = JSON.parse(fs.readFileSync(path.join(targetRoot, ".oak", "manifest.json"), "utf8")).preserved_files[0];
  assert.equal(entry.merge_acknowledgement.target_sha256, entry.observed_sha256);
  assert.equal(entry.merge_acknowledgement.source_sha256, entry.source_sha256);
});

test("[S122] acknowledgement timestamp uses injectable clock", async (t) => {
  const { sourceRoot, targetRoot, source, target } = preservedFixture(t);
  await managerFixture(sourceRoot, { stdin: Readable.from([`${ackLine(source, target)}\n`]), stdout: capture().stream }).run("doctor", {
    targetRoot, acceptPreserved: "opencode.json",
  });
  const entry = JSON.parse(fs.readFileSync(path.join(targetRoot, ".oak", "manifest.json"), "utf8")).preserved_files[0];
  assert.equal(entry.merge_acknowledgement.acknowledged_at, "2026-07-20T00:00:00.000Z");
});

test("[S123] rollback restores prior acknowledgement object", async (t) => {
  const { sourceRoot, targetRoot, source, target } = preservedFixture(t);
  const manager = managerFixture(sourceRoot, { stdin: Readable.from([`${ackLine(source, target)}\n`]), stdout: capture().stream });
  await manager.run("doctor", { targetRoot, acceptPreserved: "opencode.json" });
  await manager.run("rollback", { targetRoot });
  const entry = JSON.parse(fs.readFileSync(path.join(targetRoot, ".oak", "manifest.json"), "utf8")).preserved_files[0];
  assert.equal(entry.merge_acknowledgement, null);
});

test("[S126] source change leaves acknowledgement historical and merge-pending", async (t) => {
  const { sourceRoot, targetRoot, source, target } = preservedFixture(t);
  const manager = managerFixture(sourceRoot, { stdin: Readable.from([`${ackLine(source, target)}\n`]), stdout: capture().stream });
  await manager.run("doctor", { targetRoot, acceptPreserved: "opencode.json" });
  fs.writeFileSync(path.join(sourceRoot, "opencode.json"), "source-v2\n");
  const result = await manager.run("doctor", { targetRoot });
  assert.equal(result.report.warnings[0].classification, "preserved-source-changed");
});

test("[S127] target change leaves acknowledgement historical and user-only", async (t) => {
  const { sourceRoot, targetRoot, source, target } = preservedFixture(t);
  const manager = managerFixture(sourceRoot, { stdin: Readable.from([`${ackLine(source, target)}\n`]), stdout: capture().stream });
  await manager.run("doctor", { targetRoot, acceptPreserved: "opencode.json" });
  fs.writeFileSync(path.join(targetRoot, "opencode.json"), "user-v2\n");
  const result = await manager.run("doctor", { targetRoot });
  assert.equal(result.report.warnings[0].classification, "preserved-user-changed");
});

test("[S025] source-file target-directory collision fails without mutation", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "lead\n");
  fs.mkdirSync(path.join(targetRoot, "agents", "lead.md"), { recursive: true });
  const result = await managerFixture(sourceRoot).run("install", { targetRoot });
  assert.equal(result.exitCode, 1);
  assert.equal(fs.statSync(path.join(targetRoot, "agents", "lead.md")).isDirectory(), true);
  assert.equal(fs.existsSync(path.join(targetRoot, ".oak")), false);
});

test("[S026] source-directory target-file collision fails closed", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "lead\n");
  put(targetRoot, "agents", "user-file\n");
  const result = await managerFixture(sourceRoot).run("install", { targetRoot });
  assert.equal(result.exitCode, 2);
  assert.equal(fs.readFileSync(path.join(targetRoot, "agents"), "utf8"), "user-file\n");
});

test("[S027] .oak as regular file fails closed", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "lead\n");
  put(targetRoot, ".oak", "user\n");
  const result = await managerFixture(sourceRoot).run("install", { targetRoot });
  assert.equal(result.exitCode, 2);
  assert.equal(fs.readFileSync(path.join(targetRoot, ".oak"), "utf8"), "user\n");
});

test("[S028] .oak as symlink fails closed", async (t) => {
  const { root, sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "lead\n");
  fs.mkdirSync(targetRoot, { recursive: true });
  fs.mkdirSync(path.join(root, "outside"));
  fs.symlinkSync(path.join(root, "outside"), path.join(targetRoot, ".oak"));
  const result = await managerFixture(sourceRoot).run("install", { targetRoot });
  assert.equal(result.exitCode, 2);
  assert.deepEqual(fs.readdirSync(path.join(root, "outside")), []);
});

test("[S036] force cannot replace a directory", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "lead\n");
  fs.mkdirSync(path.join(targetRoot, "agents", "lead.md"), { recursive: true });
  const result = await managerFixture(sourceRoot).run("install", { targetRoot, force: true });
  assert.equal(result.exitCode, 1);
  assert.equal(fs.statSync(path.join(targetRoot, "agents", "lead.md")).isDirectory(), true);
});

test("[S037] force cannot traverse or replace a symlink", async (t) => {
  const { root, sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "lead\n");
  fs.mkdirSync(path.join(targetRoot, "agents"), { recursive: true });
  put(root, "outside.md", "outside\n");
  fs.symlinkSync(path.join(root, "outside.md"), path.join(targetRoot, "agents", "lead.md"));
  const result = await managerFixture(sourceRoot).run("install", { targetRoot, force: true });
  assert.equal(result.exitCode, 2);
  assert.equal(fs.readFileSync(path.join(root, "outside.md"), "utf8"), "outside\n");
});

test("[S038] state, backups, and temporaries use restrictive permissions", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "new\n");
  put(targetRoot, "agents/lead.md", "old\n");
  await managerFixture(sourceRoot).run("install", { targetRoot, force: true });
  const mode = (relative) => fs.statSync(path.join(targetRoot, relative)).mode & 0o777;
  assert.equal(mode(".oak"), 0o700);
  assert.equal(mode(".oak/manifest.json"), 0o600);
  assert.equal(mode(".oak/rollback"), 0o700);
  assert.equal(mode(".oak/rollback/transaction.json"), 0o600);
  assert.equal(mode(".oak/rollback/files/000000"), 0o600);
});

test("[S081] nested .oak source payload path is rejected", (t) => {
  const { sourceRoot } = makeFixture(t);
  fs.mkdirSync(path.join(sourceRoot, ".oak"));
  fs.writeFileSync(path.join(sourceRoot, ".oak", "manifest.json"), "{}");
  assert.throws(() => inventorySource(sourceRoot), /reserved.*\.oak/i);
});

test("[S082] target relationship hidden through an ancestor symlink is rejected", async (t) => {
  const { root, sourceRoot } = makeFixture(t);
  const link = path.join(root, "link");
  fs.symlinkSync(path.dirname(sourceRoot), link);
  const targetRoot = path.join(link, "opencode", "nested-target");
  const result = await managerFixture(sourceRoot).run("install", { targetRoot });
  assert.equal(result.exitCode, 2);
  assert.equal(fs.existsSync(path.join(sourceRoot, "nested-target")), false);
});

test("[S083] backup paths containing a reserved .oak component are rejected", () => {
  const transaction = validTransaction({ operation: {
    kind: "update", path: "agents/a.md", before_sha256: HASH_B, before_mode: 0o600,
    after_sha256: HASH_A, after_mode: 0o644, backup_path: "files/.oak/secret",
  } });
  assert.throws(() => validateTransaction(transaction), /reserved.*\.oak/i);
});

test("[S013] user modification after commit blocks rollback", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "installed\n");
  const manager = managerFixture(sourceRoot);
  await manager.run("install", { targetRoot });
  fs.writeFileSync(path.join(targetRoot, "agents/lead.md"), "user edit\n");
  const result = await manager.run("rollback", { targetRoot });
  assert.equal(result.exitCode, 1);
  assert.equal(fs.readFileSync(path.join(targetRoot, "agents/lead.md"), "utf8"), "user edit\n");
});

test("[S031] bootstrap cleanup never removes a pre-existing target", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  fs.mkdirSync(targetRoot);
  put(sourceRoot, "agents/lead.md", "lead\n");
  await managerFixture(sourceRoot, { failpoint(name) { if (name === "before-journal-create") throw new Error("stop"); } }).run("install", { targetRoot });
  assert.equal(fs.existsSync(targetRoot), true);
  assert.deepEqual(fs.readdirSync(targetRoot), []);
});

test("[S032] bootstrap cleanup removes an empty target created by the invocation", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "lead\n");
  await managerFixture(sourceRoot, { failpoint(name) { if (name === "before-journal-create") throw new Error("stop"); } }).run("install", { targetRoot });
  assert.equal(fs.existsSync(targetRoot), false);
});

test("[S034] upgrade preserves changed executable modes", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "scripts/run.sh", "v1\n", 0o700);
  const manager = managerFixture(sourceRoot);
  await manager.run("install", { targetRoot });
  put(sourceRoot, "scripts/run.sh", "v2\n", 0o755);
  await manager.run("upgrade", { targetRoot });
  assert.equal(fs.statSync(path.join(targetRoot, "scripts/run.sh")).mode & 0o777, 0o755);
});

test("[S035] rollback restores executable modes", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "scripts/run.sh", "v1\n", 0o700);
  const manager = managerFixture(sourceRoot);
  await manager.run("install", { targetRoot });
  put(sourceRoot, "scripts/run.sh", "v2\n", 0o755);
  await manager.run("upgrade", { targetRoot });
  await manager.run("rollback", { targetRoot });
  assert.equal(fs.statSync(path.join(targetRoot, "scripts/run.sh")).mode & 0o777, 0o700);
});

test("[S039] an apparently live PID blocks conservatively", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "lead\n");
  fs.mkdirSync(path.join(targetRoot, ".oak"), { recursive: true });
  fs.writeFileSync(path.join(targetRoot, ".oak", "lock.json"), JSON.stringify({ transaction_id: "live", pid: 9, command: "install", created_at: "2026-07-20T00:00:00.000Z" }));
  const result = await managerFixture(sourceRoot, { pidProbe: () => ({ alive: true }) }).run("install", { targetRoot });
  assert.equal(result.exitCode, 1);
});

test("[S040] journal completed indexes must refer to real operations", () => {
  const transaction = validTransaction();
  transaction.completed_operation_indexes = [0];
  assert.throws(() => validateTransaction(transaction), /completed indexes/i);
});

test("[S041] missing preserved source-overlapping file makes doctor actionable without recreation", async (t) => {
  const { sourceRoot, targetRoot } = preservedFixture(t);
  fs.unlinkSync(path.join(targetRoot, "opencode.json"));
  const result = await managerFixture(sourceRoot).run("doctor", { targetRoot });
  assert.equal(result.exitCode, 1);
  assert.equal(fs.existsSync(path.join(targetRoot, "opencode.json")), false);
});

test("[S042] stable preserved file is not an upgrade blocker", (t) => {
  const { sourceRoot, targetRoot } = preservedFixture(t);
  const plan = planFixture("upgrade", sourceRoot, targetRoot);
  assert.equal(plan.canApply, true);
  assert.equal(plan.blockers.length, 0);
});

test("[S044] post-journal interruption yields a deterministic doctor recovery report", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "lead\n");
  await managerFixture(sourceRoot, { failpoint(name) { if (name === "after-journal-create") throw new Error("stop"); } }).run("install", { targetRoot });
  const result = await managerFixture(sourceRoot).run("doctor", { targetRoot });
  assert.equal(result.exitCode, 1);
  assert.equal(result.report.activeTransaction, true);
  assert.equal(result.report.activeLock, "stale");
});

test("[S045] interrupted-forward recovery retains the earlier committed rollback point", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "v1\n");
  const manager = managerFixture(sourceRoot);
  await manager.run("install", { targetRoot });
  const prior = fs.readFileSync(path.join(targetRoot, ".oak", "rollback", "transaction.json"));
  put(sourceRoot, "agents/lead.md", "v2\n");
  await managerFixture(sourceRoot, {
    transactionId: () => "tx-upgrade",
    failpoint(name) { if (name === "after-journal-create") throw new Error("stop"); },
  }).run("upgrade", { targetRoot });
  await manager.run("rollback", { targetRoot });
  assert.deepEqual(fs.readFileSync(path.join(targetRoot, ".oak", "rollback", "transaction.json")), prior);
});

test("[S047] errors never include sensitive rollback backup bytes", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  const sentinel = "SENSITIVE-BACKUP-SENTINEL";
  put(sourceRoot, "agents/lead.md", "new\n");
  put(targetRoot, "agents/lead.md", `${sentinel}\n`);
  const manager = managerFixture(sourceRoot);
  await manager.run("install", { targetRoot, force: true });
  fs.writeFileSync(path.join(targetRoot, "agents/lead.md"), "conflict\n");
  const result = await manager.run("rollback", { targetRoot });
  assert.equal(JSON.stringify(result).includes(sentinel), false);
});

test("[S049] invalid transaction status-origin combination fails closed", () => {
  const transaction = validTransaction();
  transaction.status = "mystery";
  assert.throws(() => validateTransaction(transaction), /status.*rollback_origin/i);
});

test("[S052] acknowledgement updates both baselines without changing ownership", async (t) => {
  const { sourceRoot, targetRoot, source, target } = preservedFixture(t);
  await managerFixture(sourceRoot, { stdin: Readable.from([`${ackLine(source, target)}\n`]), stdout: capture().stream }).run("doctor", { targetRoot, acceptPreserved: "opencode.json" });
  const manifest = JSON.parse(fs.readFileSync(path.join(targetRoot, ".oak", "manifest.json"), "utf8"));
  assert.equal(manifest.owned_files.length, 0);
  assert.equal(manifest.preserved_files[0].observed_sha256, target.sha256);
  assert.equal(manifest.preserved_files[0].source_sha256, source.sha256);
});

test("[S055] acknowledgement of a non-preserved path fails closed", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "lead\n");
  await managerFixture(sourceRoot).run("install", { targetRoot });
  const result = await managerFixture(sourceRoot, { stdin: Readable.from([]), stdout: capture().stream }).run("doctor", { targetRoot, acceptPreserved: "agents/lead.md" });
  assert.equal(result.exitCode, 2);
});

test("[S056] source change after acknowledgement is merge-pending again", async (t) => {
  const { sourceRoot, targetRoot, source, target } = preservedFixture(t);
  const manager = managerFixture(sourceRoot, { stdin: Readable.from([`${ackLine(source, target)}\n`]), stdout: capture().stream });
  await manager.run("doctor", { targetRoot, acceptPreserved: "opencode.json" });
  fs.writeFileSync(path.join(sourceRoot, "opencode.json"), "new source\n");
  assert.equal((await manager.run("doctor", { targetRoot })).exitCode, 1);
});

test("[S057] user change after acknowledgement remains user-only evolution", async (t) => {
  const { sourceRoot, targetRoot, source, target } = preservedFixture(t);
  const manager = managerFixture(sourceRoot, { stdin: Readable.from([`${ackLine(source, target)}\n`]), stdout: capture().stream });
  await manager.run("doctor", { targetRoot, acceptPreserved: "opencode.json" });
  fs.writeFileSync(path.join(targetRoot, "opencode.json"), "new user\n");
  assert.equal((await manager.run("doctor", { targetRoot })).exitCode, 0);
});

test("[S068] adoption changes ownership without rewriting the existing file", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "same\n");
  put(targetRoot, "agents/lead.md", "same\n");
  const before = fs.statSync(path.join(targetRoot, "agents/lead.md")).mtimeMs;
  await managerFixture(sourceRoot).run("install", { targetRoot });
  assert.equal(fs.statSync(path.join(targetRoot, "agents/lead.md")).mtimeMs, before);
});

test("[S069] rollback of adoption removes ownership without deleting the file", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "same\n");
  put(targetRoot, "agents/lead.md", "same\n");
  const manager = managerFixture(sourceRoot);
  await manager.run("install", { targetRoot });
  await manager.run("rollback", { targetRoot });
  assert.equal(fs.readFileSync(path.join(targetRoot, "agents/lead.md"), "utf8"), "same\n");
});

test("[S070] preservation creates no filesystem operation or backup", async (t) => {
  const { sourceRoot, targetRoot } = preservedFixture(t);
  fs.rmSync(path.join(targetRoot, ".oak"), { recursive: true });
  const result = await managerFixture(sourceRoot).run("install", { targetRoot });
  assert.deepEqual(result.transaction.operations, []);
  assert.deepEqual(fs.readdirSync(path.join(targetRoot, ".oak", "rollback", "files")), []);
});

test("[S071] rollback of preservation restores metadata without changing user bytes", async (t) => {
  const { sourceRoot, targetRoot } = preservedFixture(t);
  fs.rmSync(path.join(targetRoot, ".oak"), { recursive: true });
  const before = fs.readFileSync(path.join(targetRoot, "opencode.json"));
  const manager = managerFixture(sourceRoot);
  await manager.run("install", { targetRoot });
  await manager.run("rollback", { targetRoot });
  assert.deepEqual(fs.readFileSync(path.join(targetRoot, "opencode.json")), before);
});

test("[S077] manifest-only adoption commits and rolls back with zero operations", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "same\n");
  put(targetRoot, "agents/lead.md", "same\n");
  const manager = managerFixture(sourceRoot);
  const installed = await manager.run("install", { targetRoot });
  assert.deepEqual(installed.transaction.operations, []);
  assert.equal((await manager.run("rollback", { targetRoot })).exitCode, 0);
});

test("[S078] acknowledgement is a rollbackable manifest-only transaction", async (t) => {
  const { sourceRoot, targetRoot, source, target } = preservedFixture(t);
  const manager = managerFixture(sourceRoot, { stdin: Readable.from([`${ackLine(source, target)}\n`]), stdout: capture().stream });
  const result = await manager.run("doctor", { targetRoot, acceptPreserved: "opencode.json" });
  assert.deepEqual(result.transaction.operations, []);
  assert.equal((await manager.run("rollback", { targetRoot })).exitCode, 0);
});

test("[S084] case-equivalent target relationships are rejected on case-insensitive filesystems", (t) => {
  const { sourceRoot } = makeFixture(t);
  const upper = sourceRoot.toUpperCase();
  if (upper === sourceRoot || !fs.existsSync(upper)) return t.skip("fixture filesystem is case-sensitive");
  assert.throws(() => assertSafeTarget({ targetRoot: upper, repositoryRoot: path.dirname(sourceRoot), sourceRoot }), /source payload/i);
});

test("[S090] path-only authorization cannot acknowledge preserved state", async (t) => {
  const { sourceRoot, targetRoot } = preservedFixture(t);
  const result = await managerFixture(sourceRoot, { stdin: Readable.from(["opencode.json\n"]), stdout: capture().stream }).run("doctor", { targetRoot, acceptPreserved: "opencode.json" });
  assert.equal(result.exitCode, 1);
});

test("[S091] any mismatched ACK tuple field is rejected", async (t) => {
  const { sourceRoot, targetRoot, source, target } = preservedFixture(t);
  const bad = ackLine(source, target).replace(" 0600 ", " 0644 ");
  const result = await managerFixture(sourceRoot, { stdin: Readable.from([`${bad}\n`]), stdout: capture().stream }).run("doctor", { targetRoot, acceptPreserved: "opencode.json" });
  assert.equal(result.exitCode, 1);
});

test("[S099] rollback of install restores manifest absence", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "lead\n");
  const manager = managerFixture(sourceRoot);
  await manager.run("install", { targetRoot });
  await manager.run("rollback", { targetRoot });
  assert.equal(fs.existsSync(path.join(targetRoot, ".oak", "manifest.json")), false);
});

test("[S100] rollback of uninstall restores the prior manifest", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "lead\n");
  const manager = managerFixture(sourceRoot);
  await manager.run("install", { targetRoot });
  const before = fs.readFileSync(path.join(targetRoot, ".oak", "manifest.json"));
  await manager.run("uninstall", { targetRoot, yes: true });
  await manager.run("rollback", { targetRoot });
  assert.deepEqual(fs.readFileSync(path.join(targetRoot, ".oak", "manifest.json")), before);
});

test("[S131] committed rollback rejects manifest presence mismatch before inverse writes", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "lead\n");
  const manager = managerFixture(sourceRoot);
  await manager.run("install", { targetRoot });
  fs.unlinkSync(path.join(targetRoot, ".oak", "manifest.json"));
  const result = await manager.run("rollback", { targetRoot });
  assert.equal(result.exitCode, 1);
  assert.equal(fs.existsSync(path.join(targetRoot, "agents/lead.md")), true);
});

test("[S132] committed rollback rejects wrong current manifest digest", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "lead\n");
  const manager = managerFixture(sourceRoot);
  await manager.run("install", { targetRoot });
  const manifest = JSON.parse(fs.readFileSync(path.join(targetRoot, ".oak", "manifest.json"), "utf8"));
  manifest.updated_at = "2026-07-21T00:00:00.000Z";
  fs.writeFileSync(path.join(targetRoot, ".oak", "manifest.json"), canonicalManifestBytes(manifest));
  const result = await manager.run("rollback", { targetRoot });
  assert.equal(result.exitCode, 1);
  assert.equal(fs.existsSync(path.join(targetRoot, "agents/lead.md")), true);
});

test("[S029] interruption after managed rename but before progress publication remains recoverable", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "new\n");
  put(targetRoot, "agents/lead.md", "old\n");
  await managerFixture(sourceRoot, {
    transactionId: () => "tx-interrupted",
    failpoint(name) { if (name === "after-operation-write-before-progress") throw new Error("lost parent fsync acknowledgement"); },
  }).run("install", { targetRoot, force: true });
  assert.equal(fs.readFileSync(path.join(targetRoot, "agents/lead.md"), "utf8"), "new\n");
  const result = await managerFixture(sourceRoot).run("rollback", { targetRoot });
  assert.equal(result.exitCode, 0);
  assert.equal(fs.readFileSync(path.join(targetRoot, "agents/lead.md"), "utf8"), "old\n");
});

test("[S030] failure while publishing a new rollback point preserves the previous point", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "v1\n");
  await managerFixture(sourceRoot, { transactionId: () => "tx-install" }).run("install", { targetRoot });
  const prior = fs.readFileSync(path.join(targetRoot, ".oak", "rollback", "transaction.json"));
  put(sourceRoot, "agents/lead.md", "v2\n");
  await managerFixture(sourceRoot, {
    transactionId: () => "tx-upgrade",
    failpoint(name) { if (name === "after-rollback-publication") throw new Error("crash"); },
  }).run("upgrade", { targetRoot });
  const recovered = await managerFixture(sourceRoot).run("rollback", { targetRoot });
  assert.equal(recovered.exitCode, 0);
  assert.deepEqual(fs.readFileSync(path.join(targetRoot, ".oak", "rollback", "transaction.json")), prior);
  assert.equal(fs.readFileSync(path.join(targetRoot, "agents/lead.md"), "utf8"), "v1\n");
});

test("[S048] bootstrap removal interruption still completes required sync and zero-state cleanup", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "lead\n");
  const seen = [];
  await managerFixture(sourceRoot, {
    failpoint(name) {
      seen.push(name);
      if (name === "before-journal-create" || name === "after-bootstrap-oak-rmdir") throw new Error(name);
    },
  }).run("install", { targetRoot });
  assert.equal(seen.includes("after-bootstrap-oak-rmdir"), true);
  assert.equal(fs.existsSync(targetRoot), false);
});

test("[S050] recovery resumes only remaining inverse operations after interruption", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "new\n");
  put(targetRoot, "agents/lead.md", "old\n");
  await managerFixture(sourceRoot, {
    transactionId: () => "tx-forward",
    failpoint(name) { if (name === "after-operation-progress") throw new Error("forward crash"); },
  }).run("install", { targetRoot, force: true });
  const firstRecovery = await managerFixture(sourceRoot, {
    failpoint(name) { if (name === "after-inverse-write-before-progress") throw new Error("inverse crash"); },
  }).run("rollback", { targetRoot });
  assert.equal(firstRecovery.exitCode, 2);
  const resumed = await managerFixture(sourceRoot).run("rollback", { targetRoot });
  assert.equal(resumed.exitCode, 0);
  assert.equal(fs.readFileSync(path.join(targetRoot, "agents/lead.md"), "utf8"), "old\n");
});

test("[S051] interrupted committed rollback resumes with matching rollback lock snapshot", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "lead\n");
  const manager = managerFixture(sourceRoot, { transactionId: () => "tx-install" });
  await manager.run("install", { targetRoot });
  const interrupted = await managerFixture(sourceRoot, {
    failpoint(name) { if (name === "after-rollback-journal") throw new Error("rollback crash"); },
  }).run("rollback", { targetRoot });
  assert.equal(interrupted.exitCode, 2);
  const active = JSON.parse(fs.readFileSync(path.join(targetRoot, ".oak", "transaction.json"), "utf8"));
  const lock = JSON.parse(fs.readFileSync(path.join(targetRoot, ".oak", "lock.json"), "utf8"));
  assert.equal(active.lock.transaction_id, lock.transaction_id);
  assert.equal(active.lock.command, "rollback");
  assert.equal((await managerFixture(sourceRoot).run("rollback", { targetRoot })).exitCode, 0);

  const successor = makeFixture(t);
  put(successor.sourceRoot, "agents/lead.md", "lead\n");
  await managerFixture(successor.sourceRoot, {
    transactionId: () => "tx-successor",
    failpoint(name) { if (name === "after-journal-create") throw new Error("forward crash"); },
  }).run("install", { targetRoot: successor.targetRoot });
  const successorLock = {
    transaction_id: "tx-successor",
    pid: 9876,
    command: "rollback",
    created_at: "2026-07-20T00:01:00.000Z",
  };
  fs.writeFileSync(path.join(successor.targetRoot, ".oak", "lock.json"), `${JSON.stringify(successorLock)}\n`);
  const recovered = await managerFixture(successor.sourceRoot, { pidProbe: () => ({ alive: false, code: "ESRCH" }) }).run("rollback", {
    targetRoot: successor.targetRoot,
  });
  assert.equal(recovered.exitCode, 0);
  assert.equal(fs.existsSync(path.join(successor.targetRoot, ".oak", "transaction.json")), false);
});

test("[S053] acknowledgement aborts when target changes after confirmation", async (t) => {
  const { sourceRoot, targetRoot, source, target } = preservedFixture(t);
  const result = await managerFixture(sourceRoot, {
    stdin: Readable.from([`${ackLine(source, target)}\n`]), stdout: capture().stream,
    failpoint(name) { if (name === "after-ack-confirmation") fs.writeFileSync(path.join(targetRoot, "opencode.json"), "race\n"); },
  }).run("doctor", { targetRoot, acceptPreserved: "opencode.json" });
  assert.equal(result.exitCode, 1);
});

test("[S054] acknowledgement aborts when source changes after confirmation", async (t) => {
  const { sourceRoot, targetRoot, source, target } = preservedFixture(t);
  const result = await managerFixture(sourceRoot, {
    stdin: Readable.from([`${ackLine(source, target)}\n`]), stdout: capture().stream,
    failpoint(name) { if (name === "after-ack-confirmation") fs.writeFileSync(path.join(sourceRoot, "opencode.json"), "race\n"); },
  }).run("doctor", { targetRoot, acceptPreserved: "opencode.json" });
  assert.equal(result.exitCode, 1);
});

test("[S058] interrupted-forward recovery resolves backup only from rollback.next", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "new\n");
  put(targetRoot, "agents/lead.md", "old\n");
  await managerFixture(sourceRoot, {
    transactionId: () => "tx-forward",
    failpoint(name) { if (name === "after-operation-progress") throw new Error("crash"); },
  }).run("install", { targetRoot, force: true });
  fs.mkdirSync(path.join(targetRoot, ".oak", "rollback", "files"), { recursive: true });
  fs.writeFileSync(path.join(targetRoot, ".oak", "rollback", "files", "000000"), "wrong-root\n");
  await managerFixture(sourceRoot).run("rollback", { targetRoot });
  assert.equal(fs.readFileSync(path.join(targetRoot, "agents/lead.md"), "utf8"), "old\n");
});

test("[S059] committed rollback resolves backup only from rollback", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "new\n");
  put(targetRoot, "agents/lead.md", "old\n");
  const manager = managerFixture(sourceRoot);
  await manager.run("install", { targetRoot, force: true });
  fs.mkdirSync(path.join(targetRoot, ".oak", "rollback.next", "files"), { recursive: true });
  fs.writeFileSync(path.join(targetRoot, ".oak", "rollback.next", "files", "000000"), "wrong-root\n");
  await manager.run("rollback", { targetRoot });
  assert.equal(fs.readFileSync(path.join(targetRoot, "agents/lead.md"), "utf8"), "old\n");
});

test("[S060] inconsistent rollback origin and status fail validation", () => {
  const transaction = validTransaction();
  transaction.status = "rolling-back";
  transaction.rollback_origin = "none";
  assert.throws(() => validateTransaction(transaction), /status.*rollback_origin/i);
});

test("[S093] post-commit residue never supersedes the active rollback point", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "lead\n");
  const committed = await managerFixture(sourceRoot, {
    failpoint(name) { if (name === "after-commit-boundary") throw new Error("cleanup crash"); },
  }).run("install", { targetRoot });
  assert.equal(committed.exitCode, 2);
  const doctor = await managerFixture(sourceRoot).run("doctor", { targetRoot });
  assert.equal(doctor.exitCode, 1);
  assert.equal(doctor.report.rollbackAvailable, true);
  assert.equal((await managerFixture(sourceRoot).run("rollback", { targetRoot })).exitCode, 0);
  assert.equal(fs.existsSync(path.join(targetRoot, "agents/lead.md")), false);
});

test("[S101] recovery rejects manifest presence when recorded phase expects absence", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "lead\n");
  await managerFixture(sourceRoot, { failpoint(name) { if (name === "after-journal-create") throw new Error("crash"); } }).run("install", { targetRoot });
  const journal = JSON.parse(fs.readFileSync(path.join(targetRoot, ".oak", "transaction.json"), "utf8"));
  fs.writeFileSync(path.join(targetRoot, ".oak", "manifest.json"), canonicalManifestBytes(journal.next_manifest));
  assert.equal((await managerFixture(sourceRoot).run("rollback", { targetRoot })).exitCode, 2);
});

test("[S102] recovery rejects manifest absence when recorded phase expects presence", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "v1\n");
  await managerFixture(sourceRoot).run("install", { targetRoot });
  put(sourceRoot, "agents/lead.md", "v2\n");
  await managerFixture(sourceRoot, { transactionId: () => "tx-upgrade", failpoint(name) { if (name === "after-journal-create") throw new Error("crash"); } }).run("upgrade", { targetRoot });
  fs.unlinkSync(path.join(targetRoot, ".oak", "manifest.json"));
  assert.equal((await managerFixture(sourceRoot).run("rollback", { targetRoot })).exitCode, 2);
});

test("[S133] recovery rejects wrong canonical manifest digest for its recorded phase", async (t) => {
  const { sourceRoot, targetRoot } = makeFixture(t);
  put(sourceRoot, "agents/lead.md", "v1\n");
  await managerFixture(sourceRoot).run("install", { targetRoot });
  put(sourceRoot, "agents/lead.md", "v2\n");
  await managerFixture(sourceRoot, { transactionId: () => "tx-upgrade", failpoint(name) { if (name === "after-journal-create") throw new Error("crash"); } }).run("upgrade", { targetRoot });
  const manifest = JSON.parse(fs.readFileSync(path.join(targetRoot, ".oak", "manifest.json"), "utf8"));
  manifest.updated_at = "2026-07-22T00:00:00.000Z";
  fs.writeFileSync(path.join(targetRoot, ".oak", "manifest.json"), canonicalManifestBytes(manifest));
  assert.equal((await managerFixture(sourceRoot).run("rollback", { targetRoot })).exitCode, 2);
});

export { deterministicDeps, makeFixture };
