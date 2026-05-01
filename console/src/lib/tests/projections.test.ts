import { describe, expect, it } from 'vitest'
import { buildAgentSessions } from '$lib/contexts/agent-sessions/projections/agentSessionProjection'
import { buildTimelineProjection } from '$lib/contexts/orchestration-timeline/projections/timelineProjection'
import { buildMetricSnapshot } from '$lib/contexts/observability-metrics/projections/metricsProjection'
import { buildRealAgentSessions, buildRealTimelineProjection, dedupeEvents, selectInitialRunFocus, workflowSummary } from '$lib/contexts/runs/read-models/runObservabilityProjection'
import type { RunDetailView, RunSummary } from '$lib/contexts/runs/read-models/run'
import { runSummaries } from '$lib/mocks/runs.mock'

describe('mock projections', () => {
  it('maps agents into session read-models', () => {
    const sessions = buildAgentSessions('run_92', ['lead', 'developer'])
    expect(sessions.find((session) => session.agent === 'developer')?.status).toBe('running')
  })

  it('maps barriers into timeline read-models', () => {
    const timeline = buildTimelineProjection('run_92', 'feature')
    expect(timeline.stages.find((stage) => stage.id === 'specifier')?.status).toBe('blocked')
  })

  it('projects metrics from run summaries', () => {
    const metrics = buildMetricSnapshot(runSummaries)
    expect(metrics.totalRuns).toBe(runSummaries.length)
    expect(metrics.totalTokens).toBeGreaterThan(0)
  })
})

describe('real run observability projections', () => {
  const featureRun: RunDetailView = {
    id: 'run_real_feature',
    title: 'Real feature',
    workflowId: 'feature',
    activeAgent: 'none',
    status: 'completed',
    validation: 'passed',
    elapsedSeconds: 5,
    tokens: 100,
    costUsd: 0,
    artifacts: 0,
    startedAt: '2026-05-01T08:00:00.000Z',
    completedAt: '2026-05-01T08:00:05.000Z',
    executionMode: 'real-opencode',
    prompt: 'feature prompt',
    configSnapshot: {
      workflowId: 'feature',
      prompt: 'feature prompt',
      models: {},
      skills: [],
      tools: [],
      workdir: '/repo',
      runnerMode: 'real-opencode',
      createdAt: '2026-05-01T08:00:00.000Z'
    },
    events: [
      { id: 'run_real_feature_1', runId: 'run_real_feature', sequence: 1, timestamp: '2026-05-01T08:00:00.000Z', agent: 'lead', stageId: 'lead', kind: 'lifecycle', message: 'started', raw: {} },
      { id: 'run_real_feature_2', runId: 'run_real_feature', sequence: 2, timestamp: '2026-05-01T08:00:05.000Z', agent: 'lead', stageId: 'lead', kind: 'output', message: 'done', raw: {}, status: 'completed', tokens: 100 }
    ],
    logs: [],
    thinking: [],
    finalOutput: 'done'
  }

  it('deduplicates SSE replay events by stable event id', () => {
    const events = dedupeEvents([
      { id: 'event_1', timestamp: 't1', agent: 'lead', message: 'same' },
      { id: 'event_1', timestamp: 't1', agent: 'lead', message: 'same' }
    ])
    expect(events).toHaveLength(1)
  })

  it('selects lead as the initial focus for real feature runs', () => {
    expect(selectInitialRunFocus(featureRun, featureRun.events)).toEqual({ agent: 'lead', stageId: 'lead' })
  })

  it('projects terminal success without leaving developer running', () => {
    const timeline = buildRealTimelineProjection(featureRun, featureRun.events)
    expect(timeline.stages.find((stage) => stage.agent === 'lead')?.status).toBe('completed')
    expect(timeline.stages.find((stage) => stage.agent === 'developer')?.status).toBe('skipped')
  })

  it('projects native child sessions as individual parent-run stages', () => {
    const groupedRun: RunDetailView = {
      ...featureRun,
      childRuns: [
        {
          id: 'ses_child_research',
          parentId: featureRun.id,
          title: 'Research APIs (@researcher subagent)',
          workflowId: 'native',
          activeAgent: 'none',
          status: 'completed',
          validation: 'not-run',
          elapsedSeconds: 30,
          tokens: 84,
          costUsd: 0,
          artifacts: 0,
          startedAt: '2026-05-01T08:01:00.000Z',
          completedAt: '2026-05-01T08:01:30.000Z',
          executionMode: 'native-opencode',
          workdir: '/repo',
          agent: 'researcher',
          model: 'openai/gpt-5.4',
          prompt: 'Research APIs',
          finalOutput: 'Research complete.'
        }
      ],
      events: [
        ...(featureRun.events ?? []),
        {
          id: 'ses_child_research_1',
          runId: featureRun.id,
          sequence: 1,
          timestamp: '2026-05-01T08:01:30.000Z',
          agent: 'researcher',
          stageId: 'ses_child_research',
          kind: 'output',
          message: 'Research complete.',
          raw: {},
          opencodeSessionId: 'ses_child_research'
        }
      ]
    }

    const timeline = buildRealTimelineProjection(groupedRun, groupedRun.events)
    const agents = buildRealAgentSessions(groupedRun, groupedRun.events)

    expect(timeline.stages.map((stage) => stage.id)).toEqual([featureRun.id, 'ses_child_research'])
    expect(selectInitialRunFocus(groupedRun, groupedRun.events)).toEqual({ agent: 'researcher', stageId: 'ses_child_research' })
    expect(agents.find((agent) => agent.id === 'ses_child_research')).toMatchObject({
      agent: 'researcher',
      model: 'openai/gpt-5.4',
      finalOutput: 'Research complete.'
    })
  })

  it('projects stopped runs onto the last active agent', () => {
    const stoppedRun: RunSummary = {
      id: 'run_stopped',
      title: 'Stopped',
      workflowId: 'direct',
      activeAgent: 'developer',
      status: 'stopped',
      validation: 'not-run',
      elapsedSeconds: 4,
      tokens: 0,
      costUsd: 0,
      artifacts: 0,
      startedAt: '2026-05-01T08:00:00.000Z',
      completedAt: '2026-05-01T08:00:04.000Z',
      executionMode: 'real-opencode'
    }
    expect(buildRealTimelineProjection(stoppedRun).stages[0].status).toBe('stopped')
    expect(buildRealAgentSessions(stoppedRun)[0].status).toBe('stopped')
  })

  it('derives compact workflow summary labels from terminal state', () => {
    const summary = workflowSummary(featureRun)
    expect(summary.durationLabel).toBe('5s total')
    expect(summary.statusReason).toBe('Completed successfully')
  })
})
