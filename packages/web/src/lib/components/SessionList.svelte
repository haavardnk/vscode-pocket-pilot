<script lang="ts">
  import { ALL_REPOSITORIES, sessionEntries } from '../hub/views';
  import { routeHash } from '../routing';
  import { clock } from '../stores/clock.svelte';
  import { hub } from '../stores/hub.svelte';
  import { ago } from '../time';
  import StatusBadge from './StatusBadge.svelte';

  const entries = $derived(sessionEntries(hub.windows, hub.groups, hub.repository));
  const showWindow = $derived(hub.repository === ALL_REPOSITORIES || hub.windows.length > 1);
</script>

{#if !hub.loaded}
  <div class="flex justify-center p-10">
    <span class="loading loading-spinner text-primary"></span>
  </div>
{:else if hub.windows.length === 0}
  <p class="p-10 text-center text-base-content/70">No VS Code windows are connected.</p>
{:else if entries.length === 0}
  <p class="p-10 text-center text-base-content/70">No chats yet. Start one with the + button.</p>
{:else}
  <ul class="list">
    {#each entries as entry (`${entry.windowId}:${entry.session.id}`)}
      <li>
        <a
          class="list-row items-start active:bg-base-200"
          href={routeHash({
            name: 'session',
            windowId: entry.windowId,
            sessionId: entry.session.id
          })}
        >
          <div class="min-w-0 list-col-grow">
            <div class="flex items-center gap-2">
              <span class="truncate font-medium">{entry.session.title}</span>
              <StatusBadge status={entry.session.status} />
            </div>
            {#if entry.session.preview}
              <p class="truncate text-sm text-base-content/70">{entry.session.preview}</p>
            {/if}
            <p class="text-xs text-base-content/50">
              {ago(entry.session.updatedAt, clock.now)}{showWindow ? ` · ${entry.windowName}` : ''}
            </p>
          </div>
        </a>
      </li>
    {/each}
  </ul>
{/if}
