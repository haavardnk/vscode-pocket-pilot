<script lang="ts">
  import History from '@lucide/svelte/icons/history';
  import Pencil from '@lucide/svelte/icons/pencil';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import type { RequestView } from '@pocket-pilot/protocol';

  import { removalText, type RestoreImpact } from '../hub/checkpoints';
  import { hub } from '../stores/hub.svelte';
  import { toasts } from '../stores/toasts.svelte';
  import Sheet from './Sheet.svelte';

  interface Props {
    target: { request: RequestView; impact: RestoreImpact } | null;
    windowId: string;
    sessionId: string;
    disabled: boolean;
    onedit: (request: RequestView) => void;
    onrestored: (request: RequestView) => void;
    onclose: () => void;
  }

  const { target, windowId, sessionId, disabled, onedit, onrestored, onclose }: Props = $props();

  let confirming = $state(false);

  function close(): void {
    confirming = false;
    onclose();
  }

  function edit(request: RequestView): void {
    close();
    onedit(request);
  }

  function restore(request: RequestView): void {
    close();
    hub.command({ kind: 'restoreCheckpoint', windowId, sessionId, requestId: request.id }).then(
      () => onrestored(request),
      (error: unknown) => toasts.error(error)
    );
  }
</script>

<Sheet open={target !== null} title="Message actions" heading={false} onclose={close}>
  {#if target}
    {@const { request, impact } = target}
    {#if confirming}
      <div role="alert" class="alert flex flex-col items-stretch gap-3 alert-soft alert-warning">
        <p class="flex items-center gap-2 font-medium">
          <TriangleAlert class="size-4 shrink-0" />Restore checkpoint?
        </p>
        <p class="text-sm">{removalText(impact)}</p>
        <div class="flex gap-2">
          <button class="btn flex-1 btn-sm btn-warning" {disabled} onclick={() => restore(request)}>
            Restore
          </button>
          <button class="btn flex-1 btn-sm" onclick={close}>Cancel</button>
        </div>
      </div>
    {:else}
      <p class="line-clamp-3 px-2 pb-2 text-sm whitespace-pre-wrap text-base-content/70">
        {request.message}
      </p>
      <ul class="menu w-full p-0">
        <li>
          <button class="flex items-start gap-3 py-3" {disabled} onclick={() => edit(request)}>
            <Pencil class="mt-0.5 size-4 shrink-0" />
            <span class="flex min-w-0 flex-col items-start text-left">
              <span class="font-medium">Edit message</span>
              <span class="text-xs text-base-content/60">
                Change the text, agent, model or approvals and send again.
              </span>
            </span>
          </button>
        </li>
        <li>
          <button
            class="flex items-start gap-3 py-3"
            {disabled}
            onclick={() => (impact.files > 0 ? (confirming = true) : restore(request))}
          >
            <History class="mt-0.5 size-4 shrink-0" />
            <span class="flex min-w-0 flex-col items-start text-left">
              <span class="font-medium">Restore checkpoint</span>
              <span class="text-xs text-base-content/60">{removalText(impact)}</span>
            </span>
          </button>
        </li>
      </ul>
    {/if}
  {/if}
</Sheet>
