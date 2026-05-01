import { error, json } from '@sveltejs/kit'
import { nativeOpenCodeSessionRepository } from '$lib/contexts/runs/adapters/nativeOpenCodeSessionRepository.server'
import { opencodeProcessRunner } from '$lib/contexts/runs/adapters/opencodeProcessRunner.server'
import { sseRunEventStream } from '$lib/contexts/runs/adapters/sseRunEventStream.server'
import { listRuns } from '$lib/contexts/runs/application/listRuns'
import { startRun } from '$lib/contexts/runs/application/startRun'
import type { StartRunRequest } from '$lib/contexts/runs/domain/runLifecycle'

function boundedNumber(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}

export async function GET({ url }) {
  const limit = boundedNumber(url.searchParams.get('limit'), 25, 1, 100)
  const offset = boundedNumber(url.searchParams.get('offset'), 0, 0, 1_000_000)
  return json(await listRuns(nativeOpenCodeSessionRepository, opencodeProcessRunner, limit, offset))
}

export async function POST({ request }) {
  const body = (await request.json()) as Partial<StartRunRequest>
  if (!body.workflowId || !body.prompt?.trim()) throw error(400, 'workflowId and prompt are required')

  const detail = await startRun({
    workflowId: body.workflowId,
    title: body.title ?? '',
    prompt: body.prompt,
    models: body.models,
    skills: body.skills,
    tools: body.tools,
    workdir: body.workdir,
    thinkingVisible: body.thinkingVisible,
    repository: nativeOpenCodeSessionRepository,
    runner: opencodeProcessRunner,
    publisher: sseRunEventStream
  })

  if (!detail) throw error(500, 'OpenCode session was not found in the native database')
  return json({ run: detail }, { status: 201 })
}
