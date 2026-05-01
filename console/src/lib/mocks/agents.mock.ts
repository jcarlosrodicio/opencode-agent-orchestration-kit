import type { AgentCatalogItem } from '$lib/contexts/presets-configuration/read-models/configuration'

export const agentCatalog: AgentCatalogItem[] = [
  {
    key: 'lead',
    label: 'lead',
    description: 'Main product-development orchestrator for research, design, spec, implementation, and review.',
    modelEnv: 'OPENCODE_LEAD_MODEL',
    workflows: ['feature', 'evolve']
  },
  {
    key: 'scoper',
    label: 'scoper',
    description: 'Lightweight research to spec orchestrator.',
    modelEnv: 'OPENCODE_SCOPER_MODEL',
    workflows: ['scope', 'mvp-spec']
  },
  {
    key: 'designer',
    label: 'designer',
    description: 'Visual design, UX/UI, and Open Design handoff.',
    modelEnv: 'OPENCODE_DESIGNER_MODEL',
    workflows: ['feature', 'design']
  },
  {
    key: 'researcher',
    label: 'researcher',
    description: 'Technical and product research.',
    modelEnv: 'OPENCODE_RESEARCHER_MODEL',
    workflows: ['feature', 'scope', 'mvp-spec', 'research']
  },
  {
    key: 'specifier',
    label: 'specifier',
    description: 'Specs, tasks, acceptance criteria, and validation plan.',
    modelEnv: 'OPENCODE_SPECIFIER_MODEL',
    workflows: ['feature', 'scope', 'mvp-spec', 'spec']
  },
  {
    key: 'developer',
    label: 'developer',
    description: 'Implementation and validation.',
    modelEnv: 'OPENCODE_DEVELOPER_MODEL',
    workflows: ['direct', 'feature', 'implement', 'evolve']
  },
  {
    key: 'reviewer',
    label: 'reviewer',
    description: 'Diff review against the active task or spec.',
    modelEnv: 'OPENCODE_REVIEWER_MODEL',
    workflows: ['feature', 'review', 'evolve']
  },
  {
    key: 'evaluator',
    label: 'evaluator',
    description: 'Optional AHE evidence sidecar.',
    modelEnv: 'OPENCODE_EVALUATOR_MODEL',
    workflows: ['evolve']
  },
  {
    key: 'debugger',
    label: 'debugger',
    description: 'Optional root-cause and trace sidecar.',
    modelEnv: 'OPENCODE_DEBUGGER_MODEL',
    workflows: ['evolve']
  },
  {
    key: 'evolver',
    label: 'evolver',
    description: 'Harness evolution sidecar for evidence-backed changes.',
    modelEnv: 'OPENCODE_EVOLVER_MODEL',
    workflows: ['evolve']
  }
]
