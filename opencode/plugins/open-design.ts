import type { Plugin as V2Plugin } from "@opencode/plugin"
import { openDesignV2 } from "../runtime/v2/open-design.ts"

// OpenCode 1 loads the Open Design tools from tools/open_design.ts, so its
// `server` hook registers nothing. Retiring OpenCode 1 deletes the marked line.
const plugin = {
  id: "oak.open-design",
  server: async () => ({}), // oak:v1-only
  setup: openDesignV2,
}

export default plugin satisfies Pick<V2Plugin.Plugin, "id" | "setup">
