<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import CloudDownload from '@lucide/svelte/icons/cloud-download';
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import GitBranchPlus from '@lucide/svelte/icons/git-branch-plus';
  import Search from '@lucide/svelte/icons/search';
  import type { QueryResultFor } from '@pocket-pilot/protocol';

  import { branchSections, type BranchTarget, remoteLabel } from '../lib/branches';
  import NewBranchSheet from '../lib/components/code/NewBranchSheet.svelte';
  import SwitchBranchSheet from '../lib/components/code/SwitchBranchSheet.svelte';
  import EmptyState from '../lib/components/EmptyState.svelte';
  import QueryView from '../lib/components/QueryView.svelte';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import ScreenHeader from '../lib/components/ScreenHeader.svelte';
  import { shortCommit } from '../lib/git';
  import { activeChats } from '../lib/hub/views';
  import { hub } from '../lib/stores/hub.svelte';
  import { QueryResource } from '../lib/stores/query.svelte';
  import { toasts } from '../lib/stores/toasts.svelte';

  interface Props {
    windowId: string;
    folderId: string;
  }

  const { windowId, folderId }: Props = $props();

  let search = $state('');
  let confirming = $state<BranchTarget | null>(null);
  let switching = $state<string | null>(null);
  let creating = $state(false);
  let busy = $state(false);
  let fetching = $state(false);

  const hostWindow = $derived(hub.windows.find((candidate) => candidate.windowId === windowId));
  const folder = $derived(hostWindow?.folders.find((candidate) => candidate.id === folderId));
  const changed = $derived(folder?.git?.changed ?? 0);
  const active = $derived(hostWindow ? activeChats(hostWindow) : 0);
  const idle = $derived(switching === null && !busy && hub.connection === 'open');
  const branches = new QueryResource<QueryResultFor<'branches'>>(() =>
    hub.query({ kind: 'branches', windowId, folderId })
  );

  $effect(() => {
    if (hub.connection === 'open') void branches.refresh();
  });

  function choose(target: BranchTarget): void {
    if (changed > 0 || active > 0) confirming = target;
    else void checkout(target, false);
  }

  async function checkout(target: BranchTarget, stash: boolean): Promise<void> {
    confirming = null;
    switching = target.remote ? `${target.remote}/${target.name}` : target.name;
    try {
      await hub.command({ kind: 'checkoutBranch', windowId, folderId, ...target, stash });
      toasts.show(`Switched to ${target.name}`);
    } catch (error) {
      toasts.error(error);
    } finally {
      switching = null;
    }
    await branches.refresh();
  }

  async function create(name: string): Promise<void> {
    busy = true;
    try {
      await hub.command({ kind: 'createBranch', windowId, folderId, name });
      creating = false;
      toasts.show(`Switched to new branch ${name}`);
    } catch (error) {
      toasts.error(error);
    } finally {
      busy = false;
    }
    await branches.refresh();
  }

  async function fetchRemotes(): Promise<void> {
    fetching = true;
    try {
      await hub.command({ kind: 'fetchBranches', windowId, folderId });
    } catch (error) {
      toasts.error(error);
    } finally {
      fetching = false;
    }
    await branches.refresh();
  }
</script>

