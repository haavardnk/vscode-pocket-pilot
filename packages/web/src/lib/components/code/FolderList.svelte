<script lang="ts">
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import FolderGit from '@lucide/svelte/icons/folder-git-2';

  import { ALL_REPOSITORIES, windowsForRepository } from '../../hub/views';
  import { routeHash } from '../../routing';
  import { hub } from '../../stores/hub.svelte';
  import Loading from '../Loading.svelte';
  import GitSummary from './GitSummary.svelte';

  const windows = $derived(windowsForRepository(hub.windows, hub.groups, hub.repository));
  const showWindow = $derived(hub.repository === ALL_REPOSITORIES || windows.length > 1);
</script>

{#if !hub.loaded}
  <Loading />
{:else if windows.length === 0}
  <p class="p-10 text-center text-base-content/70">No VS Code windows are connected.</p>
{:else}
  {#each windows as window (window.windowId)}
    <section aria-label={window.name}>
      {#if showWindow && !(window.folders.length === 1 && window.folders[0]?.name === window.name)}
        <h2 class="px-4 pt-4 pb-1 text-xs font-semibold text-base-content/60 uppercase">
          {window.name}
        </h2>
      {/if}
      {#if window.folders.length === 0}
        <p class="px-4 py-3 text-sm text-base-content/60">No folder is open in this window.</p>
      {:else}
        <ul class="list">
          {#each window.folders as folder (folder.id)}
            <li>
              <a
                class="list-row items-center active:bg-base-200"
                aria-label={folder.name}
                aria-describedby={folder.git ? `git-${window.windowId}-${folder.id}` : undefined}
                href={routeHash({
                  name: 'folder',
                  windowId: window.windowId,
                  folderId: folder.id,
                  tab: 'files',
                  path: ''
                })}
              >
                <FolderGit class="size-5 text-primary" />
                <span class="flex min-w-0 flex-col list-col-grow">
                  <span class="truncate font-medium">{folder.name}</span>
                  {#if folder.git}
                    <GitSummary git={folder.git} id={`git-${window.windowId}-${folder.id}`} />
                  {/if}
                </span>
                <ChevronRight class="size-4 text-base-content/40" />
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/each}
{/if}
