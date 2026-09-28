import type { Plugin } from "@opencode/plugin"
import { OPEN_DESIGN_TOOLS, openDesignJsonSchema } from "../../tools/open-design-tools.mjs"

export const openDesignV2: Plugin.Plugin["setup"] = async (ctx) => {
  await ctx.tool.transform((editor) => {
    for (const definition of OPEN_DESIGN_TOOLS) {
      editor.add({
        name: `open_design_${definition.name}`,
        description: definition.description,
        input: openDesignJsonSchema(definition.args),
        async execute(input) {
          return { content: await definition.execute(input as Record<string, string | undefined>) }
        },
      })
    }
  })
}
