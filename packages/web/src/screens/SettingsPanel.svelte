<script lang="ts">
  import type { AuthInfo, Connection, Device } from '@pocket-pilot/protocol';

  import { logout } from '../lib/api/auth';
  import { hub } from '../lib/stores/hub.svelte';
  import { theme, THEMES } from '../lib/stores/theme.svelte';
  import { toasts } from '../lib/stores/toasts.svelte';

  interface Props {
    device: Device;
    connection: Connection;
    onsignedout: (info: AuthInfo) => void;
  }

  const { device, connection, onsignedout }: Props = $props();

  let confirming = $state(false);

  async function signOut(): Promise<void> {
    try {
      onsignedout(await logout());
    } catch (error) {
      toasts.error(error);
    }
  }
</script>

<div class="flex flex-col gap-6 p-4">
  <section class="flex flex-col gap-2">
    <h2 class="text-sm font-medium text-base-content/60">Theme</h2>
    <select
      class="select w-full"
      value={theme.choice}
      onchange={(event) => {
        const choice = THEMES.find((option) => option.id === event.currentTarget.value);
        if (choice) theme.set(choice.id);
      }}
      aria-label="Theme"
    >
      {#each THEMES as option (option.id)}
        <option value={option.id}>{option.label}</option>
      {/each}
    </select>
  </section>

  <section class="flex flex-col gap-2">
    <h2 class="text-sm font-medium text-base-content/60">This device</h2>
    <div class="flex flex-col gap-3 rounded-box bg-base-200 p-4">
      <p class="font-medium">{device.name}</p>
      {#if confirming}
        <p class="text-sm">You will need a new pairing code to connect again.</p>
        <div class="flex gap-2">
          <button class="btn btn-error btn-sm" onclick={() => void signOut()}>Sign out</button>
          <button class="btn btn-ghost btn-sm" onclick={() => (confirming = false)}>Cancel</button>
        </div>
      {:else}
        <button
          class="btn self-start btn-outline btn-error btn-sm"
          onclick={() => (confirming = true)}
        >
          Sign out this device
        </button>
      {/if}
    </div>
  </section>

  <section class="flex flex-col gap-2">
    <h2 class="text-sm font-medium text-base-content/60">Connection</h2>
    <div class="flex flex-col gap-3 rounded-box bg-base-200 p-4 text-sm">
      <p>Windows connected: {hub.windows.length}</p>
      {#if connection === 'quickTunnel'}
        <p>
          Connected through a temporary Cloudflare address. It changes when VS Code restarts, and
          this app cannot be installed from it. Run "Pocket Pilot: Set Up Cloudflare Tunnel" in VS
          Code for a permanent address.
        </p>
      {:else}
        <p>Connected through your Cloudflare tunnel.</p>
      {/if}
      {#if hub.version}<p class="text-base-content/60">Pocket Pilot {hub.version}</p>{/if}
    </div>
  </section>
</div>
