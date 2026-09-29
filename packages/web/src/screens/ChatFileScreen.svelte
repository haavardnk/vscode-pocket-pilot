<script lang="ts">
  import FileCode from '@lucide/svelte/icons/file-code';

  import { baseName, parentPath } from '../lib/code/paths';
  import FileContentView from '../lib/components/code/FileContentView.svelte';
  import WrapToggle from '../lib/components/code/WrapToggle.svelte';
  import QueryView from '../lib/components/QueryView.svelte';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import ScreenHeader from '../lib/components/ScreenHeader.svelte';
  import { inChat, parseRoute, routeHash } from '../lib/routing';
  import { hub } from '../lib/stores/hub.svelte';
  import { QueryResource } from '../lib/stores/query.svelte';

  interface Props {
    windowId: string;
    sessionId: string;
    uri: string;
    line: number | null;
  }

  const { windowId, sessionId, uri, line }: Props = $props();

  function filePath(value: string): string {
    try {
      return decodeURIComponent(new URL(value).pathname);
    } catch {
      return value;
    }
  }

  const path = $derived(filePath(uri));
  const file = new QueryResource(() => hub.query({ kind: 'chatFile', windowId, sessionId, uri }));
  const folderId = $derived(file.value?.folderId ?? null);
  const relativePath = $derived(file.value?.relativePath ?? null);

  $effect(() => {
    if (hub.connection === 'open') void file.refresh();
  });

  $effect(() => () => {
    if (!inChat(parseRoute(location.hash), windowId, sessionId)) hub.unsubscribe();
  });
</script>

<div class="flex flex-1 flex-col">
  <ScreenHeader
    title={baseName(path)}
    subtitle={relativePath === null ? parentPath(path) : parentPath(relativePath)}
    back={{ name: 'session', windowId, sessionId }}
  >
    {#snippet actions()}
      {#if folderId && relativePath !== null}
        <a
          class="btn btn-square btn-ghost"
          aria-label="Open in code"
          href={routeHash({ name: 'file', windowId, folderId, path: relativePath })}
        >
          <FileCode class="size-5" />
        </a>
      {/if}
      <WrapToggle />
      <RefreshButton loading={file.loading} onrefresh={() => void file.refresh()} />
    {/snippet}
  </ScreenHeader>

  <main class="flex-1">
    <QueryView resource={file}>
      {#snippet children(result)}
        <FileContentView
          content={result.content}
          size={result.size}
          languageId={result.language}
          {path}
          {line}
        />
      {/snippet}
    </QueryView>
  </main>
</div>
