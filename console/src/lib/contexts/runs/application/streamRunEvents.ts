import type { RunEventPublisher } from './ports/RunEventPublisher'
import type { OpenCodeSessionRepository } from './ports/OpenCodeSessionRepository'

export async function streamRunEvents(runId: string, repository: OpenCodeSessionRepository, publisher: RunEventPublisher, enqueue: (payload: string) => void) {
  const detail = await repository.getSession(runId)
  if (!detail) throw new Error(`Run not found: ${runId}`)

  for (const event of detail.events ?? []) {
    enqueue(`id: ${event.sequence}\nevent: run-event\ndata: ${JSON.stringify(event)}\n\n`)
  }
  return publisher.subscribe(runId, (event) => {
    enqueue(`id: ${event.sequence}\nevent: run-event\ndata: ${JSON.stringify(event)}\n\n`)
  })
}
