// oak:v1-only — OpenCode 1 discovers file-based tools here. OpenCode 2 registers
// the same definitions from runtime/v2/open-design.ts. Delete with the OpenCode 1 line.
import { tool } from "@opencode-ai/plugin"
import { OPEN_DESIGN_TOOLS } from "./open-design-tools.mjs"

function v1Tool(name: string) {
  const definition = OPEN_DESIGN_TOOLS.find((entry) => entry.name === name)
  if (!definition) throw new Error(`unknown Open Design tool ${name}`)
  const args = Object.fromEntries(
    Object.entries(definition.args).map(([key, presence]) => [
      key,
      presence === "optional" ? tool.schema.string().optional() : tool.schema.string(),
    ]),
  )
  return tool({
    description: definition.description,
    args,
    execute: (input) => definition.execute(input as Record<string, string | undefined>),
  })
}

export const health = v1Tool("health")
export const list_agents = v1Tool("list_agents")
export const list_skills = v1Tool("list_skills")
export const list_design_systems = v1Tool("list_design_systems")
export const create_project = v1Tool("create_project")
export const run_design = v1Tool("run_design")
