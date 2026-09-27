<script lang="ts">
  import File from '@lucide/svelte/icons/file';
  import Folder from '@lucide/svelte/icons/folder';
  import type { TreeEntry } from '@pocket-pilot/protocol';

  import { childPath } from '../../code/paths';
  import { routeHash } from '../../routing';
  import ChangeBadge from './ChangeBadge.svelte';

  interface Props {
    windowId: string;
    folderId: string;
    path: string;
    entries: TreeEntry[];
    truncated: boolean;
  }

  const { windowId, folderId, path, entries, truncated }: Props = $props();
</script>

{#if entries.length === 0}
  <p class="p-10 text-center text-base-content/70">This folder is empty.</p>
{:else}
  <ul class="list" aria-label="Files">
    {#each entries as entry (entry.name)}
      <li>
        <a
          class={[
            'list-row items-center gap-3 py-2.5 active:bg-base-200',
            entry.ignored && 'opacity-50'
          ]}
          href={routeHash(
            entry.directory
              ? {
                  name: 'folder',
                  windowId,
                  folderId,
                  tab: 'files',
                  path: childPath(path, entry.name)
                }
              : { name: 'file', windowId, folderId, path: childPath(path, entry.name) }
          )}
        >
          {#if entry.directory}
            <Folder class="size-5 text-primary" />
          {:else}
            <File class="size-5 text-base-content/50" />
          {/if}
          <span class="min-w-0 truncate list-col-grow">{entry.name}</span>
          {#if entry.change}<ChangeBadge change={entry.change} />{/if}
        </a>
      </li>
    {/each}
  </ul>
  {#if truncated}
    <p class="p-4 text-center text-sm text-base-content/60">Some entries are not shown.</p>
  {/if}
{/if}
