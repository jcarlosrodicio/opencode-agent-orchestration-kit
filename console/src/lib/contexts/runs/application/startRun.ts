import { resolve } from 'node:path'
import { isSelectableWorkdir, normalizeWorkdirPath, workdirScopeLabel } from '../../launch/adapters/localWorkdirPolicy.server'
import type { StartRunRequest } from '../domain/runLifecycle'
import type { OpenCodeRunner } from './ports/OpenCodeRunner'
import type { OpenCodeSessionRepository } from './ports/OpenCodeSessionRepository'
import type { RunEventPublisher } from './ports/RunEventPublisher'

interface StartRunInput extends StartRunRequest {
  repository: OpenCodeSessionRepository
  runner: OpenCodeRunner
  publisher: RunEventPublisher
}

const repoRoot = resolve(process.cwd().endsWith('/console') ? `${process.cwd()}/..` : process.cwd())

function titleFor(input: StartRunRequest) {
  return input.title.trim() || input.prompt.trim().slice(0, 64) || input.workflowId
}

export async function startRun(input: StartRunInput) {
  const workdir = input.workdir?.trim() ? normalizeWorkdirPath(input.workdir) : resolve(repoRoot)
  if (!isSelectableWorkdir(workdir)) throw new Error(`Workdir must be inside ${workdirScopeLabel()}`)

  const publish = async (event: Parameters<RunEventPublisher['publish']>[0]) => {
    input.publisher.publish(event)
  }

  const sessionId = await input.runner.start({
    workflowId: input.workflowId,
    title: titleFor(input),
    prompt: input.prompt,
    workdir,
    models: input.models,
    onEvent: publish
  })

  return input.repository.waitForSession(sessionId, input.runner.activeRunIds())
}
