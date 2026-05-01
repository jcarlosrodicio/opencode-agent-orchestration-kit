import type { WorkflowId } from '../../launch/domain/workflow'

export interface AgentCatalogItem {
  key: string
  label: string
  description: string
  modelEnv: string
  workflows: WorkflowId[]
}

export interface SkillView {
  id: string
  label: string
  source: 'local' | 'plugin' | 'optional'
  status: 'active' | 'available' | 'missing'
  description: string
}

export interface ToolHealthView {
  id: string
  label: string
  status: 'active' | 'degraded' | 'missing'
  description: string
}

export interface ConfigPresetView {
  id: string
  name: string
  workflowId: WorkflowId
  promptTemplate: string
  modelOverrides: Record<string, string>
  skills: string[]
  tools: string[]
  updatedAt: string
}
