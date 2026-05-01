export interface ArtifactView {
  id: string
  runId: string
  title: string
  type: 'spec' | 'review' | 'design' | 'manifest' | 'validation' | 'config'
  agent: string
  stageId: string
  createdAt: string
  status: 'ready' | 'draft' | 'failed'
}
