<script lang="ts">
  interface Props {
    additions: number | null;
    deletions: number | null;
  }

  const { additions, deletions }: Props = $props();
</script>

{#if additions !== null && deletions !== null}
  <span class="shrink-0 font-mono text-xs">
    <span class="text-success">+{additions}</span>
    <span class="text-error">−{deletions}</span>
  </span>
{/if}
