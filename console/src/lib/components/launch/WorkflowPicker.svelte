<script lang="ts">
  import { workflowCatalog } from '$lib/contexts/launch/adapters/workflowCatalog'
  import type { WorkflowId } from '$lib/contexts/launch/domain/workflow'
  import { workflowDisplayLabel } from '$lib/utils/runDisplay'

  export let selected: WorkflowId = 'direct'
  $: launchWorkflows = workflowCatalog.filter((workflow) => workflow.id !== 'native')
</script>

<div class="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
  {#each launchWorkflows as workflow}
    <button
      class:active={selected === workflow.id}
      class="rounded-lg border border-console-line bg-console-raised p-3 text-left transition-colors duration-150 hover:border-console-active"
      type="button"
      on:click={() => (selected = workflow.id)}
    >
      <div class="text-sm font-semibold text-console-text">{workflowDisplayLabel(workflow.id)}</div>
      <div class="mt-1 line-clamp-2 text-xs leading-5 text-console-muted">{workflow.description}</div>
    </button>
  {/each}
</div>

<style>
  .active {
    border-color: #4da3ff;
    background: #13243a;
  }
</style>
