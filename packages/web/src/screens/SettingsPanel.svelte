<script lang="ts">
  import AppWindow from '@lucide/svelte/icons/app-window';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Globe from '@lucide/svelte/icons/globe';
  import Info from '@lucide/svelte/icons/info';
  import ListCollapse from '@lucide/svelte/icons/list-collapse';
  import LogOut from '@lucide/svelte/icons/log-out';
  import Palette from '@lucide/svelte/icons/palette';
  import Smartphone from '@lucide/svelte/icons/smartphone';
  import Wifi from '@lucide/svelte/icons/wifi';
  import type { AuthInfo, Connection, Device } from '@pocket-pilot/protocol';

  import { logout } from '../lib/api/auth';
  import CopilotUsageGroup from '../lib/components/CopilotUsageGroup.svelte';
  import NotificationSettings from '../lib/components/NotificationSettings.svelte';
  import SettingsGroup from '../lib/components/SettingsGroup.svelte';
  import Sheet from '../lib/components/Sheet.svelte';
  import { routeHash } from '../lib/routing';
  import { chatView } from '../lib/stores/chatView.svelte';
  import { hub } from '../lib/stores/hub.svelte';
  import { theme, THEMES } from '../lib/stores/theme.svelte';
  import { toasts } from '../lib/stores/toasts.svelte';
  import { ago } from '../lib/time';

  interface Props {
    device: Device;
    connection: Connection;
    onsignedout: (info: AuthInfo) => void;
  }

  const { device, connection, onsignedout }: Props = $props();

  const LINK = {
    open: { label: 'Connected', status: 'status-success' },
    connecting: { label: 'Connecting', status: 'status-warning' },
    offline: { label: 'Offline', status: 'status-error' }
  };

  const link = $derived(LINK[hub.connection]);
  const windowNames = $derived(hub.windows.map((window) => window.name).join(', '));

  let confirming = $state(false);

  async function signOut(): Promise<void> {
    try {
      onsignedout(await logout());
    } catch (error) {
      toasts.error(error);
    }
  }
</script>

<div class="flex flex-col gap-6 p-4 pb-8">
  <div class="flex items-center gap-4 px-2">
    <div class="grid size-12 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
      <Smartphone class="size-6" />
    </div>
    <div class="min-w-0">
      <p class="truncate text-lg font-semibold">{device.name}</p>
      <p class="text-sm text-base-content/60">Paired {ago(device.pairedAt, Date.now())}</p>
    </div>
  </div>

  <SettingsGroup title="Appearance">
    {#snippet caption()}
      Compact chats hide the agent's thinking and status lines and list each tool call and edit.
    {/snippet}
    <li class="list-row items-center py-2.5">
      <Palette class="size-5 text-base-content/70" />
      <span class="list-col-grow">Theme</span>
      <select
        class="select w-36 select-sm"
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
    </li>
    <li>
      <label class="list-row items-center py-3">
        <ListCollapse class="size-5 text-base-content/70" />
        <span class="list-col-grow">Compact chats</span>
        <input
          type="checkbox"
          class="toggle toggle-primary"
          checked={chatView.compact}
          onchange={(event) => chatView.setCompact(event.currentTarget.checked)}
        />
      </label>
    </li>
  </SettingsGroup>

  <NotificationSettings {connection} />

  <CopilotUsageGroup />

  <SettingsGroup title="Connection">
    {#snippet caption()}
      {#if connection === 'quickTunnel'}
        Connected through a temporary Cloudflare address. It changes when VS Code restarts, and this
        app cannot be installed from it. Run "Pocket Pilot: Set Up Cloudflare Tunnel" in VS Code for
        a permanent address.
      {:else}
        Connected through your Cloudflare tunnel.
      {/if}
    {/snippet}
    <li class="list-row items-center py-3">
      <Wifi class="size-5 text-base-content/70" />
      <span class="list-col-grow">Status</span>
      <span class="flex items-center gap-2 text-base-content/70">
        <span class="status {link.status}" aria-hidden="true"></span>{link.label}
      </span>
    </li>
    <li class="list-row items-center py-3">
      <Globe class="size-5 text-base-content/70" />
      <span class="list-col-grow">Address</span>
      <span class="text-base-content/70">
        {connection === 'quickTunnel' ? 'Temporary' : 'Cloudflare tunnel'}
      </span>
    </li>
    <li>
      <a
        class="list-row items-center py-3 active:bg-base-300"
        href={routeHash({ name: 'windows' })}
      >
        <AppWindow class="size-5 text-base-content/70" />
        <span class="min-w-0 list-col-grow">
          <span class="block">VS Code windows</span>
          {#if windowNames}
            <span class="block truncate text-xs text-base-content/60">{windowNames}</span>
          {/if}
        </span>
        <span class="flex items-center gap-1 text-base-content/70">
          {hub.windows.length}<ChevronRight class="size-4 text-base-content/40" />
        </span>
      </a>
    </li>
  </SettingsGroup>

  {#if hub.version}
    <SettingsGroup title="About">
      <li class="list-row items-center py-3">
        <Info class="size-5 text-base-content/70" />
        <span class="list-col-grow">Pocket Pilot</span>
        <span class="text-base-content/70">{hub.version}</span>
      </li>
    </SettingsGroup>
  {/if}

  <ul class="list rounded-box bg-base-200">
    <li>
      <button
        class="list-row w-full items-center py-3 text-left text-error active:bg-base-300"
        onclick={() => (confirming = true)}
      >
        <LogOut class="size-5" />
        <span class="font-medium list-col-grow">Sign out this device</span>
      </button>
    </li>
  </ul>
</div>

<Sheet open={confirming} title="Sign out this device?" onclose={() => (confirming = false)}>
  <div class="flex flex-col gap-3">
    <p class="text-sm text-base-content/70">You will need a new pairing code to connect again.</p>
    <button class="btn btn-block btn-error" onclick={() => void signOut()}>Sign out</button>
    <button class="btn btn-block btn-ghost" onclick={() => (confirming = false)}>Cancel</button>
  </div>
</Sheet>
