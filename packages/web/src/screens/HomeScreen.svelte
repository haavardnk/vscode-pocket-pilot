<script lang="ts">
  import CodeXml from '@lucide/svelte/icons/code-xml';
  import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
  import MessagesSquare from '@lucide/svelte/icons/messages-square';
  import Plus from '@lucide/svelte/icons/plus';
  import Settings from '@lucide/svelte/icons/settings';
  import type { AuthInfo, Connection, Device } from '@pocket-pilot/protocol';

  import FolderList from '../lib/components/code/FolderList.svelte';
  import ConnectionBanner from '../lib/components/ConnectionBanner.svelte';
  import PullRequestList from '../lib/components/PullRequestList.svelte';
  import RepositoryPicker from '../lib/components/RepositoryPicker.svelte';
  import SessionList from '../lib/components/SessionList.svelte';
  import { hub } from '../lib/stores/hub.svelte';
  import { router } from '../lib/stores/router.svelte';
  import SettingsPanel from './SettingsPanel.svelte';

  interface Props {
    tab: 'chats' | 'pullRequests' | 'code' | 'settings';
    device: Device;
    connection: Connection;
    onsignedout: (info: AuthInfo) => void;
  }

  const { tab, device, connection, onsignedout }: Props = $props();

  const tabs: { name: Props['tab']; label: string; icon: typeof Settings }[] = [
    { name: 'chats', label: 'Chats', icon: MessagesSquare },
    { name: 'pullRequests', label: 'Pull requests', icon: GitPullRequest },
    { name: 'code', label: 'Code', icon: CodeXml },
    { name: 'settings', label: 'Settings', icon: Settings }
  ];
</script>

<div class="flex min-h-dvh flex-col pb-20">
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
      class="btn fixed right-5 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 btn-circle shadow-lg btn-lg btn-primary"
      aria-label="New chat"
      onclick={() => router.go({ name: 'new' })}
    >
      <Plus class="size-6" />
    </button>
  {/if}

  <nav class="dock z-20 dock-md bg-base-200">
    {#each tabs as item (item.name)}
      <button
        class={[item.name === tab && 'dock-active text-primary']}
        aria-current={item.name === tab ? 'page' : undefined}
        onclick={() => router.go({ name: item.name })}
      >
        <item.icon class="size-5" />
        <span class="dock-label">{item.label}</span>
      </button>
    {/each}
  </nav>
</div>
