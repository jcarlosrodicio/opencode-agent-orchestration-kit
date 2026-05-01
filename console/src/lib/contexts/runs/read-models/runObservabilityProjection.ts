import { agentCatalog } from '$lib/mocks/agents.mock'
import { getWorkflow } from '../../launch/adapters/workflowCatalog'
import type { WorkflowStageDefinition } from '../../launch/domain/workflow'
import type { AgentSessionStatus, AgentSessionView } from '../../agent-sessions/read-models/agentSession'
import type { FlowEdgeView, FlowNodeView, StageStatus, StageView, TimelineProjection } from '../../orchestration-timeline/read-models/timeline'
import type { NormalizedRunEvent } from '../domain/runLifecycle'
import type { RunDetailView, RunStatus, RunSummary } from './run'

export interface RunFocus {
  agent: string
  stageId: string
}

export interface WorkflowSummaryView {
  finishedLabel: string
  durationLabel: string
  statusReason: string
}

const terminalStatuses = new Set<RunStatus>(['completed', 'failed', 'stopped', 'interrupted'])

function isSystemAgent(agent: string) {
  return agent === 'system'
}

function meaningfulEvents(events: NormalizedRunEvent[]) {
  return events.filter((event) => !isSystemAgent(event.agent))
}

function lastMeaningfulEvent(run: RunSummary | RunDetailView, events: NormalizedRunEvent[] = []) {
  const event = meaningfulEvents(events).at(-1)
  if (event) return event
  const workflow = getWorkflow(run.workflowId)
  const agent = run.activeAgent && run.activeAgent !== 'none' ? run.activeAgent : workflow.primaryAgent
  return { agent, stageId: agent }
}

function stageForAgent(stages: WorkflowStageDefinition[], agent: string) {
  return stages.find((stage) => stage.id === agent || stage.agent === agent) ?? stages[0]
}

function terminalStageStatus(runStatus: RunStatus): StageStatus {
  if (runStatus === 'completed') return 'completed'
  if (runStatus === 'failed') return 'failed'
  if (runStatus === 'stopped' || runStatus === 'interrupted') return 'stopped'
  if (runStatus === 'blocked') return 'blocked'
  return 'running'
}

function agentSessionStatus(status: RunStatus): AgentSessionStatus {
  if (status === 'completed' || status === 'failed' || status === 'stopped' || status === 'blocked') return status
  if (status === 'interrupted') return 'stopped'
  if (status === 'pending') return 'pending'
  return 'running'
}

function durationFromEvents(run: RunSummary | RunDetailView, events: NormalizedRunEvent[]) {
  const start = events[0]?.timestamp ?? run.startedAt
  const end = run.completedAt ?? events.at(-1)?.timestamp
  if (!start || !end) return run.elapsedSeconds
  return Math.max(run.elapsedSeconds, Math.round((Date.parse(end) - Date.parse(start)) / 1000))
}

function isRunDetail(run: RunSummary | RunDetailView): run is RunDetailView {
  return 'prompt' in run
}

function eventsForStage(events: NormalizedRunEvent[], stageId: string, agent: string) {
  return meaningfulEvents(events).filter((event) => event.stageId === stageId || (event.stageId === event.agent && event.agent === agent))
}

function durationForStage(fallback: number, events: NormalizedRunEvent[]) {
  if (events.length < 2) return fallback
  const start = events[0].timestamp
  const end = events.at(-1)?.timestamp
  if (!start || !end) return fallback
  return Math.max(fallback, Math.round((Date.parse(end) - Date.parse(start)) / 1000))
}

export function selectInitialRunFocus(run: RunSummary | RunDetailView, events: NormalizedRunEvent[] = []): RunFocus {
  if (isRunDetail(run) && run.childRuns?.length) {
    const child = run.childRuns.at(-1)
    if (child) return { agent: child.agent, stageId: child.id }
  }
  const workflow = getWorkflow(run.workflowId)
  const event = lastMeaningfulEvent(run, events)
  const stage = stageForAgent(workflow.stages, event.agent)
  return { agent: stage.agent, stageId: stage.id }
}

export function buildRealTimelineProjection(run: RunSummary | RunDetailView, events: NormalizedRunEvent[] = []): TimelineProjection {
  if (isRunDetail(run) && run.childRuns?.length) {
    const workflow = getWorkflow(run.workflowId)
    const parentAgent = workflow.primaryAgent
    const parentEvents = eventsForStage(events, parentAgent, parentAgent)
    const stages: StageView[] = [
      {
        id: run.id,
        label: parentAgent,
        agent: parentAgent,
        status: terminalStageStatus(run.status),
        durationSeconds: durationForStage(0, parentEvents)
      },
      ...run.childRuns.map((child) => {
        const childEvents = eventsForStage(events, child.id, child.agent)
        return {
          id: child.id,
          label: child.title,
          agent: child.agent,
          status: terminalStageStatus(child.status),
          durationSeconds: durationForStage(child.elapsedSeconds, childEvents)
        }
      })
    ]

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
      kind: 'normal'
    }))

    return { runId: run.id, stages, nodes, edges }
  }

  const workflow = getWorkflow(run.workflowId)
  const focus = selectInitialRunFocus(run, events)
  const terminal = terminalStatuses.has(run.status)
  const duration = durationFromEvents(run, events)
  const stages: StageView[] = workflow.stages.map((stage) => {
    const isFocusedStage = stage.id === focus.stageId || stage.agent === focus.agent
    const observedEvents = eventsForStage(events, stage.id, stage.agent)
    const hasObservedEvents = observedEvents.length > 0
    const status: StageStatus = isFocusedStage
      ? terminalStageStatus(run.status)
      : hasObservedEvents && terminal
        ? 'completed'
        : hasObservedEvents
          ? 'running'
      : terminal
        ? 'skipped'
        : run.status === 'blocked' && (stage.id === focus.stageId || stage.agent === focus.agent)
          ? 'blocked'
          : 'queued'
    return {
      id: stage.id,
      label: stage.label,
      agent: stage.agent,
      status,
      durationSeconds: hasObservedEvents ? durationForStage(0, observedEvents) : isFocusedStage ? duration : 0,
      barrierReason: status === 'blocked' ? 'Waiting on a barrier, approval, or dependency.' : undefined
    }
  })

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

  return { runId: run.id, stages, nodes, edges }
}

