<script lang="ts">
  import FileDiff from '@lucide/svelte/icons/file-diff';

  import { baseName, parentPath } from '../lib/code/paths';
  import CodeView from '../lib/components/code/CodeView.svelte';
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

  const folder = $derived(
    hub.windows
      .find((candidate) => candidate.windowId === windowId)
      ?.folders.find((candidate) => candidate.id === folderId)
  );
  const file = new QueryResource(() => hub.query({ kind: 'file', windowId, folderId, path }));

  $effect(() => {
    if (hub.connection === 'open') void file.refresh();
  });

  function megabytes(size: number): string {
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }
</script>

<div class="flex min-h-dvh flex-col">
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

  <main class="flex-1">
    <QueryView resource={file}>
      {#snippet children(result)}
        {#if result.content.kind === 'text'}
          <CodeView text={result.content.text} languageId={result.language} {path} />
        {:else if result.content.kind === 'image'}
          <img
            class="mx-auto max-w-full p-4"
            src={`data:${result.content.mime};base64,${result.content.data}`}
            alt={baseName(path)}
          />
        {:else if result.content.kind === 'binary'}
          <p class="p-10 text-center text-base-content/70">
            Binary file, {megabytes(result.size)}.
          </p>
        {:else if result.content.kind === 'tooLarge'}
          <p class="p-10 text-center text-base-content/70">
            This file is too large to show ({megabytes(result.size)}).
          </p>
        {:else}
          <p class="p-10 text-center text-base-content/70">This file no longer exists.</p>
        {/if}
      {/snippet}
    </QueryView>
  </main>
</div>
