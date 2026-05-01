import type { LogEventView } from '../../agent-sessions/read-models/agentSession'
import type { NormalizedRunEvent, PersistedRunDetail } from '../domain/runLifecycle'
import type { RunDetailView, RunSummary } from './run'

function displayTime(timestamp: string) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp
  return new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date)
}

function logKind(event: NormalizedRunEvent): LogEventView['kind'] {
  if (event.kind === 'thinking') return 'thinking'
  if (event.kind === 'error') return 'warning'
  if (event.kind === 'output') return 'final'
  if (event.kind === 'metric') return 'tool'
  return 'log'
}

export function toLogEventView(event: NormalizedRunEvent): LogEventView {
  return {
    id: event.id,
    runId: event.runId,
    timestamp: displayTime(event.timestamp),
    agent: event.agent,
    stageId: event.stageId,
    kind: logKind(event),
    message: event.message
  }
}

export function toRunSummary(detail: PersistedRunDetail): RunSummary {
  const validation =
    detail.run.status === 'completed'
      ? 'passed'
      : detail.run.status === 'failed'
        ? 'failed'
        : detail.run.status === 'stopped' || detail.run.status === 'interrupted'
          ? 'not-run'
          : detail.run.validation

  return {
    id: detail.run.id,
    title: detail.run.title,
    workflowId: detail.run.workflowId,
    activeAgent: detail.run.activeAgent,
    status: detail.run.status,
    validation,
    elapsedSeconds: detail.run.elapsedSeconds,
    tokens: detail.run.tokens,
    costUsd: detail.run.costUsd,
    artifacts: detail.run.artifacts,
    startedAt: detail.run.startedAt,
    completedAt: detail.run.completedAt,
    executionMode: detail.run.executionMode
  }
}

export function toRunDetailView(detail: PersistedRunDetail): RunDetailView {
  const logs = detail.events.map(toLogEventView)
  return {
    ...toRunSummary(detail),
    prompt: detail.run.prompt,
    configSnapshot: detail.configSnapshot,
    events: detail.events,
    logs,
    thinking: logs.filter((log) => log.kind === 'thinking'),
    finalOutput: detail.run.finalOutput,
    opencodeSessionId: detail.run.opencodeSessionId
  }
}
