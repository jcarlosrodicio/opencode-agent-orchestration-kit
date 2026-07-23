import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  parseChecksumFile,
  smokeTarball,
  validateArchiveEntries,
  validatePackedFileSet,
} from "./package-smoke.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const HASH = "a".repeat(64);
const BASENAME = "opencode-agent-orchestration-kit-1.0.28.tgz";
const REQUIRED = [
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

test("parseChecksumFile accepts one canonical lowercase SHA-256 line", () => {
  assert.equal(parseChecksumFile(`${HASH}  ${BASENAME}\n`, BASENAME), HASH);
});

for (const [label, contents] of [
  ["malformed", `SHA256 (${BASENAME}) = ${HASH}\n`],
  ["uppercase", `${HASH.toUpperCase()}  ${BASENAME}\n`],
  ["single separator", `${HASH} ${BASENAME}\n`],
  ["multiple", `${HASH}  ${BASENAME}\n${HASH}  other.tgz\n`],
  ["pathful", `${HASH}  dist/${BASENAME}\n`],
]) {
  test(`parseChecksumFile rejects ${label} checksum content`, () => {
    assert.throws(() => parseChecksumFile(contents, BASENAME), /checksum/i);
  });
}

test("parseChecksumFile rejects a checksum for a different basename", () => {
  assert.throws(() => parseChecksumFile(`${HASH}  other.tgz\n`, BASENAME), /basename/i);
});

test("validateArchiveEntries accepts regular files and directories below package root", () => {
  validateArchiveEntries(
    ["package/", "package/package.json"],
    ["drwxr-xr-x fixture", "-rw-r--r-- fixture"],
  );
});

for (const [label, name] of [
  ["absolute paths", "/package/package.json"],
  ["traversal", "package/../escape"],
  ["wrong roots", "other/package.json"],
]) {
  test(`validateArchiveEntries rejects ${label}`, () => {
    assert.throws(() => validateArchiveEntries([name], ["-rw-r--r-- fixture"]), /archive/i);
  });
}

for (const [label, type] of [
  ["symbolic links", "l"],
  ["hard links", "h"],
  ["character devices", "c"],
  ["block devices", "b"],
]) {
  test(`validateArchiveEntries rejects ${label}`, () => {
    assert.throws(
      () => validateArchiveEntries(["package/unsafe"], [`${type}rw-r--r-- fixture`]),
      /archive entry type/i,
    );
  });
}

test("validateArchiveEntries rejects a name without a corresponding verbose type", () => {
  assert.throws(
    () => validateArchiveEntries(["package/package.json"], []),
    /listing.*disagree/i,
  );
});

test("validatePackedFileSet accepts representative public package files", () => {
  validatePackedFileSet(REQUIRED);
});

test("validatePackedFileSet reports a missing required representative", () => {
  assert.throws(
    () => validatePackedFileSet(REQUIRED.filter((name) => name !== "package/opencode/package-lock.json")),
    /opencode\/package-lock\.json/,
  );
});

for (const forbidden of [
  "package/.env",
  "package/config/.env.production",
  "package/npm-token.credentials",
  "package/.git/config",
  "package/.github/workflows/publish.yml",
  "package/.oak/manifest.json",
  "package/opencode/node_modules/module/index.js",
  "package/.cache/result",
  "package/cache/result",
  "package/dist/release.tgz",
]) {
  test(`validatePackedFileSet rejects forbidden state ${forbidden}`, () => {
    assert.throws(() => validatePackedFileSet([...REQUIRED, forbidden]), /forbidden/i);
  });
}

for (const ignoredMetadata of [
  "package/.gitignore",
  "package/nested/.gitignore",
  "package/.npmignore",
  "package/nested/.npmignore",
]) {
  test(`validatePackedFileSet rejects ignored package metadata ${ignoredMetadata}`, () => {
    assert.throws(() => validatePackedFileSet([...REQUIRED, ignoredMetadata]), /forbidden/i);
  });
}

test("smokeTarball validates both archive listings before extraction", async () => {
  const calls = [];
  await assert.rejects(
    smokeTarball({
      repositoryRoot: ROOT,
      tarball: "/public/opencode-agent-orchestration-kit-1.0.28.tgz",
      captureTarball(_source, destination) {
        fs.writeFileSync(destination, "fixture");
        return { size: 1 };
      },
      hashFile: () => ({ sha256: HASH, sha1: "b".repeat(40), sha512: "c".repeat(128) }),
      run(command, args) {
        calls.push([command, ...args]);
        if (args.includes("-tzf")) return { stdout: "package/../escape\n" };
        if (args.includes("-tvzf")) return { stdout: "-rw-r--r-- fixture\n" };
        throw new Error("extraction must not run");
      },
    }),
    /archive/i,
  );
  assert.deepEqual(calls.map((call) => call.slice(0, 2)), [["tar", "-tzf"], ["tar", "-tvzf"]]);
});

test("the wrapper smokes a packed tarball and verifies checksum before extraction", { timeout: 180_000 }, () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "package-smoke-integration-"));
  try {
    const packed = spawnSync("npm", ["pack", "--json", "--pack-destination", temp], {
      cwd: ROOT,
      encoding: "utf8",
    });
    assert.equal(packed.status, 0, packed.stderr);
    const entries = JSON.parse(packed.stdout);
    assert.equal(entries.length, 1);
    const tarball = path.join(temp, entries[0].filename);

    const direct = spawnSync("bash", ["scripts/package-smoke.sh", tarball], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 120_000,
    });
    assert.equal(direct.status, 0, direct.stderr);
    const evidence = JSON.parse(direct.stdout);
    assert.equal(evidence.basename, path.basename(tarball));
    assert.match(evidence.sha256, /^[0-9a-f]{64}$/);

    const checksum = path.join(temp, "SHA256SUMS");
    fs.writeFileSync(checksum, `${evidence.sha256}  ${path.basename(tarball)}\n`);
    const verified = spawnSync("bash", ["scripts/package-smoke.sh", "--checksum", checksum, tarball], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 120_000,
    });
    assert.equal(verified.status, 0, verified.stderr);

    const corruptHash = `${evidence.sha256[0] === "0" ? "1" : "0"}${evidence.sha256.slice(1)}`;
    fs.writeFileSync(checksum, `${corruptHash}  ${path.basename(tarball)}\n`);
    const rejected = spawnSync("bash", ["scripts/package-smoke.sh", "--checksum", checksum, tarball], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 120_000,
    });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /checksum mismatch/i);
    assert.equal(rejected.stdout, "");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("smokeTarball is unaffected when the original tarball changes between validation phases", { timeout: 180_000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "package-smoke-snapshot-test-"));
  try {
    const packed = spawnSync("npm", ["pack", "--json", "--pack-destination", temp], {
      cwd: ROOT,
      encoding: "utf8",
    });
    assert.equal(packed.status, 0, packed.stderr);
    const entries = JSON.parse(packed.stdout);
    assert.equal(entries.length, 1);
    const tarball = path.join(temp, entries[0].filename);
    const originalHash = crypto.createHash("sha256").update(fs.readFileSync(tarball)).digest("hex");
    const tarInputs = [];

    const evidence = await smokeTarball({
      repositoryRoot: ROOT,
      tarball,
      run(command, args, options = {}) {
        const result = spawnSync(command, args, {
          cwd: options.cwd,
          env: options.env,
          encoding: "utf8",
          maxBuffer: 16 * 1024 * 1024,
        });
        if (result.status !== 0) throw new Error(options.label ?? `${command} failed`);
        if (command === "tar") {
          tarInputs.push(args[1]);
          if (args.includes("-tvzf")) fs.writeFileSync(tarball, "replaced after verbose listing\n");
        }
        return { stdout: result.stdout, stderr: result.stderr };
      },
    });

    assert.equal(evidence.sha256, originalHash);
    assert.notEqual(
      crypto.createHash("sha256").update(fs.readFileSync(tarball)).digest("hex"),
      originalHash,
    );
    assert.equal(tarInputs.length, 3);
    assert.ok(tarInputs.every((input) => input !== tarball));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("smokeTarball rejects archive listing failure without extracting", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "package-smoke-broken-"));
  try {
    const tarball = path.join(temp, BASENAME);
    fs.writeFileSync(tarball, crypto.randomBytes(32));
    await assert.rejects(smokeTarball({ repositoryRoot: ROOT, tarball }), /archive listing failed/i);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
