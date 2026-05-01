<script lang="ts">
  import '../app.css'
  import AppShell from '$lib/shell/AppShell.svelte'
  import { realRunStore } from '$lib/contexts/runs/adapters/realRunStore'
  import { onDestroy, onMount } from 'svelte'

  onMount(() => {
    void realRunStore.loadRuns()
  })

  onDestroy(() => {
    realRunStore.destroy()
  })
</script>

<a class="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-console-panel focus:px-3 focus:py-2" href="#main-content">Skip to main content</a>
<AppShell>
  <slot />
</AppShell>
