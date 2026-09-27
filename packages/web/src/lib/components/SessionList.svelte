<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';

  import { ALL_REPOSITORIES, type SessionEntry, sessionSections } from '../hub/views';
  import { routeHash } from '../routing';
  import { clock } from '../stores/clock.svelte';
  import { hub } from '../stores/hub.svelte';
  import { ago } from '../time';
  import SessionActionsSheet from './SessionActionsSheet.svelte';
  import StatusBadge from './StatusBadge.svelte';

  let target = $state<SessionEntry | null>(null);
  let showArchived = $state(false);

  const sections = $derived(sessionSections(hub.windows, hub.groups, hub.repository));
  const active = $derived(sections.pinned.length + sections.recent.length);
  const showWindow = $derived(hub.repository === ALL_REPOSITORIES || hub.windows.length > 1);
</script>

{#snippet row(entry: SessionEntry)}
  <li class="list-row items-center gap-0 p-0">
    <a
      class="min-w-0 rounded-box p-4 pe-2 list-col-grow active:bg-base-200"
      href={routeHash({ name: 'session', windowId: entry.windowId, sessionId: entry.session.id })}
    >
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
    </a>
    {#if entry.canOrganize}
      <button
        class="btn me-2 btn-square btn-ghost btn-sm"
        aria-label={`Actions for ${entry.session.title}`}
        onclick={() => (target = entry)}
      >
        <EllipsisVertical class="size-4" />
      </button>
    {/if}
  </li>
{/snippet}

{#snippet heading(label: string)}
  <li class="px-4 pt-4 pb-1 text-xs font-medium text-base-content/60">{label}</li>
{/snippet}

{#if !hub.loaded}
  <div class="flex justify-center p-10">
    <span class="loading loading-spinner text-primary"></span>
  </div>
{:else if hub.windows.length === 0}
  <p class="p-10 text-center text-base-content/70">No VS Code windows are connected.</p>
{:else if active === 0 && sections.archived.length === 0}
  <p class="p-10 text-center text-base-content/70">No chats yet. Start one with the + button.</p>
{:else}
  {#if active === 0}
    <p class="p-10 text-center text-base-content/70">All chats are archived.</p>
  {:else}
    <ul class="list" aria-label="Chats">
      {#if sections.pinned.length > 0}
        {@render heading('Pinned')}
        {#each sections.pinned as entry (`${entry.windowId}:${entry.session.id}`)}
          {@render row(entry)}
        {/each}
        {#if sections.recent.length > 0}{@render heading('Recent')}{/if}
      {/if}
      {#each sections.recent as entry (`${entry.windowId}:${entry.session.id}`)}
        {@render row(entry)}
      {/each}
    </ul>
  {/if}
  {#if sections.archived.length > 0}
    <button
      class="btn m-2 gap-1 btn-ghost btn-sm"
      aria-expanded={showArchived}
      onclick={() => (showArchived = !showArchived)}
    >
      {#if showArchived}<ChevronDown class="size-4" />{:else}<ChevronRight class="size-4" />{/if}
      Archived ({sections.archived.length})
    </button>
    {#if showArchived}
      <ul class="list" aria-label="Archived chats">
        {#each sections.archived as entry (`${entry.windowId}:${entry.session.id}`)}
          {@render row(entry)}
        {/each}
      </ul>
    {/if}
  {/if}
{/if}

<SessionActionsSheet {target} onclose={() => (target = null)} />
