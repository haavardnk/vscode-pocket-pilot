<script lang="ts">
  import type { ImageUpload } from '@pocket-pilot/protocol';

  import PendingPhotos from './PendingPhotos.svelte';

  interface Props {
    text: string;
    images: ImageUpload[];
  }

  const { text, images }: Props = $props();
</script>

<div class="flex flex-col items-end gap-2 opacity-60" aria-label="Sending">
  <div class="chat-end chat w-full">
    <div class="chat-bubble chat-bubble-primary whitespace-pre-wrap">{text}</div>
  </div>
  {#if images.length > 0}
    <PendingPhotos {images} />
  {/if}
</div>
