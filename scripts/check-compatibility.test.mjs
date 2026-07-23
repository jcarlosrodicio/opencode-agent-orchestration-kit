import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { checkCompatibility } from "./check-compatibility.mjs";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const VALID_COMPATIBILITY = {
  schema_version: 1,
  node: {
    engines: "^22.9.0 || ^24.0.0",
    blocking_majors: [22, 24],
    canary_major: 26,
  },
  opencode: {
    supported_range: ">=1.14.41 <2.0.0",
    minimum_tested: "1.14.41",
    stable_tested: "1.18.4",
    canary: "latest",
  },
  sdk: {
    opencode_plugin: "1.14.41",
    opentui_core: "0.2.5",
    opentui_solid: "0.2.5",
  },
};

const REVISED_COMPATIBILITY = {
  schema_version: 1,
  node: {
    engines: "^22.10.0 || ^25.0.0",
    blocking_majors: [22, 25],
    canary_major: 27,
  },
  opencode: {
    supported_range: ">=1.15.0 <2.0.0",
    minimum_tested: "1.15.0",
    stable_tested: "1.19.0",
    canary: "latest",
  },
  sdk: {
    opencode_plugin: "1.15.0",
    opentui_core: "0.3.0",
    opentui_solid: "0.3.0",
  },
};

const ROOT_PACKAGE = {
  name: "opencode-agent-orchestration-kit",
  engines: { node: VALID_COMPATIBILITY.node.engines },
  scripts: {
    "check:supply-chain": "node scripts/check-supply-chain.mjs",
    "dependency-audit": "npm --prefix opencode audit --omit=dev --audit-level=low",
    "dependency-signature-audit": "npm --prefix opencode audit signatures",
    "installation-smoke": "bash scripts/install-smoke.sh",
    "package-smoke": "bash scripts/package-smoke.sh",
    "check:release": "npm --prefix opencode ci --ignore-scripts && npm run check && npm run typecheck && npm run dependency-audit && npm run dependency-signature-audit && npm run installation-smoke && npm run package-smoke",
  },
};

const PACKAGED_PACKAGE = {
  engines: { node: VALID_COMPATIBILITY.node.engines },
  dependencies: {
    "@opencode-ai/plugin": VALID_COMPATIBILITY.sdk.opencode_plugin,
    "@opentui/core": VALID_COMPATIBILITY.sdk.opentui_core,
    "@opentui/solid": VALID_COMPATIBILITY.sdk.opentui_solid,
  },
};

const PACKAGED_LOCK = {
  lockfileVersion: 3,
  packages: {
    "": {
      engines: { node: VALID_COMPATIBILITY.node.engines },
      dependencies: { ...PACKAGED_PACKAGE.dependencies },
    },
  },
};

const COMPATIBILITY_MATRIX = `# Compatibility

Canonical Node engine: \`${VALID_COMPATIBILITY.node.engines}\`.

<!-- compatibility-matrix:start -->
| Surface | Status | Contract |
|---|---|---|
| Node.js 22 | supported | 22.9.0 or newer within major 22; blocking CI |
| Node.js 24 | supported | major 24; blocking CI |
| Node.js 26 | experimental | non-blocking canary only |
| Node.js 20 and EOL/odd lines | unsupported | no release guarantee |
| OpenCode 1.14.41 | tested | minimum boundary in the blocking core smoke |
| OpenCode 1.18.4 | tested | pinned stable boundary in the blocking core smoke |
| OpenCode >=1.14.41 <2.0.0 | supported | boundary-tested compatibility promise |
| OpenCode <1.14.41 or >=2.0.0 | unsupported | requires a reviewed policy change |
| \`@opencode-ai/plugin\` 1.14.41 | tested | exact pin with install, import, and typecheck evidence |
| OpenTUI core/solid 0.2.5 | tested | exact pins with install, import, and typecheck evidence |
| Ubuntu GitHub runner | tested | blocking Node 22 and 24 jobs |
| macOS GitHub runner | tested | blocking Node 24 job; runner details recorded |
| Other mainstream Linux/macOS environments | supported | Bash, Node, and OpenCode must support the host |
| WSL2 | experimental | recommended upstream path, no kit-owned runner |
| Native Windows | unsupported | Bash lifecycle wrappers have no native contract |
| Token usage plugin | experimental | compile/import is tested; runtime session-tree behavior is not stable API evidence |
| Open Design Docker adapter | experimental | optional pinned image inputs, no blocking integration smoke |
| Superpowers | experimental | optional upstream Git plugin, not part of core smoke |
| Impeccable | experimental | optional externally installed skill |
<!-- compatibility-matrix:end -->
`;

const README = "See [compatibility details](docs/compatibility.md).\n";
const INSTALLATION = `- Node.js \`${VALID_COMPATIBILITY.node.engines}\` and npm\n`;
const PROVIDER_SECRET = ["OPEN", "AI_API_KEY"].join("");

const OPENCODE_BOUNDARY_JOB = `
  # opencode-boundaries:start
  opencode-compatibility:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        include:
          - mode: core
            opencode: "1.14.41"
          - mode: core
            opencode: "1.18.4"
          - mode: default
            opencode: "1.18.4"
    steps:
      - name: Checkout
        uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6

      - name: Setup Node
        uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6
        with:
          node-version: 24

      - name: Smoke OpenCode boundary
        run: bash scripts/opencode-compat-smoke.sh "\${{ matrix.mode }}" "\${{ matrix.opencode }}"
  # opencode-boundaries:end
`;

const VALID_WORKFLOW = `name: Check

on:
  pull_request:
  push:
    branches:
      - master
    tags:
      - "v*"

permissions:
  contents: read

jobs:
  check:
    # compatibility-blocking:start
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: ubuntu-latest
            node: 22
            canonical: false
          - os: ubuntu-latest
            node: 24
            canonical: true
          - os: macos-latest
            node: 24
            canonical: false
    # compatibility-blocking:end
    runs-on: \${{ matrix.os }}
    steps:
      - name: Checkout
        uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6

      - name: Setup Node
        uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6
        with:
          node-version: \${{ matrix.node }}

      - name: Record runner evidence
        run: |
          uname -a || true
          node --version
          npm --version
          node -e 'const p=require("./opencode/package.json"); console.log(JSON.stringify({arch:process.arch,platform:process.platform,plugin:p.dependencies["@opencode-ai/plugin"],opentuiCore:p.dependencies["@opentui/core"],opentuiSolid:p.dependencies["@opentui/solid"]}))'

      - name: Validate release tag
        if: matrix.canonical && startsWith(github.ref, 'refs/tags/')
        run: node scripts/version.mjs --check-tag "$GITHUB_REF_NAME"

      - name: Contract check
        run: npm run contract-check

      - name: Unit and script tests
        run: npm run unit-and-script-tests

      - name: Install OpenCode tool dependencies
        working-directory: opencode
        run: npm ci --ignore-scripts

      - name: Audit OpenCode tool dependencies
        if: matrix.canonical
        run: npm run dependency-audit

      - name: Verify dependency signatures
        if: matrix.canonical
        run: npm run dependency-signature-audit

      - name: Typecheck TUI token plugin
        run: npm run typecheck

      - name: Installation smoke
        run: npm run installation-smoke

      - name: Smoke npm package
        if: matrix.canonical
        run: npm run package-smoke
${OPENCODE_BOUNDARY_JOB}`;

