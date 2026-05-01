<script lang="ts">
  import CatalogTable from '$lib/components/catalog/CatalogTable.svelte'
  import { tools } from '$lib/mocks/configuration.mock'

  const rows = tools.map((tool) => ({ tool: tool.label, status: tool.status, description: tool.description }))
</script>

<CatalogTable title="MCPs / Tools" description="Tool health and MCP metadata. MCP execution remains mocked in this frontend-first MVP." {rows} />
