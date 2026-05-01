<script lang="ts">
  export let title = ''
  export let className = ''
</script>

<section class={`rounded-lg border border-console-line bg-console-panel shadow-panel ${className}`}>
  {#if title}
    <div class="border-b border-console-line px-4 py-3">
      <h2 class="text-sm font-semibold text-console-text">{title}</h2>
    </div>
  {/if}
  <div class="p-4">
    <slot />
  </div>
</section>
