import { mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, test, vi } from 'vitest'
import { createNativeOpenCodeSessionRepository } from '$lib/contexts/runs/adapters/nativeOpenCodeSessionRepository.server'
import { buildOpenCodeCommand } from '$lib/contexts/runs/adapters/opencode/buildOpenCodeCommand.server'
import { normalizeOpenCodeLine } from '$lib/contexts/runs/adapters/opencode/normalizeOpenCodeEvent.server'
import { startRun } from '$lib/contexts/runs/application/startRun'
import { stopRun } from '$lib/contexts/runs/application/stopRun'
import type { OpenCodeRunner } from '$lib/contexts/runs/application/ports/OpenCodeRunner'
import type { OpenCodeSessionRepository } from '$lib/contexts/runs/application/ports/OpenCodeSessionRepository'
import type { RunEventPublisher } from '$lib/contexts/runs/application/ports/RunEventPublisher'
import type { RunDetailView } from '$lib/contexts/runs/read-models/run'

const expandedFeaturePrompt = `Objetivo:

Build a native console

Ejecuta el flujo con barreras obligatorias.

## Flujo obligatorio

1. Analiza el objetivo y el repo actual.`

function createFixtureDatabase(path: string) {
  const db = new Database(path)
  db.exec(`
    create table session (
      id text primary key,
      parent_id text,
      title text,
      directory text,
      time_created integer,
      time_updated integer,
      time_archived integer
    );
    create table message (
      id text primary key,
      session_id text,
      time_created integer,
      time_updated integer,
      data text
    );
    create table part (
      id text primary key,
      message_id text,
      session_id text,
      time_created integer,
      time_updated integer,
      data text
    );
  `)
  db.prepare('insert into session values (?, ?, ?, ?, ?, ?, ?)').run('ses_fixture_1', null, 'CLI fixture', '/workspace/project-a', 1777634425000, 1777634429000, null)
  db.prepare('insert into session values (?, ?, ?, ?, ?, ?, ?)').run('ses_fixture_2', null, 'Older fixture', '/workspace/project-b', 1777634410000, 1777634415000, null)
  db.prepare('insert into session values (?, ?, ?, ?, ?, ?, ?)').run(
    'ses_child_research',
    'ses_fixture_1',
    'Research console (@researcher subagent)',
    '/workspace/project-a',
    1777634426500,
    1777634427500,
    null
  )
  db.prepare('insert into message values (?, ?, ?, ?, ?)').run(
    'msg_user_1',
    'ses_fixture_1',
    1777634425100,
    1777634425100,
    JSON.stringify({ role: 'user', agent: 'developer' })
  )
  db.prepare('insert into message values (?, ?, ?, ?, ?)').run(
    'msg_assistant_1',
    'ses_fixture_1',
    1777634426000,
    1777634429000,
    JSON.stringify({ role: 'assistant', agent: 'developer', tokens: { total: 42 }, cost: 0.12 })
  )
  db.prepare('insert into message values (?, ?, ?, ?, ?)').run(
    'msg_child_user_1',
    'ses_child_research',
    1777634426600,
    1777634426600,
    JSON.stringify({ role: 'user', agent: 'researcher', model: { providerID: 'openai', modelID: 'gpt-5.4' } })
  )
  db.prepare('insert into message values (?, ?, ?, ?, ?)').run(
    'msg_child_assistant_1',
    'ses_child_research',
    1777634427000,
    1777634427500,
    JSON.stringify({ role: 'assistant', agent: 'researcher', modelID: 'gpt-5.4', providerID: 'openai', tokens: { total: 84 }, cost: 0.24 })
  )
  db.prepare('insert into part values (?, ?, ?, ?, ?, ?)').run(
    'part_user_1',
    'msg_user_1',
    'ses_fixture_1',
    1777634425200,
    1777634425200,
    JSON.stringify({ type: 'text', text: expandedFeaturePrompt })
  )
  db.prepare('insert into part values (?, ?, ?, ?, ?, ?)').run(
    'part_unknown_1',
    'msg_assistant_1',
    'ses_fixture_1',
    1777634426200,
    1777634426200,
    JSON.stringify({ type: 'unknown-shape', payload: { nested: true } })
  )
  db.prepare('insert into part values (?, ?, ?, ?, ?, ?)').run(
    'part_assistant_1',
    'msg_assistant_1',
    'ses_fixture_1',
    1777634428000,
    1777634428000,
    JSON.stringify({ type: 'text', text: 'Done', tokens: { total: 42 } })
  )
  db.prepare('insert into part values (?, ?, ?, ?, ?, ?)').run(
    'part_child_user_1',
    'msg_child_user_1',
    'ses_child_research',
    1777634426700,
    1777634426700,
    JSON.stringify({ type: 'text', text: 'Research the native DB shape.' })
  )
  db.prepare('insert into part values (?, ?, ?, ?, ?, ?)').run(
    'part_child_assistant_1',
    'msg_child_assistant_1',
    'ses_child_research',
    1777634427400,
    1777634427400,
    JSON.stringify({ type: 'text', text: 'Research complete.', tokens: { total: 84 } })
  )
  db.close()
}

