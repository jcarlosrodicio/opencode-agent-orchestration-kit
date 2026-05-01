<script lang="ts">
  import Button from '$lib/design-system/Button.svelte'
  import Panel from '$lib/design-system/Panel.svelte'
  import AgentAssignmentMatrix from '$lib/components/launch/AgentAssignmentMatrix.svelte'
  import StagePreview from '$lib/components/launch/StagePreview.svelte'
  import WorkflowPicker from '$lib/components/launch/WorkflowPicker.svelte'
  import { realRunStore } from '$lib/contexts/runs/adapters/realRunStore'
  import { validateLaunchDraft } from '$lib/contexts/launch/application/launchValidation'
  import type { WorkflowId } from '$lib/contexts/launch/domain/workflow'
  import { skills, tools } from '$lib/mocks/configuration.mock'
  import { goto } from '$app/navigation'
  import { onMount } from 'svelte'

  export let data

  let workflowId: WorkflowId = 'direct'
  let title = ''
  let prompt = ''
  let workdir = ''
  let selectedModels: Record<string, string> = {}
  let selectedSkillLabels = skills.filter((skill) => skill.status !== 'missing').map((skill) => skill.label)
  let selectedToolLabels = tools.filter((tool) => tool.status !== 'missing').map((tool) => tool.label)
  let workdirBrowserOpen = false
  let workdirBrowserLoading = false
  let workdirBrowserError = ''
  let workdirBrowser: {
    root: string
    current: string
    parent: string | null
    selectable: boolean
    entries: Array<{ name: string; path: string }>
  } | null = null
  let thinkingVisible = true
  let launching = false
  let launchError = ''

  $: validation = validateLaunchDraft({ workflowId, title, prompt })

  onMount(() => {
    void loadDefaultWorkdir()
  })

  async function fetchWorkdirs(path?: string) {
    const query = path ? `?path=${encodeURIComponent(path)}` : ''
    const response = await fetch(`/api/workdirs${query}`)
    if (!response.ok) throw new Error(await response.text())
    return (await response.json()) as typeof workdirBrowser
  }

  async function loadDefaultWorkdir() {
    try {
      const rootBrowser = await fetchWorkdirs()
      workdir = rootBrowser?.root ?? ''
    } catch {
      workdir = ''
    }
  }

  async function launch() {
    if (!validation.canLaunch || launching) return
    launching = true
    launchError = ''
    try {
      const run = await realRunStore.launchRun({
        workflowId,
        title,
        prompt,
        workdir,
        models: selectedModels,
        skills: selectedSkillLabels,
        tools: selectedToolLabels,
        thinkingVisible
      })
      await goto(`/runs/${run.id}`)
    } catch (error) {
      launchError = error instanceof Error ? error.message : 'Unable to launch run.'
    } finally {
      launching = false
    }
  }

  async function browseWorkdir(path = workdir) {
    workdirBrowserOpen = true
    workdirBrowserLoading = true
    workdirBrowserError = ''
    try {
      workdirBrowser = await fetchWorkdirs(path)
    } catch (error) {
      workdirBrowserError = error instanceof Error ? error.message : 'Unable to browse directories.'
    } finally {
      workdirBrowserLoading = false
    }
  }

  function chooseWorkdir(path: string) {
    workdir = path
    workdirBrowserOpen = false
  }

  function chooseVisibleWorkdir() {
    if (workdirBrowser?.selectable) chooseWorkdir(workdirBrowser.current)
  }

  function browseParentWorkdir() {
    if (workdirBrowser?.parent) void browseWorkdir(workdirBrowser.parent)
  }

  function toggleValue(values: string[], value: string) {
    return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
  }

  function resetDraft() {
    title = ''
    prompt = ''
    selectedModels = {}
    selectedSkillLabels = skills.filter((skill) => skill.status !== 'missing').map((skill) => skill.label)
    selectedToolLabels = tools.filter((tool) => tool.status !== 'missing').map((tool) => tool.label)
    thinkingVisible = true
    launchError = ''
  }
</script>

