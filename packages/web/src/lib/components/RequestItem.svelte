<script lang="ts">
  import CircleHelp from '@lucide/svelte/icons/circle-help';
  import FileDiff from '@lucide/svelte/icons/file-diff';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import type { QuestionAnswers, RequestView } from '@pocket-pilot/protocol';

  import { getChatRepository } from '../chatRepository';
  import { responseItems } from '../hub/steps';
  import { markdown } from '../markdown';
  import { routeHash } from '../routing';
  import EditLink from './EditLink.svelte';
  import PromptAlert from './PromptAlert.svelte';
  import QuestionCard from './QuestionCard.svelte';
  import StepGroup from './StepGroup.svelte';
  import SubagentBlock from './SubagentBlock.svelte';
  import ToolLine from './ToolLine.svelte';

  interface Props {
    request: RequestView;
    windowId: string;
    sessionId: string;
    disabled: boolean;
    dimmed: boolean;
    onmessage: (() => void) | null;
    onanswer: (resolveId: string, answers: QuestionAnswers | null) => Promise<boolean>;
    onconfirm: (button: string) => Promise<boolean>;
    onelicit: () => Promise<boolean>;
  }

  const {
    request,
    windowId,
    sessionId,
    disabled,
    dimmed,
    onmessage,
    onanswer,
    onconfirm,
    onelicit
  }: Props = $props();

  const repository = getChatRepository();

  let acting = $state(false);

  const items = $derived(responseItems(request.parts, request.state));
  const edited = $derived(
    new Set(request.parts.flatMap((part) => (part.kind === 'edit' ? [part.path] : []))).size
  );

  async function act(action: () => Promise<boolean>): Promise<void> {
    acting = true;
    await action();
    acting = false;
  }
</script>

<article
  class={['flex flex-col gap-3', (request.disabled || dimmed) && 'opacity-50']}
  data-request={request.id}
>
  {#if request.message}
    <div class="chat-end chat">
      {#if onmessage && request.editable && !request.disabled}
        <button
          class="chat-bubble cursor-pointer chat-bubble-primary text-left whitespace-pre-wrap"
          aria-haspopup="dialog"
          onclick={onmessage}>{request.message}</button
        >
      {:else}
        <div class="chat-bubble chat-bubble-primary whitespace-pre-wrap">{request.message}</div>
      {/if}
    </div>
  {/if}

  {#each items as part, index (index)}
    {#if part.kind === 'group'}
      <StepGroup group={part} {index} {windowId} {sessionId} requestId={request.id} />
    {:else if part.kind === 'subagent'}
      <SubagentBlock item={part} {windowId} {sessionId} />
    {:else if part.kind === 'markdown'}
      <div class="markdown" {@attach markdown(part.text, repository.github)}></div>
    {:else if part.kind === 'tool'}
      <ToolLine {part} {windowId} />
    {:else if part.kind === 'edit'}
      <EditLink {part} {windowId} {sessionId} requestId={request.id} />
    {:else if part.kind === 'progress'}
      <p class="text-sm text-base-content/60 italic">{part.text}</p>
    {:else if part.kind === 'questions'}
      <QuestionCard {part} {disabled} {onanswer} />
    {:else if part.kind === 'confirmation'}
      <PromptAlert
        icon={CircleHelp}
        title={part.title}
        message={part.message}
        pending={part.state === 'pending'}
      >
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
      </PromptAlert>
    {:else}
      <PromptAlert
        icon={ShieldAlert}
        title={part.title}
        message={part.message}
        pending={part.state === 'pending'}
      >
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
      </PromptAlert>
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
