<script lang="ts">
  import Badge from '$lib/design-system/Badge.svelte'
  import Button from '$lib/design-system/Button.svelte'
  import type { ApprovalView } from '$lib/contexts/approvals/read-models/approval'

  export let approvals: ApprovalView[] = []
</script>

<div class="grid gap-3">
  {#each approvals as approval}
    <article class="rounded-lg border border-console-line bg-console-panel p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-semibold text-console-text">{approval.title}</h2>
            <Badge tone={approval.status === 'pending' ? 'warning' : approval.status === 'approved' ? 'success' : 'danger'}>{approval.status}</Badge>
          </div>
          <p class="mt-2 text-sm leading-6 text-console-muted">{approval.reason}</p>
          <p class="mt-2 text-xs text-console-muted">{approval.runId} · /{approval.workflowId} · {approval.stageId} · {approval.agent}</p>
        </div>
        <div class="flex gap-2">
          <Button>Inspect Run</Button>
          <Button variant="primary" disabled={approval.status !== 'pending'}>Approve</Button>
        </div>
      </div>
    </article>
  {/each}
</div>
