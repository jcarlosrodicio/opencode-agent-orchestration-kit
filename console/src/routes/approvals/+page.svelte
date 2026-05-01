<script lang="ts">
  import Panel from '$lib/design-system/Panel.svelte'
  import ApprovalInbox from '$lib/components/approvals/ApprovalInbox.svelte'
  import { approvals } from '$lib/mocks/approvals.mock'
</script>

<div class="space-y-4">
  <Panel>
    <h2 class="text-base font-semibold text-console-text">Approval inbox</h2>
    <p class="mt-1 text-sm text-console-muted">Mock-driven barriers, lead approvals, handoff gates, and stopped-run decisions.</p>
  </Panel>
  <ApprovalInbox {approvals} />
</div>
