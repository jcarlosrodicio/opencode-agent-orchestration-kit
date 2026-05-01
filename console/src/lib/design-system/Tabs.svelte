<script lang="ts">
  export let tabs: string[] = []
  export let active = ''
</script>

<div class="border-b border-console-line" role="tablist" aria-label="Run sections">
  {#each tabs as tab}
    <button
      class:border-console-active={active === tab}
      class:text-console-text={active === tab}
      class="border-b-2 border-transparent px-3 py-2 text-sm text-console-muted transition-colors duration-150 hover:text-console-text"
      role="tab"
      aria-selected={active === tab}
      on:click={() => (active = tab)}
    >
      {tab}
    </button>
  {/each}
</div>

<slot {active} />
