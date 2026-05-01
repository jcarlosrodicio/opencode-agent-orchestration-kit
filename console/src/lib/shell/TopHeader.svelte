<script lang="ts">
  import { page } from '$app/stores'
  import Badge from '$lib/design-system/Badge.svelte'

  $: path = $page.url.pathname
  $: title = path === '/runs' ? 'Runs' : path === '/runs/new' ? 'New Run' : path.startsWith('/runs/') ? 'Run Detail' : path.split('/')[1]?.replace('-', ' / ') || 'Runs'
</script>

<header class="flex min-h-16 items-center justify-between border-b border-console-line bg-console-root px-6">
  <div>
    <h1 class="text-lg font-semibold capitalize text-console-text">{title}</h1>
    <p class="mt-0.5 text-sm text-console-muted">Run-centric orchestration console for local OpenCode execution.</p>
  </div>
  <div class="flex items-center gap-2">
    <Badge>v0.1.0</Badge>
  </div>
</header>
