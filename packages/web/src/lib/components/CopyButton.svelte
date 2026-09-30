<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import Copy from '@lucide/svelte/icons/copy';
  import type { ClassValue } from 'svelte/elements';

  import { toasts } from '../stores/toasts.svelte';

  interface Props {
    text: string;
    label: string;
    class?: ClassValue;
  }

  const { text, label, class: className }: Props = $props();

  const COPIED_MS = 1500;

  let copied = $state(false);

  $effect(() => {
    if (!copied) return;
    const timer = setTimeout(() => (copied = false), COPIED_MS);
    return () => clearTimeout(timer);
  });

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      toasts.show('Could not copy to the clipboard', 'error');
    }
  }
</script>

<button
  class={['btn btn-square btn-ghost btn-xs', className]}
  aria-label={copied ? 'Copied' : label}
  onclick={() => void copy()}
>
  {#if copied}<Check class="size-4 text-success" />{:else}<Copy class="size-4" />{/if}
</button>
