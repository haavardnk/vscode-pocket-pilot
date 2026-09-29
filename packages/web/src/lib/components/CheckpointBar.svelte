<script lang="ts">
  import History from '@lucide/svelte/icons/history';
  import Redo2 from '@lucide/svelte/icons/redo-2';

  import { hub } from '../stores/hub.svelte';
  import { toasts } from '../stores/toasts.svelte';

  interface Props {
    windowId: string;
    sessionId: string;
    disabled: boolean;
  }

  const { windowId, sessionId, disabled }: Props = $props();

  let redoing = $state(false);

  async function redo(): Promise<void> {
    redoing = true;
    try {
      await hub.command({ kind: 'redoCheckpoint', windowId, sessionId });
    } catch (error) {
      toasts.error(error);
    }
    redoing = false;
  }
</script>

<div class="flex items-center gap-2 text-sm text-base-content/60">
  <History class="size-4 shrink-0" />
  <span class="flex-1">Checkpoint restored</span>
  <button
    class="btn gap-1 btn-ghost btn-xs"
    disabled={disabled || redoing}
    onclick={() => void redo()}
  >
    <Redo2 class="size-3.5" />Redo
  </button>
</div>
