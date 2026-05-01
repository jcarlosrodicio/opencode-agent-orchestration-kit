export interface MetricSnapshot {
  totalRuns: number
  activeRuns: number
  totalTokens: number
  totalCostUsd: number
  artifacts: number
}

export interface ChartSlice {
  label: string
  value: number
  color: string
}