<div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
  <Panel title="Run setup">
    <div class="space-y-5">
      <section>
        <h2 class="mb-2 text-sm font-semibold text-console-text">Workflow</h2>
        <WorkflowPicker bind:selected={workflowId} />
      </section>

      <section class="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]">
        <div>
          <label class="text-sm text-console-muted" for="run-title">Title</label>
          <input id="run-title" name="run-title" autocomplete="off" class="mt-1 w-full rounded-md border border-console-line bg-console-root px-3 py-2 text-sm text-console-text" bind:value={title} placeholder="user-auth-system" />
        </div>
        <div>
          <div class="flex items-center justify-between gap-3">
            <label class="text-sm text-console-muted" for="workdir">Target workdir</label>
            <Button on:click={() => browseWorkdir(workdir)}>Browse</Button>
          </div>
          <input id="workdir" name="workdir" autocomplete="off" class="mt-1 w-full rounded-md border border-console-line bg-console-root px-3 py-2 font-mono text-xs text-console-text" bind:value={workdir} />
        </div>
      </section>

      <section>
        <label class="text-sm text-console-muted" for="prompt">Prompt</label>
        <textarea id="prompt" name="prompt" class="mt-1 min-h-64 w-full rounded-md border border-console-line bg-console-root px-3 py-2 text-sm leading-6 text-console-text" bind:value={prompt} placeholder="Describe what you want to build, fix, or explore"></textarea>
        <div class="mt-2 flex items-center justify-between text-xs text-console-muted">
          <label class="flex items-center gap-2"><input type="checkbox" bind:checked={thinkingVisible} /> Show thinking when available</label>
          <span>{prompt.length}/8000</span>
        </div>
      </section>
    </div>
  </Panel>

  <div class="space-y-4">
    <Panel title="Model assignment">
      <AgentAssignmentMatrix {workflowId} modelOptions={data.modelOptions} bind:selectedModels />
    </Panel>

    <Panel title="Context">
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
        <div>
          <h2 class="mb-2 text-sm font-semibold text-console-text">Skills</h2>
          <div class="flex flex-wrap gap-2">
            {#each skills as skill}
              <label class="rounded-md border border-console-line bg-console-raised px-3 py-2 text-sm">
                <input class="mr-2" type="checkbox" checked={selectedSkillLabels.includes(skill.label)} on:change={() => (selectedSkillLabels = toggleValue(selectedSkillLabels, skill.label))} />
                {skill.label}
              </label>
            {/each}
          </div>
        </div>
        <div>
          <h2 class="mb-2 text-sm font-semibold text-console-text">MCPs / Tools</h2>
          <div class="flex flex-wrap gap-2">
            {#each tools as tool}
              <label class="rounded-md border border-console-line bg-console-raised px-3 py-2 text-sm">
                <input class="mr-2" type="checkbox" checked={selectedToolLabels.includes(tool.label)} on:change={() => (selectedToolLabels = toggleValue(selectedToolLabels, tool.label))} />
                {tool.label}
              </label>
            {/each}
          </div>
        </div>
      </div>
    </Panel>

    <Panel title="Stage preview">
      <StagePreview {workflowId} />
    </Panel>

    <Panel title="Launch">
      {#if validation.reasons.length}
        <ul class="mb-3 list-inside list-disc text-sm text-console-warning">
          {#each validation.reasons as reason}
            <li>{reason}</li>
          {/each}
        </ul>
      {:else}
        <p class="mb-3 text-sm text-console-muted">Ready for native OpenCode execution.</p>
        <p class="mb-3 break-all rounded-md border border-console-line bg-console-root px-3 py-2 font-mono text-xs text-console-muted">Target: {workdir}</p>
      {/if}
      {#if launchError}
        <p class="mb-3 rounded-md border border-console-danger/50 bg-console-danger/10 px-3 py-2 text-sm text-console-danger">{launchError}</p>
      {/if}
      <div class="flex justify-end gap-2">
        <Button on:click={resetDraft}>Reset</Button>
        <Button variant="primary" disabled={!validation.canLaunch || launching} on:click={launch}>{launching ? 'Launching...' : 'Launch Run'}</Button>
      </div>
    </Panel>
  </div>
</div>

{#if workdirBrowserOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-console-root/80 p-6">
    <div class="w-full max-w-3xl rounded-lg border border-console-line bg-console-panel shadow-panel">
      <div class="flex items-start justify-between gap-3 border-b border-console-line px-4 py-3">
        <div>
          <h2 class="text-sm font-semibold text-console-text">Choose workdir</h2>
          <p class="mt-1 break-all font-mono text-xs text-console-muted">{workdirBrowser?.current ?? workdir}</p>
        </div>
        <Button on:click={() => (workdirBrowserOpen = false)}>Close</Button>
      </div>

      <div class="p-4">
        {#if workdirBrowserLoading}
          <p class="text-sm text-console-muted">Loading directories...</p>
        {:else if workdirBrowserError}
          <p class="rounded-md border border-console-danger/50 bg-console-danger/10 px-3 py-2 text-sm text-console-danger">{workdirBrowserError}</p>
        {:else if workdirBrowser}
          <div class="mb-3 flex flex-wrap gap-2">
            <Button variant="primary" disabled={!workdirBrowser.selectable} on:click={chooseVisibleWorkdir}>Use this directory</Button>
            {#if workdirBrowser.parent}
              <Button on:click={browseParentWorkdir}>Up one level</Button>
            {/if}
          </div>
          <div class="max-h-96 overflow-auto rounded-md border border-console-line">
            {#if workdirBrowser.entries.length}
              {#each workdirBrowser.entries as entry}
                <button type="button" class="flex w-full items-center justify-between border-b border-console-line px-3 py-2 text-left last:border-b-0 hover:bg-console-raised focus:bg-console-raised focus:outline-none" on:click={() => browseWorkdir(entry.path)}>
                  <span class="font-mono text-xs text-console-text">{entry.name}</span>
                  <span class="text-xs text-console-muted">Open</span>
                </button>
              {/each}
            {:else}
              <p class="px-3 py-2 text-sm text-console-muted">No child directories available.</p>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
