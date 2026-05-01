import type { OpenCodeRunner } from './ports/OpenCodeRunner'
import type { OpenCodeSessionRepository } from './ports/OpenCodeSessionRepository'

export async function listRuns(repository: OpenCodeSessionRepository, runner: OpenCodeRunner, limit?: number, offset?: number) {
  return repository.listSessions({ activeSessionIds: runner.activeRunIds(), limit, offset })
}
