import type { NormalizedRunEvent } from '../domain/runLifecycle'
import type { RunEventPublisher } from '../application/ports/RunEventPublisher'

const listeners = new Map<string, Set<(event: NormalizedRunEvent) => void>>()

export const sseRunEventStream: RunEventPublisher = {
  publish(event) {
    listeners.get(event.runId)?.forEach((listener) => listener(event))
  },

  subscribe(runId, listener) {
    const runListeners = listeners.get(runId) ?? new Set()
    runListeners.add(listener)
    listeners.set(runId, runListeners)
    return () => {
      runListeners.delete(listener)
      if (runListeners.size === 0) listeners.delete(runId)
    }
  }
}
