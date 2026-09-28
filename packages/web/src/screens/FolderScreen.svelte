<script lang="ts">
  import { parentPath } from '../lib/code/paths';
  import FileTree from '../lib/components/code/FileTree.svelte';
  import GitChangeList from '../lib/components/code/GitChangeList.svelte';
  import QueryView from '../lib/components/QueryView.svelte';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import ScreenHeader from '../lib/components/ScreenHeader.svelte';
  import { type FolderTab, type Route, routeHash } from '../lib/routing';
  import { hub } from '../lib/stores/hub.svelte';
  import { QueryResource } from '../lib/stores/query.svelte';

  interface Props {
    windowId: string;
    folderId: string;
    tab: FolderTab;
    path: string;
  }

  const { windowId, folderId, tab, path }: Props = $props();

  const hostWindow = $derived(hub.windows.find((candidate) => candidate.windowId === windowId));
  const folder = $derived(hostWindow?.folders.find((candidate) => candidate.id === folderId));
  const windowName = $derived(hostWindow?.name === folder?.name ? null : hostWindow?.name);
  const back = $derived<Route>(
    tab === 'files' && path
      ? { name: 'folder', windowId, folderId, tab, path: parentPath(path) }
      : { name: 'code' }
  );
  const tree = new QueryResource(() => hub.query({ kind: 'tree', windowId, folderId, path }));
  const changes = new QueryResource(() => hub.query({ kind: 'gitChanges', windowId, folderId }));
  const active = $derived(tab === 'files' ? tree : changes);
  const tabs: { name: FolderTab; label: string }[] = [
    { name: 'files', label: 'Files' },
    { name: 'changes', label: 'Changes' }
  ];

  $effect(() => {
    if (hub.connection === 'open') void active.refresh();
  });
</script>

<div class="flex flex-1 flex-col">
  <ScreenHeader title={folder?.name ?? 'Folder'} subtitle={path || windowName} {back}>
    {#snippet actions()}
      <RefreshButton loading={active.loading} onrefresh={() => void active.refresh()} />
    {/snippet}
    <div role="tablist" class="tabs tabs-border px-2">
      {#each tabs as item (item.name)}
        <a
          role="tab"
          class={['tab', item.name === tab && 'tab-active']}
          aria-selected={item.name === tab}
          href={routeHash({ name: 'folder', windowId, folderId, tab: item.name, path: '' })}
          >{item.label}</a
        >
      {/each}
    </div>
  </ScreenHeader>

  <main class="flex-1">
    {#if hub.loaded && !folder}
      <p class="p-10 text-center text-base-content/70">This folder is no longer open.</p>
    {:else if tab === 'files'}
      <QueryView resource={tree}>
        {#snippet children(result)}
          <FileTree
            {windowId}
            {folderId}
            {path}
            entries={result.entries}
            truncated={result.truncated}
          />
        {/snippet}
      </QueryView>
    {:else}
      <QueryView resource={changes}>
        {#snippet children(result)}
          <GitChangeList {windowId} {folderId} {result} />
        {/snippet}
      </QueryView>
    {/if}
  </main>
</div>
