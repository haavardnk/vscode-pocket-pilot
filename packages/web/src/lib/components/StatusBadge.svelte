<script lang="ts">
  import type { SessionStatus } from '@pocket-pilot/protocol';

  const { status, dot = false }: { status: SessionStatus; dot?: boolean } = $props();

  const labels: Record<SessionStatus, string> = {
    idle: 'Idle',
    running: 'Running',
    needsInput: 'Needs input',
    failed: 'Failed'
  };
</script>

{#if status !== 'idle' && dot}
  <span
    role="img"
    aria-label={labels[status]}
    class={[
      'status shrink-0',
      status === 'running' && 'animate-pulse status-info',
      status === 'needsInput' && 'status-warning',
      status === 'failed' && 'status-error'
    ]}
  ></span>
{:else if status !== 'idle'}
  <span
    class={[
      'badge shrink-0 gap-1 badge-sm',
      status === 'running' && 'badge-info',
      status === 'needsInput' && 'badge-warning',
      status === 'failed' && 'badge-error'
    ]}
  >
    {#if status === 'running'}<span class="loading loading-xs loading-dots"></span>{/if}
    {labels[status]}
  </span>
{/if}
