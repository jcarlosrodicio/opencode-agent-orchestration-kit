import type { Plugin } from "@opencode/plugin"
import { appendRunEvent } from "../../scripts/task-run.mjs"
import { createSessionRecorder } from "./mission-events.mjs"

// OpenCode 2 core plugins have no toast API, so the mission toasts live in
// plugins/oak-tui/tui.tsx. This hook only links sessions to the open task run.
export const missionRuntimeV2: Plugin.Plugin["setup"] = (ctx) => {
  const directory = ctx.location.directory
  const record = createSessionRecorder(
    (fields) => appendRunEvent({ root: directory, type: "agent_session", fields }),
    directory,
  )
  const stop = new AbortController()
  void (async () => {
    // A slow consumer can fail the stream, so resubscribe until the plugin stops.
    while (!stop.signal.aborted) {
      try {
        for await (const event of ctx.event.subscribe({ signal: stop.signal })) record(event)
      } catch {
        // Recording is best effort.
      }
      if (!stop.signal.aborted) await new Promise((resolve) => setTimeout(resolve, 1_000))
    }
  })()
  return () => stop.abort()
}
