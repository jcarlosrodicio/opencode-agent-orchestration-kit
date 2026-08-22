import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createMissionObserver } from "./mission-runtime-observer.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function rootCreated(id = "root-1") {
  return {
    type: "session.created",
    properties: { info: { id, parentID: null } },
  };
}

function status(sessionID, type) {
  return {
    type: "session.status",
    properties: { sessionID, status: { type } },
  };
}

test("derives running to idle without touching durable loop state", async () => {
  const observations = [];
  const observer = createMissionObserver({ notify: async value => observations.push(value) });

  await observer.observe(rootCreated());
  await observer.observe(status("root-1", "busy"));
  await observer.observe({ type: "session.idle", properties: { sessionID: "root-1" } });

  assert.deepEqual(observations.map(item => item.activity), ["running", "idle"]);
  assert.equal(observer.stats().root_session_id, "root-1");
});

test("maps errors to blocked and compaction back to running for the same session", async () => {
  const observations = [];
  const observer = createMissionObserver({ notify: async value => observations.push(value) });

  await observer.observe(rootCreated("root-2"));
  await observer.observe({ type: "session.error", properties: { sessionID: "root-2" } });
  await observer.observe({ type: "session.compacted", properties: { sessionID: "root-2" } });

  assert.deepEqual(observations.map(item => [item.activity, item.session_id]), [
    ["blocked", "root-2"],
    ["running", "root-2"],
  ]);
});

test("ignores child sessions and duplicate events", async () => {
  const observations = [];
  const observer = createMissionObserver({ notify: async value => observations.push(value) });
  const childCreated = {
    type: "session.created",
    properties: { info: { id: "child-1", parentID: "root-3" } },
  };

  await observer.observe(rootCreated("root-3"));
  await observer.observe(childCreated);
  await observer.observe(status("child-1", "busy"));
  const rootStatus = status("root-3", "busy");
  await observer.observe(rootStatus);
  await observer.observe(rootStatus);

  assert.equal(observations.length, 1);
  assert.equal(observations[0].session_id, "root-3");
  assert.deepEqual(observer.stats(), {
    root_session_id: "root-3",
    child_session_ids: ["child-1"],
    event_count: 5,
    unique_event_count: 2,
  });
});

test("notification failures are logged and never escape the observer", async () => {
  const logs = [];
  const observer = createMissionObserver({
    notify: async () => { throw new Error("transport down"); },
    log: message => logs.push(message),
  });

  await observer.observe(rootCreated("root-4"));
  const result = await observer.observe(status("root-4", "busy"));

  assert.equal(result.notification_error, true);
  assert.deepEqual(logs, ["[mission-runtime] notification failed: Error"]);
});

test("plugin is an observer only and uses an optional TUI notification", () => {
  const source = fs.readFileSync(path.join(root, "plugins/mission-runtime.ts"), "utf8");
  assert.match(source, /event:/);
  assert.match(source, /chat\.message/);
  assert.match(source, /showToast/);
  assert.doesNotMatch(source, /fs\.|writeFile|appendFile|rename|\.opencode\/loops/);
  assert.match(source, /mission-runtime-observer\.mjs/);
});
