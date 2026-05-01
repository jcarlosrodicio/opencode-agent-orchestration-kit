import { getEligibleAgents, getWorkflow } from '../adapters/workflowCatalog'
import type { LaunchDraft, LaunchValidationResult } from '../domain/workflow'

export function validateLaunchDraft(draft: LaunchDraft): LaunchValidationResult {
  const reasons: string[] = []
  const prompt = draft.prompt.trim()
  const workflow = getWorkflow(draft.workflowId)

  if (!prompt) reasons.push('Prompt is required.')
  if (prompt.length > 8000) reasons.push('Prompt must stay under 8,000 characters.')
  if (workflow.id === 'design' && !prompt.toLowerCase().includes('design')) {
    reasons.push('Design runs should describe the visual or UX target.')
  }

  return {
    canLaunch: reasons.length === 0,
    reasons,
    eligibleAgents: getEligibleAgents(draft.workflowId)
  }
}
