<script lang="ts">
  import Badge from '$lib/design-system/Badge.svelte'
  import type { RunDetailView, RunSummary } from '$lib/contexts/runs/read-models/run'
  import { buildRealTimelineProjection, workflowSummary } from '$lib/contexts/runs/read-models/runObservabilityProjection'
  import { runStatusTone, workflowDisplayLabel } from '$lib/utils/runDisplay'

  export let runs: RunSummary[] = []
  export let details: Record<string, RunDetailView> = {}
</script>

<div class="space-y-4">
  {#each runs as run}
    {@const detail = details[run.id]}
    {@const source = detail ?? run}
    {@const timeline = buildRealTimelineProjection(source, detail?.events ?? [])}
    {@const summary = workflowSummary(run)}
    <section class="rounded-lg border border-console-line bg-console-panel p-4">
      <div class="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 class="text-sm font-semibold text-console-text">{run.title}</h2>
          <div class="mt-1 flex flex-wrap gap-3 text-xs text-console-muted">
            {#if summary.finishedLabel}<span>{summary.finishedLabel}</span>{/if}
            {#if summary.durationLabel}<span>{summary.durationLabel}</span>{/if}
            {#if summary.statusReason}<span>{summary.statusReason}</span>{/if}
          </div>
        </div>
        <div class="flex gap-2">
          <Badge tone="active">{workflowDisplayLabel(run.workflowId)}</Badge>
          <Badge tone={runStatusTone(run.status)}>{run.status}</Badge>
        </div>
      </div>
      <div class="grid gap-2 md:grid-cols-4 xl:grid-cols-6">
        {#each timeline.stages as stage}
          <a class="rounded-md border border-console-line bg-console-raised p-3 hover:border-console-active" href={`/runs/${run.id}`}>
            <div class="flex items-center justify-between gap-2">
              <span class="truncate text-sm font-medium text-console-text">{stage.label}</span>
              <Badge tone={stage.status === 'completed' ? 'success' : stage.status === 'running' ? 'active' : stage.status === 'blocked' || stage.status === 'stopped' ? 'warning' : stage.status === 'failed' ? 'danger' : 'neutral'}>{stage.status}</Badge>
            </div>
            <div class="mt-2 text-xs text-console-muted">{stage.agent}</div>
            {#if stage.barrierReason}
              <div class="mt-2 text-xs text-console-warning">Barrier</div>
            {/if}
          </a>
        {/each}
      </div>
    </section>
  {/each}
</div>
