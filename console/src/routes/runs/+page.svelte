<script lang="ts">
  import Panel from '$lib/design-system/Panel.svelte'
  import Button from '$lib/design-system/Button.svelte'
  import ActiveRunCard from '$lib/components/dashboard/ActiveRunCard.svelte'
  import RecentRunsTable from '$lib/components/dashboard/RecentRunsTable.svelte'
  import DistributionBars from '$lib/components/charts/DistributionBars.svelte'
  import WidgetLists from '$lib/components/dashboard/WidgetLists.svelte'
  import { realRunStore } from '$lib/contexts/runs/adapters/realRunStore'
  import { buildMetricSnapshot, statusDistribution, workflowDistribution } from '$lib/contexts/observability-metrics/projections/metricsProjection'
  import { artifacts } from '$lib/mocks/artifacts.mock'
  import { approvals } from '$lib/mocks/approvals.mock'
  import { tools } from '$lib/mocks/configuration.mock'
  import { formatCurrency, formatTokens } from '$lib/utils/format'

  $: runs = $realRunStore.runs
  $: metrics = buildMetricSnapshot(runs)
  $: activeRuns = runs.filter((run) => run.status === 'running' || run.status === 'blocked').slice(0, 5)
  $: page = Math.floor($realRunStore.offset / $realRunStore.limit) + 1
  $: totalPages = Math.max(1, Math.ceil($realRunStore.total / $realRunStore.limit))
  $: from = $realRunStore.total ? $realRunStore.offset + 1 : 0
  $: to = Math.min($realRunStore.total, $realRunStore.offset + runs.length)

  function loadPage(offset: number) {
    void realRunStore.loadRuns({ limit: $realRunStore.limit, offset })
  }
</script>

<div class="space-y-4">
  <section class="grid gap-3 md:grid-cols-4">
    <Panel>
      <div class="text-xs text-console-muted">Active runs</div>
      <div class="mt-1 text-2xl font-semibold">{metrics.activeRuns}</div>
    </Panel>
    <Panel>
      <div class="text-xs text-console-muted">Tokens</div>
      <div class="mt-1 text-2xl font-semibold">{formatTokens(metrics.totalTokens)}</div>
    </Panel>
    <Panel>
      <div class="text-xs text-console-muted">Cost</div>
      <div class="mt-1 text-2xl font-semibold">{formatCurrency(metrics.totalCostUsd)}</div>
    </Panel>
    <Panel>
      <div class="text-xs text-console-muted">Artifacts</div>
      <div class="mt-1 text-2xl font-semibold">{metrics.artifacts}</div>
    </Panel>
  </section>

  <Panel title="Active Runs">
    <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      {#each activeRuns as run}
        <ActiveRunCard {run} />
      {:else}
        <p class="text-sm text-console-muted">No active OpenCode sessions.</p>
      {/each}
    </div>
  </Panel>

  <section class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
    <Panel title="Recent Runs">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div class="text-sm text-console-muted">{from}-{to} of {$realRunStore.total}</div>
        <div class="flex items-center gap-2">
          <Button disabled={$realRunStore.offset === 0} on:click={() => loadPage(Math.max(0, $realRunStore.offset - $realRunStore.limit))}>Previous</Button>
          <span class="min-w-20 text-center text-sm text-console-muted">Page {page} / {totalPages}</span>
          <Button disabled={page >= totalPages} on:click={() => loadPage($realRunStore.offset + $realRunStore.limit)}>Next</Button>
          <a class="rounded-md border border-console-active bg-[#1f5f9f] px-3 py-2 text-sm font-medium text-console-text transition-colors duration-150 hover:bg-[#2a6fae]" href="/runs/new">New Run</a>
        </div>
      </div>
      <RecentRunsTable {runs} />
    </Panel>
    <div class="space-y-4">
      <Panel title="Workflow Distribution">
        <DistributionBars slices={workflowDistribution(runs)} totalLabel={`${runs.length} runs`} />
      </Panel>
      <Panel title="Status">
        <DistributionBars slices={statusDistribution(runs)} />
      </Panel>
    </div>
  </section>

  <Panel>
    <WidgetLists {artifacts} {approvals} {tools} />
  </Panel>
</div>
