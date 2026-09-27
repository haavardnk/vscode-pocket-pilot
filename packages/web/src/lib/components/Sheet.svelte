<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    open: boolean;
    title: string;
    heading?: boolean;
    onclose: () => void;
    children: Snippet;
  }

  const { open, title, heading = true, onclose, children }: Props = $props();

  let dialog = $state<HTMLDialogElement>();

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });
</script>

<dialog bind:this={dialog} class="modal modal-bottom" aria-label={title} {onclose}>
  <div
    class="modal-box flex max-h-[85dvh] flex-col gap-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
  >
    {#if heading}
      <h2 class="text-lg font-semibold">{title}</h2>
    {/if}
    <div class="-mx-2 min-h-0 overflow-y-auto px-2">
      {@render children()}
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button aria-label="Close">close</button>
  </form>
</dialog>
