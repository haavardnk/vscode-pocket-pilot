<script lang="ts">
  import Pencil from '@lucide/svelte/icons/pencil';

  import { removalText, type RestoreImpact } from '../hub/checkpoints';

  interface Props {
    impact: RestoreImpact | null;
    oncancel: () => void;
  }

  const { impact, oncancel }: Props = $props();
</script>

<section class="flex items-start gap-2" aria-label="Editing message">
  <Pencil class="mt-0.5 size-4 shrink-0 text-primary" />
  <div class="min-w-0 flex-1">
    <p class="text-sm font-medium">Editing message</p>
    {#if impact}
      <p class="text-xs text-base-content/60">Sending {removalText(impact).toLowerCase()}</p>
    {/if}
  </div>
  <button class="btn btn-ghost btn-xs" onclick={oncancel}>Cancel</button>
</section>
