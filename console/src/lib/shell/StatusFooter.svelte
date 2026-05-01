<script lang="ts">
  import { realRunStore } from '$lib/contexts/runs/adapters/realRunStore'

  $: realActive = $realRunStore.runs.filter((run) => run.status === 'running' || run.status === 'blocked').length
  $: streamLabel = $realRunStore.connection === 'live' ? 'native SSE' : 'native OpenCode'
</script>

<footer class="flex h-9 items-center justify-between border-t border-console-line bg-console-root px-4 text-xs text-console-muted">
  <div class="flex gap-4">
    <span>Stream <strong class="font-medium text-console-text">{streamLabel}</strong></span>
    <span>Active runs <strong class="font-medium text-console-text">{realActive}</strong></span>
    <span>MCPs <strong class="font-medium text-console-text">5/5</strong></span>
  </div>
  <div class="flex gap-4">
    <span>Superpowers enabled</span>
    <span>OPENCODE_ENV local</span>
  </div>
</footer>
