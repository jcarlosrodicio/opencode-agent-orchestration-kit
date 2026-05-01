import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { agentCatalog } from '$lib/mocks/agents.mock'

const execFileAsync = promisify(execFile)

export interface AgentModelOptions {
  agent: string
  modelEnv: string
  selected: string
  models: string[]
}

export function providerFromModel(model: string) {
  const [provider] = model.split('/')
  return provider || ''
}

export function parseModelList(output: string) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

async function listProviderModels(provider: string) {
  if (!provider) return []
  const { stdout } = await execFileAsync('opencode', ['models', provider])
  return parseModelList(stdout)
}

export async function getAgentModelOptions(agents: string[], listModels = listProviderModels, env: NodeJS.ProcessEnv = process.env): Promise<AgentModelOptions[]> {
  const providerCache = new Map<string, Promise<string[]>>()

  return Promise.all(
    agents.map(async (agent) => {
      const catalog = agentCatalog.find((item) => item.key === agent)
      const modelEnv = catalog?.modelEnv ?? 'OPENCODE_MODEL'
      const selected = env[modelEnv] || env.OPENCODE_MODEL || ''
      const provider = providerFromModel(selected)
      const models = provider
        ? await (providerCache.get(provider) ??
            providerCache.set(
              provider,
              listModels(provider).catch(() => [])
            ).get(provider)!)
        : []

      return {
        agent,
        modelEnv,
        selected,
        models: selected && !models.includes(selected) ? [selected, ...models] : models
      }
    })
  )
}
