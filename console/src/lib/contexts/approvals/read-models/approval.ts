export interface ApprovalView {
  id: string
  runId: string
  title: string
  workflowId: string
  stageId: string
  agent: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
}
