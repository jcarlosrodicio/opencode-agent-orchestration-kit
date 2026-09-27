import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createMissionObserver } from "../scripts/mission-runtime-observer.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("observer ignores child sessions and duplicate root events", async () => {
  const observations = [];
  const observer = createMissionObserver({ notify: async value => observations.push(value) });

  await observer.observe({
    type: "session.created",
    properties: { info: { id: "root", parentID: null } },
  });
  await observer.observe({
    type: "session.created",
    properties: { info: { id: "child", parentID: "root" } },
  });
  const rootStatus = {
    type: "session.status",
    properties: { sessionID: "root", status: { type: "busy" } },
  };
  await observer.observe(rootStatus);
  await observer.observe(rootStatus);
  await observer.observe({
    type: "session.status",
    properties: { sessionID: "child", status: { type: "busy" } },
  });

  assert.equal(observations.length, 1);
  assert.equal(observations[0].session_id, "root");
  assert.deepEqual(observer.stats().child_session_ids, ["child"]);
});

test("plugin has event and notification hooks and writes only run events", () => {
  const source = fs.readFileSync(path.join(root, "runtime/v1/mission-runtime.ts"), "utf8");
  assert.match(source, /missionRuntimeV1/);
  assert.match(source, /event:/);
  assert.match(source, /chat\.message/);
  assert.match(source, /showToast/);
  assert.doesNotMatch(source, /writeFile|appendFile|rename|\.opencode\/loops/);
  assert.match(source, /appendRunEvent/);
  const entry = fs.readFileSync(path.join(root, "plugins/mission-runtime.ts"), "utf8");
  assert.match(entry, /server: missionRuntimeV1/);
  assert.match(entry, /setup: missionRuntimeV2/);
});

test("OpenCode 2 adapter records run events from the event stream only", () => {
  const source = fs.readFileSync(path.join(root, "runtime/v2/mission-runtime.ts"), "utf8");
  assert.match(source, /ctx\.event\.subscribe/);
  assert.match(source, /appendRunEvent/);
  assert.match(source, /"agent_session"/);
  assert.doesNotMatch(source, /writeFile|appendFile|rename|\.opencode\/loops/);
});
