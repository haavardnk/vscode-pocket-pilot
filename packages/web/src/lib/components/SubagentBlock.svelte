<script lang="ts" module>
  import { SvelteMap } from 'svelte/reactivity';

  const expanded = new SvelteMap<string, boolean>();
</script>

<script lang="ts">
  import Bot from '@lucide/svelte/icons/bot';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import CircleX from '@lucide/svelte/icons/circle-x';

  import { getChatContext } from '../chatContext';
  import type { SubagentItem } from '../hub/steps';
  import { markdown } from '../markdown';
  import ToolLine from './ToolLine.svelte';

  interface Props {
    item: SubagentItem;
    windowId: string;
    sessionId: string;
    requestId: string;
  }

  const { item, windowId, sessionId, requestId }: Props = $props();

  const chat = getChatContext();

  const subagent = $derived(item.part.subagent);
  const key = $derived(`${windowId}/${sessionId}/${item.part.callId}`);
  const open = $derived(expanded.get(key) ?? false);
</script>

{#if subagent}
  <details class="group text-sm" {open}>
    <summary
      class="flex cursor-pointer list-none items-center gap-2 text-base-content/70 hover:text-base-content"
      onclick={(event) => {
        event.preventDefault();
        expanded.set(key, !open);
      }}
    >
      {#if item.part.status === 'running'}
        <span class="loading loading-xs shrink-0 loading-spinner" role="img" aria-label="Running"
        ></span>
      {:else if item.part.status === 'failed'}
        <span class="shrink-0 text-error" role="img" aria-label="Failed">
          <CircleX class="size-4" />
        </span>
      {:else}
        <Bot class="size-4 shrink-0" aria-hidden="true" />
      {/if}
      <span class="min-w-0 truncate">
        <span class="font-medium text-base-content">{subagent.agentName ?? 'Subagent'}</span>
        {subagent.description}
      </span>
      <ChevronRight class="size-4 shrink-0 transition-transform group-open:rotate-90" />
    </summary>
    <div class="mt-2 ml-2 flex flex-col gap-2 border-l border-base-300 pl-4">
      {#if subagent.model}<p class="text-xs text-base-content/50">{subagent.model}</p>{/if}
      {#each item.steps as step, index (index)}
        <ToolLine part={step} {windowId} {requestId} />
      {/each}
      {#if subagent.result}
        <div class="markdown text-base-content/80" {@attach markdown(subagent.result, chat)}></div>
      {:else if item.steps.length === 0 && item.part.status !== 'running'}
        <p class="text-base-content/50">No details</p>
      {/if}
    </div>
  </details>
{/if}
