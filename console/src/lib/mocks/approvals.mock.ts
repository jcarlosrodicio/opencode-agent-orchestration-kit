import type { ApprovalView } from '$lib/contexts/approvals/read-models/approval'

export const approvals: ApprovalView[] = [
  {
    id: 'appr_1',
    runId: 'run_92',
    title: 'Spec review required',
    workflowId: 'feature',
    stageId: 'specifier',
    agent: 'lead',
    reason: 'Developer is waiting for acceptance criteria confirmation.',
    status: 'pending',
    createdAt: '2026-05-01T10:30:00.000Z'
  },
  {
    id: 'appr_2',
    runId: 'run_91',
    title: 'Scope accepted',
    workflowId: 'mvp-spec',
    stageId: 'scoper-synthesis',
    agent: 'scoper',
    reason: 'MVP boundary is ready for specifier.',
    status: 'approved',
    createdAt: '2026-05-01T09:39:00.000Z'
  },
  {
    id: 'appr_3',
    runId: 'run_89',
    title: 'Harness change blocked',
    workflowId: 'evolve',
    stageId: 'lead-approval',
    agent: 'lead approval',
    reason: 'Manifest failed validation evidence requirements.',
    status: 'rejected',
    createdAt: '2026-04-30T17:36:00.000Z'
  }
]
