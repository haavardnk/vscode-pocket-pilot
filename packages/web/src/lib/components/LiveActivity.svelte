<script lang="ts">
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import CircleX from '@lucide/svelte/icons/circle-x';
  import type { LiveEvent } from '@pocket-pilot/protocol';

  const LIMIT = 6;

  const { events }: { events: LiveEvent[] } = $props();

  const recent = $derived(events.slice(-LIMIT));
</script>

<ul class="flex flex-col gap-1 text-sm" aria-label="Live activity">
  {#each recent as event, index (`${event.at}:${index}`)}
    <li class="flex items-start gap-2 text-base-content/70">
      {#if event.kind === 'tool'}
        {#if event.state === 'running'}
          <span class="loading mt-0.5 loading-xs shrink-0 loading-spinner"></span>
        {:else if event.state === 'succeeded'}
          <CircleCheck class="mt-0.5 size-4 shrink-0 text-success" />
        {:else}
          <CircleX class="mt-0.5 size-4 shrink-0 text-error" />
        {/if}
        <span class="truncate font-mono text-xs leading-5">{event.name}</span>
      {:else}
        <span class="line-clamp-3 whitespace-pre-wrap">{event.text}</span>
      {/if}
    </li>
  {/each}
  <li class="flex items-center gap-2 text-base-content/50">
    <span class="loading loading-xs loading-dots"></span>
    Working
  </li>
</ul>
