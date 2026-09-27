// oak:v1-only — OpenCode 1 server hook. Delete with the OpenCode 1 line.
import type { Plugin } from "@opencode-ai/plugin"
import { assertShellCallAllowed } from "../../scripts/shell-export-guard-core.mjs"

export const shellExportGuardV1: Plugin = async () => ({
  "tool.execute.before": async (input, output) => {
    assertShellCallAllowed(input?.tool, output?.args)
  },
})
