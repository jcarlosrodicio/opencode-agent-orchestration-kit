<script lang="ts">
  import { getWorkflow } from '$lib/contexts/launch/adapters/workflowCatalog'
  import type { WorkflowId } from '$lib/contexts/launch/domain/workflow'
  import Badge from '$lib/design-system/Badge.svelte'

  export let workflowId: WorkflowId = 'direct'
  $: workflow = getWorkflow(workflowId)
</script>

<div class="flex flex-wrap items-center gap-2">
  {#each workflow.stages as stage, index}
    <Badge tone={stage.kind === 'barrier' ? 'warning' : stage.agent === 'evolver' || stage.agent === 'debugger' || stage.agent === 'evaluator' ? 'ahe' : 'active'}>{stage.label}</Badge>
    {#if index < workflow.stages.length - 1}
      <span class="text-console-muted" aria-hidden="true">→</span>
    {/if}
  {/each}
</div>
