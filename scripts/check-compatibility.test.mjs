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

function writeJson(root, relative, value) {
  const full = path.join(root, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`);
}

function makeFixture(t, compatibility = VALID_COMPATIBILITY) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oak-compat-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeJson(root, "compatibility.json", compatibility);
  writeJson(root, "package.json", ROOT_PACKAGE);
  writeJson(root, "opencode/package.json", PACKAGED_PACKAGE);
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
