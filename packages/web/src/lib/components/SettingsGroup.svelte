<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    caption?: Snippet;
    children: Snippet;
  }

  const { title, caption, children }: Props = $props();
</script>

<section class="flex flex-col gap-2">
  <h2 class="px-4 text-xs font-semibold tracking-wide text-base-content/60 uppercase">{title}</h2>
  <ul class="list rounded-box bg-base-200" aria-label={title}>
    {@render children()}
  </ul>
  {#if caption}
    <div class="px-4 text-xs leading-relaxed text-base-content/60">{@render caption()}</div>
  {/if}
</section>
