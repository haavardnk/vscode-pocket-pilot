<script lang="ts">
  import { toasts } from '../stores/toasts.svelte';
</script>

<div class="toast toast-center toast-top z-50 w-full max-w-md px-4 pt-safe" aria-live="polite">
  {#each toasts.items as item (item.id)}
    <button
      class={['alert w-full text-left', item.kind === 'error' ? 'alert-error' : 'alert-info']}
      onclick={() => toasts.dismiss(item.id)}
    >
      <span>{item.text}</span>
    </button>
  {/each}
</div>
