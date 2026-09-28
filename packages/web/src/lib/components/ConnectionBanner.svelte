<script lang="ts">
  import { hub } from '../stores/hub.svelte';

  const GRACE_MS = 1500;
  const names = new Intl.ListFormat('en', { type: 'conjunction' });

  let late = $state(false);
  let online = $state(navigator.onLine);
  const down = $derived(
    !online
      ? 'This phone is offline'
      : hub.quickTunnel
        ? "Can't reach VS Code. If this lasts, its quick tunnel restarted with a new address: pair again from VS Code."
        : "Can't reach VS Code. Check that the computer is awake and Pocket Pilot is running."
  );
  const incompatible = $derived(
    hub.incompatibleWindows.length === 1
      ? `${hub.incompatibleWindows[0]} runs a different Pocket Pilot version. Reload that window.`
      : `${names.format(hub.incompatibleWindows)} run a different Pocket Pilot version. Reload those windows.`
  );

  $effect(() => {
    if (hub.connection === 'open') {
      late = false;
      return;
    }
    const timer = setTimeout(() => (late = true), GRACE_MS);
    return () => clearTimeout(timer);
  });
</script>

<svelte:window ononline={() => (online = true)} onoffline={() => (online = false)} />

{#if late && hub.connection !== 'open'}
  <div
    class="flex items-center justify-center gap-2 bg-warning px-4 py-1 text-xs text-warning-content"
    role="status"
  >
    <span class="loading loading-xs shrink-0 loading-spinner"></span>
    {hub.connection === 'connecting' ? 'Connecting to VS Code…' : down}
  </div>
{:else if hub.mismatch}
  <div class="bg-error px-4 py-1 text-center text-xs text-error-content" role="alert">
    Pocket Pilot versions don't match
  </div>
{:else if hub.incompatibleWindows.length > 0}
  <div class="bg-warning px-4 py-1 text-center text-xs text-warning-content" role="status">
    {incompatible}
  </div>
{/if}
