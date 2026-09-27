<script lang="ts">
  import type { EditState } from '@pocket-pilot/protocol';

  const { state }: { state: EditState } = $props();
</script>

{#if state === 'kept'}
  <span class="badge shrink-0 badge-soft badge-sm badge-success">Kept</span>
{:else if state === 'undone'}
  <span class="badge shrink-0 badge-ghost badge-sm">Undone</span>
{/if}
