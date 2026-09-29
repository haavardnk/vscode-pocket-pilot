<script lang="ts">
  import type { ImageUpload } from '@pocket-pilot/protocol';

  import { dataUrl } from '../photos/prepare';

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
    <div class="flex flex-wrap justify-end gap-2">
      {#each images as image, index (index)}
        <img
          class="size-20 rounded-box object-cover"
          src={dataUrl(image)}
          alt={`Photo ${index + 1}`}
        />
      {/each}
    </div>
  {/if}
</div>
