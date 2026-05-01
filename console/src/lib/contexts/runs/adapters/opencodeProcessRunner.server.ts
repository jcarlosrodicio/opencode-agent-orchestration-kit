import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { OpenCodeRunner } from '../application/ports/OpenCodeRunner'
import type { NormalizedRunEvent } from '../domain/runLifecycle'
import { activeProcessRegistry } from './opencode/activeProcessRegistry.server'
import { buildOpenCodeCommand } from './opencode/buildOpenCodeCommand.server'
import { normalizeOpenCodeLine } from './opencode/normalizeOpenCodeEvent.server'

const repoRoot = process.cwd().endsWith('/console') ? join(process.cwd(), '..') : process.cwd()
const stoppingRuns = new Set<string>()

function splitLines(buffer: string, chunk: Buffer) {
  const lines = `${buffer}${chunk.toString('utf8')}`.split(/\r?\n/)
  return { complete: lines.slice(0, -1), pending: lines.at(-1) ?? '' }
}

export const opencodeProcessRunner: OpenCodeRunner = {
  async start(input) {
    const command = buildOpenCodeCommand(input)
    const launchId = `launch_${Date.now()}`
    let sequence = 1
    let stdoutBuffer = ''
    let stderrBuffer = ''
    let sessionId = ''
    const bufferedEvents: NormalizedRunEvent[] = []
    const child = spawn(command.command, command.args, {
      cwd: input.workdir ?? repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...(input.models ?? {})
      }
    })

    activeProcessRegistry.set(launchId, child)

    const withSessionId = (event: NormalizedRunEvent, id: string): NormalizedRunEvent => ({
      ...event,
      id: `${id}_${event.sequence}`,
      runId: id,
      opencodeSessionId: event.opencodeSessionId ?? id
    })

    let publish = async (event: NormalizedRunEvent) => {
      if (!sessionId) {
        bufferedEvents.push(event)
        if (!event.opencodeSessionId) return
        sessionId = event.opencodeSessionId
        activeProcessRegistry.delete(launchId)
        activeProcessRegistry.set(sessionId, child)
        for (const buffered of bufferedEvents.splice(0)) await input.onEvent(withSessionId(buffered, sessionId))
        return
      }
      await input.onEvent(withSessionId(event, sessionId))
    }

    const emitLine = async (line: string, stream: 'stdout' | 'stderr') => {
      if (!line.trim()) return
      sequence += 1
      await publish(normalizeOpenCodeLine({ runId: sessionId || launchId, workflowId: input.workflowId, line, stream, sequence }))
    }

    child.stdout.on('data', (chunk) => {
      const next = splitLines(stdoutBuffer, chunk)
      stdoutBuffer = next.pending
      next.complete.forEach((line) => void emitLine(line, 'stdout'))
    })

    child.stderr.on('data', (chunk) => {
      const next = splitLines(stderrBuffer, chunk)
      stderrBuffer = next.pending
      next.complete.forEach((line) => void emitLine(line, 'stderr'))
    })

    const started = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('OpenCode did not emit a sessionID.'))
      }, 20000)

      const settle = () => {
        if (!sessionId) return
        clearTimeout(timeout)
        resolve(sessionId)
      }

      const originalPublish = publish
      publish = async (event: NormalizedRunEvent) => {
        await originalPublish(event)
        settle()
      }

      child.on('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })

      child.on('close', (code, signal) => {
        if (sessionId) return
        clearTimeout(timeout)
        reject(new Error(`OpenCode exited before emitting a sessionID (code ${code ?? 'unknown'}${signal ? `, signal ${signal}` : ''}).`))
      })
    })

    child.on('error', (error) => {
      sequence += 1
      void publish({
        id: `${sessionId || launchId}_${sequence}`,
        runId: sessionId || launchId,
        sequence,
        timestamp: new Date().toISOString(),
        agent: 'system',
        stageId: 'process',
        kind: 'error',
        message: error.message,
        raw: { type: 'process_error', message: error.message },
        status: 'failed'
      })
    })

    child.on('close', (code, signal) => {
      activeProcessRegistry.delete(sessionId || launchId)
      void (async () => {
        await emitLine(stdoutBuffer, 'stdout')
        await emitLine(stderrBuffer, 'stderr')
        if (stoppingRuns.delete(sessionId || launchId)) return
        sequence += 1
        await publish({
          id: `${sessionId || launchId}_${sequence}`,
          runId: sessionId || launchId,
          sequence,
          timestamp: new Date().toISOString(),
          agent: 'system',
          stageId: 'process',
          kind: code === 0 ? 'lifecycle' : 'error',
          message: code === 0 ? 'OpenCode process exited successfully.' : `OpenCode process exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}.`,
          raw: { type: 'process_exit', code, signal },
          status: code === 0 ? 'completed' : 'failed'
        })
      })()
    })

    return started
  },

  async stop(sessionId) {
    const child = activeProcessRegistry.get(sessionId)
    if (!child) return false
    stoppingRuns.add(sessionId)
    child.kill('SIGTERM')
    setTimeout(() => {
      if (!child.killed) child.kill('SIGKILL')
    }, 2500).unref()
    activeProcessRegistry.delete(sessionId)
    return true
  },

  activeRunIds() {
    return activeProcessRegistry.ids()
  }
}
