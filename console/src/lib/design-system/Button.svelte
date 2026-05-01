<script lang="ts">
  import { createEventDispatcher } from 'svelte'

  export let variant: 'primary' | 'secondary' | 'danger' = 'secondary'
  export let type: 'button' | 'submit' = 'button'
  export let disabled = false
  export let onclick: ((event: MouseEvent) => void) | undefined = undefined

  const dispatch = createEventDispatcher<{ click: MouseEvent }>()

  function handleClick(event: MouseEvent) {
    onclick?.(event)
    dispatch('click', event)
  }
</script>

<button
  {type}
  {disabled}
  class:primary={variant === 'primary'}
  class:danger={variant === 'danger'}
  class="rounded-md border px-3 py-2 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50"
  on:click={handleClick}
>
  <slot />
</button>

<style>
  button {
    border-color: #334966;
    background: #101826;
    color: #e6edf6;
  }
  button:hover:not(:disabled) {
    border-color: #4da3ff;
    background: #13243a;
  }
  .primary {
    border-color: #4da3ff;
    background: #1f5f9f;
  }
  .danger {
    border-color: #f97066;
    color: #ffaaa4;
  }
</style>
