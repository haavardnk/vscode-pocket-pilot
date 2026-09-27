<script lang="ts">
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import CircleHelp from '@lucide/svelte/icons/circle-help';
  import CircleX from '@lucide/svelte/icons/circle-x';
  import FileDiff from '@lucide/svelte/icons/file-diff';
  import FilePen from '@lucide/svelte/icons/file-pen';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import type { QuestionAnswers, RequestView, ResponsePart } from '@pocket-pilot/protocol';

  import { baseName } from '../code/paths';
  import { mergeMarkdown } from '../hub/views';
  import { markdown } from '../markdown';
  import { routeHash } from '../routing';
  import QuestionCard from './QuestionCard.svelte';

  interface Props {
    request: RequestView;
    windowId: string;
    sessionId: string;
    disabled: boolean;
    onanswer: (resolveId: string, answers: QuestionAnswers | null) => Promise<boolean>;
    onconfirm: (button: string) => Promise<boolean>;
    onelicit: () => Promise<boolean>;
  }

  const { request, windowId, sessionId, disabled, onanswer, onconfirm, onelicit }: Props = $props();

  let acting = $state(false);

  const parts = $derived(mergeMarkdown(request.parts));
  const edited = $derived(
    new Set(request.parts.flatMap((part) => (part.kind === 'edit' ? [part.path] : []))).size
  );

  async function act(action: () => Promise<boolean>): Promise<void> {
    acting = true;
    await action();
    acting = false;
  }
</script>

<article class="flex flex-col gap-3" data-request={request.id}>
  {#snippet tool(part: Extract<ResponsePart, { kind: 'tool' }>)}
    {#if part.status === 'running'}
      <span
        class="loading mt-0.5 loading-xs shrink-0 loading-spinner"
        role="img"
        aria-label="Running"
      ></span>
    {:else if part.status === 'failed'}
      <span class="mt-0.5 shrink-0 text-error" role="img" aria-label="Failed">
        <CircleX class="size-4" />
      </span>
    {:else}
      <span class="mt-0.5 shrink-0 text-success" role="img" aria-label="Done">
        <CircleCheck class="size-4" />
      </span>
    {/if}
    <div class="markdown min-w-0 flex-1" {@attach markdown(part.message || part.toolId)}></div>
    {#if part.awaitingConfirmation}<span class="badge shrink-0 badge-sm badge-warning">Waiting</span
      >{/if}
  {/snippet}
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
      {#if part.detail}
        <details class="text-sm text-base-content/70">
          <summary class="flex cursor-pointer list-none items-start gap-2"
            >{@render tool(part)}</summary
          >
          <pre
            class="mt-1 ml-6 max-h-48 overflow-auto rounded-field bg-base-200 px-2 py-1 text-xs whitespace-pre-wrap"><code
              >{part.detail}</code
            ></pre>
        </details>
      {:else}
        <div class="flex items-start gap-2 text-sm text-base-content/70">{@render tool(part)}</div>
      {/if}
    {:else if part.kind === 'edit'}
      <a
        class="flex max-w-full items-center gap-2 self-start text-sm text-base-content/70 hover:text-primary"
        href={routeHash({
          name: 'sessionDiff',
          windowId,
          sessionId,
          path: part.path,
          requestId: request.id
        })}
      >
        <FilePen class="size-4 shrink-0" />
        <span class="truncate font-mono underline decoration-base-content/30"
          >{baseName(part.path)}</span
        >
      </a>
    {:else if part.kind === 'progress'}
      <p class="text-sm text-base-content/60 italic">{part.text}</p>
    {:else if part.kind === 'questions'}
      <QuestionCard {part} {disabled} {onanswer} />
    {:else if part.kind === 'confirmation'}
      <div
        role={part.state === 'pending' ? 'alert' : undefined}
        class={[
          'alert flex flex-col items-stretch gap-2 alert-soft text-sm',
          part.state === 'pending' ? 'alert-warning' : 'alert-info'
        ]}
      >
        <p class="flex items-center gap-2 font-medium">
          <CircleHelp class="size-4 shrink-0" />{part.title}
        </p>
        {#if part.message}<div class="markdown" {@attach markdown(part.message)}></div>{/if}
        {#if part.state === 'pending'}
          <div class="flex gap-2">
            {#each part.buttons as button, index (button)}
              <button
                class={['btn flex-1 btn-sm', index === 0 && 'btn-primary']}
                disabled={disabled || acting}
                onclick={() => void act(() => onconfirm(button))}
              >
                {button}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <div
        role={part.state === 'pending' ? 'alert' : undefined}
        class={[
          'alert flex flex-col items-stretch gap-2 alert-soft text-sm',
          part.state === 'pending' ? 'alert-warning' : 'alert-info'
        ]}
      >
        <p class="flex items-center gap-2 font-medium">
          <ShieldAlert class="size-4 shrink-0" />{part.title}
        </p>
        {#if part.message}<div class="markdown" {@attach markdown(part.message)}></div>{/if}
        {#if part.state === 'pending'}
          <button
            class="btn btn-primary btn-sm"
            disabled={disabled || acting}
            onclick={() => void act(onelicit)}
          >
            Allow
          </button>
        {:else}
          <p class="text-xs text-base-content/60">
            {part.state === 'accepted'
              ? 'Allowed'
              : part.state === 'rejected'
                ? 'Declined'
                : 'No longer waiting'}
          </p>
        {/if}
      </div>
    {/if}
  {/each}

  {#if edited > 0}
    <a
      class="flex items-center gap-2 self-start text-sm text-base-content/70 hover:text-primary"
      href={routeHash({ name: 'sessionChanges', windowId, sessionId, requestId: request.id })}
    >
      <FileDiff class="size-4 shrink-0" />Files changed ({edited})
    </a>
  {/if}

  {#if request.state === 'failed'}
    <div role="alert" class="alert alert-soft text-sm alert-error">
      {request.error ?? 'The request failed.'}
    </div>
  {:else if request.state === 'cancelled'}
    <p class="text-xs text-base-content/50">Stopped</p>
  {/if}
</article>
