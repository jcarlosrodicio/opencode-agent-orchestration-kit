<script lang="ts">
  import CatalogTable from '$lib/components/catalog/CatalogTable.svelte'
  import { agentCatalog } from '$lib/mocks/agents.mock'

  const rows = agentCatalog.map((agent) => ({ agent: agent.label, model: agent.modelEnv, workflows: agent.workflows.map((workflow) => `/${workflow}`).join(', '), role: agent.description }))
</script>

<CatalogTable title="Agents" description="Role catalog from the kit's OpenCode agent model." {rows} />
