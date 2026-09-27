<script lang="ts">
  import CircleHelp from '@lucide/svelte/icons/circle-help';
  import FilePen from '@lucide/svelte/icons/file-pen';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import Wrench from '@lucide/svelte/icons/wrench';
  import type { QuestionAnswers, RequestView } from '@pocket-pilot/protocol';

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

  async function act(action: () => Promise<boolean>): Promise<void> {
    acting = true;
    await action();
    acting = false;
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
      <a
        class="flex max-w-full items-center gap-2 self-start text-sm text-base-content/70 hover:text-primary"
        href={routeHash({ name: 'sessionDiff', windowId, sessionId, path: part.path })}
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

  {#if request.state === 'failed'}
    <div role="alert" class="alert alert-soft text-sm alert-error">
      {request.error ?? 'The request failed.'}
    </div>
  {:else if request.state === 'cancelled'}
    <p class="text-xs text-base-content/50">Stopped</p>
  {/if}
</article>
