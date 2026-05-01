<script lang="ts">
  import Button from './Button.svelte'

  export let open = false
  export let title = 'Confirm action'
  export let message = ''
  export let confirmLabel = 'Confirm'
  export let cancelLabel = 'Cancel'
  export let onConfirm: () => void = () => {}
</script>

{#if open}
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="presentation">
    <div class="w-full max-w-md rounded-lg border border-console-line bg-console-panel p-5 shadow-panel" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <h2 id="confirm-title" class="text-base font-semibold text-console-text">{title}</h2>
      <p class="mt-2 text-sm leading-6 text-console-muted">{message}</p>
      <div class="mt-5 flex justify-end gap-2">
        <Button on:click={() => (open = false)}>{cancelLabel}</Button>
        <Button
          variant="danger"
          on:click={() => {
            onConfirm()
            open = false
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  </div>
{/if}
