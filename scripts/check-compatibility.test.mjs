import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkCompatibility } from "./check-compatibility.mjs";

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

const ROOT_PACKAGE = {
  name: "opencode-agent-orchestration-kit",
  engines: { node: VALID_COMPATIBILITY.node.engines },
};

const PACKAGED_PACKAGE = {
  engines: { node: VALID_COMPATIBILITY.node.engines },
  dependencies: {
    "@opencode-ai/plugin": VALID_COMPATIBILITY.sdk.opencode_plugin,
    "@opentui/core": VALID_COMPATIBILITY.sdk.opentui_core,
    "@opentui/solid": VALID_COMPATIBILITY.sdk.opentui_solid,
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
  writeText(root, "docs/compatibility.md", COMPATIBILITY_MATRIX);
  writeText(root, "README.md", README);
  writeText(root, "docs/installation.md", INSTALLATION);
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

for (const [field, value, overrides] of [
  ["minimum_tested", "1.14.42", { supported_range: ">=1.14.42 <2.0.0" }],
  ["stable_tested", "1.18.5", {}],
]) {
  test(`alternative OpenCode ${field} is rejected`, (t) => {
    const root = makeFixture(t, {
      ...VALID_COMPATIBILITY,
      opencode: { ...VALID_COMPATIBILITY.opencode, [field]: value, ...overrides },
    });
    assert.throws(
      () => checkCompatibility(root, { surfaces: false }),
      new RegExp(`${field} must be`),
    );
  });
}

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

for (const [field, value] of [
  ["opencode_plugin", "1.14.42"],
  ["opentui_core", "0.2.6"],
  ["opentui_solid", "0.2.6"],
]) {
  test(`alternative SDK ${field} pin is rejected`, (t) => {
    const root = makeFixture(t, {
      ...VALID_COMPATIBILITY,
      sdk: { ...VALID_COMPATIBILITY.sdk, [field]: value },
    });
    assert.throws(
      () => checkCompatibility(root, { surfaces: false }),
      new RegExp(`sdk\\.${field} must be`),
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
