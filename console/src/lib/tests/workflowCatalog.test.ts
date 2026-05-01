import { describe, expect, it } from 'vitest'
import { getEligibleAgents, getWorkflow, workflowCatalog } from '$lib/contexts/launch/adapters/workflowCatalog'

describe('workflow catalog', () => {
  it('contains every repository command plus direct mode', () => {
    expect(workflowCatalog.map((workflow) => workflow.id)).toEqual([
      'native',
      'direct',
      'feature',
      'scope',
      'mvp-spec',
      'design',
      'research',
      'spec',
      'implement',
      'review',
      'evolve'
    ])
  })

  it('keeps native CLI sessions out of launch agent assignment', () => {
    expect(getWorkflow('native').label).toBe('OpenCode CLI')
    expect(getEligibleAgents('native')).toEqual([])
  })

  it('keeps feature stage order aligned with repository contract', () => {
    expect(getWorkflow('feature').stages.map((stage) => stage.agent)).toEqual([
      'lead',
      'designer',
      'researcher',
      'specifier',
      'developer',
      'reviewer'
    ])
  })

  it('keeps scope and mvp-spec away from implementation agents', () => {
    for (const workflowId of ['scope', 'mvp-spec'] as const) {
      const agents = getEligibleAgents(workflowId)
      expect(agents).toEqual(['scoper', 'researcher', 'specifier'])
      expect(agents).not.toContain('designer')
      expect(agents).not.toContain('developer')
      expect(agents).not.toContain('reviewer')
    }
  })

  it('models evolve as an AHE sidecar workflow with lead approval', () => {
    const stages = getWorkflow('evolve').stages.map((stage) => stage.agent)
    expect(stages).toContain('evaluator')
    expect(stages).toContain('debugger')
    expect(stages).toContain('evolver')
    expect(stages).toContain('lead approval')
  })
})
