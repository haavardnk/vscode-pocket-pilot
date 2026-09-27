<script lang="ts">
  import { hub } from '../stores/hub.svelte';

  const GRACE_MS = 1500;

  let late = $state(false);

  $effect(() => {
    if (hub.connection === 'open') {
      late = false;
      return;
    }
    const timer = setTimeout(() => (late = true), GRACE_MS);
    return () => clearTimeout(timer);
  });
</script>

{#if late && hub.connection !== 'open'}
  <div
    class="flex items-center justify-center gap-2 bg-warning px-4 py-1 text-xs text-warning-content"
    role="status"
  >
    <span class="loading loading-xs loading-spinner"></span>
    {hub.connection === 'connecting' ? 'Connecting to VS Code…' : 'Offline, reconnecting…'}
  </div>
{/if}
