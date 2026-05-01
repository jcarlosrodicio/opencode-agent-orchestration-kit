import { getWorkflow } from '$lib/contexts/launch/adapters/workflowCatalog'
import type { WorkflowId } from '$lib/contexts/launch/domain/workflow'
import type { FlowEdgeView, FlowNodeView, StageView, TimelineProjection } from '../read-models/timeline'

const statusByStage: Record<string, StageView['status']> = {
  lead: 'completed',
  designer: 'completed',
  researcher: 'completed',
  specifier: 'blocked',
  developer: 'running',
  reviewer: 'queued',
  'lead-approval': 'blocked',
  'evaluator-before': 'queued',
  'debugger-before': 'queued',
  evolver: 'queued'
}

export function buildTimelineProjection(runId: string, workflowId: WorkflowId): TimelineProjection {
  const workflow = getWorkflow(workflowId)
  const stages: StageView[] = workflow.stages.map((stage, index) => ({
    id: stage.id,
    label: stage.label,
    agent: stage.agent,
    status: statusByStage[stage.id] ?? (index === 0 ? 'running' : 'queued'),
    durationSeconds: index === 0 ? 1122 : Math.max(120, 760 - index * 90),
    barrierReason: stage.kind === 'barrier' || stage.id === 'specifier' ? 'Approval or handoff required before downstream work.' : undefined
  }))

  const nodes: FlowNodeView[] = stages.map((stage, index) => ({
    id: stage.id,
    label: stage.label,
    agent: stage.agent,
    status: stage.status,
    x: 80 + (index % 3) * 170,
    y: 70 + Math.floor(index / 3) * 110
  }))

  const edges: FlowEdgeView[] = stages.slice(1).map((stage, index) => ({
    from: stages[index].id,
    to: stage.id,
    kind: stage.status === 'blocked' ? 'barrier' : stage.id.includes('approval') ? 'approval' : stage.label.includes('if applicable') ? 'optional' : 'normal'
  }))

  return { runId, stages, nodes, edges }
}
