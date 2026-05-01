export type AgentSessionStatus = 'pending' | 'running' | 'completed' | 'blocked' | 'failed' | 'stopped'

export interface AgentSessionView {
  id: string
  runId: string
  agent: string
  role: string
  status: AgentSessionStatus
  model: string
  skills: string[]
  tools: string[]
  durationSeconds: number
  inputTokens: number
  outputTokens: number
  currentStep: string
  finalOutput: string
}

export interface LogEventView {
  id: string
  runId: string
  timestamp: string
  agent: string
  stageId: string
  kind: 'log' | 'thinking' | 'final' | 'tool' | 'warning' | 'approval'
  message: string
}
