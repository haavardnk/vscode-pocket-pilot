<script lang="ts">
  import FileDiff from '@lucide/svelte/icons/file-diff';

  import { baseName, parentPath } from '../lib/code/paths';
  import FileContentView from '../lib/components/code/FileContentView.svelte';
  import WrapToggle from '../lib/components/code/WrapToggle.svelte';
  import QueryView from '../lib/components/QueryView.svelte';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import ScreenHeader from '../lib/components/ScreenHeader.svelte';
  import ScreenMain from '../lib/components/ScreenMain.svelte';
  import { routeHash } from '../lib/routing';
  import { hub } from '../lib/stores/hub.svelte';
  import { QueryResource } from '../lib/stores/query.svelte';

  interface Props {
    windowId: string;
    folderId: string;
    path: string;
  }

  const { windowId, folderId, path }: Props = $props();

  const folder = $derived(
    hub.windows
      .find((candidate) => candidate.windowId === windowId)
      ?.folders.find((candidate) => candidate.id === folderId)
  );
  const file = new QueryResource(() => hub.query({ kind: 'file', windowId, folderId, path }));

  $effect(() => {
    if (hub.connection === 'open') void file.refresh();
  });
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <ScreenHeader
    title={baseName(path)}
    subtitle={parentPath(path) || folder?.name}
    back={{ name: 'folder', windowId, folderId, tab: 'files', path: parentPath(path) }}
  >
    {#snippet actions()}
      {#if file.value?.change}
        <a
          class="btn btn-square btn-ghost"
          aria-label="Show changes"
          href={routeHash({ name: 'gitDiff', windowId, folderId, path })}
        >
          <FileDiff class="size-5" />
        </a>
      {/if}
      <WrapToggle />
      <RefreshButton loading={file.loading} onrefresh={() => void file.refresh()} />
    {/snippet}
  </ScreenHeader>

  <ScreenMain>
    <QueryView resource={file}>
      {#snippet children(result)}
        <FileContentView
          content={result.content}
          size={result.size}
          languageId={result.language}
          {path}
        />
      {/snippet}
    </QueryView>
  </ScreenMain>
</div>
