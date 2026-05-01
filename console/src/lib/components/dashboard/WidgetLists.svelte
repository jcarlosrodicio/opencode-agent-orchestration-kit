<script lang="ts">
  import Badge from '$lib/design-system/Badge.svelte'
  import type { ApprovalView } from '$lib/contexts/approvals/read-models/approval'
  import type { ArtifactView } from '$lib/contexts/artifacts/read-models/artifact'
  import type { ToolHealthView } from '$lib/contexts/presets-configuration/read-models/configuration'

  export let artifacts: ArtifactView[] = []
  export let approvals: ApprovalView[] = []
  export let tools: ToolHealthView[] = []
</script>

<div class="grid gap-4 lg:grid-cols-3">
  <section>
    <h2 class="mb-3 text-sm font-semibold text-console-text">Recent artifacts</h2>
    <div class="space-y-2">
      {#each artifacts.slice(0, 5) as artifact}
        <a class="block rounded-md border border-console-line bg-console-raised p-3 text-sm hover:border-console-active" href="/artifacts">
          <span class="text-console-text">{artifact.title}</span>
          <span class="mt-1 block text-xs text-console-muted">{artifact.runId} · {artifact.agent}</span>
        </a>
      {/each}
    </div>
  </section>
  <section>
    <h2 class="mb-3 text-sm font-semibold text-console-text">Approvals</h2>
    <div class="space-y-2">
      {#each approvals as approval}
        <a class="block rounded-md border border-console-line bg-console-raised p-3 text-sm hover:border-console-active" href="/approvals">
          <span class="text-console-text">{approval.title}</span>
          <span class="mt-1 block text-xs text-console-muted">{approval.runId} · {approval.agent}</span>
        </a>
      {/each}
    </div>
  </section>
  <section>
    <h2 class="mb-3 text-sm font-semibold text-console-text">MCPs / Tools health</h2>
    <div class="space-y-2">
      {#each tools as tool}
        <a class="flex items-center justify-between rounded-md border border-console-line bg-console-raised p-3 text-sm hover:border-console-active" href="/mcps-tools">
          <span class="text-console-text">{tool.label}</span>
          <Badge tone={tool.status === 'active' ? 'success' : tool.status === 'degraded' ? 'warning' : 'danger'}>{tool.status}</Badge>
        </a>
      {/each}
    </div>
  </section>
</div>
