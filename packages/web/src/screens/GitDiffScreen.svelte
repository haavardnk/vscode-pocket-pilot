<script lang="ts">
  import FileCode from '@lucide/svelte/icons/file-code';

  import { baseName, parentPath } from '../lib/code/paths';
  import ChangeBadge from '../lib/components/code/ChangeBadge.svelte';
  import DiffStat from '../lib/components/code/DiffStat.svelte';
  import DiffView from '../lib/components/code/DiffView.svelte';
  import WrapToggle from '../lib/components/code/WrapToggle.svelte';
  import QueryView from '../lib/components/QueryView.svelte';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import ScreenHeader from '../lib/components/ScreenHeader.svelte';
  import { routeHash } from '../lib/routing';
  import { hub } from '../lib/stores/hub.svelte';
  import { QueryResource } from '../lib/stores/query.svelte';

  interface Props {
    windowId: string;
    folderId: string;
    path: string;
  }

  const { windowId, folderId, path }: Props = $props();

  const diff = new QueryResource(() => hub.query({ kind: 'gitDiff', windowId, folderId, path }));

  $effect(() => {
    if (hub.connection === 'open') void diff.refresh();
  });
</script>

<div class="flex min-h-dvh flex-col">
  <ScreenHeader
    title={baseName(path)}
    subtitle={parentPath(path)}
    back={{ name: 'folder', windowId, folderId, tab: 'changes', path: '' }}
  >
    {#snippet actions()}
      {#if diff.value?.file?.change !== 'deleted'}
        <a
          class="btn btn-square btn-ghost"
          aria-label="Open file"
          href={routeHash({ name: 'file', windowId, folderId, path })}
        >
          <FileCode class="size-5" />
        </a>
      {/if}
      <WrapToggle />
      <RefreshButton loading={diff.loading} onrefresh={() => void diff.refresh()} />
    {/snippet}
  </ScreenHeader>

  <main class="flex-1">
    <QueryView resource={diff}>
      {#snippet children(result)}
        {#if result.file}
          <div class="flex items-center gap-2 px-4 pt-3 text-sm">
            <ChangeBadge change={result.file.change} />
            <span class="min-w-0 flex-1 truncate text-base-content/70">
              {result.file.previousPath ? `Renamed from ${result.file.previousPath}` : ''}
            </span>
            <DiffStat additions={result.file.additions} deletions={result.file.deletions} />
          </div>
        {/if}
        <DiffView diff={result.diff} languageId={result.language} {path} />
      {/snippet}
    </QueryView>
  </main>
</div>
