import { describe, expect, it } from 'vitest'
import { validateLaunchDraft } from '$lib/contexts/launch/application/launchValidation'

describe('launch validation', () => {
  it('blocks empty prompts', () => {
    const result = validateLaunchDraft({ title: 'Empty', prompt: ' ', workflowId: 'direct' })
    expect(result.canLaunch).toBe(false)
    expect(result.reasons).toContain('Prompt is required.')
  })

  it('returns eligible agents for the selected workflow', () => {
    const result = validateLaunchDraft({ title: 'Scope', prompt: 'Research the task', workflowId: 'scope' })
    expect(result.canLaunch).toBe(true)
    expect(result.eligibleAgents).toEqual(['scoper', 'researcher', 'specifier'])
  })
})
