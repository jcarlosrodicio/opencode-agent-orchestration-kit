import type { Plugin } from "@opencode-ai/plugin";
import { classifyShellExport } from "../scripts/shell-export-policy.mjs";

const BLOCK_MESSAGE =
  "Sensitive shell export blocked by policy; use an explicit non-secret value or a scoped secret-aware tool.";

export const ShellExportGuardPlugin: Plugin = async () => ({
  "tool.execute.before": async (input, output) => {
    const tool = String(input?.tool ?? "").toLowerCase();
    if (tool !== "bash" && tool !== "shell") return;

    const args = output?.args;
    if (!args || typeof args !== "object") return;

    const command = (args as Record<string, unknown>).command;
    if (typeof command !== "string") return;

    const decision = classifyShellExport(command);
    if (decision.blocked) {
      throw new Error(`[shell-export-guard:${decision.rule}] ${BLOCK_MESSAGE}`);
    }
  },
});
