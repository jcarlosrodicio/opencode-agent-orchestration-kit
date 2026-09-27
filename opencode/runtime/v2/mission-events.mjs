// Translates OpenCode 2 events ({ type, data }) into the OpenCode 1 event shape
// ({ type, properties }) consumed by scripts/mission-runtime-observer.mjs, and
// into the agent_session run events that runtime/v1/mission-runtime.ts records.
const EXECUTION_EVENTS = {
  "session.execution.started": (sessionID) => ({
    type: "session.status",
    properties: { sessionID, status: { type: "busy" } },
  }),
  "session.execution.succeeded": (sessionID) => ({ type: "session.idle", properties: { sessionID } }),
  "session.execution.interrupted": (sessionID) => ({ type: "session.idle", properties: { sessionID } }),
  "session.execution.failed": (sessionID) => ({ type: "session.error", properties: { sessionID } }),
};

function nonEmpty(value) {
  return typeof value === "string" && value ? value : null;
}

export function toObserverEvent(event) {
  const sessionID = nonEmpty(event?.data?.sessionID);
  if (!sessionID) return null;

  if (event.type === "session.created") {
    return { type: "session.created", properties: { info: { id: sessionID, parentID: nonEmpty(event.data.parentID) } } };
  }

  const translate = EXECUTION_EVENTS[event.type];
  return translate ? translate(sessionID) : null;
}

export function toSessionRecord(event) {
  const sessionID = nonEmpty(event?.data?.sessionID);
  if (!sessionID) return null;
  const created = event.type === "session.created";
  return {
    session_id: sessionID,
    parent_session_id: (created && nonEmpty(event.data.parentID)) || "",
    agent: (created && nonEmpty(event.data.agent)) || "",
    runtime: "opencode",
  };
}

// Link each session to the open task run, if any. Best effort: it must never
// affect the session itself. A session is marked as recorded only once an
// event was written, so a session that started before the run opened is
// still linked later.
// The OpenCode 2 event stream covers every location a server has open, so a
// session seen in another directory is ignored, including its later events
// that carry no location.
export function createSessionRecorder(append, directory) {
  const recorded = new Set();
  const foreign = new Set();
  return (event) => {
    const record = toSessionRecord(event);
    if (!record || recorded.has(record.session_id)) return;
    const location = nonEmpty(event.location?.directory) ?? nonEmpty(event.data?.location?.directory);
    if (location && location !== directory) foreign.add(record.session_id);
    if (foreign.has(record.session_id)) return;
    try {
      if (append(record)) recorded.add(record.session_id);
    } catch {
      // Recording is best effort and must never affect the session.
    }
  };
}