<div class="flex flex-1 flex-col">
  <ScreenHeader
    title="Branches"
    subtitle={folder?.name}
    back={{ name: 'folder', windowId, folderId, tab: 'files', path: '' }}
  >
    {#snippet actions()}
      <button
        class="btn btn-square btn-ghost"
        aria-label="New branch"
        disabled={!idle || !folder?.git}
        onclick={() => (creating = true)}
      >
        <GitBranchPlus class="size-5" />
      </button>
      <button
        class="btn btn-square btn-ghost"
        aria-label="Fetch from remotes"
        disabled={fetching || hub.connection !== 'open'}
        onclick={() => void fetchRemotes()}
      >
        {#if fetching}
          <span class="loading loading-sm loading-spinner"></span>
        {:else}
          <CloudDownload class="size-5" />
        {/if}
      </button>
      <RefreshButton loading={branches.loading} onrefresh={() => void branches.refresh()} />
    {/snippet}
  </ScreenHeader>

  <main class="flex-1">
    {#if hub.loaded && !folder}
      <p class="p-10 text-center text-base-content/70">This folder is no longer open.</p>
    {:else}
      <QueryView resource={branches}>
        {#snippet children(result)}
          {@const sections = branchSections(result, search)}
          <div class="px-4 pt-3 pb-1">
            <label class="input w-full">
              <Search class="size-4 opacity-50" />
              <input
                type="search"
                class="grow"
                placeholder="Search branches"
                aria-label="Search branches"
                autocapitalize="off"
                bind:value={search}
              />
            </label>
          </div>
          {#if sections.local.length > 0}
            <section>
              <h2 class="px-4 pt-4 pb-1 text-xs font-semibold text-base-content/60 uppercase">
                Local
              </h2>
              <ul class="list" aria-label="Local branches">
                {#each sections.local as branch (branch.name)}
                  {@const current = branch.name === result.current}
                  <li>
                    <button
                      class={[
                        'list-row w-full items-center text-left active:bg-base-200',
                        current ? 'disabled:opacity-100' : 'disabled:opacity-60'
                      ]}
                      aria-label={branch.name}
                      aria-current={current ? 'true' : undefined}
                      disabled={current || branch.worktree !== null || !idle}
                      onclick={() => choose({ name: branch.name, remote: null })}
                    >
                      {#if switching === branch.name}
                        <span class="loading loading-sm loading-spinner text-primary"></span>
                      {:else if current}
                        <Check class="size-5 text-primary" />
                      {:else}
                        <GitBranch class="size-5 text-base-content/50" />
                      {/if}
                      <span class="flex min-w-0 flex-col list-col-grow">
                        <span class={['truncate font-mono text-sm', current && 'font-semibold']}>
                          {branch.name}
                        </span>
                        {#if branch.worktree}
                          <span class="truncate text-xs text-base-content/60">
                            Checked out in {branch.worktree}
                          </span>
                        {:else if branch.commit}
                          <span class="text-xs text-base-content/60">
                            {shortCommit(branch.commit)}
                          </span>
                        {/if}
                      </span>
                    </button>
                  </li>
                {/each}
              </ul>
            </section>
          {/if}
          {#if sections.remote.length > 0}
            <section>
              <h2 class="px-4 pt-4 pb-1 text-xs font-semibold text-base-content/60 uppercase">
                Remote
              </h2>
              <ul class="list" aria-label="Remote branches">
                {#each sections.remote as branch (remoteLabel(branch))}
                  {@const label = remoteLabel(branch)}
                  <li>
                    <button
                      class="list-row w-full items-center text-left active:bg-base-200 disabled:opacity-60"
                      aria-label={label}
                      disabled={!idle}
                      onclick={() => choose({ name: branch.name, remote: branch.remote })}
                    >
                      {#if switching === label}
                        <span class="loading loading-sm loading-spinner text-primary"></span>
                      {:else}
                        <CloudDownload class="size-5 text-base-content/50" />
                      {/if}
                      <span class="flex min-w-0 flex-col list-col-grow">
                        <span class="truncate font-mono text-sm">{label}</span>
                        <span class="text-xs text-base-content/60">
                          Creates local branch {branch.name}
                        </span>
                      </span>
                    </button>
                  </li>
                {/each}
              </ul>
            </section>
          {/if}
          {#if sections.local.length + sections.remote.length === 0}
            {#if search.trim()}
              <EmptyState icon={Search} title="No matching branches" hint="Try a different word." />
            {:else}
              <EmptyState
                icon={GitBranch}
                title="No branches yet"
                hint="Make the first commit in VS Code, then branch from here."
              />
            {/if}
          {/if}
        {/snippet}
      </QueryView>
    {/if}
  </main>
</div>

<SwitchBranchSheet
  open={confirming !== null}
  branch={confirming?.name ?? ''}
  {changed}
  {active}
  onswitch={(stash) => confirming && void checkout(confirming, stash)}
  onclose={() => (confirming = null)}
/>

<NewBranchSheet
  open={creating}
  from={folder?.git?.branch ?? null}
  {busy}
  oncreate={(name) => void create(name)}
  onclose={() => (creating = false)}
/>
