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

function writeJson(root, relative, value) {
  const full = path.join(root, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`);
}

function makeFixture(t, compatibility = VALID_COMPATIBILITY) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oak-compat-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeJson(root, "compatibility.json", compatibility);
  return root;
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
