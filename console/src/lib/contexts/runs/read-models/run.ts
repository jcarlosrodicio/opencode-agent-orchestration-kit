import type { WorkflowId } from '../../launch/domain/workflow'

export type RunStatus = 'running' | 'completed' | 'blocked' | 'failed' | 'stopped' | 'pending' | 'interrupted'
export type ValidationStatus = 'passed' | 'failed' | 'running' | 'pending' | 'not-run'
export type ExecutionMode = 'real-opencode' | 'mock-stream' | 'native-opencode'

export interface RunSummary {
  id: string
  parentId?: string
  title: string
  workflowId: WorkflowId
  activeAgent: string
  status: RunStatus
  validation: ValidationStatus
  elapsedSeconds: number
  tokens: number
  costUsd: number
  artifacts: number
  startedAt: string
  completedAt?: string
  executionMode?: ExecutionMode
  workdir?: string
}

export interface ChildRunView extends RunSummary {
  parentId: string
  agent: string
  model?: string
  prompt: string
  finalOutput?: string
  opencodeSessionId?: string
}

export interface ConfigSnapshotView {
  workflowId: WorkflowId
  prompt: string
  models: Record<string, string>
  skills: string[]
  tools: string[]
  workdir?: string
  runnerMode: 'mock-stream' | 'structured' | 'pty-mirror' | 'real-opencode' | 'native-opencode'
  createdAt?: string
}

export interface RunDetailView extends RunSummary {
  prompt: string
  configSnapshot: ConfigSnapshotView
  childRuns?: ChildRunView[]
  events?: import('../domain/runLifecycle').NormalizedRunEvent[]
  logs?: import('../../agent-sessions/read-models/agentSession').LogEventView[]
  thinking?: import('../../agent-sessions/read-models/agentSession').LogEventView[]
  finalOutput?: string
  opencodeSessionId?: string
}
