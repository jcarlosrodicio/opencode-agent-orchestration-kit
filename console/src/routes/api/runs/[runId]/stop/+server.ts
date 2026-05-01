import { error, json } from '@sveltejs/kit'
import { opencodeProcessRunner } from '$lib/contexts/runs/adapters/opencodeProcessRunner.server'
import { sseRunEventStream } from '$lib/contexts/runs/adapters/sseRunEventStream.server'
import { stopRun } from '$lib/contexts/runs/application/stopRun'

export async function POST({ params }) {
  try {
    const event = await stopRun({
      runId: params.runId,
      runner: opencodeProcessRunner,
      publisher: sseRunEventStream
    })
    return json({ event })
  } catch {
    throw error(404, 'Run not found')
  }
}
