import type { OpenCodeRunner } from './ports/OpenCodeRunner'
import type { OpenCodeSessionRepository } from './ports/OpenCodeSessionRepository'

export async function getRun(runId: string, repository: OpenCodeSessionRepository, runner: OpenCodeRunner) {
  return repository.getSession(runId, runner.activeRunIds())
}
