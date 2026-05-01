import { writable } from 'svelte/store'
import type { LogEventView } from '$lib/contexts/agent-sessions/read-models/agentSession'
import type { RunSummary } from '$lib/contexts/runs/read-models/run'
import { initialLogs, mockRunEvents } from '$lib/mocks/events.mock'
import { runSummaries } from '$lib/mocks/runs.mock'

interface MockStreamState {
  runs: RunSummary[]
  logs: LogEventView[]
  connection: 'live' | 'paused' | 'stopped'
  emitted: number
}

const initialState: MockStreamState = {
  runs: runSummaries,
  logs: initialLogs,
  connection: 'live',
  emitted: 0
}

function createMockStream() {
  const store = writable<MockStreamState>(initialState)
  let timer: ReturnType<typeof setInterval> | undefined

  function start() {
    if (timer) return
    timer = setInterval(() => {
      store.update((state) => {
        if (state.connection !== 'live') return state
        const event = mockRunEvents[state.emitted % mockRunEvents.length]
        const logs = [
          ...state.logs,
          {
            id: `${event.id}_${state.emitted}`,
            runId: event.runId,
            timestamp: event.timestamp,
            agent: event.agent,
            stageId: event.stageId,
            kind: event.type === 'approval_created' ? 'approval' : event.type === 'metric_update' ? 'tool' : 'log',
            message: event.message
          } satisfies LogEventView
        ]
        const runs = state.runs.map((run) =>
          run.id === event.runId
            ? {
                ...run,
                elapsedSeconds: run.elapsedSeconds + 12,
                tokens: run.tokens + (event.tokens ?? 700),
                costUsd: Number((run.costUsd + 0.001).toFixed(3))
              }
            : run
        )
        return { ...state, logs, runs, emitted: state.emitted + 1 }
      })
    }, 3200)
  }

  function pause() {
    store.update((state) => ({ ...state, connection: 'paused' }))
  }

  function resume() {
    store.update((state) => ({ ...state, connection: 'live' }))
  }

  function stopRun(runId: string) {
    store.update((state) => ({
      ...state,
      connection: 'stopped',
      runs: state.runs.map((run) => (run.id === runId ? { ...run, status: 'stopped', activeAgent: 'none' } : run)),
      logs: [
        ...state.logs,
        {
          id: `stop_${Date.now()}`,
          runId,
          timestamp: new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date()),
          agent: 'system',
          stageId: 'stop',
          kind: 'warning',
          message: 'Stop Run confirmed. Mock execution has been stopped.'
        }
      ]
    }))
  }

  function destroy() {
    if (timer) clearInterval(timer)
    timer = undefined
  }

  return { subscribe: store.subscribe, start, pause, resume, stopRun, destroy }
}

export const mockStream = createMockStream()
