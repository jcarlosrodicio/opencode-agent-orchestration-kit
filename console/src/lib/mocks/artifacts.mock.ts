import type { ArtifactView } from '$lib/contexts/artifacts/read-models/artifact'

export const artifacts: ArtifactView[] = [
  { id: 'art_1', runId: 'run_92', title: 'spec.md', type: 'spec', agent: 'specifier', stageId: 'specifier', createdAt: '2026-05-01T10:24:00.000Z', status: 'ready' },
  { id: 'art_2', runId: 'run_92', title: 'auth-review.md', type: 'review', agent: 'reviewer', stageId: 'reviewer', createdAt: '2026-05-01T10:29:00.000Z', status: 'draft' },
  { id: 'art_3', runId: 'run_90', title: 'open-design-project', type: 'design', agent: 'designer', stageId: 'open-design', createdAt: '2026-05-01T08:48:00.000Z', status: 'ready' },
  { id: 'art_4', runId: 'run_89', title: 'change_manifest.json', type: 'manifest', agent: 'evolver', stageId: 'evolver', createdAt: '2026-04-30T17:30:00.000Z', status: 'failed' },
  { id: 'art_5', runId: 'run_91', title: 'mvp-tasks.md', type: 'spec', agent: 'specifier', stageId: 'specifier', createdAt: '2026-05-01T09:41:00.000Z', status: 'draft' }
]
