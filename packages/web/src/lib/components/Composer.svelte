<script lang="ts">
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import Bot from '@lucide/svelte/icons/bot';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Cpu from '@lucide/svelte/icons/cpu';
  import type { Delivery } from '@pocket-pilot/protocol';

  interface Props {
    busy: boolean;
    disabled: boolean;
    agentLabel: string;
    modelLabel: string;
    placeholder: string;
    onmode: () => void;
    onmodel: () => void;
    onsend: (text: string, delivery: Delivery | null) => Promise<boolean>;
  }

  const { busy, disabled, agentLabel, modelLabel, placeholder, onmode, onmodel, onsend }: Props =
    $props();

  let text = $state('');
  let delivery = $state<Delivery>('queued');
  let sending = $state(false);

  const ready = $derived(text.trim().length > 0 && !disabled && !sending);

  async function submit(): Promise<void> {
    if (!ready) return;
    sending = true;
    if (await onsend(text.trim(), busy ? delivery : null)) text = '';
    sending = false;
  }

  function keydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    void submit();
  }
</script>

<form
  class="flex flex-col gap-2"
  onsubmit={(event) => {
    event.preventDefault();
    void submit();
  }}
>
  <div class="flex items-center gap-1 overflow-x-auto">
    <button type="button" class="btn gap-1 btn-ghost font-normal btn-xs" onclick={onmode}>
      <Bot class="size-3.5" />{agentLabel}<ChevronDown class="size-3" />
    </button>
    <button type="button" class="btn min-w-0 gap-1 btn-ghost font-normal btn-xs" onclick={onmodel}>
      <Cpu class="size-3.5 shrink-0" /><span class="truncate">{modelLabel}</span><ChevronDown
        class="size-3 shrink-0"
      />
    </button>
    {#if busy}
      <div class="join ml-auto" role="radiogroup" aria-label="Delivery">
        <button
          type="button"
          role="radio"
          aria-checked={delivery === 'queued'}
          class={['btn join-item btn-xs', delivery === 'queued' && 'btn-active']}
          onclick={() => (delivery = 'queued')}
        >
          Queue
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={delivery === 'steering'}
          class={['btn join-item btn-xs', delivery === 'steering' && 'btn-active']}
          onclick={() => (delivery = 'steering')}
        >
          Steer
        </button>
      </div>
    {/if}
  </div>
  <div class="flex items-end gap-2">
    <textarea
      class="textarea field-sizing-content max-h-40 min-h-11 flex-1 resize-none text-base"
      rows="1"
      bind:value={text}
      {placeholder}
      aria-label="Message"
      onkeydown={keydown}></textarea>
    <button class="btn btn-circle btn-primary" type="submit" disabled={!ready} aria-label="Send">
      {#if sending}<span class="loading loading-sm loading-spinner"></span>{:else}<ArrowUp
          class="size-5"
        />{/if}
    </button>
  </div>
</form>
