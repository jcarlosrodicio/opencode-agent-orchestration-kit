<script lang="ts">
  import Panel from '$lib/design-system/Panel.svelte'
  import WorkflowBoard from '$lib/components/workflows/WorkflowBoard.svelte'
  import { realRunStore } from '$lib/contexts/runs/adapters/realRunStore'

  $: runs = $realRunStore.runs
  $: streamLabel = $realRunStore.connection === 'live' ? 'native SSE' : 'native OpenCode'
</script>

<div class="space-y-4">
  <Panel>
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-base font-semibold text-console-text">Live workflow execution</h2>
        <p class="mt-1 text-sm text-console-muted">Native OpenCode sessions and current process state.</p>
      </div>
      <span class="text-sm text-console-muted">Stream: {streamLabel}</span>
    </div>
  </Panel>
  <WorkflowBoard {runs} details={$realRunStore.details} />
</div>
