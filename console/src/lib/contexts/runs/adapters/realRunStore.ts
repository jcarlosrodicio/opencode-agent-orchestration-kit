import { writable } from 'svelte/store'
import type { NormalizedRunEvent, StartRunRequest } from '../domain/runLifecycle'
import type { RunDetailView, RunSummary } from '../read-models/run'
import { toLogEventView } from '../read-models/persistedRunReadModels'
import { dedupeEvents } from '../read-models/runObservabilityProjection'

interface RealRunState {
  runs: RunSummary[]
  details: Record<string, RunDetailView>
  total: number
  limit: number
  offset: number
  connection: 'idle' | 'live' | 'paused' | 'error'
  error: string
}

const initialState: RealRunState = {
  runs: [],
  details: {},
  total: 0,
  limit: 25,
  offset: 0,
  connection: 'idle',
  error: ''
}

function applyEventToDetail(detail: RunDetailView, event: NormalizedRunEvent): RunDetailView {
  const log = toLogEventView(event)
  const logs = dedupeEvents([...(detail.logs ?? []), log])
  const events = dedupeEvents([...(detail.events ?? []), event])
  const terminalSystemEvent = event.status && event.agent === 'system'
  return {
    ...detail,
    logs,
    events,
    thinking: logs.filter((item) => item.kind === 'thinking'),
    status: event.status ?? detail.status,
    validation: event.status === 'completed' ? 'passed' : event.status === 'failed' ? 'failed' : event.status === 'stopped' || event.status === 'interrupted' ? 'not-run' : detail.validation,
    activeAgent: event.status === 'completed' ? 'none' : terminalSystemEvent ? detail.activeAgent : event.agent,
    tokens: event.tokens ? Math.max(detail.tokens, event.tokens) : detail.tokens,
    elapsedSeconds: event.timestamp ? Math.max(detail.elapsedSeconds, Math.round((Date.parse(event.timestamp) - Date.parse(detail.startedAt)) / 1000)) : detail.elapsedSeconds,
    completedAt: event.status === 'completed' || event.status === 'failed' || event.status === 'stopped' || event.status === 'interrupted' ? event.timestamp : detail.completedAt,
    finalOutput: event.kind === 'output' ? `${detail.finalOutput ?? ''}${detail.finalOutput ? '\n' : ''}${event.message}`.trim() : detail.finalOutput,
    opencodeSessionId: event.opencodeSessionId ?? detail.opencodeSessionId
  }
}

function createRealRunStore() {
  const store = writable<RealRunState>(initialState)
  const sources = new Map<string, EventSource>()

  async function loadRuns(options: { limit?: number; offset?: number } = {}) {
    const limit = options.limit ?? 25
    const offset = options.offset ?? 0
    const response = await fetch(`/api/runs?limit=${limit}&offset=${offset}`)
    if (!response.ok) throw new Error('Unable to load real runs')
    const payload = (await response.json()) as { runs: RunSummary[]; total: number; limit: number; offset: number }
    store.update((state) => ({ ...state, runs: payload.runs, total: payload.total, limit: payload.limit, offset: payload.offset, error: '' }))
  }

  async function loadRun(runId: string) {
    const response = await fetch(`/api/runs/${runId}`)
    if (!response.ok) throw new Error('Unable to load run')
    const payload = (await response.json()) as { run: RunDetailView }
    store.update((state) => ({ ...state, details: { ...state.details, [runId]: payload.run }, error: '' }))
    return payload.run
  }

  function connectRun(runId: string) {
    if (sources.has(runId)) return
    const source = new EventSource(`/api/runs/${runId}/events`)
    sources.set(runId, source)
    store.update((state) => ({ ...state, connection: 'live' }))

    source.addEventListener('run-event', (message) => {
      const event = JSON.parse((message as MessageEvent).data) as NormalizedRunEvent
      store.update((state) => {
        const current = state.details[event.runId]
        const detail = current ? applyEventToDetail(current, event) : current
        const terminalSystemEvent = event.status && event.agent === 'system'
        const runs = state.runs.map((run) =>
          run.id === event.runId
            ? {
                ...run,
                status: event.status ?? run.status,
                validation: event.status === 'completed' ? 'passed' : event.status === 'failed' ? 'failed' : event.status === 'stopped' || event.status === 'interrupted' ? 'not-run' : run.validation,
                activeAgent: event.status === 'completed' ? 'none' : terminalSystemEvent ? run.activeAgent : event.agent,
                tokens: event.tokens ? Math.max(run.tokens, event.tokens) : run.tokens,
                elapsedSeconds: event.timestamp ? Math.max(run.elapsedSeconds, Math.round((Date.parse(event.timestamp) - Date.parse(run.startedAt)) / 1000)) : run.elapsedSeconds,
                completedAt: event.status === 'completed' || event.status === 'failed' || event.status === 'stopped' || event.status === 'interrupted' ? event.timestamp : run.completedAt
              }
            : run
        )
        return detail ? { ...state, runs, details: { ...state.details, [event.runId]: detail } } : { ...state, runs }
      })
    })

    source.onerror = () => {
      source.close()
      sources.delete(runId)
      store.update((state) => ({ ...state, connection: 'error', error: 'Live stream disconnected.' }))
    }
  }

  async function launchRun(input: StartRunRequest) {
    const response = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    })
    if (!response.ok) throw new Error(await response.text())
    const payload = (await response.json()) as { run: RunDetailView }
    store.update((state) => ({
      ...state,
      runs: [payload.run, ...state.runs.filter((run) => run.id !== payload.run.id)],
      details: { ...state.details, [payload.run.id]: payload.run }
    }))
    return payload.run
  }

  async function stopRun(runId: string) {
    const response = await fetch(`/api/runs/${runId}/stop`, { method: 'POST' })
    if (!response.ok) throw new Error('Unable to stop run')
  }

  function destroy() {
    sources.forEach((source) => source.close())
    sources.clear()
  }

  return { subscribe: store.subscribe, loadRuns, loadRun, connectRun, launchRun, stopRun, destroy }
}

export const realRunStore = createRealRunStore()
