<script lang="ts">
  import type { ChartSlice } from '$lib/contexts/observability-metrics/read-models/metrics'

  export let slices: ChartSlice[] = []
  export let totalLabel = ''
  $: total = slices.reduce((sum, slice) => sum + slice.value, 0)
</script>

<div class="space-y-3">
  {#if totalLabel}
    <div class="text-sm font-medium text-console-text">{totalLabel}</div>
  {/if}
  {#each slices as slice}
    <div>
      <div class="mb-1 flex justify-between text-xs">
        <span class="text-console-muted">{slice.label}</span>
        <span class="text-console-text">{slice.value}</span>
      </div>
      <div class="h-2 rounded-sm bg-console-raised">
        <div class="h-2 rounded-sm" style={`width: ${total ? Math.max(6, (slice.value / total) * 100) : 0}%; background: ${slice.color}`}></div>
      </div>
    </div>
  {/each}
</div>
