<script lang="ts">
  import type { DiffContent } from '@pocket-pilot/protocol';

  import { diffModel } from '../../code/diffModel';
  import { highlight, type Highlighted } from '../../code/highlight';
  import { codeView } from '../../stores/codeView.svelte';
  import CodeTokens from './CodeTokens.svelte';

  interface Props {
    diff: DiffContent;
    languageId: string | null;
    path: string;
  }

  const { diff, languageId, path }: Props = $props();

  let oldHighlighted = $state.raw<Highlighted | null>(null);
  let newHighlighted = $state.raw<Highlighted | null>(null);

  const model = $derived(diffModel(diff.kind === 'text' ? diff.hunks : []));
  const gutter = $derived.by(() => {
    const last = diff.kind === 'text' ? diff.hunks.at(-1) : undefined;
    const widest = last ? Math.max(last.oldStart, last.newStart) + last.lines.length : 1;
    return `${String(widest).length + 2}ch`;
  });

  $effect(() => {
    let current = true;
    const { oldText, newText } = model;
    oldHighlighted = null;
    newHighlighted = null;
    void Promise.all([
      highlight(oldText, languageId, path),
      highlight(newText, languageId, path)
    ]).then(([before, after]) => {
      if (!current) return;
      oldHighlighted = before;
      newHighlighted = after;
    });
    return () => {
      current = false;
    };
  });
</script>

{#if diff.kind === 'binary'}
  <p class="p-10 text-center text-base-content/70">Binary file changed.</p>
{:else if diff.kind === 'tooLarge'}
  <p class="p-10 text-center text-base-content/70">This diff is too large to show.</p>
{:else if model.rows.length === 0}
  <p class="p-10 text-center text-base-content/70">No changes.</p>
{:else}
  <div class="code overflow-x-auto py-2 font-mono text-xs leading-5" data-testid="diff">
    <div class={codeView.wrap ? 'w-full' : 'w-max min-w-full'}>
      {#each model.rows as row, index (index)}
        {#if row.kind === 'gap'}
          <div class="bg-base-200 px-3 py-0.5 text-base-content/50">
            {row.hidden} unchanged {row.hidden === 1 ? 'line' : 'lines'}
          </div>
        {:else}
          <div
            class={[
              'flex',
              row.kind === 'added' && 'bg-success/15',
              row.kind === 'removed' && 'bg-error/15'
            ]}
            data-kind={row.kind}
          >
            <span
              class="shrink-0 pr-1 text-right text-base-content/40 select-none"
              style:width={gutter}
              aria-hidden="true">{row.newLine ?? row.oldLine}</span
            >
            <span
              class={[
                'w-4 shrink-0 text-center select-none',
                row.kind === 'added' && 'text-success',
                row.kind === 'removed' && 'text-error'
              ]}>{row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ''}</span
            >
            <CodeTokens
              text={row.text}
              highlighted={row.side === 'old' ? oldHighlighted : newHighlighted}
              line={row.index}
            />
          </div>
        {/if}
      {/each}
    </div>
  </div>
{/if}
