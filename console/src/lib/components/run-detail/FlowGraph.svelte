<script lang="ts">
  import type { FlowEdgeView, FlowNodeView } from '$lib/contexts/orchestration-timeline/read-models/timeline'

  export let nodes: FlowNodeView[] = []
  export let edges: FlowEdgeView[] = []
  export let selectedAgent = ''
  export let onSelect: (agent: string, stageId: string) => void = () => {}

  $: visibleNodes = nodes.length ? nodes : []
  $: activeIndex = Math.max(
    0,
    visibleNodes.findIndex((node) => node.agent === selectedAgent)
  )
  $: progressWidth = visibleNodes.length <= 1 ? 0 : (activeIndex / (visibleNodes.length - 1)) * 100

  function edgeKind(node: FlowNodeView) {
    const inbound = edges.find((edge) => edge.to === node.id)
    return inbound?.kind ?? 'normal'
  }

  function statusLabel(node: FlowNodeView) {
    if (node.status === 'queued' || node.status === 'skipped') return ''
    return node.status
  }
</script>

<div class="flow-panel">
  <div class="flow-canvas">
    <img class="flow-art" src="/images/run-detail-flow.png" alt="" aria-hidden="true" />
    <div class="flow-backdrop" aria-hidden="true">
      <div class="flow-rule"></div>
      <div class="flow-progress" style={`width: ${progressWidth}%`}></div>
    </div>

    <div class="flow-nodes" style={`--count: ${Math.max(visibleNodes.length, 1)}`}>
      {#each visibleNodes as node, index}
        <button
          type="button"
          class:selected={selectedAgent === node.agent}
          class:completed={node.status === 'completed'}
          class:running={node.status === 'running'}
          class:blocked={node.status === 'blocked'}
          class="flow-node"
          aria-label={`${node.label}${statusLabel(node) ? `, ${statusLabel(node)}` : ''}`}
          on:click={() => onSelect(node.agent, node.id)}
        >
          <span class="node-index">{String(index + 1).padStart(2, '0')}</span>
          <span class="node-dot" data-kind={edgeKind(node)}></span>
          <span class="node-label">{node.label}</span>
          <span class="node-agent">{node.agent}</span>
          {#if statusLabel(node)}
            <span class="node-status">{statusLabel(node)}</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .flow-panel {
    overflow-x: auto;
  }

  .flow-canvas {
    position: relative;
    min-width: min(860px, 100%);
    min-height: 312px;
    aspect-ratio: 1693 / 929;
    overflow: hidden;
    border: 1px solid rgba(186, 215, 247, 0.12);
    border-radius: 12px;
    background: #05060f;
    box-shadow:
      inset rgba(199, 211, 234, 0.12) 0 1px 1px 0,
      inset rgba(199, 211, 234, 0.05) 0 24px 48px 0,
      rgba(6, 6, 14, 0.7) 0 24px 32px 0;
  }

  .flow-canvas::after {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 50% 52%, rgba(77, 163, 255, 0.12), transparent 32%),
      linear-gradient(180deg, rgba(5, 6, 15, 0.04), rgba(5, 6, 15, 0.28));
    content: '';
    pointer-events: none;
  }

  .flow-art {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.92;
  }

  .flow-backdrop {
    position: absolute;
    left: 10%;
    right: 10%;
    top: 50%;
    z-index: 1;
    height: 2px;
    transform: translateY(-50%);
  }

  .flow-rule,
  .flow-progress {
    position: absolute;
    inset: 0 auto auto 0;
    height: 2px;
    border-radius: 999px;
  }

  .flow-rule {
    width: 100%;
    background: rgba(186, 215, 247, 0.18);
  }

  .flow-progress {
    background: linear-gradient(90deg, #b6d9fc, #663af3);
    box-shadow: rgba(238, 186, 247, 0.24) 0 0 12px 0;
  }

  .flow-nodes {
    position: absolute;
    left: 24px;
    right: 24px;
    top: 50%;
    z-index: 2;
    display: grid;
    grid-template-columns: repeat(var(--count), minmax(84px, 1fr));
    gap: 10px;
    align-items: center;
    transform: translateY(-50%);
  }

  .flow-node {
    min-height: 102px;
    border: 1px solid rgba(186, 215, 247, 0.14);
    border-radius: 12px;
    background: rgba(5, 6, 15, 0.66);
    color: #d8ecf8;
    padding: 10px;
    text-align: left;
    backdrop-filter: blur(10px);
    box-shadow:
      inset rgba(199, 211, 234, 0.12) 0 1px 1px 0,
      inset rgba(199, 211, 234, 0.05) 0 20px 36px 0;
    transition:
      border-color 150ms ease,
      box-shadow 150ms ease,
      transform 150ms ease;
  }

  .flow-node:hover,
  .flow-node.selected {
    border-color: rgba(182, 217, 252, 0.72);
    box-shadow:
      inset rgba(216, 236, 248, 0.2) 0 1px 1px 0,
      rgba(186, 207, 247, 0.32) 0 0 6px 0;
    transform: translateY(-1px);
  }

  .flow-node.completed .node-dot {
    background: #32d583;
  }

  .flow-node.running .node-dot {
    background: #b6d9fc;
    box-shadow: 0 0 0 6px rgba(182, 217, 252, 0.14);
  }

  .flow-node.blocked .node-dot {
    background: #f2b84b;
  }

  .node-index {
    display: block;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
    font-size: 11px;
    letter-spacing: 0.08em;
    color: #81899b;
  }

  .node-dot {
    display: block;
    width: 10px;
    height: 10px;
    margin-top: 14px;
    border-radius: 999px;
    background: #3f4959;
  }

  .node-dot[data-kind='optional'] {
    outline: 1px dashed rgba(216, 236, 248, 0.32);
    outline-offset: 4px;
  }

  .node-dot[data-kind='barrier'],
  .node-dot[data-kind='approval'] {
    background: #c58b1e;
  }

  .node-label {
    display: block;
    margin-top: 14px;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.35;
  }

  .node-agent {
    display: block;
    margin-top: 5px;
    font-size: 11px;
    color: #9da7ba;
  }

  .node-status {
    display: inline-flex;
    margin-top: 12px;
    border: 1px solid rgba(186, 215, 247, 0.12);
    border-radius: 999px;
    padding: 3px 8px;
    font-size: 10px;
    white-space: nowrap;
    color: #d1e4fa;
    background: #05060f;
  }

  @media (max-width: 760px) {
    .flow-canvas {
      min-width: 760px;
    }
  }
</style>
