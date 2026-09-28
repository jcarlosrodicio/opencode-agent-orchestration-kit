import type { Plugin as V2Plugin } from "@opencode/plugin"

// OpenCode 2 loads a plugin directory's CLI entry (tui.tsx) only when the
// directory also has a server entry. OpenCode 1 ignores plugin directories.
export default {
  id: "oak.tui",
  setup() {},
} satisfies V2Plugin.Plugin
