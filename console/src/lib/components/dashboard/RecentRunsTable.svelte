<script lang="ts">
  import Badge from '$lib/design-system/Badge.svelte'
  import type { RunSummary } from '$lib/contexts/runs/read-models/run'
  import { formatCurrency, formatDuration, formatTokens } from '$lib/utils/format'
  import { runStatusTone, workflowDisplayLabel } from '$lib/utils/runDisplay'

  export let runs: RunSummary[] = []
</script>

<div class="overflow-x-auto">
  <table class="w-full text-left text-sm">
    <thead class="border-b border-console-line text-xs text-console-muted">
      <tr>
        <th class="py-2 font-medium">Run</th>
        <th class="py-2 font-medium">Workflow</th>
        <th class="py-2 font-medium">Status</th>
        <th class="py-2 text-right font-medium">Elapsed</th>
        <th class="py-2 text-right font-medium">Tokens</th>
        <th class="py-2 text-right font-medium">Cost</th>
      </tr>
    </thead>
    <tbody>
      {#each runs as run}
        <tr class="border-b border-console-line/70 hover:bg-console-raised">
          <td class="py-2">
            <a class="font-medium text-console-text hover:text-console-active" href={`/runs/${run.id}`}>{run.title}</a>
            {#if run.workdir}<div class="max-w-80 truncate text-xs text-console-dim">{run.workdir}</div>{/if}
          </td>
          <td class="py-2 text-console-muted">{workflowDisplayLabel(run.workflowId)}</td>
          <td class="py-2"><Badge tone={runStatusTone(run.status)}>{run.status}</Badge></td>
          <td class="py-2 text-right text-console-muted">{formatDuration(run.elapsedSeconds)}</td>
          <td class="py-2 text-right text-console-muted">{formatTokens(run.tokens)}</td>
          <td class="py-2 text-right text-console-muted">{formatCurrency(run.costUsd)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
