<script lang="ts">
  import AppWindow from '@lucide/svelte/icons/app-window';
  import FolderPlus from '@lucide/svelte/icons/folder-plus';
  import X from '@lucide/svelte/icons/x';
  import type { WindowState } from '@pocket-pilot/protocol';
  import { onDestroy } from 'svelte';

  import ScreenHeader from '../lib/components/ScreenHeader.svelte';
  import SettingsGroup from '../lib/components/SettingsGroup.svelte';
  import Sheet from '../lib/components/Sheet.svelte';
  import { activeChats } from '../lib/hub/views';
  import { routeHash } from '../lib/routing';
  import { hub } from '../lib/stores/hub.svelte';
  import { toasts } from '../lib/stores/toasts.svelte';

  const CLOSE_TIMEOUT_MS = 10_000;

  interface Closing {
    windowId: string;
    name: string;
    timer: ReturnType<typeof setTimeout>;
  }

  let confirming = $state<string | null>(null);
  let closing = $state<Closing | null>(null);

  const lastWindow = $derived(hub.windows.length < 2);
  const target = $derived(hub.windows.find((window) => window.windowId === confirming));
  const targetActive = $derived(target ? activeChats(target) : 0);

  $effect(() => {
    if (!closing || hub.windows.some((window) => window.windowId === closing?.windowId)) return;
    clearTimeout(closing.timer);
    toasts.show(`Closed ${closing.name}`);
    closing = null;
  });

  onDestroy(() => {
    if (closing) clearTimeout(closing.timer);
  });

  function describe(window: WindowState): string {
    const active = activeChats(window);
    if (active > 0) return `${active} active ${active === 1 ? 'chat' : 'chats'}`;
    return window.folders.map((folder) => folder.name).join(', ') || 'No folder open';
  }

  async function close(window: WindowState): Promise<void> {
    confirming = null;
    try {
      await hub.command({ kind: 'closeWindow', windowId: window.windowId });
    } catch (error) {
      toasts.error(error);
      return;
    }
    const timer = setTimeout(() => {
      closing = null;
      toasts.show(`${window.name} is still open. VS Code may be asking for confirmation.`);
    }, CLOSE_TIMEOUT_MS);
    closing = { windowId: window.windowId, name: window.name, timer };
  }
</script>

{#snippet lastWindowCaption()}
  Pocket Pilot runs inside VS Code, so the last open window cannot be closed from here.
{/snippet}

<div class="flex flex-1 flex-col">
  <ScreenHeader title="VS Code windows" back={{ name: 'settings' }}>
    {#snippet actions()}
      <a
        class="btn btn-square btn-ghost"
        href={routeHash({ name: 'open' })}
        aria-label="Open folder"
      >
        <FolderPlus class="size-5" />
      </a>
    {/snippet}
  </ScreenHeader>

  <main class="flex flex-col gap-6 p-4 pb-8">
    <SettingsGroup title="Open windows" caption={lastWindow ? lastWindowCaption : undefined}>
      {#each hub.windows as window (window.windowId)}
        <li class="list-row items-center py-3">
          <AppWindow class="size-5 text-base-content/70" />
          <span class="min-w-0 list-col-grow">
            <span class="block truncate">{window.name}</span>
            <span class="block truncate text-xs text-base-content/60">{describe(window)}</span>
          </span>
          {#if closing?.windowId === window.windowId}
            <span class="loading loading-sm loading-spinner" aria-label={`Closing ${window.name}`}
            ></span>
          {:else}
            <button
              class="btn btn-square btn-ghost btn-sm"
              aria-label={`Close ${window.name}`}
              disabled={lastWindow || closing !== null || hub.connection !== 'open'}
              onclick={() => (confirming = window.windowId)}
            >
              <X class="size-5" />
            </button>
          {/if}
        </li>
      {/each}
    </SettingsGroup>
  </main>
</div>

<Sheet
  open={target !== undefined}
  title={`Close ${target?.name ?? 'window'}?`}
  onclose={() => (confirming = null)}
>
  <div class="flex flex-col gap-3">
    <p class="text-sm text-base-content/70">
      {#if targetActive > 0}
        {targetActive}
        {targetActive === 1 ? 'chat is' : 'chats are'} still active in this window. Closing it stops them.
      {:else}
        VS Code asks on the desktop before discarding unsaved files.
      {/if}
    </p>
    <button class="btn btn-block btn-error" onclick={() => target && void close(target)}>
      Close window
    </button>
    <button class="btn btn-block btn-ghost" onclick={() => (confirming = null)}>Cancel</button>
  </div>
</Sheet>