export function buildRealAgentSessions(run: RunSummary | RunDetailView, events: NormalizedRunEvent[] = []): AgentSessionView[] {
  if (isRunDetail(run) && run.childRuns?.length) {
    const workflow = getWorkflow(run.workflowId)
    const parentAgent = workflow.primaryAgent
    const parentCatalog = agentCatalog.find((item) => item.key === parentAgent)
    const parentEvents = eventsForStage(events, parentAgent, parentAgent)
    return [
      {
        id: run.id,
        runId: run.id,
        agent: parentAgent,
        role: parentCatalog?.description ?? `${parentAgent} stage`,
        status: agentSessionStatus(run.status),
        model: 'OPENCODE_MODEL',
        skills: [],
        tools: ['filesystem', 'git'],
        durationSeconds: durationForStage(0, parentEvents),
        inputTokens: run.tokens,
        outputTokens: 0,
        currentStep: 'Parent OpenCode session.',
        finalOutput: run.finalOutput ?? ''
      },
      ...run.childRuns.map((child) => {
        const catalog = agentCatalog.find((item) => item.key === child.agent)
        const childEvents = eventsForStage(events, child.id, child.agent)
        return {
          id: child.id,
          runId: run.id,
          agent: child.agent,
          role: catalog?.description ?? `${child.agent} subagent`,
          status: agentSessionStatus(child.status),
          model: child.model || catalog?.modelEnv || 'OPENCODE_MODEL',
          skills: child.agent === 'designer' ? ['open-design', 'impeccable'] : child.agent === 'developer' ? ['superpowers'] : [],
          tools: child.agent === 'designer' ? ['open-design', 'filesystem'] : ['filesystem', 'git'],
          durationSeconds: durationForStage(child.elapsedSeconds, childEvents),
          inputTokens: child.tokens,
          outputTokens: 0,
          currentStep: child.title,
          finalOutput: child.finalOutput ?? ''
        }
      })
    ]
  }

  const workflow = getWorkflow(run.workflowId)
  const timeline = buildRealTimelineProjection(run, events)
  return timeline.stages
    .filter((stage) => stage.agent !== 'open-design' && !stage.agent.includes('approval'))
    .map((stage) => {
      const catalog = agentCatalog.find((item) => item.key === stage.agent)
      return {
        id: `${run.id}_${stage.agent}`,
        runId: run.id,
        agent: stage.agent,
        role: catalog?.description ?? `${stage.agent} stage`,
        status: stage.status === 'queued' || stage.status === 'skipped' ? 'pending' : stage.status,
        model: catalog?.modelEnv ?? 'OPENCODE_MODEL',
        skills: stage.agent === 'designer' ? ['open-design', 'impeccable'] : stage.agent === 'developer' ? ['superpowers'] : [],
        tools: stage.agent === 'designer' ? ['open-design', 'filesystem'] : ['filesystem', 'git'],
        durationSeconds: stage.durationSeconds ?? 0,
        inputTokens: stage.status === 'queued' || stage.status === 'skipped' ? 0 : run.tokens,
        outputTokens: 0,
        currentStep:
          stage.status === 'running'
            ? 'OpenCode process is executing.'
            : stage.status === 'blocked'
              ? 'Waiting on a barrier, approval, or dependency.'
              : stage.status === 'failed'
                ? 'This stage failed.'
                : stage.status === 'stopped'
                  ? 'Run was stopped while this stage was active.'
                  : stage.status === 'completed'
                    ? 'Stage completed.'
                    : 'No real event observed for this stage.',
        finalOutput: stage.status === 'completed' ? (run as RunDetailView).finalOutput ?? '' : ''
      }
    })
}

export function workflowSummary(run: RunSummary): WorkflowSummaryView {
  const terminal = terminalStatuses.has(run.status)
  const finishedLabel = terminal && run.completedAt ? `Finished ${relativeTime(run.completedAt)}` : run.status === 'running' ? 'Running now' : ''
  return {
    finishedLabel,
    durationLabel: run.elapsedSeconds ? `${formatDuration(run.elapsedSeconds)} total` : '',
    statusReason:
      run.status === 'failed'
        ? `${run.activeAgent === 'none' ? 'process' : run.activeAgent} failed`
        : run.status === 'blocked'
          ? `${run.activeAgent} blocked`
          : run.status === 'stopped'
            ? 'Stopped by user'
            : run.status === 'completed'
              ? 'Completed successfully'
              : run.status === 'interrupted'
                ? 'Interrupted after restart'
                : ''
  }
}

function relativeTime(timestamp: string) {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(timestamp)) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return `${hours}h ago`
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`
}

export function dedupeEvents<T extends { id: string; timestamp: string; agent: string; message: string }>(events: T[]): T[] {
  const seen = new Set<string>()
  return events.filter((event) => {
    const key = event.id || `${event.timestamp}:${event.agent}:${event.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
