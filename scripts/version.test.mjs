import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  checkVersionContract,
  compareStableVersions,
  formatVersion,
  parseStableVersion,
  readCanonicalVersion,
} from "./version.mjs";

const REPOSITORY_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function makeRepository(t, packageOverrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oak-version-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "package.json"), `${JSON.stringify({
    name: "opencode-agent-orchestration-kit",
    version: "1.0.27",
    ...packageOverrides,
  }, null, 2)}\n`);
  return root;
}

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

function write(root, relative, contents) {
  const fullPath = path.join(root, relative);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, contents);
}

function makeContractRepository(t, overrides = {}) {
  const root = makeRepository(t);
  write(root, "docs/releases/v1.0.27.md", [
    "# v1.0.27 - Safe lifecycle and canonical release identity",
    "",
    "## Highlights",
    "",
    "## Installation or upgrade",
    "",
    "## Migration",
    "",
    "## Validation performed",
    "",
    "## Public safety boundary",
    "",
  ].join("\n"));
  write(root, "opencode/package.json", "{\"private\":true}\n");
  for (const relative of OPERATIONAL_VERSION_SURFACES) write(root, relative, "canonical consumer\n");
  for (const [relative, contents] of Object.entries(overrides)) {
    const fullPath = path.join(root, relative);
    if (contents === null) fs.rmSync(fullPath, { force: true });
    else write(root, relative, contents);
  }
  return root;
}

test("[V001] canonical package identity is read and formatted", (t) => {
  const root = makeRepository(t);
  assert.equal(readCanonicalVersion(root), "1.0.27");
  assert.equal(formatVersion("1.0.27"), "opencode-agent-orchestration-kit 1.0.27");
  assert.throws(() => readCanonicalVersion(makeRepository(t, { name: "other" })), /package name/i);
});

test("[V002] non-canonical stable versions are rejected", () => {
  for (const value of [
    "v1.0.27", "01.0.27", "1.0", "1.0.0-rc.1", "1.0.0+build",
    " 1.0.27", "1.0.27 ", "-1.0.0", "9007199254740992.0.0",
  ]) {
    assert.throws(() => parseStableVersion(value), /version/i, value);
  }
});

test("[V003] stable version comparison is numeric", () => {
  assert.equal(compareStableVersions("1.9.9", "1.10.0"), -1);
  assert.equal(compareStableVersions("1.10.0", "1.9.9"), 1);
  assert.equal(compareStableVersions("1.0.27", "1.0.27"), 0);
});

