<script lang="ts">
  import { getEligibleAgents } from '$lib/contexts/launch/adapters/workflowCatalog'
  import type { WorkflowId } from '$lib/contexts/launch/domain/workflow'

  export let workflowId: WorkflowId = 'direct'
  export let selectedModels: Record<string, string> = {}
  export let modelOptions: AgentModelOptions[] = []

  interface AgentModelOptions {
    agent: string
    modelEnv: string
    selected: string
    models: string[]
  }

  $: agents = getEligibleAgents(workflowId)

  function optionsFor(agent: string) {
    return modelOptions.find((item) => item.agent === agent)
  }

  function currentModel(agent: string) {
    const options = optionsFor(agent)
    return selectedModels[agent] ?? options?.selected ?? ''
  }

  function updateModel(agent: string, value: string) {
    const options = optionsFor(agent)
    const next = { ...selectedModels }
    if (!value || value === options?.selected) delete next[agent]
    else next[agent] = value
    selectedModels = next
  }
</script>

<div class="overflow-x-auto">
  <table class="w-full text-left text-sm">
    <thead class="border-b border-console-line text-xs text-console-muted">
      <tr>
        <th class="w-1/3 py-2 font-medium">Agent</th>
        <th class="py-2 font-medium">Model</th>
      </tr>
    </thead>
    <tbody>
      {#each agents as agent}
        {@const options = optionsFor(agent)}
        <tr class="border-b border-console-line/70">
          <td class="py-2 text-console-text">{agent}</td>
          <td class="py-2">
            <select class="w-full rounded-md border border-console-line bg-console-root px-2 py-1 text-console-text" name={`${agent}-model`} aria-label={`${agent} model`} value={currentModel(agent)} on:change={(event) => updateModel(agent, event.currentTarget.value)}>
              {#if options?.selected}
                <option value={options.selected}>{options.selected}</option>
              {/if}
              {#each options?.models ?? [] as model}
                {#if model !== options?.selected}
                  <option value={model}>{model}</option>
                {/if}
              {/each}
              {#if !options?.selected && !(options?.models.length)}
                <option value="">No model resolved</option>
              {/if}
            </select>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
