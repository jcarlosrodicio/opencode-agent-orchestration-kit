<script lang="ts">
  import CatalogTable from '$lib/components/catalog/CatalogTable.svelte'
  import { presets } from '$lib/mocks/configuration.mock'

  const rows = presets.map((preset) => ({ name: preset.name, workflow: `/${preset.workflowId}`, skills: preset.skills.join(', '), tools: preset.tools.join(', ') }))
</script>

<CatalogTable title="Presets" description="Reusable launch setups. Reusing a preset pre-fills New Run without mutating existing snapshots." {rows} />
