import { error, json } from '@sveltejs/kit'
import { getEligibleAgents } from '$lib/contexts/launch/adapters/workflowCatalog'
import { getAgentModelOptions } from '$lib/contexts/launch/adapters/localModelCatalog.server'
import type { WorkflowId } from '$lib/contexts/launch/domain/workflow'

export async function GET({ url }) {
  try {
    const workflowId = (url.searchParams.get('workflowId') || 'direct') as WorkflowId
    return json({ agents: await getAgentModelOptions(getEligibleAgents(workflowId)) })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unable to load models'
    throw error(400, message)
  }
}
