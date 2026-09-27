<script lang="ts">
  import Archive from '@lucide/svelte/icons/archive';
  import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
  import Pin from '@lucide/svelte/icons/pin';
  import PinOff from '@lucide/svelte/icons/pin-off';
  import type { Command } from '@pocket-pilot/protocol';

  import type { SessionEntry } from '../hub/views';
  import { hub } from '../stores/hub.svelte';
  import { toasts } from '../stores/toasts.svelte';
  import Sheet from './Sheet.svelte';

  interface Props {
    target: Pick<SessionEntry, 'windowId' | 'session'> | null;
    onarchived?: () => void;
    onclose: () => void;
  }

  const { target, onarchived, onclose }: Props = $props();

  const disabled = $derived(hub.connection !== 'open');

  function act(command: Command, after?: () => void): void {
    onclose();
    hub.command(command).then(
      () => after?.(),
      (error: unknown) => toasts.error(error)
    );
  }
</script>

<Sheet open={target !== null} title={target?.session.title ?? ''} heading={false} {onclose}>
  {#if target}
    {@const { windowId, session } = target}
    <ul class="menu w-full p-0">
      {#if session.archived}
        <li>
          <button
            class="py-3"
            {disabled}
            onclick={() =>
              act({ kind: 'setArchived', windowId, sessionId: session.id, archived: false })}
          >
            <ArchiveRestore class="size-4" />Unarchive
          </button>
        </li>
      {:else}
        <li>
          <button
            class="py-3"
            {disabled}
            onclick={() =>
              act({ kind: 'setPinned', windowId, sessionId: session.id, pinned: !session.pinned })}
          >
            {#if session.pinned}
              <PinOff class="size-4" />Unpin
            {:else}
              <Pin class="size-4" />Pin
            {/if}
          </button>
        </li>
        <li>
          <button
            class="py-3"
            {disabled}
            onclick={() =>
              act(
                { kind: 'setArchived', windowId, sessionId: session.id, archived: true },
                onarchived
              )}
          >
            <Archive class="size-4" />Archive
          </button>
        </li>
      {/if}
    </ul>
  {/if}
</Sheet>
