<script lang="ts">
  import CatalogTable from '$lib/components/catalog/CatalogTable.svelte'
  import { artifacts } from '$lib/mocks/artifacts.mock'

  const rows = artifacts.map((artifact) => ({ title: artifact.title, type: artifact.type, run: artifact.runId, agent: artifact.agent, status: artifact.status }))
</script>

<CatalogTable title="Artifacts" description="Specs, reviews, Open Design handoffs, manifests, validation evidence, and config snapshots." {rows} />
