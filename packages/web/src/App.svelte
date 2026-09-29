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

  let auth = $state<AuthInfo | null>(null);
  let unreachable = $state(false);
  let signInNeeded = $state(false);

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
      signInNeeded = false;
    } catch (error) {
      if (error instanceof SignInRedirect) signInNeeded = true;
      unreachable = auth === null;
    }
  }

  function recheck(): void {
    if (signInNeeded && document.visibilityState === 'visible') void refresh();
  }

  onMount(() => {
    void refresh();
    document.addEventListener('visibilitychange', recheck);
    return () => document.removeEventListener('visibilitychange', recheck);
  });
</script>

<svelte:boundary onerror={(error) => console.error(error)}>
  {#if signInNeeded}
    <main class="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p class="text-lg font-semibold">Sign in again</p>
      <p class="text-sm text-base-content/70">
        The sign-in page in front of this address wants you to sign in again.
      </p>
      <a class="btn btn-primary" href="/signin">Sign in</a>
      <button class="btn btn-ghost" onclick={() => void refresh()}>Try again</button>
    </main>
  {:else if auth === null}
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

  {#snippet failed(error)}
    <main class="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p class="text-lg font-semibold">Pocket Pilot stopped</p>
      <p class="text-sm break-words text-base-content/70">
        {error instanceof Error ? error.message : String(error)}
      </p>
      <button class="btn btn-primary" onclick={() => location.reload()}>Reload</button>
    </main>
  {/snippet}
</svelte:boundary>

<Toasts />
