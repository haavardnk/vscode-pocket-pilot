<script lang="ts">
  import type { AuthInfo } from '@pocket-pilot/protocol';
  import { onMount } from 'svelte';

  import { fetchAuth } from './lib/api/auth';
  import Toasts from './lib/components/Toasts.svelte';
  import { pairCode } from './lib/routing';
  import { hub } from './lib/stores/hub.svelte';
  import { router } from './lib/stores/router.svelte';
  import PairScreen from './screens/PairScreen.svelte';
  import TabsScreen from './screens/TabsScreen.svelte';

  const initialCode = pairCode(location.hash);
  if (initialCode) router.replace({ name: 'chats' });

  let auth = $state<AuthInfo | null>(null);
  let unreachable = $state(false);

  function signedIn(info: AuthInfo): void {
    auth = info;
    if (info.device) hub.start(() => void refresh());
    else hub.stop();
  }

  async function refresh(): Promise<void> {
    try {
      signedIn(await fetchAuth());
      unreachable = false;
    } catch {
      unreachable = auth === null;
    }
  }

  onMount(() => {
    void refresh();
  });
</script>

{#if auth === null}
  <main class="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
    {#if unreachable}
      <p class="text-lg font-semibold">Can't reach VS Code</p>
      <p class="text-sm text-base-content/70">
        Check that Pocket Pilot is running in VS Code and this device can reach it.
      </p>
      <button class="btn btn-primary" onclick={() => void refresh()}>Try again</button>
    {:else}
      <span class="loading loading-lg loading-spinner text-primary" aria-label="Loading"></span>
    {/if}
  </main>
{:else if auth.device === null}
  <PairScreen code={initialCode} passwordEnabled={auth.passwordEnabled} onpaired={signedIn} />
{:else}
  <TabsScreen device={auth.device} connection={auth.connection} onsignedout={signedIn} />
{/if}

<Toasts />
