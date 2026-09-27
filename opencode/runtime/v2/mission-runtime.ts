import type { Plugin } from "@opencode/plugin"
import { appendRunEvent } from "../../scripts/task-run.mjs"
import { createSessionRecorder } from "./mission-events.mjs"

// OpenCode 2 core plugins have no toast API, so the mission toasts live in
// plugins/oak-tui/tui.tsx. This hook only links sessions to the open task run.
export const missionRuntimeV2: Plugin.Plugin["setup"] = (ctx) => {
  const directory = ctx.location.directory
  const record = createSessionRecorder((fields) =>
    appendRunEvent({ root: directory, type: "agent_session", fields }),
  )
  const stop = new AbortController()
  void (async () => {
    try {
      for await (const event of ctx.event.subscribe({ signal: stop.signal })) record(event)
    } catch {
      // The stream ends on shutdown; recording is best effort.
    }
  })()
  return () => stop.abort()
}
