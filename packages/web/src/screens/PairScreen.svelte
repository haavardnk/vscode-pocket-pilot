<script lang="ts">
  import type { AuthInfo } from '@pocket-pilot/protocol';
  import { untrack } from 'svelte';

  import { guessDeviceName, login, pair } from '../lib/api/auth';

  interface Props {
    code: string | null;
    passwordEnabled: boolean;
    onpaired: (info: AuthInfo) => void;
  }

  const { code, passwordEnabled, onpaired }: Props = $props();

  let method = $state<'code' | 'password'>('code');
  let pairingCode = $state(untrack(() => code) ?? '');
  let password = $state('');
  let deviceName = $state(guessDeviceName(navigator.userAgent));
  let busy = $state(false);
  let error = $state<string | null>(null);

  const ready = $derived(
    deviceName.trim().length > 0 &&
      (method === 'code' ? /^\d{6}$/.test(pairingCode) : password.length > 0)
  );

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!ready || busy) return;
    busy = true;
    error = null;
    try {
      const name = deviceName.trim();
      onpaired(
        method === 'code'
          ? await pair({ code: pairingCode, deviceName: name })
          : await login({ password, deviceName: name })
      );
    } catch (failure) {
      error = failure instanceof Error ? failure.message : 'Pairing failed';
    } finally {
      busy = false;
    }
  }
</script>

<main class="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 pt-safe pb-safe">
  <header class="flex flex-col items-center gap-2 text-center">
    <img src="/icon.svg" alt="" class="size-16" />
    <h1 class="text-2xl font-semibold">Pocket Pilot</h1>
    <p class="text-sm text-base-content/70">
      {method === 'code'
        ? 'Enter the code shown by "Pocket Pilot: Pair Phone" in VS Code.'
        : 'Sign in with the password set in VS Code.'}
    </p>
  </header>

  {#if passwordEnabled}
    <div role="tablist" class="tabs tabs-box self-center">
      <button
        role="tab"
        class={['tab', method === 'code' && 'tab-active']}
        onclick={() => (method = 'code')}
      >
        Code
      </button>
      <button
        role="tab"
        class={['tab', method === 'password' && 'tab-active']}
        onclick={() => (method = 'password')}
      >
        Password
      </button>
    </div>
  {/if}

  <form class="flex flex-col gap-4" onsubmit={submit}>
    {#if method === 'code'}
      <label class="floating-label">
        <span>Pairing code</span>
        <input
          class="input w-full text-center font-mono tracking-[0.4em] input-lg"
          bind:value={pairingCode}
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          placeholder="Pairing code"
          required
        />
      </label>
    {:else}
      <label class="floating-label">
        <span>Password</span>
        <input
          class="input w-full input-lg"
          type="password"
          bind:value={password}
          autocomplete="current-password"
          placeholder="Password"
          required
        />
      </label>
    {/if}
    <label class="floating-label">
      <span>Device name</span>
      <input
        class="input w-full"
        bind:value={deviceName}
        maxlength="64"
        placeholder="Device name"
        required
      />
    </label>
    {#if error}
      <p role="alert" class="text-sm text-error">{error}</p>
    {/if}
    <button class="btn btn-lg btn-primary" type="submit" disabled={!ready || busy}>
      {#if busy}<span class="loading loading-spinner"></span>{/if}
      {method === 'code' ? 'Pair' : 'Sign in'}
    </button>
  </form>
</main>
