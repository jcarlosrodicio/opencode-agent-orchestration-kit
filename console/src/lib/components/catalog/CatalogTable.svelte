<script lang="ts">
  export let title = ''
  export let description = ''
  export let rows: Record<string, string | number>[] = []
  $: columns = rows[0] ? Object.keys(rows[0]) : []
</script>

<section class="rounded-lg border border-console-line bg-console-panel">
  <div class="border-b border-console-line px-4 py-3">
    <h2 class="text-sm font-semibold text-console-text">{title}</h2>
    {#if description}
      <p class="mt-1 text-sm text-console-muted">{description}</p>
    {/if}
  </div>
  <div class="overflow-x-auto p-4">
    {#if rows.length}
      <table class="w-full text-left text-sm">
        <thead class="border-b border-console-line text-xs text-console-muted">
          <tr>
            {#each columns as column}
              <th class="py-2 font-medium capitalize">{column}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each rows as row}
            <tr class="border-b border-console-line/70">
              {#each columns as column}
                <td class="py-2 text-console-muted">{row[column]}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="text-sm text-console-muted">No records available yet.</p>
    {/if}
  </div>
</section>
