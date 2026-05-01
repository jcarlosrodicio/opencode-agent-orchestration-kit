<script lang="ts">
  import CatalogTable from '$lib/components/catalog/CatalogTable.svelte'

  const rows = [
    { setting: 'Config source', value: 'opencode/opencode.json', status: 'read-only mock' },
    { setting: 'Open Design URL', value: 'OPEN_DESIGN_URL', status: 'mock active' },
    { setting: 'Thinking traces', value: 'visible when available', status: 'enabled' },
    { setting: 'Runner mode', value: 'mock-stream', status: 'frontend-only' }
  ]
</script>

<CatalogTable title="Settings" description="Local console preferences. This MVP does not mutate repository config." {rows} />
