<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import ChevronUp from '@lucide/svelte/icons/chevron-up';
  import Paperclip from '@lucide/svelte/icons/paperclip';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import X from '@lucide/svelte/icons/x';
  import { type QueuedRequest, type QueueEntry, queuePlan } from '@pocket-pilot/protocol';

  import Sheet from './Sheet.svelte';

  interface Props {
    queued: QueuedRequest[];
    disabled: boolean;
    onchange: (expected: string[], queue: QueueEntry[]) => Promise<boolean>;
  }

  const { queued, disabled, onchange }: Props = $props();

  let open = $state(true);
  let editing = $state<{ item: QueuedRequest; base: QueuedRequest[] } | null>(null);
  let draft = $state('');
  let confirming = $state<{ base: QueuedRequest[]; queue: QueueEntry[]; dropped: number } | null>(
    null
  );
  let saving = $state(false);

  const entry = ({ id, delivery, text }: QueuedRequest): QueueEntry => ({ id, delivery, text });

  function change(base: QueuedRequest[], queue: QueueEntry[]): void {
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
    if (dropped > 0) {
      confirming = { base, queue, dropped };
      return;
    }
    void commit(base, queue);
  }

  async function commit(base: QueuedRequest[], queue: QueueEntry[]): Promise<void> {
    saving = true;
    const saved = await onchange(
      base.map((item) => item.id),
      queue
    );
    saving = false;
    if (!saved) return;
    editing = null;
    confirming = null;
  }

  function move(index: number, by: -1 | 1): void {
    const base = $state.snapshot(queued);
    const queue = base.map(entry);
    const [item] = queue.splice(index, 1);
    if (!item) return;
    queue.splice(index + by, 0, item);
    change(base, queue);
  }

  function edit(item: QueuedRequest): void {
    editing = { item: $state.snapshot(item), base: $state.snapshot(queued) };
    draft = item.text;
  }

  function save(): void {
    if (!editing) return;
    const { item, base } = editing;
    change(
      base,
      base.map((other) =>
        other.id === item.id ? { ...entry(other), text: draft.trim() } : entry(other)
      )
    );
  }

  function remove(id: string, base: QueuedRequest[]): void {
    change(base, base.filter((other) => other.id !== id).map(entry));
  }

  function close(): void {
    editing = null;
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
        <li class="flex items-center gap-1 rounded-field bg-base-200 py-1 pr-1 pl-3 text-sm">
          <span class="badge badge-ghost badge-xs"
            >{item.delivery === 'steering' ? 'Steer' : 'Queued'}</span
          >
          <button
            class="min-w-0 flex-1 truncate px-1 py-0.5 text-left"
            {disabled}
            onclick={() => edit(item)}
          >
            {item.text}
          </button>
          {#if item.attachments > 0}
            <span
              class="flex items-center gap-0.5 text-xs text-base-content/60"
              role="img"
              aria-label={`${item.attachments} attachment${item.attachments === 1 ? '' : 's'}`}
            >
              <Paperclip class="size-3.5" />{item.attachments}
            </span>
          {/if}
          <button
            class="btn btn-square btn-ghost btn-xs"
            aria-label="Move up"
            disabled={disabled || saving || queued[index - 1]?.delivery !== item.delivery}
            onclick={() => move(index, -1)}
          >
            <ChevronUp class="size-4" />
          </button>
          <button
            class="btn btn-square btn-ghost btn-xs"
            aria-label="Move down"
            disabled={disabled || saving || queued[index + 1]?.delivery !== item.delivery}
            onclick={() => move(index, 1)}
          >
            <ChevronDown class="size-4" />
          </button>
          <button
            class="btn btn-square btn-ghost btn-xs"
            aria-label="Remove"
            disabled={disabled || saving}
            onclick={() => remove(item.id, $state.snapshot(queued))}
          >
            <X class="size-4" />
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<Sheet
  open={editing !== null || confirming !== null}
  title={confirming ? 'Drop attachments?' : 'Queued message'}
  onclose={close}
>
  {#if confirming}
    <div role="alert" class="alert flex flex-col items-stretch gap-3 alert-soft alert-warning">
      <p class="flex items-center gap-2 font-medium">
        <TriangleAlert class="size-4 shrink-0" />{confirming.dropped} attachment{confirming.dropped ===
        1
          ? ''
          : 's'} will be dropped
      </p>
      <p class="text-sm">
        VS Code cannot edit or reorder queued messages, so the queue is sent again as text only.
      </p>
      <div class="flex gap-2">
        <button
          class="btn flex-1 btn-sm btn-warning"
          disabled={disabled || saving}
          onclick={() => {
            if (confirming) void commit(confirming.base, confirming.queue);
          }}
        >
          Continue
        </button>
        <button class="btn flex-1 btn-sm" onclick={() => (confirming = null)}>Cancel</button>
      </div>
    </div>
  {:else if editing}
    <div class="flex flex-col gap-3">
      <textarea
        class="textarea field-sizing-content max-h-60 min-h-24 w-full resize-none text-base"
        aria-label="Queued message"
        bind:value={draft}></textarea>
      <div class="flex gap-2">
        <button
          class="btn flex-1 btn-primary btn-sm"
          disabled={disabled ||
            saving ||
            draft.trim().length === 0 ||
            draft.trim() === editing.item.text}
          onclick={save}
        >
          Save
        </button>
        <button
          class="btn flex-1 btn-soft btn-error btn-sm"
          disabled={disabled || saving}
          onclick={() => {
            if (editing) remove(editing.item.id, editing.base);
          }}
        >
          Remove
        </button>
      </div>
    </div>
  {/if}
</Sheet>
