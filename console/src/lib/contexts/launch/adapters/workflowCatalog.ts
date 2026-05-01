import type { AgentKey, WorkflowDefinition, WorkflowId } from '../domain/workflow'

export const workflowCatalog: WorkflowDefinition[] = [
  {
    id: 'native',
    label: 'OpenCode CLI',
    commandLabel: 'opencode',
    description: 'Native OpenCode CLI session.',
    entryMode: 'direct_message',
    primaryAgent: 'developer',
    stages: [{ id: 'developer', label: 'developer', agent: 'developer', kind: 'agent' }]
  },
  {
    id: 'direct',
    label: 'Direct message',
    commandLabel: 'direct message',
    description: 'Small, clear, low-risk work goes straight to developer.',
    entryMode: 'direct_message',
    primaryAgent: 'developer',
    stages: [{ id: 'developer', label: 'developer', agent: 'developer', kind: 'agent' }]
  },
  {
    id: 'feature',
    label: '/feature',
    commandLabel: '/feature',
    description: 'Full product-development flow with explicit barriers.',
    entryMode: 'slash_command',
    slashCommand: '/feature',
    primaryAgent: 'lead',
    stages: [
      { id: 'lead', label: 'lead', agent: 'lead', kind: 'agent' },
      { id: 'designer', label: 'designer if applicable', agent: 'designer', kind: 'agent', optional: true },
      { id: 'researcher', label: 'researcher', agent: 'researcher', kind: 'agent' },
      { id: 'specifier', label: 'specifier', agent: 'specifier', kind: 'agent' },
      { id: 'developer', label: 'developer', agent: 'developer', kind: 'agent' },
      { id: 'reviewer', label: 'reviewer', agent: 'reviewer', kind: 'agent' }
    ]
  },
  {
    id: 'scope',
    label: '/scope',
    commandLabel: '/scope',
    description: 'Research and scoped spec. No design, implementation, or review.',
    entryMode: 'slash_command',
    slashCommand: '/scope',
    primaryAgent: 'scoper',
    stages: [
      { id: 'scoper-intake', label: 'scoper', agent: 'scoper', kind: 'agent' },
      { id: 'researcher', label: 'researcher', agent: 'researcher', kind: 'agent' },
      { id: 'scoper-synthesis', label: 'scoper synthesis', agent: 'scoper', kind: 'handoff' },
      { id: 'specifier', label: 'specifier', agent: 'specifier', kind: 'agent' }
    ]
  },
  {
    id: 'mvp-spec',
    label: '/mvp-spec',
    commandLabel: '/mvp-spec',
    description: 'Strict MVP spec with small tasks and explicit out of scope.',
    entryMode: 'slash_command',
    slashCommand: '/mvp-spec',
    primaryAgent: 'scoper',
    stages: [
      { id: 'scoper-intake', label: 'scoper', agent: 'scoper', kind: 'agent' },
      { id: 'researcher', label: 'researcher', agent: 'researcher', kind: 'agent' },
      { id: 'scoper-synthesis', label: 'scoper synthesis', agent: 'scoper', kind: 'handoff' },
      { id: 'specifier', label: 'specifier', agent: 'specifier', kind: 'agent' }
    ]
  },
  {
    id: 'design',
    label: '/design',
    commandLabel: '/design',
    description: 'Designer creates or runs an Open Design handoff.',
    entryMode: 'slash_command',
    slashCommand: '/design',
    primaryAgent: 'designer',
    stages: [
      { id: 'designer', label: 'designer', agent: 'designer', kind: 'agent' },
      { id: 'open-design', label: 'open-design', agent: 'open-design', kind: 'tool' }
    ]
  },
  {
    id: 'research',
    label: '/research',
    commandLabel: '/research',
    description: 'Direct researcher task.',
    entryMode: 'slash_command',
    slashCommand: '/research',
    primaryAgent: 'researcher',
    stages: [{ id: 'researcher', label: 'researcher', agent: 'researcher', kind: 'agent' }]
  },
  {
    id: 'spec',
    label: '/spec',
    commandLabel: '/spec',
    description: 'Direct specifier task.',
    entryMode: 'slash_command',
    slashCommand: '/spec',
    primaryAgent: 'specifier',
    stages: [{ id: 'specifier', label: 'specifier', agent: 'specifier', kind: 'agent' }]
  },
  {
    id: 'implement',
    label: '/implement',
    commandLabel: '/implement',
    description: 'Direct developer implementation of approved work.',
    entryMode: 'slash_command',
    slashCommand: '/implement',
    primaryAgent: 'developer',
    stages: [{ id: 'developer', label: 'developer', agent: 'developer', kind: 'agent' }]
  },
  {
    id: 'review',
    label: '/review',
    commandLabel: '/review',
    description: 'Direct reviewer task for current diff.',
    entryMode: 'slash_command',
    slashCommand: '/review',
    primaryAgent: 'reviewer',
    stages: [{ id: 'reviewer', label: 'reviewer', agent: 'reviewer', kind: 'agent' }]
  },
  {
    id: 'evolve',
    label: '/evolve',
    commandLabel: '/evolve',
    description: 'AHE harness evolution with evidence, root cause, manifest, and attribution.',
    entryMode: 'slash_command',
    slashCommand: '/evolve',
    primaryAgent: 'lead',
    sidecarOnly: true,
    stages: [
      { id: 'evaluator-before', label: 'evaluator', agent: 'evaluator', kind: 'agent' },
      { id: 'debugger-before', label: 'debugger', agent: 'debugger', kind: 'agent' },
      { id: 'evolver', label: 'evolver', agent: 'evolver', kind: 'agent' },
      { id: 'lead-approval', label: 'lead approval', agent: 'lead approval', kind: 'barrier' },
      { id: 'developer', label: 'developer', agent: 'developer', kind: 'agent' },
      { id: 'evaluator-after', label: 'evaluator', agent: 'evaluator', kind: 'agent' },
      { id: 'debugger-after', label: 'debugger', agent: 'debugger', kind: 'agent' },
      { id: 'reviewer', label: 'reviewer', agent: 'reviewer', kind: 'agent' }
    ]
  }
]

export const allAgentKeys: AgentKey[] = [
  'lead',
  'scoper',
  'designer',
  'researcher',
  'specifier',
  'developer',
  'reviewer',
  'evaluator',
  'debugger',
  'evolver'
]

export function getWorkflow(id: WorkflowId): WorkflowDefinition {
  const workflow = workflowCatalog.find((item) => item.id === id)
  if (!workflow) throw new Error(`Unknown workflow: ${id}`)
  return workflow
}

export function getEligibleAgents(workflowId: WorkflowId): AgentKey[] {
  if (workflowId === 'native') return []
  return Array.from(
    new Set(
      getWorkflow(workflowId)
        .stages.map((stage) => stage.agent)
        .filter((agent) => allAgentKeys.includes(agent))
    )
  )
}
