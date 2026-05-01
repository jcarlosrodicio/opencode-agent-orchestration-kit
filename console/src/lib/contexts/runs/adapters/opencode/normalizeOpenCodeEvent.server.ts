import type { WorkflowId } from '../../../launch/domain/workflow'
import type { NormalizedRunEvent, NormalizedRunEventKind } from '../../domain/runLifecycle'

interface NormalizeInput {
  runId: string
  workflowId: WorkflowId
  line: string
  stream: 'stdout' | 'stderr'
  sequence: number
}

function defaultAgent(workflowId: WorkflowId) {
  return workflowId === 'feature' ? 'lead' : 'developer'
}

function timestamp(value: unknown) {
  if (typeof value === 'number') return new Date(value).toISOString()
  if (typeof value === 'string' && value.trim()) return value
  return new Date().toISOString()
}

function partText(value: unknown) {
  if (!value || typeof value !== 'object') return ''
  const part = value as { text?: unknown }
  return typeof part.text === 'string' ? part.text : ''
}

function tokenTotal(value: unknown) {
  if (!value || typeof value !== 'object') return undefined
  const part = value as { tokens?: { total?: unknown } }
  return typeof part.tokens?.total === 'number' ? part.tokens.total : undefined
}

export function normalizeOpenCodeLine(input: NormalizeInput): NormalizedRunEvent {
  const agent = defaultAgent(input.workflowId)
  const base = {
    id: `${input.runId}_${input.sequence}`,
    runId: input.runId,
    sequence: input.sequence,
    agent,
    stageId: agent
  }

  try {
    const parsed = JSON.parse(input.line) as { type?: string; timestamp?: unknown; sessionID?: string; part?: unknown }
    const type = parsed.type ?? 'unknown'
    const kindByType: Record<string, NormalizedRunEventKind> = {
      step_start: 'lifecycle',
      reasoning: 'thinking',
      text: 'output',
      step_finish: 'lifecycle'
    }
    const kind = kindByType[type] ?? 'raw'
    const tokens = tokenTotal(parsed.part)
    const status = type === 'step_finish' ? 'completed' : undefined
    const text = partText(parsed.part)

    return {
      ...base,
      timestamp: timestamp(parsed.timestamp),
      kind,
      message: text || (type === 'step_start' ? 'OpenCode step started.' : type === 'step_finish' ? 'OpenCode step finished.' : `OpenCode event: ${type}`),
      raw: parsed,
      status,
      tokens,
      opencodeSessionId: parsed.sessionID
    }
  } catch {
    return {
      ...base,
      timestamp: new Date().toISOString(),
      kind: 'raw',
      message: input.line,
      raw: input.line
    }
  }
}
