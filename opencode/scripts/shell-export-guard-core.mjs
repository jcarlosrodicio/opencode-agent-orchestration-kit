import { classifyShellExport } from "./shell-export-policy.mjs";

export const BLOCK_MESSAGE =
  "Sensitive shell export blocked by policy; use an explicit non-secret value or a scoped secret-aware tool.";

// OpenCode 1 names the shell tool `bash`; OpenCode 2 names it `shell`.
const SHELL_TOOLS = new Set(["bash", "shell"]);

export function assertShellCallAllowed(toolName, args) {
  const tool = String(toolName ?? "").toLowerCase();
  if (!SHELL_TOOLS.has(tool)) return;
  if (!args || typeof args !== "object") return;

  const command = args.command;
  if (typeof command !== "string") return;

  const decision = classifyShellExport(command);
  if (decision.blocked) {
    throw new Error(`[shell-export-guard:${decision.rule}] ${BLOCK_MESSAGE}`);
  }
}
