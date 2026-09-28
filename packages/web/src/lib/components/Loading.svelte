<script lang="ts">
  import { VERSION_MISMATCH } from '@pocket-pilot/protocol';

  import { hub } from '../stores/hub.svelte';

  async function reloadApp(): Promise<void> {
    const registration =
      'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    await registration?.update().catch(() => undefined);
    const worker = registration?.installing ?? registration?.waiting;
    if (!worker) {
      location.reload();
      return;
    }
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated' || worker.state === 'redundant') location.reload();
    });
    worker.postMessage({ type: 'SKIP_WAITING' });
  }
</script>

{#if hub.mismatch}
  <div class="flex flex-col items-center gap-3 p-10 text-center">
    <p class="text-base-content/70">{VERSION_MISMATCH}</p>
    <button class="btn btn-sm" onclick={reloadApp}>Reload app</button>
  </div>
{:else}
  <div class="flex justify-center p-10">
    <span class="loading loading-spinner text-primary"></span>
  </div>
{/if}