const VALID_CANARY_WORKFLOW = `name: Compatibility Canary

on:
  workflow_dispatch:
  schedule:
    - cron: "17 6 * * 1"

permissions:
  contents: read

jobs:
  # compatibility-canary:start
  latest:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6
        with:
          persist-credentials: false

      - name: Setup Node
        uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6
        with:
          node-version: 26

      - name: Smoke latest OpenCode
        run: bash scripts/opencode-compat-smoke.sh core latest
  # compatibility-canary:end
`;

const SINGLE_JOB_WORKFLOW = `name: Check
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Setup Node
        uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6
        with:
          node-version: 24
      - name: Validate release tag
        if: startsWith(github.ref, 'refs/tags/')
        run: node scripts/version.mjs --check-tag "$GITHUB_REF_NAME"
      - name: Contract check
        run: npm run contract-check
      - name: Unit and script tests
        run: npm run unit-and-script-tests
      - name: Install OpenCode tool dependencies
        working-directory: opencode
        run: npm ci --ignore-scripts
      - name: Audit OpenCode tool dependencies
        run: npm run dependency-audit
      - name: Typecheck TUI token plugin
        run: npm run typecheck
      - name: Installation smoke
        run: npm run installation-smoke
`;

function writeJson(root, relative, value) {
  const full = path.join(root, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(root, relative, value) {
  const full = path.join(root, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, value);
}

function makeFixture(t, compatibility = VALID_COMPATIBILITY) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oak-compat-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeJson(root, "compatibility.json", compatibility);
  writeJson(root, "package.json", ROOT_PACKAGE);
  writeJson(root, "opencode/package.json", PACKAGED_PACKAGE);
  writeJson(root, "opencode/package-lock.json", PACKAGED_LOCK);
  writeText(root, "docs/compatibility.md", COMPATIBILITY_MATRIX);
  writeText(root, "README.md", README);
  writeText(root, "docs/installation.md", INSTALLATION);
  writeText(root, ".github/workflows/check.yml", VALID_WORKFLOW);
  writeText(root, ".github/workflows/compatibility-canary.yml", VALID_CANARY_WORKFLOW);
  writeText(root, "scripts/install-smoke.sh", "#!/usr/bin/env bash\nnpm ci --ignore-scripts\n");
  return root;
}

function assertInvalidCompatibility(action, message) {
  assert.throws(action, (error) => {
    assert.equal(error.code, "INVALID_COMPATIBILITY");
    assert.match(error.message, message);
    return true;
  });
}

test("valid canonical compatibility schema is accepted", (t) => {
  const root = makeFixture(t);
  assert.equal(checkCompatibility(root, { surfaces: false }).schema_version, 1);
});

test("a coherent revised compatibility contract is accepted without surfaces", (t) => {
  const root = makeFixture(t, REVISED_COMPATIBILITY);
  assert.deepEqual(checkCompatibility(root, { surfaces: false }), REVISED_COMPATIBILITY);
});

test("unknown compatibility schema versions are rejected", (t) => {
  const root = makeFixture(t, { ...VALID_COMPATIBILITY, schema_version: 2 });
  assert.throws(
    () => checkCompatibility(root, { surfaces: false }),
    /schema_version must be 1/,
  );
});

test("non-canonical OpenCode boundaries are rejected", (t) => {
  const root = makeFixture(t, {
    ...VALID_COMPATIBILITY,
    opencode: { ...VALID_COMPATIBILITY.opencode, minimum_tested: "v1.14.41" },
  });
  assert.throws(
    () => checkCompatibility(root, { surfaces: false }),
    /minimum_tested must use MAJOR.MINOR.PATCH/,
  );
});

test("alternative supported OpenCode range is rejected", (t) => {
  const root = makeFixture(t, {
    ...VALID_COMPATIBILITY,
    opencode: { ...VALID_COMPATIBILITY.opencode, supported_range: ">=1.14.41 <3.0.0" },
  });
  assert.throws(
    () => checkCompatibility(root, { surfaces: false }),
    /supported_range must begin at minimum_tested and end before 2.0.0/,
  );
});

for (const [label, node, message] of [
  ["non-caret engine", { engines: ">=22", blocking_majors: [22], canary_major: 26 }, /node\.engines/],
  ["engine major drift", { engines: "^22.10.0 || ^25.0.0", blocking_majors: [22, 24], canary_major: 27 }, /blocking_majors/],
  ["duplicate blocking major", { engines: "^22.10.0 || ^22.11.0", blocking_majors: [22, 22], canary_major: 27 }, /blocking_majors/],
  ["blocking canary major", { engines: "^22.10.0 || ^25.0.0", blocking_majors: [22, 25], canary_major: 25 }, /canary_major/],
]) {
  test(`Node compatibility rejects ${label}`, (t) => {
    const root = makeFixture(t, {
      ...VALID_COMPATIBILITY,
      node,
    });
    assertInvalidCompatibility(
      () => checkCompatibility(root, { surfaces: false }),
      message,
    );
  });
}

test("root Node engine drift names the root package surface", (t) => {
  const root = makeFixture(t);
  writeJson(root, "package.json", {
    ...ROOT_PACKAGE,
    engines: { node: ">=22" },
  });

  assertInvalidCompatibility(
    () => checkCompatibility(root),
    /package\.json engines\.node must match compatibility\.json node\.engines/,
  );
});

test("packaged Node engine drift names the packaged surface", (t) => {
  const root = makeFixture(t);
  writeJson(root, "opencode/package.json", {
    ...PACKAGED_PACKAGE,
    engines: { node: ">=22" },
  });

  assertInvalidCompatibility(
    () => checkCompatibility(root),
    /opencode\/package\.json engines\.node must match compatibility\.json node\.engines/,
  );
});

test("packaged SDK plugin pin drift names the plugin dependency surface", (t) => {
  const root = makeFixture(t);
  writeJson(root, "opencode/package.json", {
    ...PACKAGED_PACKAGE,
    dependencies: {
      ...PACKAGED_PACKAGE.dependencies,
      "@opencode-ai/plugin": "1.14.42",
    },
  });

  assertInvalidCompatibility(
    () => checkCompatibility(root),
    /opencode\/package\.json dependency @opencode-ai\/plugin must match compatibility\.json sdk\.opencode_plugin/,
  );
});

test("packaged OpenTUI core pin drift names the core dependency surface", (t) => {
  const root = makeFixture(t);
  writeJson(root, "opencode/package.json", {
    ...PACKAGED_PACKAGE,
    dependencies: {
      ...PACKAGED_PACKAGE.dependencies,
      "@opentui/core": "0.2.6",
    },
  });

  assertInvalidCompatibility(
    () => checkCompatibility(root),
    /opencode\/package\.json dependency @opentui\/core must match compatibility\.json sdk\.opentui_core/,
  );
});

test("packaged OpenTUI solid pin drift names the solid dependency surface", (t) => {
  const root = makeFixture(t);
  writeJson(root, "opencode/package.json", {
    ...PACKAGED_PACKAGE,
    dependencies: {
      ...PACKAGED_PACKAGE.dependencies,
      "@opentui/solid": "0.2.6",
    },
  });

  assertInvalidCompatibility(
    () => checkCompatibility(root),
    /opencode\/package\.json dependency @opentui\/solid must match compatibility\.json sdk\.opentui_solid/,
  );
});

test("lockfile Node engine drift names the lock surface", (t) => {
  const root = makeFixture(t);
  writeJson(root, "opencode/package-lock.json", {
    ...PACKAGED_LOCK,
    packages: {
      "": { ...PACKAGED_LOCK.packages[""], engines: { node: ">=22" } },
    },
  });

  assertInvalidCompatibility(
    () => checkCompatibility(root),
    /opencode\/package-lock\.json engines\.node must match compatibility\.json node\.engines/,
  );
});

for (const [dependency, sdkField, driftedVersion] of [
  ["@opencode-ai/plugin", "opencode_plugin", "1.14.42"],
  ["@opentui/core", "opentui_core", "0.2.6"],
  ["@opentui/solid", "opentui_solid", "0.2.6"],
]) {
  test(`lockfile drift names the ${dependency} dependency surface`, (t) => {
    const root = makeFixture(t);
    writeJson(root, "opencode/package-lock.json", {
      ...PACKAGED_LOCK,
      packages: {
        "": {
          ...PACKAGED_LOCK.packages[""],
          dependencies: {
            ...PACKAGED_LOCK.packages[""].dependencies,
            [dependency]: driftedVersion,
          },
        },
      },
    });

    assertInvalidCompatibility(
      () => checkCompatibility(root),
      new RegExp(`opencode/package-lock\\.json dependency ${dependency.replaceAll("/", "\\/")} must match compatibility\\.json sdk\\.${sdkField}`),
    );
  });
}

test("documentation rejects an unknown matrix status", (t) => {
  const root = makeFixture(t);
  writeText(
    root,
    "docs/compatibility.md",
    COMPATIBILITY_MATRIX.replace("| Node.js 22 | supported |", "| Node.js 22 | supported boundary |"),
  );

  assertInvalidCompatibility(
    () => checkCompatibility(root),
    /unknown compatibility status: supported boundary/,
  );
});

test("documentation and boundary workflow follow a promoted stable OpenCode version", (t) => {
  const compatibility = {
    ...VALID_COMPATIBILITY,
    opencode: { ...VALID_COMPATIBILITY.opencode, stable_tested: "1.19.0" },
  };
  const root = makeFixture(t, compatibility);
  writeText(root, "docs/compatibility.md", COMPATIBILITY_MATRIX.replaceAll("1.18.4", "1.19.0"));
  writeText(root, ".github/workflows/check.yml", VALID_WORKFLOW.replaceAll("1.18.4", "1.19.0"));

  assert.equal(checkCompatibility(root).opencode.stable_tested, "1.19.0");
});

for (const [surface, currentStatus, replacement, expectedStatus] of [
  ["Node.js 26", "experimental", "tested", "experimental"],
  ["Native Windows", "unsupported", "supported", "unsupported"],
  ["WSL2", "experimental", "supported", "experimental"],
  ["Token usage plugin", "experimental", "supported", "experimental"],
  ["Open Design Docker adapter", "experimental", "supported", "experimental"],
  ["Superpowers", "experimental", "supported", "experimental"],
  ["Impeccable", "experimental", "supported", "experimental"],
]) {
  test(`documentation rejects the wrong status for ${surface}`, (t) => {
    const root = makeFixture(t);
    writeText(
      root,
      "docs/compatibility.md",
      COMPATIBILITY_MATRIX.replace(
        `| ${surface} | ${currentStatus} |`,
        `| ${surface} | ${replacement} |`,
      ),
    );

    assertInvalidCompatibility(
      () => checkCompatibility(root),
      new RegExp(`docs/compatibility\\.md must classify ${surface.replaceAll(".", "\\.")} as ${expectedStatus}`),
    );
  });
}

for (const surface of [
  "OpenCode >=1.14.41 <2.0.0",
  "Node.js 22",
  "Node.js 24",
  "WSL2",
  "Native Windows",
  "Token usage plugin",
  "Open Design Docker adapter",
  "Superpowers",
  "Impeccable",
]) {
  test(`documentation requires the ${surface} boundary`, (t) => {
    const root = makeFixture(t);
    const line = COMPATIBILITY_MATRIX.split("\n").find((candidate) =>
      candidate.startsWith(`| ${surface} |`),
    );
    assert.ok(line);
    writeText(root, "docs/compatibility.md", COMPATIBILITY_MATRIX.replace(`${line}\n`, ""));

    assertInvalidCompatibility(
      () => checkCompatibility(root),
      new RegExp(`docs/compatibility\\.md must classify ${surface.replaceAll(".", "\\.")} as`),
    );
  });
}

test("README must link the compatibility documentation", (t) => {
  const root = makeFixture(t);
  writeText(root, "README.md", "Compatibility details are available.\n");

  assertInvalidCompatibility(
    () => checkCompatibility(root),
    /README\.md must link docs\/compatibility\.md/,
  );
});

test("installation must declare the canonical Node engine", (t) => {
  const root = makeFixture(t);
  writeText(root, "docs/installation.md", "- Node.js and npm\n");

  assertInvalidCompatibility(
    () => checkCompatibility(root),
    /docs\/installation\.md must declare the canonical Node engine/,
  );
});

test("documentation cannot escape the repository through a symlinked directory", (t) => {
  const root = makeFixture(t);
  const external = fs.mkdtempSync(path.join(os.tmpdir(), "oak-compat-external-"));
  t.after(() => fs.rmSync(external, { recursive: true, force: true }));
  writeText(external, "compatibility.md", COMPATIBILITY_MATRIX);
  writeText(external, "installation.md", INSTALLATION);
  fs.rmSync(path.join(root, "docs"), { recursive: true });
  fs.symlinkSync(external, path.join(root, "docs"), "dir");

  assertInvalidCompatibility(
    () => checkCompatibility(root),
    /docs\/compatibility\.md must be a safe regular file|escape/,
  );
});

test("documentation requires exactly one start marker", (t) => {
  const root = makeFixture(t);
  writeText(
    root,
    "docs/compatibility.md",
    COMPATIBILITY_MATRIX.replace(
      "<!-- compatibility-matrix:start -->",
      "<!-- compatibility-matrix:start -->\n<!-- compatibility-matrix:start -->",
    ),
  );

  assertInvalidCompatibility(
    () => checkCompatibility(root),
    /docs\/compatibility\.md must contain exactly one start and one end marker/,
  );
});

test("documentation rejects a duplicated surface before status resolution", (t) => {
  const root = makeFixture(t);
  writeText(
    root,
    "docs/compatibility.md",
    COMPATIBILITY_MATRIX.replace(
      "| Node.js 22 | supported |",
      "| Node.js 22 | unsupported | duplicate |\n| Node.js 22 | supported |",
    ),
  );

  assertInvalidCompatibility(
    () => checkCompatibility(root),
    /docs\/compatibility\.md must not duplicate surface Node\.js 22/,
  );
});

test("blocking workflow accepts exactly the supported Node and OS matrix", (t) => {
  const root = makeFixture(t);
  assert.equal(checkCompatibility(root).schema_version, 1);
});

test("blocking workflow rejects mutable Action major tags", (t) => {
  const root = makeFixture(t);
  writeText(
    root,
    ".github/workflows/check.yml",
    VALID_WORKFLOW.replaceAll(
      "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6",
      "actions/checkout@v6",
    ),
  );
  assertInvalidCompatibility(() => checkCompatibility(root), /workflow|OpenCode boundary job/);
});

test("the previous single Ubuntu Node 24 job is rejected", (t) => {
  const root = makeFixture(t);
  writeText(root, ".github/workflows/check.yml", SINGLE_JOB_WORKFLOW);

  assertInvalidCompatibility(
    () => checkCompatibility(root),
    /workflow must contain exactly one compatibility blocking marker pair/,
  );
});

for (const [label, mutate] of [
  ["missing Ubuntu Node 22 entry", (workflow) => workflow.replace("          - os: ubuntu-latest\n            node: 22\n            canonical: false\n", "")],
  ["missing Ubuntu Node 24 entry", (workflow) => workflow.replace("          - os: ubuntu-latest\n            node: 24\n            canonical: true\n", "")],
  ["missing macOS Node 24 entry", (workflow) => workflow.replace("          - os: macos-latest\n            node: 24\n            canonical: false\n", "")],
  ["extra entry", (workflow) => workflow.replace("    # compatibility-blocking:end", "          - os: ubuntu-latest\n            node: 26\n            canonical: false\n    # compatibility-blocking:end")],
  ["duplicated entry", (workflow) => workflow.replace("    # compatibility-blocking:end", "          - os: ubuntu-latest\n            node: 24\n            canonical: true\n    # compatibility-blocking:end")],
]) {
  test(`blocking workflow rejects a ${label}`, (t) => {
    const root = makeFixture(t);
    writeText(root, ".github/workflows/check.yml", mutate(VALID_WORKFLOW));
    assertInvalidCompatibility(() => checkCompatibility(root), /workflow blocking matrix must be exactly/);
  });
}

test("blocking workflow requires fail-fast false", (t) => {
  const root = makeFixture(t);
  writeText(root, ".github/workflows/check.yml", VALID_WORKFLOW.replace("fail-fast: false", "fail-fast: true"));
  assertInvalidCompatibility(() => checkCompatibility(root), /workflow strategy must set fail-fast to false/);
});

test("release gate requires the exact reproducible artifact command order", (t) => {
  const root = makeFixture(t);
  const packageData = { ...ROOT_PACKAGE, scripts: { ...ROOT_PACKAGE.scripts } };
  packageData.scripts["check:release"] = packageData.scripts["check:release"].replace(
    "npm run dependency-signature-audit && ",
    "",
  );
  writeJson(root, "package.json", packageData);
  assertInvalidCompatibility(() => checkCompatibility(root), /check:release.*exact/i);
});

test("release scripts require the supply-chain checker", (t) => {
  const root = makeFixture(t);
  const packageData = { ...ROOT_PACKAGE, scripts: { ...ROOT_PACKAGE.scripts } };
  delete packageData.scripts["check:supply-chain"];
  writeJson(root, "package.json", packageData);
  assertInvalidCompatibility(() => checkCompatibility(root), /check:supply-chain.*exact/i);
});

for (const [label, current, replacement, message] of [
  ["tag validation", "if: matrix.canonical && startsWith(github.ref, 'refs/tags/')", "if: startsWith(github.ref, 'refs/tags/')", /tag validation guard/],
  ["dependency audit", "if: matrix.canonical\n        run: npm run dependency-audit", "if: success()\n        run: npm run dependency-audit", /dependency audit guard/],
  ["dependency signature audit", "if: matrix.canonical\n        run: npm run dependency-signature-audit", "if: success()\n        run: npm run dependency-signature-audit", /dependency signature audit guard/],
  ["package smoke", "if: matrix.canonical\n        run: npm run package-smoke", "if: success()\n        run: npm run package-smoke", /package smoke guard/],
]) {
  test(`blocking workflow requires the exact ${label} guard`, (t) => {
    const root = makeFixture(t);
    writeText(root, ".github/workflows/check.yml", VALID_WORKFLOW.replace(current, replacement));
    assertInvalidCompatibility(() => checkCompatibility(root), message);
  });
}

for (const [label, current, message] of [
  ["matrix runner", "runs-on: ${{ matrix.os }}", /matrix\.os/],
  ["matrix Node setup", "node-version: ${{ matrix.node }}", /matrix\.node/],
  ["dependency installation", "working-directory: opencode\n        run: npm ci --ignore-scripts", /install OpenCode tool dependencies/],
  ["contract check", "run: npm run contract-check", /contract check/],
  ["unit and script tests", "run: npm run unit-and-script-tests", /unit and script tests/],
  ["token plugin typecheck", "run: npm run typecheck", /token plugin typecheck/],
  ["installation smoke", "run: npm run installation-smoke", /installation smoke/],
]) {
  test(`every blocking matrix job retains ${label}`, (t) => {
    const root = makeFixture(t);
    writeText(root, ".github/workflows/check.yml", VALID_WORKFLOW.replace(current, "# removed by test"));
    assertInvalidCompatibility(() => checkCompatibility(root), message);
  });
}

test("installation smoke requires the frozen npm ci command", (t) => {
  const root = makeFixture(t);
  writeText(root, "scripts/install-smoke.sh", "#!/usr/bin/env bash\nnpm ci\n");
  assertInvalidCompatibility(
    () => checkCompatibility(root),
    /installation smoke must use npm ci --ignore-scripts/,
  );
});

test("a sidecar job cannot satisfy a required blocking check step", (t) => {
  const root = makeFixture(t);
  const workflow = VALID_WORKFLOW
    .replace("        run: npm run typecheck", "        run: echo skipped-typecheck")
    .concat(`
  sidecar:
    runs-on: ubuntu-latest
    steps:
      - name: Typecheck TUI token plugin
        run: npm run typecheck
`);
  writeText(root, ".github/workflows/check.yml", workflow);

  assertInvalidCompatibility(
    () => checkCompatibility(root),
    /workflow blocking job must retain token plugin typecheck/,
  );
});

for (const [label, workflow] of [
  ["missing", VALID_WORKFLOW.replace("  check:\n", "  renamed:\n")],
  ["duplicated", `${VALID_WORKFLOW}\n  check:\n    runs-on: ubuntu-latest\n`],
  ["ambiguous", `${VALID_WORKFLOW}\njobs:\n  sidecar:\n    runs-on: ubuntu-latest\n`],
]) {
  test(`workflow rejects a ${label} jobs.check body`, (t) => {
    const root = makeFixture(t);
    writeText(root, ".github/workflows/check.yml", workflow);
    assertInvalidCompatibility(
      () => checkCompatibility(root),
      /workflow must contain exactly one unambiguous jobs\.check body/,
    );
  });
}

for (const command of [
  "uname -a || true",
  "node --version",
  "npm --version",
  "arch:process.arch",
  "platform:process.platform",
  'p.dependencies["@opencode-ai/plugin"]',
  'p.dependencies["@opentui/core"]',
  'p.dependencies["@opentui/solid"]',
]) {
  test(`runner evidence requires ${command}`, (t) => {
    const root = makeFixture(t);
    writeText(root, ".github/workflows/check.yml", VALID_WORKFLOW.replace(command, "removed-by-test"));
    assertInvalidCompatibility(() => checkCompatibility(root), /runner evidence/);
  });
}

test("workflow rejects write permissions", (t) => {
  const root = makeFixture(t);
  writeText(root, ".github/workflows/check.yml", VALID_WORKFLOW.replace("contents: read", "contents: write"));
  assertInvalidCompatibility(() => checkCompatibility(root), /read-only permissions/);
});

for (const [job, workflow] of [
  [
    "check",
    VALID_WORKFLOW.replace(
      "  check:\n",
      "  check:\n    permissions:\n      contents: read\n",
    ),
  ],
  [
    "opencode-compatibility",
    VALID_WORKFLOW.replace(
      "  opencode-compatibility:\n",
      "  opencode-compatibility:\n    permissions:\n      contents: read\n",
    ),
  ],
]) {
  test(`workflow requires jobs.${job} to inherit top-level permissions`, (t) => {
    const root = makeFixture(t);
    writeText(root, ".github/workflows/check.yml", workflow);
    assertInvalidCompatibility(
      () => checkCompatibility(root),
      /job-level permissions are forbidden/,
    );
  });
}

test("workflow rejects publish commands", (t) => {
  const root = makeFixture(t);
  writeText(root, ".github/workflows/check.yml", `${VALID_WORKFLOW}      - run: npm publish\n`);
  assertInvalidCompatibility(() => checkCompatibility(root), /must not publish/);
});

for (const [label, command] of [
  ["GitHub release upload", "gh release upload v1 artifact.tgz"],
  ["GitHub release edit", "gh release edit v1 --draft=false"],
  ["GitHub release delete", "gh release delete v1 --yes"],
  ["GitHub API PATCH", "gh api repos/example/project/releases/1 -X PATCH -f draft=false"],
  ["GitHub API DELETE", "gh api --method=DELETE repos/example/project/releases/1"],
  ["npm dist-tag add", "npm dist-tag add pkg@1 latest"],
  ["npm dist-tag rm", "npm dist-tag rm pkg latest"],
  ["npm unpublish", "npm unpublish pkg@1"],
  ["npm deprecate", "npm deprecate pkg@1 obsolete"],
  ["repository push", "git push origin HEAD"],
  ["cache action", "uses: actions/cache@v4"],
  ["artifact action", "uses: actions/upload-artifact@v4"],
]) {
  test(`workflow rejects ${label}`, (t) => {
    const root = makeFixture(t);
    writeText(
      root,
      ".github/workflows/check.yml",
      VALID_WORKFLOW.replace(
        "  # opencode-boundaries:start",
        `      - run: ${command}\n\n  # opencode-boundaries:start`,
      ),
    );
    assertInvalidCompatibility(() => checkCompatibility(root), /must not publish, release, upload, mutate, cache, or use artifacts/);
  });
}

for (const [label, command] of [
  ["GitHub release view", "gh release view v1"],
  ["GitHub API GET", "gh api repos/example/project/releases/1"],
  ["npm view", "npm view pkg@1 dist.integrity"],
]) {
  test(`workflow accepts read-only ${label}`, (t) => {
    const root = makeFixture(t);
    writeText(
      root,
      ".github/workflows/check.yml",
      VALID_WORKFLOW.replace(
        "  # opencode-boundaries:start",
        `      - run: ${command}\n\n  # opencode-boundaries:start`,
      ),
    );
    assert.equal(checkCompatibility(root).schema_version, 1);
  });
}

test("workflow requires exactly one ordered blocking marker pair", (t) => {
  const root = makeFixture(t);
  writeText(
    root,
    ".github/workflows/check.yml",
    VALID_WORKFLOW.replace("# compatibility-blocking:start", "# compatibility-blocking:start\n    # compatibility-blocking:start"),
  );
  assertInvalidCompatibility(
    () => checkCompatibility(root),
    /workflow must contain exactly one compatibility blocking marker pair/,
  );
});

test("workflow requires blocking markers in order", (t) => {
  const root = makeFixture(t);
  writeText(
    root,
    ".github/workflows/check.yml",
    VALID_WORKFLOW
      .replace("# compatibility-blocking:start", "# compatibility-blocking:temporary")
      .replace("# compatibility-blocking:end", "# compatibility-blocking:start")
      .replace("# compatibility-blocking:temporary", "# compatibility-blocking:end"),
  );
  assertInvalidCompatibility(
    () => checkCompatibility(root),
    /workflow compatibility blocking markers must be in order/,
  );
});

test("OpenCode boundary job accepts the exact blocking matrix", (t) => {
  const root = makeFixture(t);
  assert.equal(checkCompatibility(root).schema_version, 1);
});

for (const [label, mutate] of [
  ["minimum core tested version", (workflow) => workflow.replace('          - mode: core\n            opencode: "1.14.41"\n', "")],
  ["stable core tested version", (workflow) => workflow.replace('          - mode: core\n            opencode: "1.18.4"\n', "")],
  ["stable default tested version", (workflow) => workflow.replace('          - mode: default\n            opencode: "1.18.4"\n', "")],
  ["Node 24 setup", (workflow) => workflow.replace("          node-version: 24", "          node-version: 22")],
  [
    "matrix-version wrapper invocation",
    (workflow) => workflow.replace(
      'run: bash scripts/opencode-compat-smoke.sh "${{ matrix.mode }}" "${{ matrix.opencode }}"',
      "run: bash scripts/opencode-compat-smoke.sh 1.18.4",
    ),
  ],
  [
    "isolated wrapper instead of the operator binary",
    (workflow) => workflow.replace(
      'run: bash scripts/opencode-compat-smoke.sh "${{ matrix.mode }}" "${{ matrix.opencode }}"',
      "run: opencode --version",
    ),
  ],
  [
    "blocking failure behavior",
    (workflow) => workflow.replace(
      "  opencode-compatibility:\n",
      "  opencode-compatibility:\n    continue-on-error: true\n",
    ),
  ],
  [
    "non-publishing behavior",
    (workflow) => workflow.replace(
      "  # opencode-boundaries:end",
      "      - name: Publish\n        run: npm publish\n  # opencode-boundaries:end",
    ),
  ],
  [
    "credential-free behavior",
    (workflow) => workflow.replace(
      "    runs-on: ubuntu-latest\n    strategy:",
      '    runs-on: ubuntu-latest\n    env:\n      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n    strategy:',
    ),
  ],
  [
    "provider-secret-free behavior",
    (workflow) => workflow.replace(
      "    runs-on: ubuntu-latest\n    strategy:",
      `    runs-on: ubuntu-latest\n    env:\n      ${PROVIDER_SECRET}: \${{ secrets.${PROVIDER_SECRET} }}\n    strategy:`,
    ),
  ],
  [
    "checkout-level dependency install",
    (workflow) => workflow.replace(
      OPENCODE_BOUNDARY_JOB,
      OPENCODE_BOUNDARY_JOB.replace(
        "      - name: Setup Node\n        uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6",
        "      - name: Install dependencies\n        run: npm ci\n\n      - name: Setup Node\n        uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6",
      ),
    ),
  ],
]) {
  test(`OpenCode boundary job requires ${label}`, (t) => {
    const root = makeFixture(t);
    writeText(root, ".github/workflows/check.yml", mutate(VALID_WORKFLOW));
    assertInvalidCompatibility(() => checkCompatibility(root), /OpenCode boundary job/);
  });
}

test("OpenCode boundary job cannot borrow its smoke from another job", (t) => {
  const root = makeFixture(t);
  const workflow = VALID_WORKFLOW
    .replace(
      '        run: bash scripts/opencode-compat-smoke.sh "${{ matrix.mode }}" "${{ matrix.opencode }}"',
      "        run: echo skipped-boundary-smoke",
    )
    .concat(`
  sidecar-smoke:
    runs-on: ubuntu-latest
    steps:
      - run: bash scripts/opencode-compat-smoke.sh "\${{ matrix.mode }}" "\${{ matrix.opencode }}"
`);
  writeText(root, ".github/workflows/check.yml", workflow);
  assertInvalidCompatibility(() => checkCompatibility(root), /OpenCode boundary job/);
});

test("OpenCode boundary job markers must wrap the job inside jobs", (t) => {
  const root = makeFixture(t);
  const workflow = VALID_WORKFLOW
    .replace(OPENCODE_BOUNDARY_JOB, "  opencode-compatibility:\n    runs-on: macos-latest\n")
    .concat(`
outside:
${OPENCODE_BOUNDARY_JOB}`);
  writeText(root, ".github/workflows/check.yml", workflow);
  assertInvalidCompatibility(() => checkCompatibility(root), /OpenCode boundary job/);
});

for (const [label, trailingYaml] of [
  ["trailing continue-on-error", "    continue-on-error: true\n"],
  [
    "trailing provider secret",
    '    env:\n      TEST_TOKEN: ${{ secrets.TEST_TOKEN }}\n',
  ],
  ["trailing job key", "    timeout-minutes: 5\n"],
  [
    "trailing steps key",
    "    steps:\n      - name: Bypass\n        run: echo bypass\n",
  ],
]) {
  test(`OpenCode boundary job rejects ${label} after its end marker`, (t) => {
    const root = makeFixture(t);
    writeText(
      root,
      ".github/workflows/check.yml",
      VALID_WORKFLOW.replace(
        "  # opencode-boundaries:end\n",
        `  # opencode-boundaries:end\n${trailingYaml}`,
      ),
    );
    assertInvalidCompatibility(() => checkCompatibility(root), /OpenCode boundary job/);
  });
}

test("OpenCode boundary job requires exactly one marker pair", (t) => {
  const root = makeFixture(t);
  writeText(
    root,
    ".github/workflows/check.yml",
    VALID_WORKFLOW.replace(
      "  # opencode-boundaries:start",
      "  # opencode-boundaries:start\n  # opencode-boundaries:start",
    ),
  );
  assertInvalidCompatibility(() => checkCompatibility(root), /OpenCode boundary job/);
});

test("OpenCode boundary job requires markers in order", (t) => {
  const root = makeFixture(t);
  writeText(
    root,
    ".github/workflows/check.yml",
    VALID_WORKFLOW
      .replace("# opencode-boundaries:start", "# opencode-boundaries:temporary")
      .replace("# opencode-boundaries:end", "# opencode-boundaries:start")
      .replace("# opencode-boundaries:temporary", "# opencode-boundaries:end"),
  );
  assertInvalidCompatibility(() => checkCompatibility(root), /OpenCode boundary job/);
});

test("compatibility canary accepts the exact scheduled and manual latest smoke", (t) => {
  const root = makeFixture(t);
  assert.equal(checkCompatibility(root).schema_version, 1);
});

test("compatibility canary rejects mutable Action major tags", (t) => {
  const root = makeFixture(t);
  writeText(
    root,
    ".github/workflows/compatibility-canary.yml",
    VALID_CANARY_WORKFLOW.replace(
      "actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6",
      "actions/setup-node@v6",
    ),
  );
  assertInvalidCompatibility(() => checkCompatibility(root), /compatibility canary/i);
});

for (const [label, mutate] of [
  ["schedule trigger", (workflow) => workflow.replace('  schedule:\n    - cron: "17 6 * * 1"\n', "")],
  ["workflow_dispatch trigger", (workflow) => workflow.replace("  workflow_dispatch:\n", "")],
  ["push trigger", (workflow) => workflow.replace("  workflow_dispatch:\n", "  workflow_dispatch:\n  push:\n")],
  ["pull_request trigger", (workflow) => workflow.replace("  workflow_dispatch:\n", "  workflow_dispatch:\n  pull_request:\n")],
  ["canonical canary Node", (workflow) => workflow.replace("          node-version: 26", "          node-version: 24")],
  ["canonical latest argument", (workflow) => workflow.replace("opencode-compat-smoke.sh core latest", "opencode-compat-smoke.sh core 1.18.4")],
  ["read-only permissions", (workflow) => workflow.replace("contents: read", "contents: write")],
  ["blocking failure behavior", (workflow) => workflow.replace("    runs-on: ubuntu-latest", "    continue-on-error: true\n    runs-on: ubuntu-latest")],
  ["credential-free behavior", (workflow) => workflow.replace("    runs-on: ubuntu-latest", '    env:\n      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n    runs-on: ubuntu-latest')],
  ["npm publish ban", (workflow) => workflow.replace("      - name: Smoke latest OpenCode", "      - run: npm publish\n\n      - name: Smoke latest OpenCode")],
  ["tag creation ban", (workflow) => workflow.replace("      - name: Smoke latest OpenCode", "      - run: git tag canary\n\n      - name: Smoke latest OpenCode")],
  ["issue creation ban", (workflow) => workflow.replace("      - name: Smoke latest OpenCode", "      - run: gh issue create --title canary\n\n      - name: Smoke latest OpenCode")],
  ["dependency update ban", (workflow) => workflow.replace("      - name: Smoke latest OpenCode", "      - run: npm update\n\n      - name: Smoke latest OpenCode")],
  ["npm ci ban", (workflow) => workflow.replace("      - name: Smoke latest OpenCode", "      - run: npm ci\n\n      - name: Smoke latest OpenCode")],
  ["checkout cache ban", (workflow) => workflow.replace("        uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6", "        uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6\n        with:\n          cache: npm")],
  ["cache action ban", (workflow) => workflow.replace("      - name: Smoke latest OpenCode", "      - uses: actions/cache@v4\n\n      - name: Smoke latest OpenCode")],
  ["artifact action ban", (workflow) => workflow.replace("      - name: Smoke latest OpenCode", "      - uses: actions/upload-artifact@v4\n\n      - name: Smoke latest OpenCode")],
  ["repository mutation ban", (workflow) => workflow.replace("      - name: Smoke latest OpenCode", "      - run: git push origin HEAD\n\n      - name: Smoke latest OpenCode")],
]) {
  test(`compatibility canary requires ${label}`, (t) => {
    const root = makeFixture(t);
    writeText(root, ".github/workflows/compatibility-canary.yml", mutate(VALID_CANARY_WORKFLOW));
    assertInvalidCompatibility(() => checkCompatibility(root), /compatibility canary/i);
  });
}

for (const [label, mutate] of [
  [
    "missing persist-credentials",
    (workflow) => workflow.replace("        with:\n          persist-credentials: false\n", ""),
  ],
  [
    "persist-credentials true",
    (workflow) => workflow.replace("persist-credentials: false", "persist-credentials: true"),
  ],
  [
    "duplicate persist-credentials",
    (workflow) => workflow.replace(
      "          persist-credentials: false",
      "          persist-credentials: false\n          persist-credentials: false",
    ),
  ],
]) {
  test(`compatibility canary rejects ${label}`, (t) => {
    const root = makeFixture(t);
    writeText(root, ".github/workflows/compatibility-canary.yml", mutate(VALID_CANARY_WORKFLOW));
    assertInvalidCompatibility(() => checkCompatibility(root), /compatibility canary/i);
  });
}

test("compatibility canary latest job must inherit top-level permissions", (t) => {
  const root = makeFixture(t);
  writeText(
    root,
    ".github/workflows/compatibility-canary.yml",
    VALID_CANARY_WORKFLOW.replace(
      "  latest:\n",
      "  latest:\n    permissions:\n      contents: read\n",
    ),
  );

  assertInvalidCompatibility(
    () => checkCompatibility(root),
    /compatibility canary job-level permissions are forbidden/,
  );
});

for (const [label, workflow] of [
  ["missing latest job", VALID_CANARY_WORKFLOW.replace("  latest:\n", "  renamed:\n")],
  ["duplicate latest job", `${VALID_CANARY_WORKFLOW}\n  latest:\n    runs-on: ubuntu-latest\n`],
  ["duplicate jobs mapping", `${VALID_CANARY_WORKFLOW}\njobs:\n  sidecar:\n    runs-on: ubuntu-latest\n`],
  ["duplicate start marker", VALID_CANARY_WORKFLOW.replace("  # compatibility-canary:start", "  # compatibility-canary:start\n  # compatibility-canary:start")],
  ["duplicate end marker", VALID_CANARY_WORKFLOW.replace("  # compatibility-canary:end", "  # compatibility-canary:end\n  # compatibility-canary:end")],
  [
    "reversed markers",
    VALID_CANARY_WORKFLOW
      .replace("# compatibility-canary:start", "# compatibility-canary:temporary")
      .replace("# compatibility-canary:end", "# compatibility-canary:start")
      .replace("# compatibility-canary:temporary", "# compatibility-canary:end"),
  ],
  ["trailing job key", VALID_CANARY_WORKFLOW.replace("  # compatibility-canary:end", "  # compatibility-canary:end\n    timeout-minutes: 5")],
  ["trailing steps key", VALID_CANARY_WORKFLOW.replace("  # compatibility-canary:end", "  # compatibility-canary:end\n    steps:\n      - run: echo bypass")],
]) {
  test(`compatibility canary rejects ${label}`, (t) => {
    const root = makeFixture(t);
    writeText(root, ".github/workflows/compatibility-canary.yml", workflow);
    assertInvalidCompatibility(() => checkCompatibility(root), /compatibility canary/i);
  });
}

function shellQuote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function writeExecutable(root, relative, contents) {
  writeText(root, relative, contents);
  fs.chmodSync(path.join(root, relative), 0o755);
}

function makeCompatibilitySmokeFixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oak-compat-smoke-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const sourceScript = path.join(REPOSITORY_ROOT, "scripts/opencode-compat-smoke.sh");
  if (fs.existsSync(sourceScript)) {
    fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
    fs.copyFileSync(sourceScript, path.join(root, "scripts/opencode-compat-smoke.sh"));
    fs.chmodSync(path.join(root, "scripts/opencode-compat-smoke.sh"), 0o755);
  }

  writeJson(root, "package.json", {
    name: "compat-smoke-fixture",
    version: "1.0.0",
    files: ["opencode"],
  });
  writeText(root, "agents/lead.md", "---\nmode: all\n---\n");
  if (options.packagedLead !== "missing") {
    writeText(
      root,
      "opencode/agents/lead.md",
      `---\nmode: ${options.packagedLead ?? "primary"}\n---\n`,
    );
  }
  writeJson(root, "opencode/package.json", { name: "fixture", private: true });
  writeJson(root, "opencode/package-lock.json", {
    name: "fixture",
    lockfileVersion: 3,
    packages: { "": { name: "fixture" } },
  });
  writeText(root, "opencode/node_modules/excluded", "must not be copied\n");
  writeText(root, "opencode/.oak/excluded", "must not be copied\n");
  writeText(root, "opencode/plugins/token-tree-usage.tsx", "export default {};\n");
  writeJson(root, "opencode/opencode.json", {
    default_agent: "lead",
    plugin: [
      "superpowers@git+https://github.com/obra/superpowers.git#d884ae04edebef577e82ff7c4e143debd0bbec99",
    ],
  });

  const quotedRoot = shellQuote(root);
  const realNpm = spawnSync("which", ["npm"], { encoding: "utf8" }).stdout.trim();
  writeExecutable(root, "fake-bin/npm", `#!/bin/sh
set -eu
if [ "\${1-}" = pack ]; then
  touch ${shellQuote(path.join(root, "npm-pack-called"))}
  ${options.packFailure ? "exit 51" : `exec ${shellQuote(realNpm)} "$@"`}
fi
touch ${shellQuote(path.join(root, "npm-ci-called"))}
smoke_root=\${HOME%/home}
smoke_home="$(CDPATH= cd "$HOME" && pwd -P)"
test "$(pwd -P)" = "$smoke_home"
test "\${PWD-}" = "$smoke_home"
test "$#" -eq 4
test "$1" = --prefix
test "$2" = "$smoke_root/config/opencode"
test "$3" = ci
test "$4" = --ignore-scripts
test "$HOME" = "$smoke_root/home"
test "$XDG_CONFIG_HOME" = "$smoke_root/config"
test "$XDG_DATA_HOME" = "$smoke_root/data"
test "$XDG_CACHE_HOME" = "$smoke_root/cache"
test "$XDG_STATE_HOME" = "$smoke_root/state"
test "$npm_config_cache" = "$smoke_root/npm"
test "$OPENCODE_CONFIG_DIR" = "$smoke_root/config/opencode"
case "$2" in ${quotedRoot}|${quotedRoot}/*) exit 31;; esac
case "$OPENCODE_CONFIG_DIR" in ${quotedRoot}|${quotedRoot}/*) exit 32;; esac
test -f "$2/agents/lead.md"
test ! -e "$2/opencode"
test ! -e "$2/node_modules"
test ! -e "$2/.oak"
case "${options.mode ?? "core"}" in
  core)
    test ! -e "$2/plugins"
    node -e 'const c=require(process.argv[1]); if (!Array.isArray(c.plugin) || c.plugin.length !== 0) process.exit(1)' "$2/opencode.json"
    ;;
  default)
    test -f "$2/plugins/token-tree-usage.tsx"
    node -e 'const c=require(process.argv[1]); const p=c.plugin; if (!Array.isArray(p) || p.length !== 1 || p[0] !== "superpowers@git+https://github.com/obra/superpowers.git#d884ae04edebef577e82ff7c4e143debd0bbec99") process.exit(1)' "$2/opencode.json"
    ;;
esac
`);

  const request = options.request ?? "1.14.41";
  const version = options.resolvedVersion ?? (options.wrongVersion ? "9.9.9" : request);
  const stdoutLeakPath = options.stdoutLeak === "root" ? root : options.stdoutLeak;
  const leak = stdoutLeakPath ? `,\"source\":${JSON.stringify(stdoutLeakPath)}` : "";
  const stderrLeakPath = options.stderrLeak === "root" ? root : options.stderrLeak;
  let stderrLeak = ":";
  if (stderrLeakPath === "smoke") {
    stderrLeak = `printf '%s\\n' "$smoke_root/SMOKE_TEMP_MARKER" >&2`;
  } else if (stderrLeakPath) {
    stderrLeak = `printf '%s\\n' ${shellQuote(stderrLeakPath)} >&2`;
  }
  writeExecutable(root, "fake-bin/npx", `#!/bin/sh
set -eu
touch ${shellQuote(path.join(root, "npx-called"))}
if env | grep -q '^FAKE_PROVIDER_TOKEN='; then exit 41; fi
smoke_root=\${HOME%/home}
smoke_home="$(CDPATH= cd "$HOME" && pwd -P)"
test "$(pwd -P)" = "$smoke_home"
test "\${PWD-}" = "$smoke_home"
test "$HOME" = "$smoke_root/home"
test "$XDG_CONFIG_HOME" = "$smoke_root/config"
test "$XDG_DATA_HOME" = "$smoke_root/data"
test "$XDG_CACHE_HOME" = "$smoke_root/cache"
test "$XDG_STATE_HOME" = "$smoke_root/state"
test "$npm_config_cache" = "$smoke_root/npm"
test "$OPENCODE_CONFIG_DIR" = "$smoke_root/config/opencode"
case "$OPENCODE_CONFIG_DIR" in ${quotedRoot}|${quotedRoot}/*) exit 42;; esac
test "$1" = --yes
test "$2" = --package
test "$3" = opencode-ai@${request}
test "$4" = opencode
shift 4
case "$1" in
  --version)
    test "$#" -eq 1
    ${stderrLeak}
    printf '%s\\n' '${version}'
    ;;
  debug)
    test "$#" -eq 4
    test "$2" = agent
    test "$3" = lead
    test "$4" = --pure
    grep -q '^mode: primary$' "$OPENCODE_CONFIG_DIR/agents/lead.md"
    printf '{\"name\":\"lead\",\"mode\":\"primary\",\"config\":\"%s\"${leak}}\\n' "$OPENCODE_CONFIG_DIR"
    ;;
  *) exit 43;;
esac
`);
  return root;
}

