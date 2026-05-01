import { error, json } from '@sveltejs/kit'
import { nativeOpenCodeSessionRepository } from '$lib/contexts/runs/adapters/nativeOpenCodeSessionRepository.server'
import { opencodeProcessRunner } from '$lib/contexts/runs/adapters/opencodeProcessRunner.server'
import { getRun } from '$lib/contexts/runs/application/getRun'

export async function GET({ params }) {
  const detail = await getRun(params.runId, nativeOpenCodeSessionRepository, opencodeProcessRunner)
  if (!detail) throw error(404, 'Run not found')
  return json({ run: detail })
}
