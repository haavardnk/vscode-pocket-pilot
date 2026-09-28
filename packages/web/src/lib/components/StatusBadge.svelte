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
    role="img"
    aria-label={labels[status]}
    class={[
      'status shrink-0',
      status === 'running' && 'animate-pulse status-info',
      status === 'needsInput' && 'status-warning',
      status === 'failed' && 'status-error'
    ]}
  ></span>
{/if}
