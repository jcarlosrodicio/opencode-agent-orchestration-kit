import assert from "node:assert/strict";
import test from "node:test";
import { EXPECTED_LOCAL_PLUGINS, assertPluginsActive, parseSmokeArgs, parseVersion } from "./opencode-v2-smoke.mjs";

const active = (id, type = "local") => ({ id, source: { type }, features: {}, state: { status: "active" } });

test("parses mode and version", () => {
  assert.deepEqual(parseSmokeArgs(["core", "2.0.18"]), { mode: "core", request: "2.0.18" });
  assert.deepEqual(parseSmokeArgs(["core", "latest"]), { mode: "core", request: "latest" });
  assert.deepEqual(parseSmokeArgs(["default", "2.0.18"]), { mode: "default", request: "2.0.18" });
  for (const argv of [[], ["core"], ["other", "2.0.18"], ["core", "2.0"], ["default", "latest"]]) {
    assert.throws(() => parseSmokeArgs(argv), /usage:/);
  }
});

test("reads the version from the OpenCode 2 banner", () => {
  assert.equal(parseVersion("opencode v2.0.18\n"), "2.0.18");
  assert.equal(parseVersion("2.1.0"), "2.1.0");
  assert.equal(parseVersion("opencode vnext"), null);
});

test("accepts a bare array or a data envelope with every OAK plugin active", () => {
  const list = [...EXPECTED_LOCAL_PLUGINS.map((id) => active(id)), active("opencode.agent", "builtin")];
  assert.deepEqual(assertPluginsActive(list).sort(), [...EXPECTED_LOCAL_PLUGINS].sort());
  assert.deepEqual(assertPluginsActive({ data: list }).sort(), [...EXPECTED_LOCAL_PLUGINS].sort());
});

test("rejects a failed or missing OAK plugin without echoing error text or paths", () => {
  const list = EXPECTED_LOCAL_PLUGINS.map((id) => active(id));
  list[0] = { ...list[0], state: { status: "failed", error: "/private/path boom" } };
  assert.throws(
    () => assertPluginsActive(list),
    (error) => /failed/.test(error.message) && !error.message.includes("/private/path"),
  );
  assert.throws(() => assertPluginsActive(list.slice(1)), /missing/);
});

test("rejects a local plugin that failed before it reported an id", () => {
  const list = [
    ...EXPECTED_LOCAL_PLUGINS.slice(1).map((id) => active(id)),
    { source: { type: "local", path: "/private/cfg/plugins/mission-runtime.ts" }, state: { status: "failed" } },
  ];
  assert.throws(
    () => assertPluginsActive(list),
    (error) => /mission-runtime\.ts failed/.test(error.message) && !error.message.includes("/private/cfg"),
  );
});
