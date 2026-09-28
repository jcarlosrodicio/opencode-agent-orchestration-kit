import type { Plugin as V2Plugin } from "@opencode/plugin"
import { missionRuntimeV1 } from "../runtime/v1/mission-runtime.ts" // oak:v1-only
import { missionRuntimeV2 } from "../runtime/v2/mission-runtime.ts"

// One default export serves both runtimes: OpenCode 1 calls `server`,
// OpenCode 2 calls `setup`. Retiring OpenCode 1 deletes the marked lines.
const plugin = {
  id: "oak.mission-runtime",
  server: missionRuntimeV1, // oak:v1-only
  setup: missionRuntimeV2,
}

export default plugin satisfies Pick<V2Plugin.Plugin, "id" | "setup">
