// oak:v1-only — OpenCode 1 server hooks. Delete with the OpenCode 1 line.
import type { Plugin } from "@opencode-ai/plugin"

import { createMissionObserver } from "../../scripts/mission-runtime-observer.mjs"
import { appendRunEvent } from "../../scripts/task-run.mjs"

const TOAST_DURATION_MS = 1_500

function toastVariant(activity: string) {
  if (activity === "blocked") return "error" as const
  if (activity === "idle") return "info" as const
  return "success" as const
}

export const missionRuntimeV1: Plugin = async ({ client, directory }) => {
  const observer = createMissionObserver({
    notify: async observation => {
      if (!client?.tui?.showToast) return
      await client.tui.showToast({
        body: {
          title: "Mission runtime",
          message: `${observation.activity}: ${observation.session_id}`,
          variant: toastVariant(observation.activity),
          duration: TOAST_DURATION_MS,
        },
        query: { directory },
      })
    },
    log: message => console.warn(message),
  })
  const recordedSessions = new Set<string>()

  // Link each session to the open task run, if any. Best effort: it must never
  // affect the session itself.
  // A session is marked as recorded only once an event was written, so a
  // session that started before the run opened is still linked later.
  function recordSession(info: { id: string; parentID?: string }) {
    if (recordedSessions.has(info.id)) return
    try {
      const recorded = appendRunEvent({
        root: directory,
        type: "agent_session",
        fields: {
          session_id: info.id,
          parent_session_id: info.parentID ?? "",
          agent: (info as { agent?: string }).agent ?? "",
          runtime: "opencode",
        },
      })
      if (recorded) recordedSessions.add(info.id)
    } catch {
      // Recording is best effort and must never affect the session.
    }
  }

  return {
    "chat.message": async ({ sessionID }) => {
      await observer.observe({
        type: "chat.message",
        properties: { sessionID },
      })
    },
    event: async ({ event }) => {
      if (event.type === "session.created" && event.properties.info?.id) {
        recordSession(event.properties.info)
      } else {
        const sessionID = (event.properties as { sessionID?: unknown } | undefined)?.sessionID
        if (typeof sessionID === "string" && sessionID) recordSession({ id: sessionID })
      }
      await observer.observe(event)
    },
  }
}
