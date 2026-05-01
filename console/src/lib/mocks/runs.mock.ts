import type { RunDetailView, RunSummary } from '$lib/contexts/runs/read-models/run'

export const runSummaries: RunSummary[] = [
  {
    id: 'run_92',
    title: 'user-auth-system',
    workflowId: 'feature',
    activeAgent: 'developer',
    status: 'running',
    validation: 'running',
    elapsedSeconds: 1122,
    tokens: 182400,
    costUsd: 0.183,
    artifacts: 12,
    startedAt: '2026-05-01T10:02:21.000Z'
  },
  {
    id: 'run_91',
    title: 'payments-core',
    workflowId: 'mvp-spec',
    activeAgent: 'specifier',
    status: 'blocked',
    validation: 'pending',
    elapsedSeconds: 551,
    tokens: 96300,
    costUsd: 0.097,
    artifacts: 8,
    startedAt: '2026-05-01T09:32:00.000Z'
  },
  {
    id: 'run_90',
    title: 'dashboard-v2',
    workflowId: 'design',
    activeAgent: 'open-design',
    status: 'completed',
    validation: 'passed',
    elapsedSeconds: 363,
    tokens: 54100,
    costUsd: 0.054,
    artifacts: 5,
    startedAt: '2026-05-01T08:41:00.000Z'
  },
  {
    id: 'run_89',
    title: 'refactor-run-57',
    workflowId: 'evolve',
    activeAgent: 'debugger',
    status: 'failed',
    validation: 'failed',
    elapsedSeconds: 850,
    tokens: 211700,
    costUsd: 0.211,
    artifacts: 15,
    startedAt: '2026-04-30T17:20:00.000Z'
  },
  {
    id: 'run_88',
    title: 'quick-fix',
    workflowId: 'direct',
    activeAgent: 'developer',
    status: 'completed',
    validation: 'passed',
    elapsedSeconds: 139,
    tokens: 21800,
    costUsd: 0.022,
    artifacts: 2,
    startedAt: '2026-04-30T14:06:00.000Z'
  }
]

export const runDetails: RunDetailView[] = [
  {
    ...runSummaries[0],
    prompt: 'Implement authentication endpoints, validation, tests, and reviewable artifacts.',
    configSnapshot: {
      workflowId: 'feature',
      prompt: 'Implement authentication endpoints, validation, tests, and reviewable artifacts.',
      models: {
        lead: 'OPENCODE_LEAD_MODEL',
        designer: 'OPENCODE_DESIGNER_MODEL',
        researcher: 'OPENCODE_RESEARCHER_MODEL',
        specifier: 'OPENCODE_SPECIFIER_MODEL',
        developer: 'OPENCODE_DEVELOPER_MODEL',
        reviewer: 'OPENCODE_REVIEWER_MODEL'
      },
      skills: ['open-design', 'superpowers'],
      tools: ['filesystem', 'git', 'http', 'open-design'],
      runnerMode: 'mock-stream'
    }
  },
  {
    ...runSummaries[1],
    prompt: 'Research Stripe Checkout integration and produce a strict MVP spec.',
    configSnapshot: {
      workflowId: 'mvp-spec',
      prompt: 'Research Stripe Checkout integration and produce a strict MVP spec.',
      models: {
        scoper: 'OPENCODE_SCOPER_MODEL',
        researcher: 'OPENCODE_RESEARCHER_MODEL',
        specifier: 'OPENCODE_SPECIFIER_MODEL'
      },
      skills: ['superpowers'],
      tools: ['filesystem', 'git', 'http'],
      runnerMode: 'mock-stream'
    }
  }
]
