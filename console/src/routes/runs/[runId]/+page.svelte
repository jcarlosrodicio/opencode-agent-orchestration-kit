<script lang="ts">
  import Badge from '$lib/design-system/Badge.svelte'
  import Button from '$lib/design-system/Button.svelte'
  import ConfirmDialog from '$lib/design-system/ConfirmDialog.svelte'
  import Panel from '$lib/design-system/Panel.svelte'
  import Tabs from '$lib/design-system/Tabs.svelte'
  import AgentDetailPanel from '$lib/components/run-detail/AgentDetailPanel.svelte'
  import FlowGraph from '$lib/components/run-detail/FlowGraph.svelte'
  import LogViewer from '$lib/components/run-detail/LogViewer.svelte'
  import StageTimeline from '$lib/components/run-detail/StageTimeline.svelte'
  import { realRunStore } from '$lib/contexts/runs/adapters/realRunStore'
  import { getWorkflow } from '$lib/contexts/launch/adapters/workflowCatalog'
  import { buildRealAgentSessions, buildRealTimelineProjection, selectInitialRunFocus } from '$lib/contexts/runs/read-models/runObservabilityProjection'
  import { artifacts } from '$lib/mocks/artifacts.mock'
  import { formatCurrency, formatDuration, formatTokens } from '$lib/utils/format'
  import { runStatusTone, workflowDisplayLabel } from '$lib/utils/runDisplay'
  import { onMount } from 'svelte'

  export let data

  let activeTab = 'Logs'
  let selectedAgent = 'developer'
  let selectedStage = ''
  let showThinking = true
  let confirmOpen = false
  let stopError = ''
  let initializedRunId = ''

  onMount(() => {
    void realRunStore
      .loadRun(data.runId)
      .then(() => realRunStore.connectRun(data.runId))
      .catch(() => undefined)
  })

  $: realDetail = $realRunStore.details[data.runId] ?? data.initialRun
  $: run = realDetail
  $: detail = realDetail
  $: workflow = getWorkflow(run.workflowId)
  $: timeline = buildRealTimelineProjection(realDetail, realDetail.events ?? [])
  $: agents = buildRealAgentSessions(realDetail, realDetail.events ?? [])
  $: selectedAgentView = agents.find((agent) => agent.id === selectedStage || agent.agent === selectedAgent)
  $: runArtifacts = artifacts.filter((artifact) => artifact.runId === run.id)
  $: logs = realDetail.logs ?? []
  $: thinkingLogs = realDetail.thinking ?? logs.filter((log) => log.kind === 'thinking')
  $: stopDisabled = ['stopped', 'completed', 'failed', 'interrupted'].includes(run.status)
  $: if (run.id && run.id !== initializedRunId) {
    const focus = selectInitialRunFocus(realDetail, realDetail.events ?? [])
    selectedAgent = focus.agent
    selectedStage = focus.stageId
    initializedRunId = run.id
  }

  function select(agent: string, stageId: string) {
    selectedAgent = agent
    selectedStage = stageId
    activeTab = 'Logs'
  }

  async function confirmStop() {
    stopError = ''
    try {
      await realRunStore.stopRun(run.id)
    } catch (error) {
      stopError = error instanceof Error ? error.message : 'Unable to stop run.'
    }
  }
</script>

<svelte:head><title>{run.title} · OpenCode Console</title></svelte:head>

<div class="space-y-4">
  <Panel>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-base font-semibold text-console-text">{run.title}</h2>
          <Badge tone="active">{workflowDisplayLabel(run.workflowId)}</Badge>
          <Badge tone={runStatusTone(run.status)}>{run.status}</Badge>
        </div>
        <p class="mt-1 text-sm text-console-muted">{detail.prompt}</p>
        {#if detail.configSnapshot?.workdir}<p class="mt-1 text-xs text-console-dim">Workdir: {detail.configSnapshot.workdir}</p>{/if}
        {#if stopError}<p class="mt-2 text-sm text-console-danger">{stopError}</p>{/if}
      </div>
      <div class="flex items-center gap-4 text-sm text-console-muted">
        <span>{formatDuration(run.elapsedSeconds)}</span>
        <span>{formatTokens(run.tokens)}</span>
        <span>{formatCurrency(run.costUsd)}</span>
        <Button variant="danger" disabled={stopDisabled} on:click={() => (confirmOpen = true)}>Stop Run</Button>
      </div>
    </div>
  </Panel>

  <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
    <div class="space-y-4">
      <Panel title="Flow">
        <FlowGraph nodes={timeline.nodes} edges={timeline.edges} {selectedAgent} onSelect={select} />
      </Panel>

      <Panel>
        <Tabs tabs={['Logs', 'Thinking', 'Final output', 'Artifacts', 'Config snapshot']} bind:active={activeTab}>
          {#if activeTab === 'Logs'}
            <LogViewer {logs} filterAgent={selectedAgent} filterStage={selectedStage} {showThinking} />
          {:else if activeTab === 'Thinking'}
            <label class="mb-3 flex items-center gap-2 text-sm text-console-muted"><input type="checkbox" bind:checked={showThinking} /> Show thinking traces</label>
            <LogViewer logs={thinkingLogs} filterAgent="" filterStage="" showThinking={true} />
          {:else if activeTab === 'Final output'}
            <div class="space-y-2">
              <div class="rounded-md border border-console-line bg-console-raised p-3">
                <div class="text-sm font-semibold text-console-text">{run.activeAgent === 'none' ? workflow.primaryAgent : run.activeAgent}</div>
                <p class="mt-1 whitespace-pre-wrap text-sm text-console-muted">{realDetail.finalOutput || 'No final output yet.'}</p>
              </div>
            </div>
          {:else if activeTab === 'Artifacts'}
            <div class="space-y-2">
              {#each runArtifacts as artifact}
                <div class="rounded-md border border-console-line bg-console-raised p-3 text-sm">
                  <span class="text-console-text">{artifact.title}</span>
                  <span class="ml-2 text-console-muted">{artifact.type} · {artifact.agent}</span>
                </div>
              {/each}
            </div>
          {:else}
            <pre class="overflow-auto rounded-md border border-console-line bg-console-root p-4 text-xs text-console-muted">{JSON.stringify(detail.configSnapshot, null, 2)}</pre>
          {/if}
        </Tabs>
      </Panel>
    </div>

    <div class="space-y-4">
      <Panel title="Stage Timeline">
        <StageTimeline stages={timeline.stages} onSelect={select} />
      </Panel>
      <Panel title="Agent Detail">
        <AgentDetailPanel agent={selectedAgentView} />
      </Panel>
    </div>
  </div>
</div>

<ConfirmDialog bind:open={confirmOpen} title="Stop Run" message="Stop this run? Logs, artifacts, and config snapshot remain inspectable." confirmLabel="Stop Run" onConfirm={confirmStop} />
