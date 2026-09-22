import type { Plugin } from "@opencode-ai/plugin"
// @ts-ignore - plain ESM helper, shared with the CLI entrypoint and its tests
import { route } from "../scripts/route-jev.mjs"

// Optional external router for `lead`.
//
// Disabled unless the operator exports OAK_ROUTER=jev: `route()` returns
// `unavailable` without touching the network, nothing is injected, and `lead`
// routes exactly as it does today. That is the default and the majority case.
//
// It lives in a plugin rather than in lead's prompt because two measured probes
// showed `lead` ignoring a contract that told it to call the router - once
// conditionally, once unconditionally - while happily making ten other bash
// calls in the same run. A routing step the model can forget is not a routing
// step.
//
// Privacy boundary: only the user's own request text is sent. The plugin never
// reads a file and never forwards repository contents.
//
// Failure policy: every path is wrapped. A plugin that throws here would break
// every session for everyone, which is a far worse outcome than a slow route.

const DEBUG = process.env.OAK_ROUTER_DEBUG === "1"
const log = (msg: string) => {
  if (!DEBUG) return
  try { require("node:fs").appendFileSync("/tmp/jev-plugin.log", `${new Date().toISOString()} ${msg}\n`) } catch {}
}

const PENDING = new Map<string, string>()
const MAX_TRACKED = 50
const MAX_ROUTABLE_CHARS = Number(process.env.OAK_ROUTER_MAX_CHARS || 1500)

export const JevRouterPlugin: Plugin = async () => {
  log("plugin loaded")
  return {
    "chat.message": async (input: any, output: any) => {
      try {
        log(`chat.message agent=${input?.agent} session=${input?.sessionID}`)
        if (input?.agent !== "lead") return
        const sessionID = input?.sessionID
        if (!sessionID) return

        const text = (output?.parts ?? [])
          .filter((p: any) => p?.type === "text" && typeof p?.text === "string")
          .map((p: any) => p.text)
          .join("\n")
          .trim()
        if (!text) return

        // Only free-form messages are a routing question. An explicit command
        // (`/feature`, `/plan`, `/scope`...) already mandates its flow in the
        // command contract, so there is nothing to route and the answer would
        // be both useless and harmful - measured once injecting `ask_user`
        // into a flow the user had explicitly commanded.
        //
        // OpenCode's `chat.message` exposes no flag for this, so the signal
        // used here is size: a rendered command template arrives expanded
        // (feature.md measured at 4337 characters) while a routing request is
        // a sentence or two. This is a heuristic standing in for a missing
        // upstream signal, and it is the weakest part of this plugin.
        if (text.length > MAX_ROUTABLE_CHARS) {
          log(`skipped: ${text.length} chars looks like an expanded command template`)
          return
        }

        const answer = await route(text)
        log(`route answer=${JSON.stringify(answer)}`)
        if (answer?.status === "ok") {
          PENDING.set(sessionID, `route: ${answer.route}\nconfidence: high\nrouter: jev (${answer.model ?? "unknown"}, confidence ${answer.confidence})`)
        } else if (answer?.status === "low_confidence") {
          PENDING.set(sessionID, `route: ask_user\nconfidence: low\nrouter: jev reported low confidence (${answer.confidence}); ask instead of choosing silently`)
        }

        // Bound the map: a long-lived process must not accumulate sessions.
        if (PENDING.size > MAX_TRACKED) {
          const oldest = PENDING.keys().next().value
          if (oldest) PENDING.delete(oldest)
        }
      } catch {
        // Never let routing advice break message handling.
      }
    },

    "experimental.chat.system.transform": async (input: any, output: any) => {
      try {
        const sessionID = input?.sessionID
        if (!sessionID) return
        const advice = PENDING.get(sessionID)
        log(`system.transform session=${sessionID} advice=${advice ? "yes" : "no"}`)
        if (!advice) return
        PENDING.delete(sessionID)
        if (!Array.isArray(output?.system)) return
        output.system.push(
          [
            "## Routing decision already made",
            "",
            "An external classifier answered the routing question for this request.",
            "Emit this block verbatim as your routing decision and delegate accordingly.",
            "Do not re-derive it and do not justify the agents it discarded.",
            "",
            advice,
          ].join("\n"),
        )
      } catch {
        // Never let routing advice break system prompt assembly.
      }
    },
  }
}
