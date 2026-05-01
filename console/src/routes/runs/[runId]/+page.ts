import { error } from '@sveltejs/kit'
import type { RunDetailView } from '$lib/contexts/runs/read-models/run'

export async function load({ params, fetch }: { params: { runId: string }; fetch: typeof globalThis.fetch }) {
  const response = await fetch(`/api/runs/${params.runId}`)
  if (!response.ok) throw error(404, 'Run not found')
  const payload = (await response.json()) as { run: RunDetailView }
  return { runId: params.runId, initialRun: payload.run }
}
