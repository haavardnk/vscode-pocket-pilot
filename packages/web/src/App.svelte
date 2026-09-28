<script lang="ts">
  import type { AuthInfo } from '@pocket-pilot/protocol';
  import { onMount } from 'svelte';

  import { fetchAuth } from './lib/api/auth';
  import { SignInRedirect } from './lib/api/http';
  import Toasts from './lib/components/Toasts.svelte';
  import { pairCode } from './lib/routing';
  import { hub } from './lib/stores/hub.svelte';
  import { router } from './lib/stores/router.svelte';
  import PairScreen from './screens/PairScreen.svelte';
  import TabsScreen from './screens/TabsScreen.svelte';

  const initialCode = pairCode(location.hash);
  if (initialCode) router.replace({ name: 'chats' });

  const SIGN_IN_RELOAD = 'pocket-pilot:sign-in-reload';
  const SIGN_IN_RELOAD_GAP_MS = 60_000;

  let auth = $state<AuthInfo | null>(null);
  let unreachable = $state(false);
  let blocked = $state(false);

  function reloadToSignIn(): void {
    const last = Number(sessionStorage.getItem(SIGN_IN_RELOAD));
    if (Date.now() - last < SIGN_IN_RELOAD_GAP_MS) {
      blocked = true;
      return;
    }
    sessionStorage.setItem(SIGN_IN_RELOAD, String(Date.now()));
    location.reload();
  }

  function signedIn(info: AuthInfo): void {
    auth = info;
    hub.quickTunnel = info.connection === 'quickTunnel';
    if (info.device) hub.start(() => void refresh());
    else hub.stop();
  }

  async function refresh(): Promise<void> {
    try {
      signedIn(await fetchAuth());
      unreachable = false;
      blocked = false;
    } catch (error) {
      if (error instanceof SignInRedirect) reloadToSignIn();
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
        {#if blocked}
          A sign-in page in front of this address keeps redirecting. Check its access policy.
        {:else}
          Check that Pocket Pilot is running in VS Code and this device can reach it.
        {/if}
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