describe('OpenCode command builder', () => {
  test('direct uses the raw prompt and no directory or command flag', () => {
    const command = buildOpenCodeCommand({
      workflowId: 'direct',
      title: 'Direct smoke',
      prompt: 'Reply exactly: OK'
    })

    expect(command.command).toBe('opencode')
    expect(command.args).toEqual(['run', '--format', 'json', '--thinking', '--title', 'Direct smoke', 'Reply exactly: OK'])
    expect(command.args).not.toContain('--dir')
    expect(command.args).not.toContain('--command')
  })

  test('slash workflows prefix the prompt with the native command', () => {
    const command = buildOpenCodeCommand({
      workflowId: 'feature',
      title: 'Feature smoke',
      prompt: 'Build the smallest useful slice'
    })

    expect(command.args).toEqual(['run', '--format', 'json', '--thinking', '--title', 'Feature smoke', '/feature Build the smallest useful slice'])
    expect(command.args).not.toContain('--dir')
    expect(command.args).not.toContain('--command')
  })
})

describe('OpenCode event normalizer', () => {
  test('maps reasoning, text, and finish events while preserving native session ids', () => {
    expect(
      normalizeOpenCodeLine({
        runId: 'ses_1',
        workflowId: 'direct',
        line: JSON.stringify({ type: 'reasoning', timestamp: 1000, sessionID: 'ses_1', part: { text: 'thinking aloud' } }),
        stream: 'stdout',
        sequence: 1
      })
    ).toMatchObject({ kind: 'thinking', message: 'thinking aloud', agent: 'developer', stageId: 'developer', opencodeSessionId: 'ses_1' })

    expect(
      normalizeOpenCodeLine({
        runId: 'ses_1',
        workflowId: 'direct',
        line: JSON.stringify({ type: 'text', timestamp: 1001, sessionID: 'ses_1', part: { text: 'final answer' } }),
        stream: 'stdout',
        sequence: 2
      })
    ).toMatchObject({ kind: 'output', message: 'final answer' })

    expect(
      normalizeOpenCodeLine({
        runId: 'ses_1',
        workflowId: 'direct',
        line: JSON.stringify({ type: 'step_finish', timestamp: 1002, sessionID: 'ses_1', part: { tokens: { total: 42 } } }),
        stream: 'stdout',
        sequence: 3
      })
    ).toMatchObject({ kind: 'lifecycle', status: 'completed', tokens: 42 })
  })
})

