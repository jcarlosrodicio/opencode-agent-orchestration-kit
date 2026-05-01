<script lang="ts">
  import Badge from '$lib/design-system/Badge.svelte'
  import type { AgentSessionView } from '$lib/contexts/agent-sessions/read-models/agentSession'
  import { formatDuration, formatTokens } from '$lib/utils/format'

  export let agent: AgentSessionView | undefined
</script>

{#if agent}
  <div class="space-y-4">
    <div>
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-console-text">{agent.agent}</h2>
        {#if agent.status !== 'pending'}
          <Badge tone={agent.status === 'running' ? 'active' : agent.status === 'completed' ? 'success' : agent.status === 'blocked' ? 'warning' : 'neutral'}>{agent.status}</Badge>
        {/if}
      </div>
      <p class="mt-2 text-sm leading-6 text-console-muted">{agent.role}</p>
    </div>
    <dl class="grid grid-cols-2 gap-3 text-sm">
      <div><dt class="text-console-muted">Model</dt><dd class="text-console-text">{agent.model}</dd></div>
      <div><dt class="text-console-muted">Duration</dt><dd class="text-console-text">{formatDuration(agent.durationSeconds)}</dd></div>
      <div><dt class="text-console-muted">Input</dt><dd class="text-console-text">{formatTokens(agent.inputTokens)}</dd></div>
      <div><dt class="text-console-muted">Output</dt><dd class="text-console-text">{formatTokens(agent.outputTokens)}</dd></div>
    </dl>
    <div>
      <h3 class="mb-2 text-sm font-semibold text-console-text">Skills & tools</h3>
      <div class="flex flex-wrap gap-2">
        {#each [...agent.skills, ...agent.tools] as item}
          <Badge>{item}</Badge>
        {/each}
      </div>
    </div>
  </div>
{:else}
  <p class="text-sm text-console-muted">Select an agent or stage to inspect details.</p>
{/if}
