<script lang="ts">
  import type { ImageUpload } from '@pocket-pilot/protocol';
  import type { ClassValue } from 'svelte/elements';

  import { dataUrl } from '../photos/prepare';

  interface Props {
    images: ImageUpload[];
    class?: ClassValue;
  }

  const { images, class: className }: Props = $props();
</script>

<ul class={['flex flex-wrap justify-end gap-2', className]} aria-label="Attaching photos">
  {#each images as image, index (index)}
    <li>
      <img
        class="size-20 rounded-box border border-base-content/20 object-cover"
        src={dataUrl(image)}
        alt={`Photo ${index + 1}`}
      />
    </li>
  {/each}
</ul>
