<script lang="ts">
  export let tone: 'neutral' | 'active' | 'success' | 'warning' | 'danger' | 'ahe' = 'neutral'
</script>

<span
  class:badge-active={tone === 'active'}
  class:badge-success={tone === 'success'}
  class:badge-warning={tone === 'warning'}
  class:badge-danger={tone === 'danger'}
  class:badge-ahe={tone === 'ahe'}
  class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium"
>
  <slot />
</span>

<style>
  span {
    border-color: #334966;
    background: #101826;
    color: #c8d3e2;
  }
  .badge-active {
    border-color: #4da3ff;
    color: #8cc5ff;
  }
  .badge-success {
    border-color: #32d583;
    color: #7ae4ad;
  }
  .badge-warning {
    border-color: #f2b84b;
    color: #ffd27a;
  }
  .badge-danger {
    border-color: #f97066;
    color: #ffaaa4;
  }
  .badge-ahe {
    border-color: #c084fc;
    color: #d8b4fe;
  }
</style>
