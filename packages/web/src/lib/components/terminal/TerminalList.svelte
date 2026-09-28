<script lang="ts">
  import Bot from '@lucide/svelte/icons/bot';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import MonitorOff from '@lucide/svelte/icons/monitor-off';
  import SquareTerminal from '@lucide/svelte/icons/square-terminal';

  import { ALL_REPOSITORIES, windowsForRepository } from '../../hub/views';
  import { routeHash } from '../../routing';
  import { hub } from '../../stores/hub.svelte';
  import EmptyState from '../EmptyState.svelte';
  import Loading from '../Loading.svelte';

  const windows = $derived(windowsForRepository(hub.windows, hub.groups, hub.repository));
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
    <section aria-label={window.name}>
      {#if showWindow}
        <h2 class="px-4 pt-4 pb-1 text-xs font-semibold text-base-content/60 uppercase">
          {window.name}
        </h2>
      {/if}
      {#if window.terminals.length === 0}
        <p class="px-4 py-3 text-sm text-base-content/60">No terminals are open in this window.</p>
      {:else}
        <ul class="list">
          {#each window.terminals as terminal (terminal.id)}
            {@const chat = terminal.sessionId
              ? window.sessions.find((session) => session.id === terminal.sessionId)
              : undefined}
            <li>
              <a
                class={[
                  'list-row items-center active:bg-base-200',
                  terminal.exited && 'opacity-60'
                ]}
                href={routeHash({
                  name: 'terminal',
                  windowId: window.windowId,
                  terminalId: terminal.id,
                  executionId: null
                })}
              >
                {#if terminal.agent}
                  <Bot class="size-5 text-primary" />
                {:else}
                  <SquareTerminal class="size-5 text-primary" />
                {/if}
                <div class="flex min-w-0 flex-col gap-0.5 list-col-grow">
                  <span class="truncate font-medium">{terminal.name}</span>
                  {#if terminal.command}
                    <span class="flex min-w-0 items-center gap-1.5 text-xs text-base-content/70">
                      <span
                        class="loading loading-xs shrink-0 loading-spinner"
                        role="img"
                        aria-label="Running"
                      ></span>
                      <span class="truncate font-mono">{terminal.command}</span>
                    </span>
                  {:else if terminal.cwd}
                    <span class="truncate text-xs text-base-content/60">{terminal.cwd}</span>
                  {/if}
                  {#if chat}
                    <span class="truncate text-xs text-base-content/60">{chat.title}</span>
                  {/if}
                </div>
                {#if terminal.exited}
                  <span class="badge badge-ghost badge-sm">Exited</span>
                {:else if !terminal.command && terminal.lastExitCode}
                  <span class="badge badge-soft badge-sm badge-error">
                    Exit {terminal.lastExitCode}
                  </span>
                {/if}
                <ChevronRight class="size-4 text-base-content/40" />
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/each}
{/if}
