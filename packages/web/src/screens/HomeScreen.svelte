<script lang="ts">
  import Plus from '@lucide/svelte/icons/plus';
  import type { AuthInfo, Connection, Device } from '@pocket-pilot/protocol';

  import FolderList from '../lib/components/code/FolderList.svelte';
  import ConnectionBanner from '../lib/components/ConnectionBanner.svelte';
  import PullRequestList from '../lib/components/PullRequestList.svelte';
  import RepositoryPicker from '../lib/components/RepositoryPicker.svelte';
  import SessionList from '../lib/components/SessionList.svelte';
  import type { Tab } from '../lib/routing';
  import { hub } from '../lib/stores/hub.svelte';
  import { router } from '../lib/stores/router.svelte';
  import SettingsPanel from './SettingsPanel.svelte';

  interface Props {
    tab: Tab;
    device: Device;
    connection: Connection;
    onsignedout: (info: AuthInfo) => void;
  }

  const { tab, device, connection, onsignedout }: Props = $props();
</script>

<div class="flex flex-1 flex-col">
  <header class="sticky top-0 z-20 bg-base-100/90 pt-safe backdrop-blur">
    <div class="flex h-14 items-center gap-2 px-4">
      {#if tab === 'settings'}
        <h1 class="text-lg font-semibold">Settings</h1>
      {:else}
        <RepositoryPicker />
      {/if}
    </div>
    <ConnectionBanner />
  </header>

  <main class="flex-1">
    {#if tab === 'chats'}
      <SessionList />
    {:else if tab === 'pullRequests'}
      <PullRequestList />
    {:else if tab === 'code'}
      <FolderList />
    {:else}
      <SettingsPanel {device} {connection} {onsignedout} />
    {/if}
  </main>

  {#if tab === 'chats' && hub.windows.length > 0}
    <button
      class="btn fixed right-5 bottom-[calc(var(--dock-height)+1.5rem)] z-20 btn-circle shadow-lg btn-lg btn-primary"
      aria-label="New chat"
      onclick={() => router.go({ name: 'new' })}
    >
      <Plus class="size-6" />
    </button>
  {/if}
</div>
