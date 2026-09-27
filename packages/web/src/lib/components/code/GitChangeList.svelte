<script lang="ts">
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import type { CodeResultFor } from '@pocket-pilot/protocol';

  import { baseName, parentPath } from '../../code/paths';
  import { routeHash } from '../../routing';
  import ChangeBadge from './ChangeBadge.svelte';
  import DiffStat from './DiffStat.svelte';

  interface Props {
    windowId: string;
    folderId: string;
    result: CodeResultFor<'gitChanges'>;
  }

  const { windowId, folderId, result }: Props = $props();
</script>

{#if !result.repository}
  <p class="p-10 text-center text-base-content/70">This folder is not in a Git repository.</p>
{:else}
  {#if result.branch}
    <p class="flex items-center gap-2 px-4 pt-3 pb-1 text-sm text-base-content/70">
      <GitBranch class="size-4" /><span class="truncate font-mono">{result.branch}</span>
    </p>
  {/if}
  {#if result.files.length === 0}
    <p class="p-10 text-center text-base-content/70">No uncommitted changes.</p>
  {:else}
    <ul class="list" aria-label="Changed files">
      {#each result.files as file (file.path)}
        <li>
          <a
            class="list-row items-center gap-3 py-2.5 active:bg-base-200"
            href={routeHash({ name: 'gitDiff', windowId, folderId, path: file.path })}
          >
            <ChangeBadge change={file.change} />
            <div class="min-w-0 list-col-grow">
              <p class="truncate">{baseName(file.path)}</p>
              <p class="truncate text-xs text-base-content/60">
                {file.previousPath ? `from ${file.previousPath}` : parentPath(file.path)}
              </p>
            </div>
            <DiffStat additions={file.additions} deletions={file.deletions} />
          </a>
        </li>
      {/each}
    </ul>
    {#if result.truncated}
      <p class="p-4 text-center text-sm text-base-content/60">Some changes are not shown.</p>
    {/if}
  {/if}
{/if}
