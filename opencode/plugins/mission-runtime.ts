import type { Plugin } from "@opencode-ai/plugin"

import { createMissionObserver } from "../scripts/mission-runtime-observer.mjs"
import { appendRunEvent } from "../scripts/task-run.mjs"

const TOAST_DURATION_MS = 1_500

function toastVariant(activity: string) {
  if (activity === "blocked") return "error" as const
  if (activity === "idle") return "info" as const
  return "success" as const
}

export const MissionRuntimePlugin: Plugin = async ({ client, directory }) => {
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
  function recordSession(info: { id: string; parentID?: string }) {
    if (recordedSessions.has(info.id)) return
    recordedSessions.add(info.id)
    try {
      appendRunEvent({
        root: directory,
        type: "agent_session",
        fields: {
          session_id: info.id,
          parent_session_id: info.parentID ?? "",
          agent: (info as { agent?: string }).agent ?? "",
          runtime: "opencode",
        },
      })
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
      }
      await observer.observe(event)
    },
  }
}
