<script lang="ts">
  import { highlight, type Highlighted } from '../../code/highlight';
  import { codeView } from '../../stores/codeView.svelte';
  import CodeTokens from './CodeTokens.svelte';

  interface Props {
    text: string;
    languageId: string | null;
    path: string;
  }

  const { text, languageId, path }: Props = $props();

  let highlighted = $state.raw<Highlighted | null>(null);

  const lines = $derived(text.replace(/\r?\n$/, '').split(/\r?\n/));
  const gutter = $derived(`${String(lines.length).length + 2}ch`);

  $effect(() => {
    let current = true;
    highlighted = null;
    void highlight(text, languageId, path).then((result) => {
      if (current) highlighted = result;
    });
    return () => {
      current = false;
    };
  });
</script>

<div class="code overflow-x-auto py-2 font-mono text-xs leading-5" data-testid="code">
  <div class={codeView.wrap ? 'w-full' : 'w-max min-w-full'}>
    {#each lines as line, index (index)}
      <div class="flex">
        <span
          class="shrink-0 pr-3 text-right text-base-content/40 select-none"
          style:width={gutter}
          aria-hidden="true">{index + 1}</span
        >
        <CodeTokens text={line} {highlighted} line={index} />
      </div>
    {/each}
  </div>
</div>
