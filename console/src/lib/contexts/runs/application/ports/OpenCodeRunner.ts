import type { WorkflowId } from '../../../launch/domain/workflow'
import type { NormalizedRunEvent } from '../../domain/runLifecycle'

export interface OpenCodeRunnerStart {
  workflowId: WorkflowId
  title: string
  prompt: string
  workdir?: string
  models?: Record<string, string>
  onEvent(event: NormalizedRunEvent): Promise<void>
}

export interface OpenCodeRunner {
  start(input: OpenCodeRunnerStart): Promise<string>
  stop(sessionId: string): Promise<boolean>
  activeRunIds(): Set<string>
}
