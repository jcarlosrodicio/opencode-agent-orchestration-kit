import type { Plugin } from "@opencode/plugin"
import { assertShellCallAllowed } from "../../scripts/shell-export-guard-core.mjs"

export const shellExportGuardV2: Plugin.Plugin["setup"] = async (ctx) => {
  await ctx.tool.hook("execute.before", (event) => {
    assertShellCallAllowed(event.tool, event.input)
  })
}
