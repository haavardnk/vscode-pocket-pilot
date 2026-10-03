<script module lang="ts">
  import type { Delivery, ImageUpload } from '@pocket-pilot/protocol';

  export interface Draft {
    text: string;
    images: ImageUpload[];
    delivery: Delivery;
  }
</script>

<script lang="ts">
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import Bot from '@lucide/svelte/icons/bot';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Cpu from '@lucide/svelte/icons/cpu';
  import ImagePlus from '@lucide/svelte/icons/image-plus';
  import Shield from '@lucide/svelte/icons/shield';
  import ShieldOff from '@lucide/svelte/icons/shield-off';
  import X from '@lucide/svelte/icons/x';
  import { MAX_IMAGES, type PermissionLevel } from '@pocket-pilot/protocol';

  import { PERMISSIONS } from '../hub/permissions';
  import { dataUrl, preparePhoto } from '../photos/prepare';
  import { chatView } from '../stores/chatView.svelte';
  import { toasts } from '../stores/toasts.svelte';

  interface Props {
    busy: boolean;
    disabled: boolean;
    agentLabel: string;
    modelLabel: string;
    photos: boolean;
    permission: PermissionLevel | null;
    placeholder: string;
    onmode: () => void;
    onmodel: () => void;
    onpermission: (() => void) | null;
    onsend: (text: string, delivery: Delivery | null, images: ImageUpload[]) => Promise<boolean>;
  }

  const {
    busy,
    disabled,
    agentLabel,
    modelLabel,
    photos,
    permission,
    placeholder,
    onmode,
    onmodel,
    onpermission,
    onsend
  }: Props = $props();

  let text = $state('');
  let images = $state<ImageUpload[]>([]);
  let preparing = $state(0);
  let delivery = $state<Delivery>(chatView.delivery);
  let sending = $state(false);
  let input = $state<HTMLTextAreaElement>();
  let picker = $state<HTMLInputElement>();
  let generation = 0;

  const room = $derived(MAX_IMAGES - images.length - preparing);
  const blocked = $derived(!photos && images.length > 0);
  const ready = $derived(
    text.trim().length > 0 && !disabled && !sending && preparing === 0 && !blocked
  );

  export function fill(draft: Draft, focus = true): void {
    generation += 1;
    text = draft.text;
    images = draft.images;
    delivery = draft.delivery;
    preparing = 0;
    if (focus) input?.focus();
  }

  export function current(): Draft {
    return { text, images: $state.snapshot(images), delivery };
  }

  export async function attach(loading: Promise<ImageUpload>[]): Promise<void> {
    if (loading.length === 0) return;
    const started = generation;
    preparing += loading.length;
    const results = await Promise.allSettled(loading);
    if (started !== generation) return;
    preparing -= loading.length;
    const added = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : []
    );
    images = [...images, ...added].slice(0, MAX_IMAGES);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) toasts.error(failed.reason);
  }

  function pick(files: File[]): void {
    const chosen = files.filter((file) => file.type.startsWith('image/'));
    if (chosen.length > room) toasts.show(`Up to ${MAX_IMAGES} photos per message`);
    void attach(chosen.slice(0, Math.max(0, room)).map(preparePhoto));
  }

  function paste(event: ClipboardEvent): void {
    const files = [...(event.clipboardData?.files ?? [])].filter((file) =>
      file.type.startsWith('image/')
    );
    if (files.length === 0 || !photos) return;
    event.preventDefault();
    pick(files);
  }

  async function submit(): Promise<void> {
    if (!ready) return;
    sending = true;
    const value = text.trim();
    const attached = images;
    if (await onsend(value, busy ? delivery : null, $state.snapshot(attached))) {
      if (text.trim() === value) text = '';
      if (images === attached) images = [];
    }
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
          class={['btn join-item btn-xs', delivery === 'queued' && 'btn-primary']}
          onclick={() => (delivery = 'queued')}
        >
          Queue
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={delivery === 'steering'}
          class={['btn join-item btn-xs', delivery === 'steering' && 'btn-primary']}
          onclick={() => (delivery = 'steering')}
        >
          Steer
        </button>
      </div>
    {/if}
  </div>
  {#if images.length > 0 || preparing > 0}
    <ul class="flex gap-2 overflow-x-auto pt-1.5" aria-label="Attached photos">
      {#each images as image, index (image)}
        <li class="relative shrink-0">
          <img
            class="size-16 rounded-box border border-base-content/20 object-cover"
            src={dataUrl(image)}
            alt={`Photo ${index + 1}`}
          />
          <button
            type="button"
            class="btn absolute -top-1.5 -right-1.5 btn-circle btn-xs"
            aria-label={`Remove photo ${index + 1}`}
            disabled={sending}
            onclick={() => {
              images = images.filter((candidate) => candidate !== image);
            }}
          >
            <X class="size-3" />
          </button>
        </li>
      {/each}
      {#each { length: preparing }, index (index)}
        <li class="size-16 shrink-0 skeleton rounded-box" aria-label="Preparing photo"></li>
      {/each}
    </ul>
  {/if}
  {#if blocked}
    <p class="text-xs text-warning">{modelLabel} cannot read photos. Pick another model.</p>
  {/if}
  <div class="flex items-end gap-2">
    <input
      bind:this={picker}
      class="hidden"
      type="file"
      accept="image/*"
      multiple
      aria-label="Photo files"
      onchange={(event) => {
        pick([...(event.currentTarget.files ?? [])]);
        event.currentTarget.value = '';
      }}
    />
    <button
      type="button"
      class="btn btn-circle btn-ghost"
      aria-label="Add photos"
      disabled={disabled || sending || !photos || room <= 0}
      onclick={() => picker?.click()}
    >
      <ImagePlus class="size-5" />
    </button>
    <textarea
      class="textarea field-sizing-content max-h-40 min-h-11 flex-1 resize-none text-base"
      rows="1"
      bind:value={text}
      bind:this={input}
      {placeholder}
      aria-label="Message"
      onkeydown={keydown}
      onpaste={paste}></textarea>
    <button class="btn btn-circle btn-primary" type="submit" disabled={!ready} aria-label="Send">
      {#if sending}<span class="loading loading-sm loading-spinner"></span>{:else}<ArrowUp
          class="size-5"
        />{/if}
    </button>
  </div>
</form>
