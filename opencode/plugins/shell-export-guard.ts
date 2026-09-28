import type { Plugin as V2Plugin } from "@opencode/plugin"
import { shellExportGuardV1 } from "../runtime/v1/shell-export-guard.ts" // oak:v1-only
import { shellExportGuardV2 } from "../runtime/v2/shell-export-guard.ts"

// One default export serves both runtimes: OpenCode 1 calls `server`,
// OpenCode 2 calls `setup`. Retiring OpenCode 1 deletes the marked lines.
const plugin = {
  id: "oak.shell-export-guard",
  server: shellExportGuardV1, // oak:v1-only
  setup: shellExportGuardV2,
}

export default plugin satisfies Pick<V2Plugin.Plugin, "id" | "setup">
