<script lang="ts">
  import type { Baseline } from '@pocket-pilot/protocol';

  const { baseline }: { baseline: Baseline } = $props();
</script>

{#if baseline === 'commit'}
  <p class="px-4 pt-3 text-xs text-base-content/60">
    Compared with the last commit until VS Code saves this chat's edit snapshot, about once a
    minute.
  </p>
{:else if baseline === 'none'}
  <p class="px-4 pt-3 text-xs text-base-content/60">
    No earlier version is available yet. VS Code saves this chat's edit snapshot about once a
    minute.
  </p>
{/if}
