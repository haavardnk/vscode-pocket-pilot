<script lang="ts" module>
  import { SvelteMap } from 'svelte/reactivity';

  const expanded = new SvelteMap<string, boolean>();
</script>

<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';

  import { getChatContext } from '../chatContext';
  import type { StepGroup } from '../hub/steps';
  import { markdown } from '../markdown';
  import DiffStat from './code/DiffStat.svelte';
  import EditLink from './EditLink.svelte';
  import ToolLine from './ToolLine.svelte';

  interface Props {
    group: StepGroup;
    index: number;
    windowId: string;
    sessionId: string;
    requestId: string;
  }

  const { group, index, windowId, sessionId, requestId }: Props = $props();

  const chat = getChatContext();

  const key = $derived(`${windowId}/${sessionId}/${requestId}/${index}`);
  const open = $derived(expanded.get(key) ?? group.active);
</script>

<details class="group text-sm" {open}>
  <summary
    class="flex cursor-pointer list-none items-center gap-2 text-base-content/70 hover:text-base-content"
    onclick={(event) => {
      event.preventDefault();
      expanded.set(key, !open);
    }}
  >
    {#if group.active}
      <span class="loading loading-xs shrink-0 loading-spinner" aria-hidden="true"></span>
    {:else}
      <Check class="size-4 shrink-0" aria-hidden="true" />
    {/if}
    <span class="min-w-0 truncate">{group.title}</span>
    <DiffStat additions={group.additions} deletions={group.deletions} />
    <ChevronRight class="size-4 shrink-0 transition-transform group-open:rotate-90" />
  </summary>
  <div class="mt-2 ml-2 flex flex-col gap-2 border-l border-base-300 pl-4">
    {#each group.steps as step, position (position)}
      {#if step.kind === 'thinking'}
        <div class="markdown text-base-content/60" {@attach markdown(step.text, chat)}></div>
      {:else if step.kind === 'tool'}
        <ToolLine part={step} {windowId} {requestId} />
      {:else}
        <EditLink part={step} {windowId} {sessionId} {requestId} />
      {/if}
    {/each}
  </div>
</details>
