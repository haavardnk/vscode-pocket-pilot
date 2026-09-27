<script lang="ts">
  import CircleHelp from '@lucide/svelte/icons/circle-help';
  import FilePen from '@lucide/svelte/icons/file-pen';
  import Wrench from '@lucide/svelte/icons/wrench';
  import type { RequestView } from '@pocket-pilot/protocol';

  import { mergeMarkdown } from '../hub/views';
  import { markdown } from '../markdown';

  const { request }: { request: RequestView } = $props();

  const parts = $derived(mergeMarkdown(request.parts));

  function fileName(path: string): string {
    return path.split(/[\\/]/).at(-1) ?? path;
  }
</script>

<article class="flex flex-col gap-3" data-request={request.id}>
  {#if request.message}
    <div class="chat-end chat">
      <div class="chat-bubble chat-bubble-primary whitespace-pre-wrap">{request.message}</div>
    </div>
  {/if}

  {#each parts as part, index (index)}
    {#if part.kind === 'markdown'}
      <div class="markdown" {@attach markdown(part.text)}></div>
    {:else if part.kind === 'thinking'}
      <details class="collapse-arrow collapse bg-base-200 text-sm">
        <summary class="collapse-title min-h-0 py-2 font-medium">{part.title ?? 'Thinking'}</summary
        >
        <div class="collapse-content whitespace-pre-wrap text-base-content/80">{part.text}</div>
      </details>
    {:else if part.kind === 'tool'}
      <div class="flex items-start gap-2 text-sm text-base-content/70">
        <Wrench class="mt-0.5 size-4 shrink-0" />
        <div class="markdown min-w-0" {@attach markdown(part.message || part.toolId)}></div>
        {#if part.awaitingConfirmation}<span class="badge shrink-0 badge-sm badge-warning"
            >Waiting</span
          >{/if}
      </div>
    {:else if part.kind === 'edit'}
      <div class="flex items-center gap-2 text-sm text-base-content/70">
        <FilePen class="size-4 shrink-0" />
        <span class="truncate font-mono">{fileName(part.path)}</span>
      </div>
    {:else if part.kind === 'progress'}
      <p class="text-sm text-base-content/60 italic">{part.text}</p>
    {:else}
      <div class={['alert alert-soft text-sm', part.answered ? 'alert-info' : 'alert-warning']}>
        <CircleHelp class="size-4 shrink-0" />
        <div class="markdown" {@attach markdown(part.text)}></div>
      </div>
    {/if}
  {/each}

  {#if request.state === 'failed'}
    <div role="alert" class="alert alert-soft text-sm alert-error">
      {request.error ?? 'The request failed.'}
    </div>
  {:else if request.state === 'cancelled'}
    <p class="text-xs text-base-content/50">Stopped</p>
  {/if}
</article>
