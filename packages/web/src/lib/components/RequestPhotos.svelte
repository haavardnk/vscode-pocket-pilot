<script lang="ts">
  import ImageOff from '@lucide/svelte/icons/image-off';
  import X from '@lucide/svelte/icons/x';
  import type { RequestImage } from '@pocket-pilot/protocol';

  import { dataUrl } from '../photos/prepare';
  import { requestPhoto } from '../photos/requestPhotos';

  interface Props {
    windowId: string;
    sessionId: string;
    requestId: string;
    images: RequestImage[];
  }

  const { windowId, sessionId, requestId, images }: Props = $props();

  let viewing = $state<{ name: string; src: string } | null>(null);
  let dialog = $state<HTMLDialogElement>();

  $effect(() => {
    if (viewing && dialog && !dialog.open) dialog.showModal();
  });
</script>

<ul class="flex flex-wrap justify-end gap-2" aria-label="Photos">
  {#each images as image (image.id)}
    <li>
      {#await requestPhoto(windowId, sessionId, requestId, image.id)}
        <div class="size-20 skeleton rounded-box" aria-label={`Loading ${image.name}`}></div>
      {:then photo}
        <button
          class="block cursor-zoom-in overflow-hidden rounded-box"
          aria-label={`View ${image.name}`}
          onclick={() => {
            viewing = { name: image.name, src: dataUrl(photo) };
          }}
        >
          <img class="size-20 object-cover" src={dataUrl(photo)} alt={image.name} />
        </button>
      {:catch}
        <div
          class="grid size-20 place-items-center rounded-box bg-base-200 text-base-content/50"
          role="img"
          aria-label={`${image.name} is unavailable`}
        >
          <ImageOff class="size-5" />
        </div>
      {/await}
    </li>
  {/each}
</ul>

{#if viewing}
  <dialog
    bind:this={dialog}
    class="modal"
    aria-label={viewing.name}
    onclose={() => (viewing = null)}
  >
    <div class="modal-box w-auto max-w-[95vw] p-2">
      <img class="max-h-[85dvh] w-auto rounded-box" src={viewing.src} alt={viewing.name} />
    </div>
    <form method="dialog" class="modal-backdrop">
      <button aria-label="Close">close</button>
    </form>
    <form method="dialog" class="fixed top-[max(1rem,env(safe-area-inset-top))] right-4">
      <button class="btn btn-circle btn-sm" aria-label="Close photo"><X class="size-4" /></button>
    </form>
  </dialog>
{/if}
