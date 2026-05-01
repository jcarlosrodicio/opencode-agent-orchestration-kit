import { allAgentKeys } from '$lib/contexts/launch/adapters/workflowCatalog'
import { getAgentModelOptions } from '$lib/contexts/launch/adapters/localModelCatalog.server'

export async function load() {
  return {
    modelOptions: await getAgentModelOptions(allAgentKeys)
  }
}
