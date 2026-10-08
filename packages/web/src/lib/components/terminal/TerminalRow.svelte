<script lang="ts">
  import Bot from '@lucide/svelte/icons/bot';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import SquareTerminal from '@lucide/svelte/icons/square-terminal';
  import type { SessionSummary, TerminalSummary } from '@pocket-pilot/protocol';

  import { routeHash } from '../../routing';

  interface Props {
    windowId: string;
    terminal: TerminalSummary;
    chat: SessionSummary | undefined;
  }

  const { windowId, terminal, chat }: Props = $props();
</script>

<li>
  <a
    class={['list-row items-center active:bg-base-200', terminal.exited && 'opacity-60']}
    href={routeHash({ name: 'terminal', windowId, terminalId: terminal.id, executionId: null })}
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
          <span class="loading loading-xs shrink-0 loading-spinner" role="img" aria-label="Running"
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