function run(command, args, env = {}) {
  return spawnSync(command, args, {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("[V004] direct version entrypoints are exact and mutation-free", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "oak-version-home-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const target = path.join(home, ".config", "opencode");
  for (const args of [["scripts/version.mjs"], ["scripts/manage-installation.mjs", "--version"]]) {
    const result = run(process.execPath, args, { HOME: home });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "opencode-agent-orchestration-kit 1.0.29\n");
    assert.equal(fs.existsSync(target), false);
  }
});

test("[V005] all lifecycle wrappers expose the canonical version", () => {
  for (const wrapper of ["install.sh", "upgrade.sh", "doctor.sh", "uninstall.sh", "rollback.sh"]) {
    const result = run(path.join(REPOSITORY_ROOT, wrapper), ["--version"]);
    assert.equal(result.status, 0, `${wrapper}: ${result.stderr}`);
    assert.equal(result.stdout, "opencode-agent-orchestration-kit 1.0.29\n", wrapper);
  }
});

test("[V006] version cannot be combined with lifecycle arguments", () => {
  for (const args of [
    ["scripts/manage-installation.mjs", "--version", "--target", "/tmp/x"],
    ["scripts/manage-installation.mjs", "install", "--version", "--dry-run"],
  ]) {
    const result = run(process.execPath, args);
    assert.equal(result.status, 2);
  }
});

test("[V007] the current release note path and first heading are required", (t) => {
  assert.equal(checkVersionContract({ repositoryRoot: makeContractRepository(t) }).version, "1.0.27");
  assert.throws(() => checkVersionContract({
    repositoryRoot: makeContractRepository(t, { "docs/releases/v1.0.27.md": null }),
  }), /release note/i);
  assert.throws(() => checkVersionContract({
    repositoryRoot: makeContractRepository(t, { "docs/releases/v1.0.27.md": "# wrong\n" }),
  }), /heading/i);
  assert.throws(() => checkVersionContract({
    repositoryRoot: makeContractRepository(t, {
      "docs/releases/v1.0.27.md": "# v1.0.27 - Safe lifecycle and canonical release identity\n\n## Highlights\n",
    }),
  }), /required section/i);
  const historicalGap = makeContractRepository(t);
  write(historicalGap, "docs/releases/v1.0.25.md", "# historical\n");
  assert.doesNotThrow(() => checkVersionContract({ repositoryRoot: historicalGap }));
});

test("[V008] competing declarations fail on every allowlisted operational surface", async (t) => {
  const declarations = [
    ["VERSION", "1.0.27\n"],
    ["opencode/package.json", "{\"private\":true,\"version\":\"1.0.27\"}\n"],
    ...OPERATIONAL_VERSION_SURFACES.map((relative) => [relative, "const duplicate = '1.0.27'\n"]),
  ];
  for (const [relative, contents] of declarations) {
    await t.test(relative, (child) => {
      const root = makeContractRepository(child, { [relative]: contents });
      assert.throws(() => checkVersionContract({ repositoryRoot: root }), /version|declaration/i);
    });
  }
});

test("[V009] tag validation accepts only the matching canonical v-tag", (t) => {
  const root = makeContractRepository(t);
  assert.equal(checkVersionContract({ repositoryRoot: root, tag: "v1.0.27" }).tag, "v1.0.27");
  for (const tag of ["v1.0.26", "1.0.27", "v01.0.27", "v1.0.27-rc.1"]) {
    assert.throws(() => checkVersionContract({ repositoryRoot: root, tag }), /tag/i, tag);
  }
});

test("[V010] CI keeps branch and PR checks and adds tag-only validation", () => {
  const workflow = fs.readFileSync(path.join(REPOSITORY_ROOT, ".github", "workflows", "check.yml"), "utf8");
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /branches:\s*\n\s*- master/);
  assert.match(workflow, /tags:\s*\n\s*- ["']v\*["']/);
  assert.match(workflow, /startsWith\(github\.ref, 'refs\/tags\/'\)/);
  assert.match(workflow, /version\.mjs --check-tag \"\$GITHUB_REF_NAME\"/);
});

test("[V011] workflow remains non-publishing and scenario IDs are unique", () => {
  const workflow = fs.readFileSync(path.join(REPOSITORY_ROOT, ".github", "workflows", "check.yml"), "utf8");
  for (const expected of ["Contract check", "Unit and script tests", "Install OpenCode tool dependencies", "Audit OpenCode tool dependencies", "Typecheck TUI token plugin", "Installation smoke"]) {
    assert.match(workflow, new RegExp(`name: ${expected}`));
  }
  assert.doesNotMatch(workflow, /contents:\s*write|create-release|softprops|gh release|git push/i);

  const sources = ["scripts/version.test.mjs", "scripts/manage-installation.test.mjs"]
    .map((relative) => fs.readFileSync(path.join(REPOSITORY_ROOT, relative), "utf8"))
    .join("\n");
  const ids = [...sources.matchAll(/\[V(\d{3})\]/g)].map((match) => Number(match[1]));
  assert.deepEqual(ids.sort((left, right) => left - right), Array.from({ length: 28 }, (_, index) => index + 1));
});

test("[V028] only the marked OpenCode boundary section may declare non-kit stable versions", async (t) => {
  const workflow = `name: Check
jobs:
  # opencode-boundaries:start
  opencode-compatibility:
    strategy:
      matrix:
        opencode:
          - "1.14.41"
          - "1.18.4"
  # opencode-boundaries:end
`;

  assert.doesNotThrow(() => checkVersionContract({
    repositoryRoot: makeContractRepository(t, { ".github/workflows/check.yml": workflow }),
  }));

  for (const [label, contents] of [
    ["outside the section", `${workflow}env:\n  OTHER_VERSION: "9.8.7"\n`],
    [
      "without markers",
      workflow
        .replace("  # opencode-boundaries:start\n", "")
        .replace("  # opencode-boundaries:end\n", ""),
    ],
    [
      "with a duplicated marker",
      workflow.replace(
        "  # opencode-boundaries:start",
        "  # opencode-boundaries:start\n  # opencode-boundaries:start",
      ),
    ],
    [
      "with markers out of order",
      workflow
        .replace("# opencode-boundaries:start", "# opencode-boundaries:temporary")
        .replace("# opencode-boundaries:end", "# opencode-boundaries:start")
        .replace("# opencode-boundaries:temporary", "# opencode-boundaries:end"),
    ],
  ]) {
    await t.test(label, (child) => {
      const root = makeContractRepository(child, { ".github/workflows/check.yml": contents });
      assert.throws(
        () => checkVersionContract({ repositoryRoot: root }),
        /competing stable version declaration/,
      );
    });
  }
});