describe('native OpenCode session repository', () => {
  test('lists sessions from the native SQLite schema ordered by update time', async () => {
    const root = await mkdtemp(join(tmpdir(), 'opencode-native-db-'))
    const dbPath = join(root, 'opencode.db')
    createFixtureDatabase(dbPath)
    const repository = createNativeOpenCodeSessionRepository(dbPath)

    try {
      const result = await repository.listSessions()
      expect(result.total).toBe(2)
      expect(result.limit).toBe(25)
      expect(result.offset).toBe(0)
      expect(result.runs.map((session) => session.id)).toEqual(['ses_fixture_1', 'ses_fixture_2'])
      expect(result.runs[0]).toMatchObject({
        title: 'CLI fixture',
        workflowId: 'feature',
        workdir: '/workspace/project-a',
        executionMode: 'native-opencode',
        validation: 'not-run',
        tokens: 126
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('paginates native sessions at the SQLite boundary', async () => {
    const root = await mkdtemp(join(tmpdir(), 'opencode-native-page-'))
    const dbPath = join(root, 'opencode.db')
    createFixtureDatabase(dbPath)
    const repository = createNativeOpenCodeSessionRepository(dbPath)

    try {
      const result = await repository.listSessions({ limit: 1, offset: 1 })
      expect(result.total).toBe(2)
      expect(result.limit).toBe(1)
      expect(result.offset).toBe(1)
      expect(result.runs.map((session) => session.id)).toEqual(['ses_fixture_2'])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('reads transcript from message and part tables while tolerating unknown part shapes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'opencode-native-detail-'))
    const dbPath = join(root, 'opencode.db')
    createFixtureDatabase(dbPath)
    const repository = createNativeOpenCodeSessionRepository(dbPath)

    try {
      const detail = await repository.getSession('ses_fixture_1')
      expect(detail?.id).toBe('ses_fixture_1')
      expect(detail?.prompt).toBe('Build a native console')
      expect(detail?.tokens).toBe(126)
      expect(detail?.finalOutput).toBe('Done')
      expect(detail?.logs?.map((log) => log.message)).toContain('OpenCode part: unknown-shape')
      expect(detail?.configSnapshot.workdir).toBe('/workspace/project-a')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('groups native child sessions under their parent run detail', async () => {
    const root = await mkdtemp(join(tmpdir(), 'opencode-native-children-'))
    const dbPath = join(root, 'opencode.db')
    createFixtureDatabase(dbPath)
    const repository = createNativeOpenCodeSessionRepository(dbPath)

    try {
      const detail = await repository.getSession('ses_fixture_1')
      expect(detail?.workflowId).toBe('feature')
      expect(detail?.childRuns?.map((child) => child.id)).toEqual(['ses_child_research'])
      expect(detail?.childRuns?.[0]).toMatchObject({
        parentId: 'ses_fixture_1',
        agent: 'researcher',
        model: 'openai/gpt-5.4',
        prompt: 'Research the native DB shape.'
      })
      expect(detail?.events?.some((event) => event.stageId === 'ses_child_research' && event.opencodeSessionId === 'ses_child_research')).toBe(true)
      expect(detail?.logs?.map((log) => log.message)).toContain('Research complete.')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('surfaces native database failures instead of reporting zero runs', async () => {
    const repository = createNativeOpenCodeSessionRepository('/tmp/opencode-missing-for-test/opencode.db')

    await expect(repository.listSessions()).rejects.toThrow('OpenCode database not found')
  })
})

describe('stop run use case', () => {
  test('only stops native sessions controlled by this console process', async () => {
    const runner: OpenCodeRunner = {
      start: vi.fn(),
      stop: vi.fn(async () => true),
      activeRunIds: vi.fn(() => new Set(['ses_stop_1']))
    }
    const publisher: RunEventPublisher = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined)
    }

    const event = await stopRun({ runId: 'ses_stop_1', runner, publisher })

    expect(runner.stop).toHaveBeenCalledWith('ses_stop_1')
    expect(event.status).toBe('stopped')
    expect(publisher.publish).toHaveBeenCalledWith(expect.objectContaining({ runId: 'ses_stop_1', status: 'stopped' }))
  })
})

describe('start run use case', () => {
  function nativeDetail(sessionId: string, workdir: string): RunDetailView {
    return {
      id: sessionId,
      title: 'Native run',
      workflowId: 'native',
      activeAgent: 'developer',
      status: 'running',
      validation: 'not-run',
      elapsedSeconds: 0,
      tokens: 0,
      costUsd: 0,
      artifacts: 0,
      startedAt: '2026-05-01T08:00:00.000Z',
      executionMode: 'native-opencode',
      workdir,
      prompt: 'hello',
      configSnapshot: {
        workflowId: 'native',
        prompt: 'hello',
        models: {},
        skills: [],
        tools: [],
        workdir,
        runnerMode: 'native-opencode',
        createdAt: '2026-05-01T08:00:00.000Z'
      },
      logs: [],
      events: [],
      thinking: [],
      finalOutput: '',
      opencodeSessionId: sessionId
    }
  }

  test('returns the native ses_* id and passes the selected workdir to the runner', async () => {
    const repoRoot = resolve(process.cwd().endsWith('/console') ? `${process.cwd()}/..` : process.cwd())
    const repository: OpenCodeSessionRepository = {
      listSessions: vi.fn(async () => ({ runs: [], total: 0, limit: 25, offset: 0 })),
      getSession: vi.fn(async () => undefined),
      waitForSession: vi.fn(async () => nativeDetail('ses_native_1', repoRoot))
    }
    const runner: OpenCodeRunner = {
      start: vi.fn(async () => 'ses_native_1'),
      stop: vi.fn(async () => true),
      activeRunIds: vi.fn(() => new Set(['ses_native_1']))
    }
    const publisher: RunEventPublisher = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined)
    }

    const detail = await startRun({
      workflowId: 'direct',
      title: 'Workdir run',
      prompt: 'hello',
      workdir: repoRoot,
      repository,
      runner,
      publisher
    })

    expect(detail?.id).toBe('ses_native_1')
    expect(runner.start).toHaveBeenCalledWith(expect.objectContaining({ workdir: repoRoot }))
    expect(repository.waitForSession).toHaveBeenCalledWith('ses_native_1', new Set(['ses_native_1']))
  })

  test('allows selected workdirs outside the repository when they are under the home scope', async () => {
    const externalWorkdir = await mkdtemp(join(homedir(), 'opencode-console-external-workdir-'))
    const repository: OpenCodeSessionRepository = {
      listSessions: vi.fn(async () => ({ runs: [], total: 0, limit: 25, offset: 0 })),
      getSession: vi.fn(async () => undefined),
      waitForSession: vi.fn(async () => nativeDetail('ses_external_1', externalWorkdir))
    }
    const runner: OpenCodeRunner = {
      start: vi.fn(async () => 'ses_external_1'),
      stop: vi.fn(async () => true),
      activeRunIds: vi.fn(() => new Set(['ses_external_1']))
    }
    const publisher: RunEventPublisher = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined)
    }

    try {
      const detail = await startRun({
        workflowId: 'direct',
        title: 'External workdir run',
        prompt: 'hello',
        workdir: externalWorkdir,
        repository,
        runner,
        publisher
      })

      expect(detail?.workdir).toBe(externalWorkdir)
      expect(runner.start).toHaveBeenCalledWith(expect.objectContaining({ workdir: externalWorkdir }))
    } finally {
      await rm(externalWorkdir, { recursive: true, force: true })
    }
  })
})
