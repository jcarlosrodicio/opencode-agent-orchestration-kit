import type { OpenCodeRunner } from '../application/ports/OpenCodeRunner'

export const mockWorkflowRunner: OpenCodeRunner = {
  async start() {
    // Mock-backed workflows are persisted by the StartRun use case in this slice.
    return ''
  },
  async stop() {
    return false
  },
  activeRunIds() {
    return new Set()
  }
}
