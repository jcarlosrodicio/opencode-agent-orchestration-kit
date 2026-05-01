import type { RunDetailView, RunSummary } from '../../read-models/run'

export interface ListOpenCodeSessionsInput {
  activeSessionIds?: Set<string>
  limit?: number
  offset?: number
}

export interface ListOpenCodeSessionsResult {
  runs: RunSummary[]
  total: number
  limit: number
  offset: number
}

export interface OpenCodeSessionRepository {
  listSessions(input?: ListOpenCodeSessionsInput): Promise<ListOpenCodeSessionsResult>
  getSession(sessionId: string, activeSessionIds?: Set<string>): Promise<RunDetailView | undefined>
  waitForSession(sessionId: string, activeSessionIds?: Set<string>): Promise<RunDetailView | undefined>
}
