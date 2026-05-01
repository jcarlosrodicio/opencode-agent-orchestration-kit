<script lang="ts">
  import CatalogTable from '$lib/components/catalog/CatalogTable.svelte'
  import { skills } from '$lib/mocks/configuration.mock'

  const rows = skills.map((skill) => ({ skill: skill.label, source: skill.source, status: skill.status, description: skill.description }))
</script>

<CatalogTable title="Skills" description="Local, plugin, and optional skill metadata for launch configuration." {rows} />
