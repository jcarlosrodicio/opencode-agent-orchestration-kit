import { error } from '@sveltejs/kit'
import { nativeOpenCodeSessionRepository } from '$lib/contexts/runs/adapters/nativeOpenCodeSessionRepository.server'
import { sseRunEventStream } from '$lib/contexts/runs/adapters/sseRunEventStream.server'
import { streamRunEvents } from '$lib/contexts/runs/application/streamRunEvents'

export async function GET({ params }) {
  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | undefined
  const stream = new ReadableStream({
    async start(controller) {
      try {
        unsubscribe = await streamRunEvents(params.runId, nativeOpenCodeSessionRepository, sseRunEventStream, (payload) => {
          controller.enqueue(encoder.encode(payload))
        })
        controller.enqueue(encoder.encode(`event: ready\ndata: {"runId":"${params.runId}"}\n\n`))
      } catch {
        controller.error(error(404, 'Run not found'))
      }
    },
    cancel() {
      unsubscribe?.()
    }
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive'
    }
  })
}
