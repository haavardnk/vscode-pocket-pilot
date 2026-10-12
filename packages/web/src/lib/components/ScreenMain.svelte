<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ClassValue } from 'svelte/elements';

  import { getPane } from '../pane';

  interface Props {
    class?: ClassValue;
    children: Snippet;
  }

  const { class: className, children }: Props = $props();

  const pane = getPane();
</script>

<main
  class={['min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain', className]}
  {@attach pane.scroller}
>
  {@render children()}
</main>
