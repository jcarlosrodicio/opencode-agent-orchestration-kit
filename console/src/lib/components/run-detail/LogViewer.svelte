<script lang="ts">
  import { afterUpdate, tick } from 'svelte'
  import type { LogEventView } from '$lib/contexts/agent-sessions/read-models/agentSession'
  import Button from '$lib/design-system/Button.svelte'

  export let logs: LogEventView[] = []
  export let filterAgent = ''
  export let filterStage = ''
  export let showThinking = true

  let container: HTMLDivElement
  let follow = true
  let filterMode: 'selected' | 'all' | 'system' = 'selected'

  $: filtered = logs.filter((log) => {
    if (!showThinking && log.kind === 'thinking') return false
    if (filterMode === 'all') return true
    if (filterMode === 'system') return log.agent === 'system'
    if (log.agent === 'system') return true
    if (filterAgent && log.agent !== filterAgent) return false
    if (filterStage && log.stageId !== filterStage) return false
    return true
  })

  function onScroll() {
    if (!container) return
    follow = container.scrollHeight - container.scrollTop - container.clientHeight < 20
  }

  async function resume() {
    follow = true
    await tick()
    container?.scrollTo({ top: container.scrollHeight })
  }

  afterUpdate(() => {
    if (follow && container) container.scrollTo({ top: container.scrollHeight })
  })
</script>

<div class="mb-3 flex items-center justify-between gap-3">
  <div class="flex flex-wrap items-center gap-2 text-sm text-console-muted">
    {#if filterMode === 'all'}
      All execution events
    {:else if filterMode === 'system'}
      System events
    {:else if filterAgent || filterStage}
      Filtered by {filterAgent || 'all agents'} {filterStage ? `· ${filterStage}` : ''}; system events included
    {:else}
      All live events
    {/if}
    <button class="rounded border border-console-line px-2 py-1 text-xs text-console-text" class:bg-console-raised={filterMode === 'all'} on:click={() => (filterMode = 'all')}>All</button>
    <button class="rounded border border-console-line px-2 py-1 text-xs text-console-text" class:bg-console-raised={filterMode === 'selected'} on:click={() => (filterMode = 'selected')}>Selected</button>
    <button class="rounded border border-console-line px-2 py-1 text-xs text-console-text" class:bg-console-raised={filterMode === 'system'} on:click={() => (filterMode = 'system')}>System</button>
  </div>
  <Button on:click={resume}>{follow ? 'Following live' : 'Resume live'}</Button>
</div>

<div bind:this={container} on:scroll={onScroll} class="console-scrollbar h-80 overflow-auto rounded-lg border border-console-line bg-console-root p-3 font-mono text-xs leading-6" aria-live="polite">
  {#each filtered as log}
    <div class="grid grid-cols-[70px_110px_minmax(0,1fr)] gap-3 border-b border-console-line/50 py-1">
      <span class="text-console-dim">{log.timestamp}</span>
      <span class:text-console-warning={log.kind === 'warning'} class:text-console-active={log.kind === 'thinking'} class="truncate text-console-muted">[{log.agent}]</span>
      <span class="min-w-0 break-words text-console-text">{log.message}</span>
    </div>
  {/each}
</div>
