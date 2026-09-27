<script lang="ts">
  import type { SessionStatus } from '@pocket-pilot/protocol';

  const { status }: { status: SessionStatus } = $props();

  const labels: Record<SessionStatus, string> = {
    idle: 'Idle',
    running: 'Running',
    needsInput: 'Needs input',
    failed: 'Failed'
  };
</script>

{#if status !== 'idle'}
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
