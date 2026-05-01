<script lang="ts">
  import { page } from '$app/stores'

  const nav = [
    ['Runs', '/runs'],
    ['Approvals', '/approvals'],
    ['Artifacts', '/artifacts'],
    ['Agents', '/agents'],
    ['Models', '/models'],
    ['Skills', '/skills'],
    ['MCPs / Tools', '/mcps-tools'],
    ['Presets', '/presets'],
    ['Settings', '/settings']
  ]
</script>

<aside class="flex h-screen w-60 shrink-0 flex-col border-r border-console-line bg-console-shell">
  <a class="mx-4 mt-4 rounded-md border border-console-line p-3 text-left" href="/runs">
    <div class="text-sm font-semibold text-console-text">OpenCode</div>
    <div class="mt-1 text-xs text-console-muted">Orchestration Kit</div>
  </a>

  <nav class="mt-4 flex-1 px-3" aria-label="Primary navigation">
    {#each nav as [label, href]}
      <a
        {href}
        class:active={$page.url.pathname === href || (href === '/runs' && $page.url.pathname.startsWith('/runs/'))}
        class="mb-1 block rounded-md border border-transparent px-3 py-2 text-sm text-console-muted transition-colors duration-150 hover:border-console-line hover:text-console-text"
      >
        {label}
      </a>
    {/each}
  </nav>

  <div class="border-t border-console-line p-4 text-xs text-console-muted">
    <div>Environment <span class="text-console-text">local</span></div>
    <div class="mt-1">Config <span class="text-console-text">opencode.json</span></div>
    <div class="mt-1">Open Design <span class="text-console-success">active</span></div>
  </div>
</aside>

<style>
  .active {
    border-color: #334966;
    background: #111b2a;
    color: #e6edf6;
  }
</style>
