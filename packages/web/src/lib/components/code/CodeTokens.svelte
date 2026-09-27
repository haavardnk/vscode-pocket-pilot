<script lang="ts">
  import type { Highlighted } from '../../code/highlight';
  import { codeView } from '../../stores/codeView.svelte';

  interface Props {
    text: string;
    highlighted: Highlighted | null;
    line: number;
  }

  const { text, highlighted, line }: Props = $props();

  const tokens = $derived(highlighted?.lines[line]);
</script>

<span
  class={[
    'code-tokens min-w-0 flex-1 pr-3',
    codeView.wrap ? 'break-all whitespace-pre-wrap' : 'whitespace-pre'
  ]}
  >{#if tokens}{#each tokens as [token, style], index (index)}<span
        style={highlighted?.styles[style]}>{token}</span
      >{/each}{:else}{text}{/if}</span
>
