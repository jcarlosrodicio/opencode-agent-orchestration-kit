export type AgentKey =
  | 'lead'
  | 'scoper'
  | 'designer'
  | 'researcher'
  | 'specifier'
  | 'developer'
  | 'reviewer'
  | 'evaluator'
  | 'debugger'
  | 'evolver'
  | 'open-design'
  | 'lead approval'

export type WorkflowId =
  | 'native'
  | 'direct'
  | 'feature'
  | 'scope'
  | 'mvp-spec'
  | 'design'
  | 'research'
  | 'spec'
  | 'implement'
  | 'review'
  | 'evolve'

export type StageKind = 'agent' | 'barrier' | 'handoff' | 'tool'

export interface WorkflowStageDefinition {
  id: string
  label: string
  agent: AgentKey
  kind: StageKind
  optional?: boolean
  disabledInLaunch?: boolean
}

export interface WorkflowDefinition {
  id: WorkflowId
  label: string
  commandLabel: string
  description: string
  entryMode: 'direct_message' | 'slash_command'
  slashCommand?: string
  primaryAgent: AgentKey
  stages: WorkflowStageDefinition[]
  sidecarOnly?: boolean
}

export interface LaunchDraft {
  title: string
  prompt: string
  workflowId: WorkflowId
  selectedPresetId?: string
}

export interface LaunchValidationResult {
  canLaunch: boolean
  reasons: string[]
  eligibleAgents: AgentKey[]
}
