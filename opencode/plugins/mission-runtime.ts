import type { Plugin } from "@opencode-ai/plugin"

import { createMissionObserver } from "../scripts/mission-runtime-observer.mjs"

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

  return {
    "chat.message": async ({ sessionID }) => {
      await observer.observe({
        type: "chat.message",
        properties: { sessionID },
      })
    },
    event: async ({ event }) => {
      await observer.observe(event)
    },
  }
}
