import { agentCatalog } from '$lib/mocks/agents.mock'
import type { AgentSessionView } from '../read-models/agentSession'

const runningAgents = new Set(['developer'])
const completedAgents = new Set(['lead', 'designer', 'researcher'])
const blockedAgents = new Set(['specifier'])

export function buildAgentSessions(runId: string, participatingAgents: string[]): AgentSessionView[] {
  return participatingAgents.map((agent) => {
    const catalog = agentCatalog.find((item) => item.key === agent)
    const status = runningAgents.has(agent)
      ? 'running'
      : completedAgents.has(agent)
        ? 'completed'
        : blockedAgents.has(agent)
          ? 'blocked'
          : 'pending'

    return {
      id: `${runId}_${agent}`,
      runId,
      agent,
      role: catalog?.description ?? `${agent} stage`,
      status,
      model: catalog?.modelEnv ?? 'OPENCODE_MODEL',
      skills: agent === 'designer' ? ['open-design', 'impeccable'] : agent === 'developer' ? ['superpowers'] : [],
      tools: agent === 'designer' ? ['open-design', 'filesystem'] : ['filesystem', 'git'],
      durationSeconds: status === 'pending' ? 0 : agent === 'developer' ? 921 : 540,
      inputTokens: status === 'pending' ? 0 : 26000,
      outputTokens: status === 'pending' ? 0 : 8400,
      currentStep: status === 'running' ? 'Implementing authentication endpoints and middleware.' : status === 'blocked' ? 'Waiting for spec approval.' : 'Stage output captured.',
      finalOutput: status === 'completed' ? `${agent} handoff completed with evidence and next-step notes.` : ''
    }
  })
}
