export type StageStatus = 'queued' | 'running' | 'completed' | 'blocked' | 'failed' | 'stopped' | 'skipped'

export interface StageView {
  id: string
  label: string
  agent: string
  status: StageStatus
  durationSeconds?: number
  barrierReason?: string
}

export interface FlowNodeView {
  id: string
  label: string
  agent: string
  status: StageStatus
  x: number
  y: number
}

export interface FlowEdgeView {
  from: string
  to: string
  kind: 'normal' | 'optional' | 'barrier' | 'approval'
}

export interface TimelineProjection {
  runId: string
  stages: StageView[]
  nodes: FlowNodeView[]
  edges: FlowEdgeView[]
}
