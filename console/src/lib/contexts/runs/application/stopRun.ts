import type { NormalizedRunEvent } from '../domain/runLifecycle'
import type { OpenCodeRunner } from './ports/OpenCodeRunner'
import type { RunEventPublisher } from './ports/RunEventPublisher'

interface StopRunInput {
  runId: string
  runner: OpenCodeRunner
  publisher?: RunEventPublisher
}

export async function stopRun(input: StopRunInput) {
  const stopped = await input.runner.stop(input.runId)
  if (!stopped) throw new Error(`Run is not controlled by this console: ${input.runId}`)

  const event: NormalizedRunEvent = {
    id: `${input.runId}_stop`,
    runId: input.runId,
    sequence: Date.now(),
    timestamp: new Date().toISOString(),
    agent: 'system',
    stageId: 'process',
    kind: 'lifecycle',
    message: 'Run stopped by user request.',
    raw: { type: 'run_stopped' },
    status: 'stopped'
  }
  input.publisher?.publish(event)
  return event
}
