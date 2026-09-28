/** @jsxImportSource @opentui/solid */
import type { Plugin } from "@opencode/plugin/tui"
import { createMemo, Show } from "solid-js"
import { createMissionObserver } from "../../scripts/mission-runtime-observer.mjs"
import { toObserverEvent } from "../../runtime/v2/mission-events.mjs"
import { familyUsage, formatTokens } from "../../runtime/v2/token-usage.mjs"

type Context = Parameters<Plugin.Definition["setup"]>[0]

const TOAST_DURATION_MS = 1_500

function SidebarUsage(props: { context: Context; sessionID: string }) {
  const usage = createMemo(() => {
    const data = props.context.data.session
    const sessions = data.family(props.sessionID).flatMap((id) => {
      const session = data.get(id)
      return session ? [session] : []
    })
    return familyUsage(props.sessionID, sessions)
  })
  const theme = () => props.context.theme

  return (
    <box flexDirection="column" paddingTop={1}>
      <text fg={theme().text.muted}>
        <b>Tokens</b>
      </text>
      <text fg={theme().text.base}>
        Lead {formatTokens(usage().lead)} | Total {formatTokens(usage().lead + usage().subagents)}
      </text>
      <Show when={usage().sessions > 0}>
        <text fg={theme().text.muted}>
          Subagents +{formatTokens(usage().subagents)} | {usage().sessions}
        </text>
      </Show>
    </box>
  )
}

function registerMissionToasts(context: Context) {
  const observer = createMissionObserver({
    notify: async (observation) => {
      context.ui.toast.show({
        title: "Mission runtime",
        message: `${observation.activity}: ${observation.session_id}`,
        variant: observation.activity === "blocked" ? "error" : observation.activity === "idle" ? "info" : "success",
        duration: TOAST_DURATION_MS,
      })
    },
    log: (message) => console.warn(message),
  })
  const forward = (event: unknown) => {
    const translated = toObserverEvent(event)
    if (translated) void observer.observe(translated)
  }
  const stops = [
    context.data.on("session.created", forward),
    context.data.on("session.execution.started", forward),
    context.data.on("session.execution.succeeded", forward),
    context.data.on("session.execution.interrupted", forward),
    context.data.on("session.execution.failed", forward),
  ]
  return () => stops.forEach((stop) => stop())
}

const plugin: Plugin.Definition = {
  id: "oak.tui",
  setup(context) {
    const disposeSidebar = context.ui.slot({
      append: "sidebar.content",
      render: (input) => <SidebarUsage context={context} sessionID={input.sessionID} />,
    })
    const disposeToasts = registerMissionToasts(context)
    return () => {
      disposeSidebar()
      disposeToasts()
    }
  },
}

export default plugin
