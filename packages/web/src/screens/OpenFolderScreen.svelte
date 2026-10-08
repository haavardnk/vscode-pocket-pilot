<script lang="ts">
  import FolderGit from '@lucide/svelte/icons/folder-git-2';
  import FolderInput from '@lucide/svelte/icons/folder-input';
  import FolderOpen from '@lucide/svelte/icons/folder-open';
  import Layers from '@lucide/svelte/icons/layers';
  import MonitorOff from '@lucide/svelte/icons/monitor-off';
  import Search from '@lucide/svelte/icons/search';
  import type { OpenTarget, QueryResultFor } from '@pocket-pilot/protocol';
  import { onDestroy } from 'svelte';

  import EmptyState from '../lib/components/EmptyState.svelte';
  import QueryView from '../lib/components/QueryView.svelte';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import ScreenHeader from '../lib/components/ScreenHeader.svelte';
  import { repositoryGroups } from '../lib/hub/views';
  import { hub } from '../lib/stores/hub.svelte';
  import { QueryResource } from '../lib/stores/query.svelte';
  import { router } from '../lib/stores/router.svelte';
  import { toasts } from '../lib/stores/toasts.svelte';

  const SLOW_OPEN_MS = 30_000;

  interface Pending {
    target: OpenTarget;
    slow: boolean;
    timer: ReturnType<typeof setTimeout>;
  }

  let search = $state('');
  let pending = $state<Pending | null>(null);
  let resolving = $state(false);

  const hostId = $derived(hub.windows[0]?.windowId);
  const openIds = $derived(new Set(hub.windows.map((window) => window.workspace)));
  const typedPath = $derived(/^\s*[~/]/.test(search) ? search.trim() : null);
  const targets = new QueryResource<QueryResultFor<'openTargets'>>(() => {
    if (!hostId) return Promise.reject(new Error('No VS Code window is connected'));
    return hub.query({ kind: 'openTargets', windowId: hostId });
  });

  $effect(() => {
    if (hub.connection === 'open' && hostId) void targets.refresh();
  });

  $effect(() => {
    if (!pending) return;
    const opened = hub.windows.find((window) => window.workspace === pending?.target.id);
    if (!opened) return;
    clearTimeout(pending.timer);
    const [group] = repositoryGroups([opened]);
    if (group) hub.selectRepository(group.key);
    toasts.show(`Opened ${pending.target.name}`);
    pending = null;
    router.replace({ name: 'chats' });
  });

  onDestroy(() => {
    if (pending) clearTimeout(pending.timer);
  });

  function matches(target: OpenTarget): boolean {
    const needle = search.trim().toLowerCase();
    return (
      !needle ||
      target.name.toLowerCase().includes(needle) ||
      target.path.toLowerCase().includes(needle)
    );
  }

  function sections(
    result: QueryResultFor<'openTargets'>
  ): { title: string; targets: OpenTarget[] }[] {
    return [
      { title: 'Recent', targets: result.recent.filter(matches) },
      { title: 'Projects', targets: result.projects.filter(matches) }
    ].filter((section) => section.targets.length > 0);
  }

  async function open(target: OpenTarget): Promise<void> {
    if (!hostId) return;
    try {
      await hub.command({ kind: 'openWindow', windowId: hostId, target: target.id });
    } catch (error) {
      toasts.error(error);
      return;
    }
    const timer = setTimeout(() => {
      if (pending) pending.slow = true;
    }, SLOW_OPEN_MS);
    pending = { target, slow: false, timer };
  }

  async function openPath(path: string): Promise<void> {
    if (!hostId || resolving) return;
    resolving = true;
    try {
      const { target } = await hub.query({ kind: 'pathTarget', windowId: hostId, path });
      if (openIds.has(target.id)) toasts.show(`${target.name} is already open`);
      else await open(target);
    } catch (error) {
      toasts.error(error);
    } finally {
      resolving = false;
    }
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    if (typedPath) void openPath(typedPath);
  }
</script>

