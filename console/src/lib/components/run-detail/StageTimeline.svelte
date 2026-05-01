<script lang="ts">
  import Badge from '$lib/design-system/Badge.svelte'
  import type { StageView } from '$lib/contexts/orchestration-timeline/read-models/timeline'
  import { formatDuration } from '$lib/utils/format'

  export let stages: StageView[] = []
  export let onSelect: (agent: string, stageId: string) => void = () => {}
</script>

<div class="space-y-2">
  {#each stages as stage}
    <button class="w-full rounded-md border border-console-line bg-console-raised p-3 text-left hover:border-console-active" type="button" on:click={() => onSelect(stage.agent, stage.id)}>
      <div class="flex items-center justify-between gap-3">
        <span class="text-sm font-medium text-console-text">{stage.label}</span>
        {#if stage.status !== 'queued' && stage.status !== 'skipped'}
          <Badge tone={stage.status === 'completed' ? 'success' : stage.status === 'running' ? 'active' : stage.status === 'blocked' ? 'warning' : 'neutral'}>{stage.status}</Badge>
        {/if}
      </div>
      <div class="mt-1 text-xs text-console-muted">{stage.durationSeconds ? `${stage.agent} · ${formatDuration(stage.durationSeconds)}` : stage.agent}</div>
      {#if stage.barrierReason}
        <div class="mt-2 text-xs text-console-warning">{stage.barrierReason}</div>
      {/if}
    </button>
  {/each}
</div>
