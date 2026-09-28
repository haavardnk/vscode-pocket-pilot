<script lang="ts">
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import type { TerminalDetail } from '@pocket-pilot/protocol';

  import TerminalLines from './TerminalLines.svelte';

  interface Props {
    detail: TerminalDetail;
  }

  const { detail }: Props = $props();
</script>

{#if detail.dropped > 0}
  <p class="text-center text-xs text-base-content/50">
    {detail.dropped} earlier {detail.dropped === 1 ? 'command' : 'commands'} trimmed
  </p>
{/if}
{#if detail.executions.length === 0}
  <p class="p-10 text-center text-base-content/60">No command output yet.</p>
{/if}
{#each detail.executions as execution (execution.id)}
  <section
    id={`execution-${execution.id}`}
    class="flex scroll-mt-20 flex-col gap-1"
    aria-label={execution.command}
  >
    <div class="flex items-start gap-2">
      <p class="min-w-0 flex-1 font-mono text-sm font-semibold break-all">
        <span class="text-base-content/50">$</span>
        {execution.command}
      </p>
      {#if execution.endedAt === null}
        <span
          class="loading mt-0.5 loading-xs shrink-0 loading-spinner"
          role="img"
          aria-label="Running"
        ></span>
      {:else if execution.exitCode === 0}
        <span class="mt-0.5 shrink-0 text-success" role="img" aria-label="Succeeded">
          <CircleCheck class="size-4" />
        </span>
      {:else if execution.exitCode !== null}
        <span class="badge shrink-0 badge-soft badge-sm badge-error">
          Exit {execution.exitCode}
        </span>
      {/if}
    </div>
    {#if execution.dropped > 0}
      <p class="text-xs text-base-content/50">
        {execution.dropped} earlier {execution.dropped === 1 ? 'line' : 'lines'} trimmed
      </p>
    {/if}
    <div
      class={['font-mono text-xs leading-snug', execution.alternate && 'overflow-x-auto']}
      role="log"
    >
      <TerminalLines lines={execution.lines} alternate={execution.alternate} />
      <TerminalLines lines={execution.tail} alternate={execution.alternate} />
    </div>
  </section>
{/each}
