import type { NormalizedRunEvent } from '../../domain/runLifecycle'

export interface RunEventPublisher {
  publish(event: NormalizedRunEvent): void
  subscribe(runId: string, listener: (event: NormalizedRunEvent) => void): () => void
}
