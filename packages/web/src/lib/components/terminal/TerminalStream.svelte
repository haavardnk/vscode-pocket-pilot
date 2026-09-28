<script lang="ts">
  import type { TerminalStream } from '@pocket-pilot/protocol';

  import TerminalLines from './TerminalLines.svelte';

  interface Props {
    stream: TerminalStream;
  }

  const { stream }: Props = $props();
</script>

{#if stream.dropped > 0 && !stream.alternate}
  <p class="text-center text-xs text-base-content/50">
    {stream.dropped} earlier {stream.dropped === 1 ? 'line' : 'lines'} trimmed
  </p>
{/if}
<div
  class={['font-mono text-xs leading-snug', stream.alternate && 'overflow-x-auto']}
  role="log"
  aria-label="Terminal output"
>
  {#if !stream.alternate}
    <TerminalLines lines={stream.lines} alternate={false} />
  {/if}
  <TerminalLines lines={stream.tail} alternate={stream.alternate} />
</div>