function runCompatibilitySmoke(root, args = ["core", "1.14.41"]) {
  return spawnSync(
    "bash",
    [path.join(root, "scripts/opencode-compat-smoke.sh"), ...args],
    {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${path.join(root, "fake-bin")}:${process.env.PATH}`,
        FAKE_PROVIDER_TOKEN: "must-not-reach-opencode",
      },
      encoding: "utf8",
    },
  );
}

test("core OpenCode compatibility smoke strips optional plugins from the working-tree copy", (t) => {
  const root = makeCompatibilitySmokeFixture(t);
  const result = runCompatibilitySmoke(root);

  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.equal(
    result.stdout,
    "opencode compatibility smoke ok: mode=core requested=1.14.41 resolved=1.14.41\n",
  );
});

test("default OpenCode compatibility smoke packs and loads the unmodified package config", (t) => {
  const root = makeCompatibilitySmokeFixture(t, { mode: "default", request: "1.18.4" });
  const result = runCompatibilitySmoke(root, ["default", "1.18.4"]);

  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.equal(fs.existsSync(path.join(root, "npm-pack-called")), true);
  assert.equal(
    result.stdout,
    "opencode compatibility smoke ok: mode=default requested=1.18.4 resolved=1.18.4\n",
  );
});

test("default OpenCode compatibility smoke does not fall back when npm pack fails", (t) => {
  const root = makeCompatibilitySmokeFixture(t, {
    mode: "default",
    request: "1.18.4",
    packFailure: true,
  });
  const result = runCompatibilitySmoke(root, ["default", "1.18.4"]);

  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(path.join(root, "npm-pack-called")), true);
  assert.equal(fs.existsSync(path.join(root, "npm-ci-called")), false);
  assert.equal(fs.existsSync(path.join(root, "npx-called")), false);
});

test("OpenCode compatibility smoke suppresses temporary stderr paths without failing", (t) => {
  const root = makeCompatibilitySmokeFixture(t, { stderrLeak: "smoke" });
  const result = runCompatibilitySmoke(root);

  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.equal(
    result.stdout,
    "opencode compatibility smoke ok: mode=core requested=1.14.41 resolved=1.14.41\n",
  );
  assert.equal(result.stderr.includes("SMOKE_TEMP_MARKER"), false);
});

test("OpenCode compatibility smoke rejects a non-canonical explicit version before tools run", (t) => {
  const root = makeCompatibilitySmokeFixture(t, { request: "01.14.41" });
  const result = runCompatibilitySmoke(root, ["core", "01.14.41"]);

  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.equal(fs.existsSync(path.join(root, "npm-called")), false);
  assert.equal(fs.existsSync(path.join(root, "npx-called")), false);
});

test("OpenCode compatibility smoke rejects a non-canonical latest resolution", (t) => {
  const root = makeCompatibilitySmokeFixture(t, {
    request: "latest",
    resolvedVersion: "01.18.4",
  });
  const result = runCompatibilitySmoke(root, ["core", "latest"]);

  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(fs.existsSync(path.join(root, "npx-called")), true);
});

for (const [label, leakPath] of [
  ["original repository", "root"],
  ["original home", process.env.HOME],
]) {
  if (!leakPath && label === "original home") continue;

  test(`OpenCode compatibility smoke suppresses an ${label} path leaked on stderr`, (t) => {
    const root = makeCompatibilitySmokeFixture(t, {
      stderrLeak: leakPath,
    });
    const forbiddenPath = leakPath === "root" ? root : leakPath;
    const result = runCompatibilitySmoke(root);

    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr.includes(forbiddenPath), false);
  });
}

for (const args of [
  [],
  ["core"],
  ["unknown", "1.14.41"],
  ["default", "latest"],
  ["core", "1.14.41", "extra"],
]) {
  test(`OpenCode compatibility smoke rejects invalid interface: ${JSON.stringify(args)}`, (t) => {
    const root = makeCompatibilitySmokeFixture(t);
    const result = runCompatibilitySmoke(root, args);

    assert.equal(result.status, 2);
    assert.equal(fs.existsSync(path.join(root, "npm-pack-called")), false);
    assert.equal(fs.existsSync(path.join(root, "npm-ci-called")), false);
    assert.equal(fs.existsSync(path.join(root, "npx-called")), false);
  });
}

for (const [label, leakPath] of [
  ["original repository", "root"],
  ["original home", process.env.HOME],
]) {
  if (!leakPath && label === "original home") continue;

  test(`OpenCode compatibility smoke rejects an ${label} path leaked on stdout`, (t) => {
    const root = makeCompatibilitySmokeFixture(t, { stdoutLeak: leakPath });
    const result = runCompatibilitySmoke(root);

    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
  });
}

for (const [name, options] of [
  ["a mismatched resolved version", { wrongVersion: true }],
  ["a missing packaged lead", { packagedLead: "missing" }],
  ["an incorrect packaged lead mode", { packagedLead: "all" }],
]) {
  test(`OpenCode compatibility smoke rejects ${name}`, (t) => {
    const root = makeCompatibilitySmokeFixture(t, options);
    const result = runCompatibilitySmoke(root);

    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
  });
}
