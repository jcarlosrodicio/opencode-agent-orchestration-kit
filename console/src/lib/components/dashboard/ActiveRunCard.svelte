<script lang="ts">
  import Badge from '$lib/design-system/Badge.svelte'
  import type { RunSummary } from '$lib/contexts/runs/read-models/run'
  import { formatDuration } from '$lib/utils/format'
  import { runStatusTone } from '$lib/utils/runDisplay'

  export let run: RunSummary
</script>

<a href={`/runs/${run.id}`} class="block rounded-lg border border-console-line bg-console-raised p-3 transition-colors duration-150 hover:border-console-active">
  <div class="flex items-start justify-between gap-3">
    <div class="min-w-0">
      <div class="truncate text-sm font-semibold text-console-text">{run.title}</div>
      <div class="mt-1 text-xs text-console-muted">{run.activeAgent}</div>
    </div>
    <Badge tone={runStatusTone(run.status)}>{run.status}</Badge>
  </div>
  <div class="mt-4 h-1 rounded-sm bg-console-panel">
    <div class="h-1 rounded-sm bg-console-active" style={`width: ${run.status === 'completed' ? 100 : run.status === 'blocked' ? 62 : 44}%`}></div>
  </div>
  <div class="mt-2 text-xs text-console-muted">{formatDuration(run.elapsedSeconds)}</div>
</a>
