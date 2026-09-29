<script lang="ts">
  import { highlight, type Highlighted } from '../../code/highlight';
  import { codeView } from '../../stores/codeView.svelte';
  import CodeTokens from './CodeTokens.svelte';

  interface Props {
    text: string;
    languageId: string | null;
    path: string;
    line?: number | null;
  }

  const { text, languageId, path, line = null }: Props = $props();

  let highlighted = $state.raw<Highlighted | null>(null);

  const lines = $derived(text.replace(/\r?\n$/, '').split(/\r?\n/));
  const gutter = $derived(`${String(lines.length).length + 2}ch`);

  function reveal(node: HTMLElement): void {
    node.scrollIntoView({ block: 'center' });
  }

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
    {#each lines as lineText, index (index)}
      <div
        class={['flex', index + 1 === line && 'bg-warning/20']}
        data-testid={index + 1 === line ? 'current-line' : undefined}
        {@attach index + 1 === line && reveal}
      >
        <span
          class="shrink-0 pr-3 text-right text-base-content/40 select-none"
          style:width={gutter}
          aria-hidden="true">{index + 1}</span
        >
        <CodeTokens text={lineText} {highlighted} line={index} />
      </div>
    {/each}
  </div>
</div>
