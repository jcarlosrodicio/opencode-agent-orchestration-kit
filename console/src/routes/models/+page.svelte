<script lang="ts">
  import CatalogTable from '$lib/components/catalog/CatalogTable.svelte'
  import { agentCatalog } from '$lib/mocks/agents.mock'

  const rows = [
    { variable: 'OPENCODE_MODEL', scope: 'default', resolved: 'mocked' },
    { variable: 'OPENCODE_SMALL_MODEL', scope: 'small model', resolved: 'mocked' },
    ...agentCatalog.map((agent) => ({ variable: agent.modelEnv, scope: agent.key, resolved: 'mocked' }))
  ]
</script>

<CatalogTable title="Models" description="Environment-backed model references used by opencode/opencode.json." {rows} />
