<script lang="ts" module>
  import { SvelteMap } from 'svelte/reactivity';

  const expanded = new SvelteMap<string, boolean>();
</script>

<script lang="ts">
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import CircleX from '@lucide/svelte/icons/circle-x';
  import SquareTerminal from '@lucide/svelte/icons/square-terminal';
  import type { ResponsePart } from '@pocket-pilot/protocol';

  import { chatFileHref, getChatContext } from '../chatContext';
  import { markdown } from '../markdown';
  import { toolPhoto } from '../photos/chatPhotos';
  import { routeHash } from '../routing';
  import PhotoStrip from './PhotoStrip.svelte';

  interface Props {
    part: Extract<ResponsePart, { kind: 'tool' }>;
    windowId: string;
    requestId: string;
  }

  const { part, windowId, requestId }: Props = $props();

  const chat = getChatContext();

  const key = $derived(`${windowId}/${chat.sessionId}/${requestId}/${part.callId}`);
  const open = $derived(expanded.get(key) ?? false);
  const expandable = $derived(part.detail !== null || part.links.length > 0 || part.images > 0);
  const photos = $derived(
    Array.from({ length: part.images }, (_, index) => ({
      id: String(index),
      name: `Image ${index + 1}`
    }))
  );
</script>

{#snippet line()}
  {#if part.status === 'running'}
    <span class="loading mt-0.5 loading-xs shrink-0 loading-spinner" role="img" aria-label="Running"
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
  <div class="markdown min-w-0 flex-1" {@attach markdown(part.message || part.toolId, chat)}></div>
  {#if part.awaitingConfirmation}<span class="badge shrink-0 badge-sm badge-warning">Waiting</span
    >{/if}
{/snippet}

{#if expandable}
  <details class="text-sm text-base-content/70" {open}>
    <summary
      class="flex cursor-pointer list-none items-start gap-2"
      onclick={(event) => {
        if (event.target instanceof Element && event.target.closest('a')) return;
        event.preventDefault();
        expanded.set(key, !open);
      }}>{@render line()}</summary
    >
    {#if open}
      <div class="mt-1 ml-6 flex flex-col gap-2">
        {#if photos.length > 0}
          <PhotoStrip
            {photos}
            load={(id) => toolPhoto(windowId, chat.sessionId, requestId, part.callId, Number(id))}
          />
        {/if}
        {#if part.links.length > 0}
          <ul class="flex flex-col gap-1" aria-label="Results">
            {#each part.links as link (link.uri)}
              <li class="truncate">
                {#if link.uri.startsWith('file:')}
                  <a class="link link-hover" href={chatFileHref(chat, new URL(link.uri))}
                    >{link.label}</a
                  >
                {:else}
                  <a
                    class="link link-hover"
                    href={link.uri}
                    target="_blank"
                    rel="noopener noreferrer">{link.label}</a
                  >
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
        {#if part.detail}
          <pre
            class="max-h-48 overflow-auto rounded-field bg-base-200 px-2 py-1 text-xs whitespace-pre-wrap"><code
              >{part.detail}</code
            ></pre>
        {/if}
      </div>
    {/if}
  </details>
{:else}
  <div class="flex items-start gap-2 text-sm text-base-content/70">{@render line()}</div>
{/if}
{#if part.terminal}
  <a
    class="-mt-1 ml-6 flex items-center gap-2 self-start text-sm text-base-content/70 hover:text-primary"
    href={routeHash({
      name: 'terminal',
      windowId,
      terminalId: part.terminal.terminalId,
      executionId: part.terminal.executionId
    })}
  >
    <SquareTerminal class="size-4 shrink-0" />Open terminal
  </a>
{/if}
