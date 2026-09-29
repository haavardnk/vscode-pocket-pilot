<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import ChevronUp from '@lucide/svelte/icons/chevron-up';
  import Paperclip from '@lucide/svelte/icons/paperclip';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import X from '@lucide/svelte/icons/x';
  import {
    type QueuedRequest,
    type QueueEntry,
    queueEntry,
    queuePlan
  } from '@pocket-pilot/protocol';
  import { onDestroy } from 'svelte';

  import Sheet from './Sheet.svelte';

  interface Props {
    queued: QueuedRequest[];
    disabled: boolean;
    editingId: string | null;
    onchange: (expected: string[], queue: QueueEntry[]) => Promise<boolean>;
    onedit: (item: QueuedRequest) => void;
  }

  const { queued, disabled, editingId, onchange, onedit }: Props = $props();

  let open = $state(true);
  let confirming = $state.raw<{
    base: QueuedRequest[];
    queue: QueueEntry[];
    dropped: number;
    resolve: (saved: boolean) => void;
  } | null>(null);
  let saving = $state(false);

  const locked = $derived(disabled || saving || editingId !== null);

  onDestroy(() => confirming?.resolve(false));

  export function change(base: QueuedRequest[], queue: QueueEntry[]): Promise<boolean> {
    const kept = new Set(queue.map((item) => item.id));
    const rewrite =
      queuePlan(
        base,
        base.map((item) => item.id),
        queue
      ).kind === 'rewrite';
    const dropped = rewrite
      ? base.reduce((sum, item) => sum + (kept.has(item.id) ? item.attachments : 0), 0)
      : 0;
    if (dropped === 0) return commit(base, queue);
    confirming?.resolve(false);
    return new Promise((resolve) => {
      confirming = { base, queue, dropped, resolve };
    });
  }

  async function commit(base: QueuedRequest[], queue: QueueEntry[]): Promise<boolean> {
    saving = true;
    const saved = await onchange(
      base.map((item) => item.id),
      queue
    );
    saving = false;
    return saved;
  }

  async function proceed(): Promise<void> {
    if (!confirming) return;
    const { base, queue, resolve } = confirming;
    const saved = await commit(base, queue);
    if (!saved) return;
    confirming = null;
    resolve(true);
  }

  function move(index: number, by: -1 | 1): void {
    const base = $state.snapshot(queued);
    const queue = base.map(queueEntry);
    const [item] = queue.splice(index, 1);
    if (!item) return;
    queue.splice(index + by, 0, item);
    void change(base, queue);
  }

  function remove(id: string): void {
    const base = $state.snapshot(queued);
    void change(base, base.filter((other) => other.id !== id).map(queueEntry));
  }

  function close(): void {
    confirming?.resolve(false);
    confirming = null;
  }
</script>

<section class="flex flex-col gap-1">
  <button
    class="flex items-center gap-1 self-start text-xs font-medium text-base-content/60"
    aria-expanded={open}
    aria-controls="queued-messages"
    onclick={() => (open = !open)}
  >
    <ChevronRight class={['size-3.5 transition-transform', open && 'rotate-90']} />Queued ({queued.length})
  </button>
  {#if open}
    <ul id="queued-messages" class="flex flex-col gap-1" aria-label="Queued messages">
      {#each queued as item, index (item.id)}
        {@const attached = item.images.length + item.attachments}
        <li
          class={[
            'flex items-center gap-1 rounded-field bg-base-200 py-1 pr-1 pl-3 text-sm',
            item.id === editingId && 'ring-1 ring-primary'
          ]}
          aria-current={item.id === editingId ? 'true' : undefined}
        >
          <span class="badge badge-ghost badge-xs"
            >{item.delivery === 'steering' ? 'Steer' : 'Queued'}</span
          >
          <button
            class="min-w-0 flex-1 truncate px-1 py-0.5 text-left"
            disabled={locked}
            onclick={() => onedit(item)}
          >
            {item.text}
          </button>
          {#if attached > 0}
            <span
              class="flex items-center gap-0.5 text-xs text-base-content/60"
              role="img"
              aria-label={`${attached} attachment${attached === 1 ? '' : 's'}`}
            >
              <Paperclip class="size-3.5" />{attached}
            </span>
          {/if}
          <button
            class="btn btn-square btn-ghost btn-xs"
            aria-label="Move up"
            disabled={locked || queued[index - 1]?.delivery !== item.delivery}
            onclick={() => move(index, -1)}
          >
            <ChevronUp class="size-4" />
          </button>
          <button
            class="btn btn-square btn-ghost btn-xs"
            aria-label="Move down"
            disabled={locked || queued[index + 1]?.delivery !== item.delivery}
            onclick={() => move(index, 1)}
          >
            <ChevronDown class="size-4" />
          </button>
          <button
            class="btn btn-square btn-ghost btn-xs"
            aria-label="Remove"
            disabled={locked}
            onclick={() => remove(item.id)}
          >
            <X class="size-4" />
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<Sheet open={confirming !== null} title="Drop attachments?" onclose={close}>
  {#if confirming}
    <div role="alert" class="alert flex flex-col items-stretch gap-3 alert-soft alert-warning">
      <p class="flex items-center gap-2 font-medium">
        <TriangleAlert class="size-4 shrink-0" />{confirming.dropped} attachment{confirming.dropped ===
        1
          ? ''
          : 's'} will be dropped
      </p>
      <p class="text-sm">
        VS Code cannot edit or reorder queued messages, so they are queued again. Photos, agent,
        model and approvals carry over; other attachments such as files are dropped.
      </p>
      <div class="flex gap-2">
        <button
          class="btn flex-1 btn-sm btn-warning"
          disabled={disabled || saving}
          onclick={() => void proceed()}
        >
          Continue
        </button>
        <button class="btn flex-1 btn-sm" onclick={close}>Cancel</button>
      </div>
    </div>
  {/if}
</Sheet>
