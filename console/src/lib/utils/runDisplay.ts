import type { RunStatus, ValidationStatus } from '$lib/contexts/runs/read-models/run'
import type { WorkflowId } from '$lib/contexts/launch/domain/workflow'

export type BadgeTone = 'neutral' | 'active' | 'success' | 'warning' | 'danger' | 'ahe'

const toneColors: Record<BadgeTone, string> = {
  neutral: '#8b9bb0',
  active: '#4da3ff',
  success: '#32d583',
  warning: '#f2b84b',
  danger: '#f97066',
  ahe: '#c084fc'
}

export function workflowDisplayLabel(workflowId: WorkflowId) {
  if (workflowId === 'native') return 'OpenCode CLI'
  if (workflowId === 'direct') return 'Direct message'
  return workflowId
    .split('-')
    .map((part, index) => (index === 0 ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part))
    .join(' ')
}

export function runStatusTone(status: RunStatus): BadgeTone {
  if (status === 'completed') return 'success'
  if (status === 'running') return 'active'
  if (status === 'failed') return 'danger'
  if (status === 'blocked' || status === 'pending') return 'warning'
  return 'neutral'
}

export function validationTone(status: ValidationStatus): BadgeTone {
  if (status === 'passed') return 'success'
  if (status === 'running') return 'active'
  if (status === 'failed') return 'danger'
  if (status === 'pending') return 'warning'
  return 'neutral'
}

export function colorForTone(tone: BadgeTone) {
  return toneColors[tone]
}
