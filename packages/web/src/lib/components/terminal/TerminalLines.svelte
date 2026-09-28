<script lang="ts">
  import type { TerminalLine } from '@pocket-pilot/protocol';

  import { segmentStyle } from '../../terminal/ansi';

  interface Props {
    lines: TerminalLine[];
    alternate: boolean;
  }

  const { lines, alternate }: Props = $props();
</script>

{#each lines as line, index (index)}
  <div class={['min-h-lh', alternate ? 'w-max whitespace-pre' : 'break-all whitespace-pre-wrap']}>
    {#each line as segment, part (part)}<span style={segmentStyle(segment) || undefined}
        >{segment.text}</span
      >{/each}
  </div>
{/each}
