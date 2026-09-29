<script lang="ts">
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import Bot from '@lucide/svelte/icons/bot';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Cpu from '@lucide/svelte/icons/cpu';
  import Shield from '@lucide/svelte/icons/shield';
  import ShieldOff from '@lucide/svelte/icons/shield-off';
  import type { Delivery, PermissionLevel } from '@pocket-pilot/protocol';

  import { PERMISSIONS } from '../hub/permissions';

  interface Props {
    busy: boolean;
    disabled: boolean;
    agentLabel: string;
    modelLabel: string;
    permission: PermissionLevel | null;
    placeholder: string;
    onmode: () => void;
    onmodel: () => void;
    onpermission: (() => void) | null;
    onsend: (text: string, delivery: Delivery | null) => Promise<boolean>;
  }

  const {
    busy,
    disabled,
    agentLabel,
    modelLabel,
    permission,
    placeholder,
    onmode,
    onmodel,
    onpermission,
    onsend
  }: Props = $props();

  let text = $state('');
  let delivery = $state<Delivery>('queued');
  let sending = $state(false);
  let input = $state<HTMLTextAreaElement>();

  const ready = $derived(text.trim().length > 0 && !disabled && !sending);

  export function fill(value: string): void {
    text = value;
    input?.focus();
  }

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
    <button
      type="button"
      class="btn min-w-0 shrink gap-1 btn-ghost font-normal btn-xs"
      onclick={onmodel}
    >
      <Cpu class="size-3.5 shrink-0" /><span class="truncate">{modelLabel}</span><ChevronDown
        class="size-3 shrink-0"
      />
    </button>
    {#if permission && onpermission}
      <button
        type="button"
        class={[
          'btn gap-1 btn-ghost font-normal btn-xs',
          permission !== 'default' && 'text-warning'
        ]}
        aria-label={`Approvals: ${PERMISSIONS[permission].label}`}
        onclick={onpermission}
      >
        {#if permission === 'default'}<Shield class="size-3.5" />{:else}<ShieldOff
            class="size-3.5"
          />{/if}{PERMISSIONS[permission].short}<ChevronDown class="size-3" />
      </button>
    {/if}
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
      bind:this={input}
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
