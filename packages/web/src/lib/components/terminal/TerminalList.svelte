<script lang="ts">
  import MonitorOff from '@lucide/svelte/icons/monitor-off';

  import { ALL_REPOSITORIES, homeTerminals, windowsForRepository } from '../../hub/views';
  import { hub } from '../../stores/hub.svelte';
  import EmptyState from '../EmptyState.svelte';
  import Loading from '../Loading.svelte';
  import TerminalRow from './TerminalRow.svelte';

  const windows = $derived(windowsForRepository(hub.windows, hub.groups, hub.repository));
  const home = $derived(homeTerminals(hub.windows));
  const showWindow = $derived(hub.repository === ALL_REPOSITORIES || windows.length > 1);
</script>

{#if !hub.loaded}
  <Loading />
{:else if windows.length === 0}
  <EmptyState
    icon={MonitorOff}
    title="No VS Code windows are connected."
    hint="Open a folder in VS Code with Pocket Pilot running."
  />
{:else}
  {#each windows as window (window.windowId)}
    {@const terminals = window.terminals.filter((terminal) => !terminal.home)}
    <section aria-label={window.name}>
      {#if showWindow}
        <h2 class="px-4 pt-4 pb-1 text-xs font-semibold text-base-content/60 uppercase">
          {window.name}
        </h2>
      {/if}
      {#if terminals.length === 0}
        <p class="px-4 py-3 text-sm text-base-content/60">No terminals are open in this window.</p>
      {:else}
        <ul class="list">
          {#each terminals as terminal (terminal.id)}
            <TerminalRow
              windowId={window.windowId}
              {terminal}
              chat={terminal.sessionId
                ? window.sessions.find((session) => session.id === terminal.sessionId)
                : undefined}
            />
          {/each}
        </ul>
      {/if}
    </section>
  {/each}
  {#if home.length > 0}
    <section aria-label="Home folder">
      <h2 class="px-4 pt-4 pb-1 text-xs font-semibold text-base-content/60 uppercase">
        Home folder
      </h2>
      <ul class="list">
        {#each home as { windowId, terminal } (terminal.id)}
          <TerminalRow {windowId} {terminal} chat={undefined} />
        {/each}
      </ul>
    </section>
  {/if}
{/if}