<div class="flex flex-1 flex-col">
  <ScreenHeader
    title="Open folder"
    subtitle="Opens in a new VS Code window"
    back={{ name: 'chats' }}
  >
    {#snippet actions()}
      {#if !pending && hostId}
        <RefreshButton loading={targets.loading} onrefresh={() => void targets.refresh()} />
      {/if}
    {/snippet}
  </ScreenHeader>

  <main class="flex-1">
    {#if pending}
      <div class="flex flex-col items-center gap-3 px-8 py-16 text-center">
        <span class="loading loading-spinner text-primary"></span>
        <p class="text-base-content/70">Opening {pending.target.name}…</p>
        {#if pending.slow}
          <p class="text-sm text-base-content/60">
            The new window has not connected yet. If VS Code asks whether you trust the folder,
            answer on the desktop. Pocket Pilot does not run in Restricted Mode.
          </p>
        {/if}
      </div>
    {:else if !hostId}
      <EmptyState
        icon={MonitorOff}
        title="No VS Code windows are connected."
        hint="Pocket Pilot opens folders through a running VS Code window."
      />
    {:else}
      <form class="px-4 pt-3 pb-1" onsubmit={submit}>
        <label class="input w-full">
          <Search class="size-4 opacity-50" />
          <input
            type="search"
            class="grow"
            placeholder="Search, or type a path like ~/Git"
            aria-label="Search folders or type a path"
            autocapitalize="off"
            autocomplete="off"
            spellcheck="false"
            enterkeyhint="go"
            bind:value={search}
          />
        </label>
      </form>
      {#if typedPath}
        <ul class="list" aria-label="Path">
          <li>
            <button
              class="list-row w-full items-center text-left active:bg-base-200 disabled:opacity-60"
              aria-label="Open path"
              disabled={resolving || hub.connection !== 'open'}
              onclick={() => void openPath(typedPath)}
            >
              {#if resolving}
                <span class="loading loading-sm loading-spinner text-primary"></span>
              {:else}
                <FolderInput class="size-5 text-primary" />
              {/if}
              <span class="flex min-w-0 flex-col list-col-grow">
                <span class="truncate font-medium">Open this path</span>
                <span class="truncate text-xs text-base-content/60">{typedPath}</span>
              </span>
            </button>
          </li>
        </ul>
      {/if}
      <QueryView resource={targets}>
        {#snippet children(result)}
          {#if result.recent.length + result.projects.length === 0}
            <EmptyState
              icon={FolderOpen}
              title="No folders to open"
              hint="Type a path above, open folders in VS Code once, or list your project folders in the pocketPilot.projectRoots setting."
            />
          {:else}
            {#each sections(result) as section (section.title)}
              <section>
                <h2 class="px-4 pt-4 pb-1 text-xs font-semibold text-base-content/60 uppercase">
                  {section.title}
                </h2>
                <ul class="list" aria-label={section.title}>
                  {#each section.targets as target (target.id)}
                    {@const isOpen = openIds.has(target.id)}
                    <li>
                      <button
                        class="list-row w-full items-center text-left active:bg-base-200 disabled:opacity-60"
                        aria-label={target.name}
                        disabled={isOpen || hub.connection !== 'open'}
                        onclick={() => void open(target)}
                      >
                        {#if target.kind === 'workspace'}
                          <Layers class="size-5 text-primary" />
                        {:else}
                          <FolderGit class="size-5 text-primary" />
                        {/if}
                        <span class="flex min-w-0 flex-col list-col-grow">
                          <span class="truncate font-medium">{target.name}</span>
                          <span class="truncate text-xs text-base-content/60">{target.path}</span>
                        </span>
                        {#if isOpen}
                          <span class="badge badge-ghost badge-sm">Open</span>
                        {/if}
                      </button>
                    </li>
                  {/each}
                </ul>
              </section>
            {:else}
              {#if !typedPath}
                <EmptyState
                  icon={Search}
                  title="No matching folders"
                  hint="Try a different word, or type a full path."
                />
              {/if}
            {/each}
          {/if}
        {/snippet}
      </QueryView>
    {/if}
  </main>
</div>
