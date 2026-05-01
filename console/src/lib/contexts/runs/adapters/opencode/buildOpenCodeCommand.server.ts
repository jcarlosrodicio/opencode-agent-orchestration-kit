import type { WorkflowId } from '../../../launch/domain/workflow'
import { getWorkflow } from '../../../launch/adapters/workflowCatalog'

interface BuildCommandInput {
  workflowId: WorkflowId
  title: string
  prompt: string
}

export interface OpenCodeCommand {
  command: 'opencode'
  args: string[]
}

export function buildOpenCodeCommand(input: BuildCommandInput): OpenCodeCommand {
  const workflow = getWorkflow(input.workflowId)
  const prompt = workflow.slashCommand ? `${workflow.slashCommand} ${input.prompt}` : input.prompt
  return {
    command: 'opencode',
    args: ['run', '--format', 'json', '--thinking', '--title', input.title || input.workflowId, prompt]
  }
}
