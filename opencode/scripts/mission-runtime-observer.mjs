const ACTIVITIES = new Set(["running", "idle", "blocked"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stable(value[key])]),
  );
}

function sessionIdFrom(event) {
  const properties = event?.properties;
  if (typeof properties?.sessionID === "string" && properties.sessionID) {
    return properties.sessionID;
  }
  if (typeof properties?.info?.id === "string" && properties.info.id) {
    return properties.info.id;
  }
  return undefined;
}

function activityFrom(event) {
  const type = event?.type;
  if (type === "session.status") {
    const status = event.properties?.status;
    if (status?.type === "idle") return "idle";
    if (status?.type === "busy" || status?.type === "retry") return "running";
  }
  if (type === "session.idle") return "idle";
  if (type === "session.error") return "blocked";
  if (
    type === "tool.execute.before"
    || type === "tool.execute.after"
    || type === "session.compacted"
    || type === "chat.message"
  ) {
    return "running";
  }
  return undefined;
}

function eventKey(event, sessionId) {
  return JSON.stringify(stable({
    type: event?.type ?? null,
    session_id: sessionId ?? null,
    properties: event?.properties ?? null,
  }));
}

export function createMissionObserver({ notify = async () => {}, log = () => {} } = {}) {
  const childSessions = new Set();
  const seenEvents = new Set();
  let rootSessionId;
  let eventCount = 0;

  const observe = async (event) => {
    eventCount += 1;
    const properties = isObject(event?.properties) ? event.properties : {};
    const info = properties.info;
    if (isObject(info) && typeof info.id === "string" && info.parentID) {
      childSessions.add(info.id);
    } else if (
      event?.type === "session.created"
      && isObject(info)
      && typeof info.id === "string"
      && !info.parentID
      && !rootSessionId
    ) {
      rootSessionId = info.id;
    }

    const sessionId = sessionIdFrom(event);
    if (sessionId && childSessions.has(sessionId)) {
      return { ignored: "child_session", session_id: sessionId };
    }

    const key = eventKey(event, sessionId);
    if (seenEvents.has(key)) {
      return { ignored: "duplicate", session_id: sessionId };
    }
    seenEvents.add(key);

    const activity = activityFrom(event);
    if (!activity || !sessionId) {
      return { ignored: "unobservable", session_id: sessionId };
    }

    const observation = {
      activity,
      event_type: event.type,
      session_id: sessionId,
      event_count: eventCount,
    };
    try {
      await notify(observation);
    } catch (error) {
      try {
        log(`[mission-runtime] notification failed: ${error instanceof Error ? error.name : "unknown"}`);
      } catch {
        // Logging is best effort and must not affect the loop.
      }
      return { ...observation, notification_error: true };
    }
    return observation;
  };

  return {
    observe,
    stats() {
      return {
        root_session_id: rootSessionId,
        child_session_ids: [...childSessions].sort(),
        event_count: eventCount,
        unique_event_count: seenEvents.size,
      };
    },
  };
}

export { ACTIVITIES };
