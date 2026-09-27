import assert from "node:assert/strict";
import test from "node:test";
import { createMissionObserver } from "../../scripts/mission-runtime-observer.mjs";
import { createSessionRecorder, toObserverEvent, toSessionRecord } from "./mission-events.mjs";

test("maps session.created with and without a parent", () => {
  assert.deepEqual(toObserverEvent({ type: "session.created", data: { sessionID: "root" } }), {
    type: "session.created",
    properties: { info: { id: "root", parentID: null } },
  });
  assert.deepEqual(
    toObserverEvent({ type: "session.created", data: { sessionID: "child", parentID: "root" } }),
    { type: "session.created", properties: { info: { id: "child", parentID: "root" } } },
  );
});

test("maps execution lifecycle to observer activities", () => {
  assert.deepEqual(toObserverEvent({ type: "session.execution.started", data: { sessionID: "s" } }), {
    type: "session.status",
    properties: { sessionID: "s", status: { type: "busy" } },
  });
  for (const type of ["session.execution.succeeded", "session.execution.interrupted"]) {
    assert.deepEqual(toObserverEvent({ type, data: { sessionID: "s" } }), {
      type: "session.idle",
      properties: { sessionID: "s" },
    });
  }
  assert.deepEqual(toObserverEvent({ type: "session.execution.failed", data: { sessionID: "s" } }), {
    type: "session.error",
    properties: { sessionID: "s" },
  });
});

test("ignores unknown events and malformed payloads", () => {
  for (const event of [
    null,
    { type: "session.text.started", data: { sessionID: "s" } },
    { type: "session.execution.started" },
    { type: "session.execution.started", data: { sessionID: "" } },
  ]) {
    assert.equal(toObserverEvent(event), null);
  }
});

test("translated events drive the shared observer like OpenCode 1 events", async () => {
  const observations = [];
  const observer = createMissionObserver({ notify: async (value) => observations.push(value) });
  for (const event of [
    { type: "session.created", data: { sessionID: "root" } },
    { type: "session.created", data: { sessionID: "child", parentID: "root" } },
    { type: "session.execution.started", data: { sessionID: "root" } },
    { type: "session.execution.started", data: { sessionID: "child" } },
    { type: "session.execution.failed", data: { sessionID: "root" } },
  ]) {
    const translated = toObserverEvent(event);
    if (translated) await observer.observe(translated);
  }
  assert.deepEqual(observations.map((entry) => entry.activity), ["running", "blocked"]);
  assert.deepEqual(observer.stats().child_session_ids, ["child"]);
});

test("maps session.created to an agent_session record with parent and agent", () => {
  assert.deepEqual(
    toSessionRecord({ type: "session.created", data: { sessionID: "child", parentID: "root", agent: "developer" } }),
    { session_id: "child", parent_session_id: "root", agent: "developer", runtime: "opencode" },
  );
  assert.deepEqual(toSessionRecord({ type: "session.created", data: { sessionID: "root" } }), {
    session_id: "root",
    parent_session_id: "",
    agent: "",
    runtime: "opencode",
  });
});

test("maps any other event with a session id to a bare agent_session record", () => {
  assert.deepEqual(toSessionRecord({ type: "session.execution.started", data: { sessionID: "s", agent: "x" } }), {
    session_id: "s",
    parent_session_id: "",
    agent: "",
    runtime: "opencode",
  });
  for (const event of [null, { type: "session.created" }, { type: "x", data: { sessionID: "" } }]) {
    assert.equal(toSessionRecord(event), null);
  }
});

test("recorder marks a session only after its event was written", () => {
  const written = [];
  let open = false;
  const record = createSessionRecorder((fields) => {
    if (!open) return null;
    written.push(fields.session_id);
    return { type: "agent_session" };
  });
  record({ type: "session.created", data: { sessionID: "s" } });
  open = true;
  record({ type: "session.execution.started", data: { sessionID: "s" } });
  record({ type: "session.execution.succeeded", data: { sessionID: "s" } });
  assert.deepEqual(written, ["s"]);
});

test("recorder never lets a recording failure escape", () => {
  const record = createSessionRecorder(() => {
    throw new Error("disk full");
  });
  assert.doesNotThrow(() => record({ type: "session.created", data: { sessionID: "s" } }));
});
