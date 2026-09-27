<script lang="ts">
  import FileCode from '@lucide/svelte/icons/file-code';
  import type { CodeResultFor } from '@pocket-pilot/protocol';

  import { baseName, parentPath } from '../lib/code/paths';
  import BaselineNote from '../lib/components/code/BaselineNote.svelte';
  import ChangeBadge from '../lib/components/code/ChangeBadge.svelte';
  import DiffStat from '../lib/components/code/DiffStat.svelte';
  import DiffView from '../lib/components/code/DiffView.svelte';
  import EditStateBadge from '../lib/components/code/EditStateBadge.svelte';
  import WrapToggle from '../lib/components/code/WrapToggle.svelte';
  import QueryView from '../lib/components/QueryView.svelte';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import ScreenHeader from '../lib/components/ScreenHeader.svelte';
  import { routeHash } from '../lib/routing';
  import { clock } from '../lib/stores/clock.svelte';
  import { editDecisions } from '../lib/stores/editDecisions.svelte';
  import { hub } from '../lib/stores/hub.svelte';
  import { QueryResource } from '../lib/stores/query.svelte';

  interface Props {
    windowId: string;
    sessionId: string;
    path: string;
    requestId: string | null;
  }

  const { windowId, sessionId, path, requestId }: Props = $props();

  let acting = $state(false);

  const hostWindow = $derived(hub.windows.find((candidate) => candidate.windowId === windowId));
  const connected = $derived(hub.connection === 'open' && hostWindow !== undefined);
  const diff = new QueryResource<CodeResultFor<'sessionDiff' | 'requestDiff'>>(() =>
    requestId
      ? hub.query({ kind: 'requestDiff', windowId, sessionId, requestId, path })
      : hub.query({ kind: 'sessionDiff', windowId, sessionId, path })
  );
  const file = $derived(diff.value?.file);
  const label = $derived(file?.label ?? path);
  const editState = $derived(
    file ? editDecisions.state(windowId, sessionId, file, clock.now) : null
  );

  $effect(() => {
    if (hub.connection === 'open') void diff.refresh();
  });

  async function decide(decision: 'keep' | 'undo'): Promise<void> {
    acting = true;
    if (await editDecisions.decide(windowId, sessionId, path, decision)) void diff.refresh();
    acting = false;
  }
</script>

<div class="flex flex-1 flex-col">
  <ScreenHeader
    title={baseName(label)}
    subtitle={parentPath(label)}
    back={{ name: 'sessionChanges', windowId, sessionId, requestId }}
  >
    {#snippet actions()}
      {#if file?.folderId && file.relativePath !== null && file.change !== 'deleted'}
        <a
          class="btn btn-square btn-ghost"
          aria-label="Open file"
          href={routeHash({
            name: 'file',
            windowId,
            folderId: file.folderId,
            path: file.relativePath
          })}
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
        <div class="flex items-center gap-2 px-4 pt-3 text-sm">
          <ChangeBadge change={result.file.change} />
          <span class="flex-1"></span>
          {#if editState}<EditStateBadge state={editState} />{/if}
          <DiffStat additions={result.file.additions} deletions={result.file.deletions} />
        </div>
        <BaselineNote baseline={result.file.baseline} />
        <DiffView diff={result.diff} languageId={result.language} path={result.file.path} />
      {/snippet}
    </QueryView>
  </main>

  {#if editState === 'pending' && !requestId}
    <footer class="sticky bottom-(--dock-height) z-20 border-t border-base-300 bg-base-100">
      <div class="flex gap-2 p-3">
        <button
          class="btn flex-1"
          disabled={!connected || acting}
          onclick={() => void decide('undo')}
        >
          Undo
        </button>
        <button
          class="btn flex-1 btn-primary"
          disabled={!connected || acting}
          onclick={() => void decide('keep')}
        >
          Keep
        </button>
      </div>
    </footer>
  {/if}
</div>
