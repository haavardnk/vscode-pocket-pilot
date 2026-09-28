<script lang="ts">
  import Archive from '@lucide/svelte/icons/archive';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
  import MessageCircleQuestionMark from '@lucide/svelte/icons/message-circle-question-mark';
  import MessageSquare from '@lucide/svelte/icons/message-square';

  import type { SessionEntry } from '../hub/views';
  import { routeHash } from '../routing';
  import { clock } from '../stores/clock.svelte';
  import { ago, shortAgo } from '../time';

  const {
    entry,
    showWindow,
    onactions
  }: { entry: SessionEntry; showWindow: boolean; onactions: (entry: SessionEntry) => void } =
    $props();

  const labels = { running: 'Running', needsInput: 'Needs input', failed: 'Failed' } as const;

  const session = $derived(entry.session);
  const preview = $derived(session.preview === session.title ? null : session.preview);
</script>

<li class="list-row items-center gap-0 p-0">
  <a
    class="flex min-w-0 items-center gap-3 rounded-box py-3 ps-4 pe-2 list-col-grow active:bg-base-200"
    href={routeHash({ name: 'session', windowId: entry.windowId, sessionId: session.id })}
  >
    {#if session.status === 'idle'}
      <span
        class="grid size-10 shrink-0 place-items-center rounded-full bg-base-content/10 text-base-content/60"
      >
        <MessageSquare class="size-5" />
      </span>
    {:else}
      <span
        role="img"
        aria-label={labels[session.status]}
        class={[
          'grid size-10 shrink-0 place-items-center rounded-full',
          session.status === 'running' && 'bg-info/15 text-info',
          session.status === 'needsInput' && 'bg-warning/20 text-warning',
          session.status === 'failed' && 'bg-error/15 text-error'
        ]}
      >
        {#if session.status === 'running'}
          <span class="loading loading-sm loading-spinner"></span>
        {:else if session.status === 'needsInput'}
          <MessageCircleQuestionMark class="size-5" />
        {:else}
          <CircleAlert class="size-5" />
        {/if}
      </span>
    {/if}
    <span class="min-w-0 flex-1">
      <span class="flex items-baseline gap-2">
        <span class="truncate font-medium">{session.title}</span>
        {#if session.archived}
          <span role="img" aria-label="Archived" class="shrink-0 self-center text-base-content/50">
            <Archive class="size-3.5" />
          </span>
        {/if}
        <time
          class="ms-auto shrink-0 text-xs text-base-content/50"
          datetime={new Date(session.updatedAt).toISOString()}
          title={ago(session.updatedAt, clock.now)}>{shortAgo(session.updatedAt, clock.now)}</time
        >
      </span>
      {#if preview}
        <span class="block truncate text-sm text-base-content/60">{preview}</span>
      {/if}
      {#if showWindow}
        <span class="block truncate text-xs text-base-content/50">{entry.windowName}</span>
      {/if}
    </span>
  </a>
  {#if entry.canOrganize}
    <button
      class="btn me-2 btn-square btn-ghost btn-sm"
      aria-label={`Actions for ${session.title}`}
      onclick={() => onactions(entry)}
    >
      <EllipsisVertical class="size-4" />
    </button>
  {/if}
</li>
