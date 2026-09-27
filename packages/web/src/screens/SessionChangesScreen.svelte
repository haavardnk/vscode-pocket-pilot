<script lang="ts">
  import type { SessionChange } from '@pocket-pilot/protocol';

  import { baseName, parentPath } from '../lib/code/paths';
  import BaselineNote from '../lib/components/code/BaselineNote.svelte';
  import ChangeBadge from '../lib/components/code/ChangeBadge.svelte';
  import DiffStat from '../lib/components/code/DiffStat.svelte';
  import EditStateBadge from '../lib/components/code/EditStateBadge.svelte';
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
  }

  const { windowId, sessionId }: Props = $props();

  let acting = $state(false);

  const hostWindow = $derived(hub.windows.find((candidate) => candidate.windowId === windowId));
  const summary = $derived(hostWindow?.sessions.find((candidate) => candidate.id === sessionId));
  const updatedAt = $derived(summary?.updatedAt);
  const connected = $derived(hub.connection === 'open' && hostWindow !== undefined);
  const changes = new QueryResource(() =>
    hub.query({ kind: 'sessionChanges', windowId, sessionId })
  );
  const pending = $derived(
    (changes.value?.files ?? []).filter((file) => stateOf(file) === 'pending').length
  );
  const baseline = $derived(
    changes.value?.files.find((file) => file.baseline !== 'session')?.baseline ?? 'session'
  );

  $effect(() => {
    void updatedAt;
    if (hub.connection === 'open') void changes.refresh();
  });

  function stateOf(file: SessionChange): SessionChange['state'] {
    return editDecisions.state(windowId, sessionId, file, clock.now);
  }

  async function decideAll(decision: 'keep' | 'undo'): Promise<void> {
    if (decision === 'undo' && !confirm('Undo every pending change from this chat?')) return;
    acting = true;
    if (await editDecisions.decide(windowId, sessionId, null, decision)) void changes.refresh();
    acting = false;
  }
</script>

<div class="flex flex-1 flex-col">
  <ScreenHeader
    title="Changes"
    subtitle={summary?.title}
    back={{ name: 'session', windowId, sessionId }}
  >
    {#snippet actions()}
      <RefreshButton loading={changes.loading} onrefresh={() => void changes.refresh()} />
    {/snippet}
  </ScreenHeader>

  <main class="flex-1">
    <QueryView resource={changes}>
      {#snippet children(result)}
        <BaselineNote {baseline} />
        {#if result.files.length === 0}
          <p class="p-10 text-center text-base-content/70">This chat has not changed any files.</p>
        {:else}
          <ul class="list" aria-label="Changed files">
            {#each result.files as file (file.path)}
              <li>
                <a
                  class="list-row items-center gap-3 py-2.5 active:bg-base-200"
                  href={routeHash({ name: 'sessionDiff', windowId, sessionId, path: file.path })}
                >
                  <ChangeBadge change={file.change} />
                  <div class="min-w-0 list-col-grow">
                    <p class="truncate">{baseName(file.label)}</p>
                    <p class="truncate text-xs text-base-content/60">{parentPath(file.label)}</p>
                  </div>
                  <EditStateBadge state={stateOf(file)} />
                  <DiffStat additions={file.additions} deletions={file.deletions} />
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      {/snippet}
    </QueryView>
  </main>

  {#if pending > 0}
    <footer class="sticky bottom-(--dock-height) z-20 border-t border-base-300 bg-base-100">
      <div class="flex gap-2 p-3">
        <button
          class="btn flex-1"
          disabled={!connected || acting}
          onclick={() => void decideAll('undo')}
        >
          Undo all
        </button>
        <button
          class="btn flex-1 btn-primary"
          disabled={!connected || acting}
          onclick={() => void decideAll('keep')}
        >
          Keep all ({pending})
        </button>
      </div>
    </footer>
  {/if}
</div>
