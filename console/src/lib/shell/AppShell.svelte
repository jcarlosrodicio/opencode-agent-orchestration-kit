<script lang="ts">
  import SidebarNav from './SidebarNav.svelte'
  import TopHeader from './TopHeader.svelte'
  import StatusFooter from './StatusFooter.svelte'
</script>

<div class="flex min-h-screen bg-console-root text-console-text">
  <SidebarNav />
  <div class="flex min-w-0 flex-1 flex-col">
    <TopHeader />
    <main id="main-content" class="min-h-0 flex-1 overflow-auto p-6">
      <slot />
    </main>
    <StatusFooter />
  </div>
</div>
