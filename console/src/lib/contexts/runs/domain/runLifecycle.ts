import type { WorkflowId } from '../../launch/domain/workflow'
import type { ConfigSnapshotView, ExecutionMode, RunStatus, ValidationStatus } from '../read-models/run'

export type NormalizedRunEventKind = 'lifecycle' | 'thinking' | 'output' | 'raw' | 'error' | 'metric'

export interface RealRunRecord {
  id: string
  title: string
  workflowId: WorkflowId
  status: RunStatus
  validation: ValidationStatus
  activeAgent: string
  startedAt: string
  updatedAt: string
  completedAt?: string
  elapsedSeconds: number
  tokens: number
  costUsd: number
  artifacts: number
  prompt: string
  executionMode: ExecutionMode
  finalOutput: string
  opencodeSessionId?: string
}

export interface PersistedConfigSnapshot extends ConfigSnapshotView {
  runnerMode: 'mock-stream' | 'real-opencode' | 'native-opencode'
  createdAt: string
}

export interface NormalizedRunEvent {
  id: string
  runId: string
  sequence: number
  timestamp: string
  agent: string
  stageId: string
  kind: NormalizedRunEventKind
  message: string
  raw: unknown
  status?: RunStatus
  tokens?: number
  opencodeSessionId?: string
}

export interface PersistedRunDetail {
  run: RealRunRecord
  configSnapshot: PersistedConfigSnapshot
  events: NormalizedRunEvent[]
  artifacts: unknown[]
}

export interface StartRunRequest {
  workflowId: WorkflowId
  title: string
  prompt: string
  models?: Record<string, string>
  skills?: string[]
  tools?: string[]
  workdir?: string
  thinkingVisible?: boolean
}
