<script lang="ts">
  import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
  import FileDiff from '@lucide/svelte/icons/file-diff';
  import Square from '@lucide/svelte/icons/square';
  import type { SessionStatus } from '@pocket-pilot/protocol';

  import { routeHash } from '../routing';
  import { hub } from '../stores/hub.svelte';
  import { toasts } from '../stores/toasts.svelte';
  import ScreenHeader from './ScreenHeader.svelte';
  import StatusBadge from './StatusBadge.svelte';

  interface Props {
    windowId: string;
    sessionId: string;
    title: string;
    status: SessionStatus;
    place: string | null;
    editedFiles: number;
    busy: boolean;
    disabled: boolean;
    onactions: (() => void) | null;
  }

  const {
    windowId,
    sessionId,
    title,
    status,
    place,
    editedFiles,
    busy,
    disabled,
    onactions
  }: Props = $props();

  let stopping = $state(false);

  async function stop(): Promise<void> {
    stopping = true;
    try {
      await hub.command({ kind: 'stop', windowId, sessionId });
    } catch (error) {
      toasts.error(error);
    }
    stopping = false;
  }
</script>

<ScreenHeader {title} back={{ name: 'chats' }}>
  {#snippet meta()}
    {#if place !== null || status !== 'idle'}
      <div class="flex min-w-0 items-center gap-1.5">
        <StatusBadge {status} />
        {#if place !== null}<p class="truncate text-xs text-base-content/60">{place}</p>{/if}
      </div>
    {/if}
  {/snippet}
  {#snippet actions()}
    {#if editedFiles > 0}
      <a
        class="btn gap-1 btn-ghost btn-sm"
        aria-label={`Changes (${editedFiles})`}
        href={routeHash({ name: 'sessionChanges', windowId, sessionId, requestId: null })}
      >
        <FileDiff class="size-4" />{editedFiles}
      </a>
    {/if}
    {#if busy}
      <button
        class="btn btn-square btn-soft btn-error btn-sm"
        aria-label="Stop"
        disabled={disabled || stopping}
        onclick={() => void stop()}
      >
        <Square class="size-3.5 fill-current" />
      </button>
    {/if}
    {#if onactions}
      <button class="btn btn-square btn-ghost btn-sm" aria-label="Chat actions" onclick={onactions}>
        <EllipsisVertical class="size-4" />
      </button>
    {/if}
  {/snippet}
</ScreenHeader>
