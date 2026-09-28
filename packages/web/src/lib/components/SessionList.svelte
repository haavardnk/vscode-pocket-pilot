<script lang="ts">
  import Archive from '@lucide/svelte/icons/archive';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import MessagesSquare from '@lucide/svelte/icons/messages-square';
  import MonitorOff from '@lucide/svelte/icons/monitor-off';
  import Search from '@lucide/svelte/icons/search';

  import {
    ALL_REPOSITORIES,
    searchSessions,
    type SessionEntry,
    sessionSections
  } from '../hub/views';
  import { clock } from '../stores/clock.svelte';
  import { hub } from '../stores/hub.svelte';
  import Loading from './Loading.svelte';
  import SessionActionsSheet from './SessionActionsSheet.svelte';
  import SessionRow from './SessionRow.svelte';

  let target = $state<SessionEntry | null>(null);
  let showArchived = $state(false);
  let query = $state('');

  const sections = $derived(sessionSections(hub.windows, hub.groups, hub.repository, clock.now));
  const results = $derived(
    query.trim() ? searchSessions(hub.windows, hub.groups, hub.repository, query) : null
  );
  const total = $derived(
    sections.groups.reduce((sum, group) => sum + group.entries.length, sections.archived.length)
  );
  const showWindow = $derived(hub.repository === ALL_REPOSITORIES || hub.windows.length > 1);
  const key = (entry: SessionEntry): string => `${entry.windowId}:${entry.session.id}`;
  const actions = (entry: SessionEntry): void => {
    target = entry;
  };
</script>

{#snippet empty(Icon: typeof Search, title: string, hint: string)}
  <div class="flex flex-col items-center gap-2 px-10 py-16 text-center">
    <span
      class="mb-2 grid size-14 place-items-center rounded-full bg-base-content/10 text-base-content/50"
    >
      <Icon class="size-6" />
    </span>
    <p class="font-medium">{title}</p>
    <p class="text-sm text-base-content/60">{hint}</p>
  </div>
{/snippet}

{#if !hub.loaded}
  <Loading />
{:else if hub.windows.length === 0}
  {@render empty(
    MonitorOff,
    'No VS Code windows are connected.',
    'Open a folder in VS Code with Pocket Pilot running.'
  )}
{:else if total === 0}
  {@render empty(MessagesSquare, 'No chats yet', 'Start one with the + button.')}
{:else}
  <div class="px-4 pt-3 pb-1">
    <label class="input w-full">
      <Search class="size-4 opacity-50" />
      <input
        type="search"
        class="grow"
        placeholder="Search chats"
        aria-label="Search chats"
        bind:value={query}
      />
    </label>
  </div>
  {#if results}
    {#if results.length === 0}
      {@render empty(Search, 'No matching chats', 'Try a different word.')}
    {:else}
      <ul class="list" aria-label="Search results">
        {#each results as entry (key(entry))}
          <SessionRow {entry} {showWindow} onactions={actions} />
        {/each}
      </ul>
    {/if}
  {:else}
    {#if sections.groups.length === 0}
      {@render empty(Archive, 'All chats are archived.', 'Start a new one with the + button.')}
    {/if}
    {#each sections.groups as group (group.id)}
      <section>
        <h2 class="px-4 pt-4 pb-1 text-xs font-semibold text-base-content/60">{group.label}</h2>
        <ul class="list" aria-label={group.label}>
          {#each group.entries as entry (key(entry))}
            <SessionRow {entry} {showWindow} onactions={actions} />
          {/each}
        </ul>
      </section>
    {/each}
    {#if sections.archived.length > 0}
      <section>
        <button
          class="btn mx-2 mt-2 gap-1 btn-ghost text-base-content/60 btn-sm"
          aria-expanded={showArchived}
          onclick={() => (showArchived = !showArchived)}
        >
          {#if showArchived}<ChevronDown class="size-4" />{:else}<ChevronRight
              class="size-4"
            />{/if}
          Archived ({sections.archived.length})
        </button>
        {#if showArchived}
          <ul class="list" aria-label="Archived chats">
            {#each sections.archived as entry (key(entry))}
              <SessionRow {entry} {showWindow} onactions={actions} />
            {/each}
          </ul>
        {/if}
      </section>
    {/if}
  {/if}
  <div class="h-24"></div>
{/if}

<SessionActionsSheet {target} onclose={() => (target = null)} />
