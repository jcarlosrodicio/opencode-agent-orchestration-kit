import type { RunSummary } from '$lib/contexts/runs/read-models/run'
import { colorForTone, runStatusTone, workflowDisplayLabel } from '$lib/utils/runDisplay'
import type { ChartSlice, MetricSnapshot } from '../read-models/metrics'

export function buildMetricSnapshot(runs: RunSummary[]): MetricSnapshot {
  return {
    totalRuns: runs.length,
    activeRuns: runs.filter((run) => run.status === 'running' || run.status === 'blocked').length,
    totalTokens: runs.reduce((sum, run) => sum + run.tokens, 0),
    totalCostUsd: runs.reduce((sum, run) => sum + run.costUsd, 0),
    artifacts: runs.reduce((sum, run) => sum + run.artifacts, 0)
  }
}

export function workflowDistribution(runs: RunSummary[]): ChartSlice[] {
  const colors = ['#4da3ff', '#32d583', '#f2b84b', '#c084fc', '#f97066', '#8b9bb0']
  const counts = new Map<string, number>()
  for (const run of runs) counts.set(workflowDisplayLabel(run.workflowId), (counts.get(workflowDisplayLabel(run.workflowId)) ?? 0) + 1)
  return Array.from(counts.entries()).map(([label, value], index) => ({ label, value, color: colors[index % colors.length] }))
}

export function statusDistribution(runs: RunSummary[]): ChartSlice[] {
  const statuses = ['completed', 'running', 'stopped', 'failed', 'blocked', 'pending', 'interrupted'] as const
  const counts = new Map<string, number>()
  for (const run of runs) counts.set(run.status, (counts.get(run.status) ?? 0) + 1)
  return statuses.map((label) => ({ label, value: counts.get(label) ?? 0, color: colorForTone(runStatusTone(label)) })).filter((slice) => slice.value > 0)
}
