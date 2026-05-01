import { existsSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { LogEventView } from '../../agent-sessions/read-models/agentSession'
import type { WorkflowId } from '../../launch/domain/workflow'
import type { OpenCodeSessionRepository } from '../application/ports/OpenCodeSessionRepository'
import type { NormalizedRunEvent } from '../domain/runLifecycle'
import type { RunDetailView, RunStatus, RunSummary } from '../read-models/run'
import { getNativeOpenCodePaths } from './nativeOpenCodePaths.server'

interface NativeSessionRow {
  id: string
  parent_id: string | null
  title: string | null
  directory: string | null
  time_created: number
  time_updated: number
  time_archived: number | null
}

interface NativePartRow {
  id: string
  message_id: string
  time_created: number
  part_data: string
  message_data: string | null
}

type JsonRecord = Record<string, unknown>

interface TranscriptOptions {
  runId?: string
  stageId?: string
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseJson(value: string | null): JsonRecord {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function iso(timestamp: number | null | undefined) {
  return new Date(Number(timestamp ?? Date.now())).toISOString()
}

function elapsedSeconds(startedAt: string, completedAt?: string) {
  const end = completedAt ?? new Date().toISOString()
  return Math.max(0, Math.round((Date.parse(end) - Date.parse(startedAt)) / 1000))
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function numberValue(value: unknown) {
  return typeof value === 'number' ? value : 0
}

function nestedRecord(value: JsonRecord, key: string): JsonRecord {
  const nested = value[key]
  return isRecord(nested) ? nested : {}
}

function sessionTitle(row: NativeSessionRow) {
  return row.title?.trim() || row.id
}

function agentFor(message: JsonRecord) {
  const role = textValue(message.role)
  if (role === 'user') return 'user'
  return textValue(message.agent) || textValue(message.mode) || 'developer'
}

function partMessage(part: JsonRecord) {
  const type = textValue(part.type)
  if (type === 'text') return textValue(part.text)
  if (type === 'reasoning') return textValue(part.text) || 'Reasoning update.'
  if (type === 'step-start') return 'OpenCode step started.'
  if (type === 'step-finish') return 'OpenCode step finished.'
  if (type.includes('tool')) return textValue(part.title) || `OpenCode ${type}.`
  return type ? `OpenCode part: ${type}` : ''
}

function partKind(part: JsonRecord, message: JsonRecord): LogEventView['kind'] {
  const type = textValue(part.type)
  if (type === 'reasoning') return 'thinking'
  if (type.includes('tool')) return 'tool'
  if (type === 'text' && textValue(message.role) === 'assistant') return 'final'
  return 'log'
}

function tokenTotal(part: JsonRecord, message: JsonRecord) {
  const partTokens = nestedRecord(part, 'tokens')
  const messageTokens = nestedRecord(message, 'tokens')
  return numberValue(partTokens.total) || numberValue(messageTokens.total)
}

function costUsd(message: JsonRecord) {
  return numberValue(message.cost)
}

function statusFor(row: NativeSessionRow, activeSessionIds?: Set<string>): RunStatus {
  if (activeSessionIds?.has(row.id)) return 'running'
  return 'completed'
}

const workflowBySlashCommand: Array<{ id: WorkflowId; slashCommand: string }> = [
  { id: 'feature', slashCommand: '/feature' },
  { id: 'scope', slashCommand: '/scope' },
  { id: 'mvp-spec', slashCommand: '/mvp-spec' },
  { id: 'design', slashCommand: '/design' },
  { id: 'research', slashCommand: '/research' },
  { id: 'spec', slashCommand: '/spec' },
  { id: 'implement', slashCommand: '/implement' },
  { id: 'review', slashCommand: '/review' },
  { id: 'evolve', slashCommand: '/evolve' }
]

function workflowFor(prompt: string): WorkflowId {
  const normalized = prompt
    .trim()
    .replace(/^["'`]+/, '')
    .toLowerCase()
  const match = workflowBySlashCommand.find((workflow) => normalized.startsWith(workflow.slashCommand))
  if (match) return match.id
  return 'native'
}

function workflowForNativeSession(prompt: string, agents: string[] = []): WorkflowId {
  const fromPrompt = workflowFor(prompt)
  if (fromPrompt !== 'native') return fromPrompt
  if (isExpandedFeaturePrompt(prompt)) return 'feature'
  const agentSet = new Set(agents)
  if (agentSet.has('reviewer') || (agentSet.has('researcher') && agentSet.has('specifier') && agentSet.has('developer'))) return 'feature'
  return 'native'
}

function summaryFromRow(row: NativeSessionRow, activeSessionIds?: Set<string>, tokens = 0, cost = 0, prompt = '', agents: string[] = [], workflowPrompt = prompt): RunSummary {
  const startedAt = iso(row.time_created)
  const completedAt = activeSessionIds?.has(row.id) ? undefined : iso(row.time_updated)
  return {
    id: row.id,
    parentId: row.parent_id ?? undefined,
    title: sessionTitle(row),
    workflowId: workflowForNativeSession(workflowPrompt, agents),
    activeAgent: activeSessionIds?.has(row.id) ? 'developer' : 'none',
    status: statusFor(row, activeSessionIds),
    validation: 'not-run',
    elapsedSeconds: elapsedSeconds(startedAt, completedAt),
    tokens,
    costUsd: cost,
    artifacts: 0,
    startedAt,
    completedAt,
    executionMode: 'native-opencode',
    workdir: row.directory ?? undefined
  }
}

function isExpandedFeaturePrompt(prompt: string) {
  return (
    (prompt.startsWith('Objetivo:') && prompt.includes('\n\nEjecuta el flujo con barreras obligatorias.')) ||
    (prompt.startsWith('Objective:') && prompt.includes('\n\nRun the feature flow with explicit barriers.'))
  )
}

function displayPromptFor(prompt: string) {
  const featurePatterns = [
    { prefix: 'Objetivo:\n\n', suffix: '\n\nEjecuta el flujo con barreras obligatorias.' },
    { prefix: 'Objective:\n\n', suffix: '\n\nRun the feature flow with explicit barriers.' }
  ]
  for (const pattern of featurePatterns) {
    if (!prompt.startsWith(pattern.prefix)) continue
    const end = prompt.indexOf(pattern.suffix, pattern.prefix.length)
    if (end === -1) continue
    return prompt.slice(pattern.prefix.length, end).trim()
  }
  return prompt
}

function modelFor(message: JsonRecord) {
  const model = nestedRecord(message, 'model')
  const provider = textValue(message.providerID) || textValue(model.providerID)
  const modelId = textValue(message.modelID) || textValue(model.modelID)
  if (!modelId) return ''
  return provider ? `${provider}/${modelId}` : modelId
}

function createTranscript(sessionId: string, rows: NativePartRow[], options: TranscriptOptions = {}) {
  const runId = options.runId ?? sessionId
  let tokens = 0
  let cost = 0
  let model = ''
  const events: NormalizedRunEvent[] = []
  const logs: LogEventView[] = []
  const finalOutput: string[] = []
  const costedMessages = new Set<string>()
  let prompt = ''
  let rawPrompt = ''

  rows.forEach((row, index) => {
    const part = parseJson(row.part_data)
    const message = parseJson(row.message_data)
    const messageText = partMessage(part)
    if (!messageText) return
    const agent = agentFor(message)
    const kind = partKind(part, message)
    const timestamp = iso(row.time_created)
    const stageId = options.stageId ?? agent
    if (!model) model = modelFor(message)
    const event: NormalizedRunEvent = {
      id: `${sessionId}_${index + 1}`,
      runId,
      sequence: index + 1,
      timestamp,
      agent,
      stageId,
      kind: kind === 'thinking' ? 'thinking' : kind === 'final' ? 'output' : kind === 'tool' ? 'metric' : 'raw',
      message: messageText,
      raw: part,
      tokens: tokenTotal(part, message) || undefined,
      opencodeSessionId: sessionId
    }
    tokens = Math.max(tokens, event.tokens ?? 0)
    if (!costedMessages.has(row.message_id)) {
      cost += costUsd(message)
      costedMessages.add(row.message_id)
    }
    events.push(event)
    logs.push({
      id: event.id,
      runId,
      timestamp: new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(timestamp)),
      agent,
      stageId,
      kind,
      message: messageText
    })
    if (!rawPrompt && agent === 'user' && kind === 'log') {
      rawPrompt = messageText
      prompt = displayPromptFor(messageText)
    }
    if (kind === 'final') finalOutput.push(messageText)
  })

  const agents = Array.from(new Set(events.map((event) => event.agent).filter((agent) => agent !== 'user')))
  return { events, logs, tokens, cost, model, agents, prompt, rawPrompt, finalOutput: finalOutput.join('\n').trim() }
}

function sortByTimestamp<T extends { timestamp: string; id: string }>(items: T[]) {
  return [...items].sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp) || left.id.localeCompare(right.id))
}

function sortLogsByEvents(logs: LogEventView[], events: NormalizedRunEvent[]) {
  const timestampByEventId = new Map(events.map((event) => [event.id, event.timestamp]))
  return [...logs].sort((left, right) => {
    const leftTime = Date.parse(timestampByEventId.get(left.id) ?? '')
    const rightTime = Date.parse(timestampByEventId.get(right.id) ?? '')
    return leftTime - rightTime || left.id.localeCompare(right.id)
  })
}

export function createNativeOpenCodeSessionRepository(databasePath?: string): OpenCodeSessionRepository {
  async function dbPath() {
    if (databasePath) return databasePath
    const paths = await getNativeOpenCodePaths()
    return join(paths.data, 'opencode.db')
  }

  async function withDatabase<T>(query: (db: Database.Database) => T): Promise<T> {
    const path = await dbPath()
    if (!existsSync(path)) throw new Error(`OpenCode database not found: ${path}`)
    const db = new Database(path, { readonly: true, fileMustExist: true })
    try {
      return query(db)
    } finally {
      db.close()
    }
  }

  function getSessionRow(db: Database.Database, sessionId: string) {
    return db.prepare('select id, parent_id, title, directory, time_created, time_updated, time_archived from session where id = ?').get(sessionId) as unknown as
      | NativeSessionRow
      | undefined
  }

  function getChildSessionRows(db: Database.Database, sessionId: string) {
    return db
      .prepare('select id, parent_id, title, directory, time_created, time_updated, time_archived from session where parent_id = ? order by time_created asc')
      .all(sessionId) as unknown as NativeSessionRow[]
  }

  function getPartRows(db: Database.Database, sessionId: string) {
    return db
      .prepare(
        `select p.id, p.message_id, p.time_created, p.data as part_data, m.data as message_data
         from part p
         left join message m on m.id = p.message_id
         where p.session_id = ?
         order by p.time_created asc, p.id asc`
      )
      .all(sessionId) as unknown as NativePartRow[]
  }

  return {
    async listSessions(input = {}) {
      return withDatabase((db) => {
        const limit = input.limit ?? 25
        const offset = input.offset ?? 0
        const total = (db.prepare('select count(*) as total from session where parent_id is null').get() as { total: number }).total
        const rows = db
          .prepare('select id, parent_id, title, directory, time_created, time_updated, time_archived from session where parent_id is null order by time_updated desc limit ? offset ?')
          .all(limit, offset) as unknown as NativeSessionRow[]
        const runs = rows.map((row) => {
          const parts = getPartRows(db, row.id)
          const transcript = createTranscript(row.id, parts)
          const childTranscripts = getChildSessionRows(db, row.id).map((child) => createTranscript(child.id, getPartRows(db, child.id)))
          const childAgents = childTranscripts.flatMap((child) => child.agents)
          const totalTokens = transcript.tokens + childTranscripts.reduce((total, child) => total + child.tokens, 0)
          return summaryFromRow(row, input.activeSessionIds, totalTokens, transcript.cost, transcript.prompt, [...transcript.agents, ...childAgents], transcript.rawPrompt)
        })
        return { runs, total, limit, offset }
      })
    },

    async getSession(sessionId, activeSessionIds) {
      return withDatabase((db) => {
        const row = getSessionRow(db, sessionId)
        if (!row) return undefined
        const transcript = createTranscript(sessionId, getPartRows(db, sessionId))
        const childRuns = getChildSessionRows(db, sessionId).map((child) => {
          const childTranscript = createTranscript(child.id, getPartRows(db, child.id), { runId: sessionId, stageId: child.id })
          const childSummary = summaryFromRow(child, activeSessionIds, childTranscript.tokens, childTranscript.cost, childTranscript.prompt, childTranscript.agents, childTranscript.rawPrompt)
          return {
            ...childSummary,
            parentId: sessionId,
            agent: childTranscript.agents[0] ?? 'developer',
            model: childTranscript.model,
            prompt: childTranscript.prompt,
            finalOutput: childTranscript.finalOutput,
            opencodeSessionId: child.id,
            events: childTranscript.events,
            logs: childTranscript.logs
          }
        })
        const childAgents = childRuns.map((child) => child.agent)
        const totalTokens = transcript.tokens + childRuns.reduce((total, child) => total + child.tokens, 0)
        const summary = summaryFromRow(row, activeSessionIds, totalTokens, transcript.cost, transcript.prompt, [...transcript.agents, ...childAgents], transcript.rawPrompt)
        const prompt = transcript.prompt
        const events = sortByTimestamp([...transcript.events, ...childRuns.flatMap((child) => child.events)])
        const logs = sortLogsByEvents([...transcript.logs, ...childRuns.flatMap((child) => child.logs)], events)
        return {
          ...summary,
          prompt,
          configSnapshot: {
            workflowId: summary.workflowId,
            prompt,
            models: {},
            skills: [],
            tools: [],
            workdir: row.directory ?? undefined,
            runnerMode: 'native-opencode',
            createdAt: summary.startedAt
          },
          childRuns: childRuns.map(({ events: _events, logs: _logs, ...child }) => child),
          events,
          logs,
          thinking: logs.filter((log) => log.kind === 'thinking'),
          finalOutput: transcript.finalOutput,
          opencodeSessionId: sessionId
        }
      })
    },

    async waitForSession(sessionId, activeSessionIds) {
      const deadline = Date.now() + 5000
      while (Date.now() < deadline) {
        const session = await this.getSession(sessionId, activeSessionIds)
        if (session) return session
        await new Promise((resolve) => setTimeout(resolve, 150))
      }
      return this.getSession(sessionId, activeSessionIds)
    }
  }
}

export const nativeOpenCodeSessionRepository = createNativeOpenCodeSessionRepository()
