<script lang="ts">
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';

  interface Props {
    loading: boolean;
    onrefresh: () => void;
  }

  const { loading, onrefresh }: Props = $props();
</script>

<button
  class="btn btn-square btn-ghost"
  aria-label="Refresh"
  disabled={loading}
  onclick={onrefresh}
>
  <RefreshCw class={['size-5', loading && 'animate-spin']} />
</button>
