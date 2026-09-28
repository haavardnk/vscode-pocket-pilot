<script lang="ts">
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import CircleX from '@lucide/svelte/icons/circle-x';
  import SquareTerminal from '@lucide/svelte/icons/square-terminal';
  import type { ResponsePart } from '@pocket-pilot/protocol';

  import { markdown } from '../markdown';
  import { routeHash } from '../routing';

  interface Props {
    part: Extract<ResponsePart, { kind: 'tool' }>;
    windowId: string;
  }

  const { part, windowId }: Props = $props();
</script>

{#snippet line()}
  {#if part.status === 'running'}
    <span class="loading mt-0.5 loading-xs shrink-0 loading-spinner" role="img" aria-label="Running"
    ></span>
  {:else if part.status === 'failed'}
    <span class="mt-0.5 shrink-0 text-error" role="img" aria-label="Failed">
      <CircleX class="size-4" />
    </span>
  {:else}
    <span class="mt-0.5 shrink-0 text-success" role="img" aria-label="Done">
      <CircleCheck class="size-4" />
    </span>
  {/if}
  <div class="markdown min-w-0 flex-1" {@attach markdown(part.message || part.toolId)}></div>
  {#if part.awaitingConfirmation}<span class="badge shrink-0 badge-sm badge-warning">Waiting</span
    >{/if}
{/snippet}

{#if part.detail}
  <details class="text-sm text-base-content/70">
    <summary class="flex cursor-pointer list-none items-start gap-2">{@render line()}</summary>
    <pre
      class="mt-1 ml-6 max-h-48 overflow-auto rounded-field bg-base-200 px-2 py-1 text-xs whitespace-pre-wrap"><code
        >{part.detail}</code
      ></pre>
  </details>
{:else}
  <div class="flex items-start gap-2 text-sm text-base-content/70">{@render line()}</div>
{/if}
{#if part.terminal}
  <a
    class="-mt-1 ml-6 flex items-center gap-2 self-start text-sm text-base-content/70 hover:text-primary"
    href={routeHash({
      name: 'terminal',
      windowId,
      terminalId: part.terminal.terminalId,
      executionId: part.terminal.executionId
    })}
  >
    <SquareTerminal class="size-4 shrink-0" />Open terminal
  </a>
{/if}
