<script lang="ts">
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import MessagesSquare from '@lucide/svelte/icons/messages-square';
  import Trash from '@lucide/svelte/icons/trash';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import type { TerminalLine } from '@pocket-pilot/protocol';
  import { untrack } from 'svelte';

  import Loading from '../lib/components/Loading.svelte';
  import ScreenHeader from '../lib/components/ScreenHeader.svelte';
  import Sheet from '../lib/components/Sheet.svelte';
  import { routeHash } from '../lib/routing';
  import { hub } from '../lib/stores/hub.svelte';
  import { router } from '../lib/stores/router.svelte';
  import { toasts } from '../lib/stores/toasts.svelte';
  import { segmentStyle } from '../lib/terminal/ansi';

  interface Props {
    windowId: string;
    terminalId: string;
    executionId: string | null;
  }

  const { windowId, terminalId, executionId }: Props = $props();

  const KEYS = [
    { label: 'Ctrl+C', text: '^C', data: '\x03' },
    { label: 'Ctrl+D', text: '^D', data: '\x04' },
    { label: 'Tab', text: 'Tab', data: '\t' },
    { label: 'Escape', text: 'Esc', data: '\x1b' },
    { label: 'Up arrow', text: '↑', data: '\x1b[A' },
    { label: 'Down arrow', text: '↓', data: '\x1b[B' },
    { label: 'Enter', text: '⏎', data: '\r' }
  ];

  let text = $state('');
  let killing = $state(false);
  let followBottom = true;
  let targeted = false;

  const hostWindow = $derived(hub.windows.find((candidate) => candidate.windowId === windowId));
  const summary = $derived(hostWindow?.terminals.find((candidate) => candidate.id === terminalId));
  const detail = $derived(hub.terminal);
  const chat = $derived(
    summary?.sessionId
      ? hostWindow?.sessions.find((session) => session.id === summary.sessionId)
      : undefined
  );
  const ready = $derived(hub.connection === 'open' && summary !== undefined && !summary.exited);
  const tail = $derived.by(() => {
    const last = detail?.executions.at(-1);
    return [
      detail?.executions.length,
      last?.id,
      last?.lines.length,
      last?.tail.length,
      last?.tail.at(-1)?.length,
      last?.endedAt
    ].join();
  });

  $effect(() => {
    hub.watchTerminal(windowId, terminalId);
    return () => hub.unwatchTerminal();
  });

  $effect.pre(() => {
    void tail;
    if (!hub.terminal || untrack(() => router.tab) !== 'terminals') return;
    followBottom = innerHeight + scrollY >= document.documentElement.scrollHeight - 120;
  });

  $effect(() => {
    void tail;
    if (!hub.terminal || targeted) return;
    targeted = true;
    const element = executionId ? document.getElementById(`execution-${executionId}`) : null;
    if (!element) return;
    followBottom = false;
    element.scrollIntoView({ block: 'start' });
  });

  $effect(() => {
    void tail;
    if (!hub.terminal || !followBottom || router.tab !== 'terminals') return;
    scrollTo({ top: document.documentElement.scrollHeight });
  });

  function send(data: string, execute: boolean): Promise<boolean> {
    followBottom = true;
    return hub.command({ kind: 'terminalInput', windowId, terminalId, text: data, execute }).then(
      () => true,
      (error: unknown) => {
        toasts.error(error);
        return false;
      }
    );
  }

  async function submit(): Promise<void> {
    const command = text;
    text = '';
    if (!(await send(command, true))) text = command;
  }

  function kill(): void {
    killing = false;
    hub.command({ kind: 'killTerminal', windowId, terminalId }).then(
      () => router.go({ name: 'terminals' }),
      (error: unknown) => toasts.error(error)
    );
  }
</script>

{#snippet output(lines: TerminalLine[], alternate: boolean)}
  {#each lines as line, index (index)}
    <div
      class={['min-h-[1lh]', alternate ? 'w-max whitespace-pre' : 'break-all whitespace-pre-wrap']}
    >
      {#each line as segment, part (part)}<span style={segmentStyle(segment) || undefined}
          >{segment.text}</span
        >{/each}
    </div>
  {/each}
{/snippet}

<div class="flex flex-1 flex-col">
  <ScreenHeader
    title={summary?.name ?? 'Terminal'}
    subtitle={summary?.cwd ?? hostWindow?.name}
    back={{ name: 'terminals' }}
  >
    {#snippet actions()}
      {#if summary?.sessionId}
        <a
          class="btn btn-square btn-ghost btn-sm"
          aria-label={chat ? `Open chat ${chat.title}` : 'Open chat'}
          href={routeHash({ name: 'session', windowId, sessionId: summary.sessionId })}
        >
          <MessagesSquare class="size-4" />
        </a>
      {/if}
      {#if summary}
        <button
          class="btn btn-square btn-ghost btn-sm"
          aria-label="Kill terminal"
          disabled={hub.connection !== 'open'}
          onclick={() => (killing = true)}
        >
          <Trash class="size-4" />
        </button>
      {/if}
    {/snippet}
  </ScreenHeader>

  <main class="flex flex-1 flex-col gap-4 px-4 py-4">
    {#if hub.terminalMissing || (hub.loaded && !summary)}
      <div class="flex flex-col items-center gap-3 p-10 text-center">
        <p class="text-base-content/70">This terminal is closed.</p>
        <button class="btn btn-sm" onclick={() => router.go({ name: 'terminals' })}>
          Back to terminals
        </button>
      </div>
    {:else if !detail}
      <Loading />
    {:else}
      {#if summary && !summary.shellIntegration}
        <div role="status" class="alert alert-soft text-sm alert-info">
          Output appears once shell integration is active in this terminal. Input still works.
        </div>
      {/if}
      {#if summary?.exited}
        <div role="status" class="alert alert-soft text-sm alert-warning">
          The shell in this terminal has exited.
        </div>
      {/if}
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
            {@render output(execution.lines, execution.alternate)}
            {@render output(execution.tail, execution.alternate)}
          </div>
        </section>
      {/each}
    {/if}
  </main>

  {#if summary && !hub.terminalMissing}
    <footer class="sticky bottom-(--dock-height) z-20 border-t border-base-300 bg-base-100">
      <div class="flex flex-col gap-2 px-3 pt-2 pb-3">
        <div class="flex gap-1 overflow-x-auto">
          {#each KEYS as key (key.label)}
            <button
              class="btn btn-ghost font-mono btn-sm"
              aria-label={key.label}
              disabled={!ready}
              onclick={() => void send(key.data, false)}
            >
              {key.text}
            </button>
          {/each}
        </div>
        <form
          class="flex items-center gap-2"
          onsubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <input
            class="input flex-1 font-mono"
            aria-label="Terminal input"
            placeholder="Command"
            autocapitalize="off"
            autocomplete="off"
            spellcheck="false"
            enterkeyhint="send"
            disabled={!ready}
            bind:value={text}
          />
          <button
            class="btn btn-circle btn-primary"
            type="submit"
            aria-label="Run"
            disabled={!ready || text.length === 0}
          >
            <ArrowUp class="size-5" />
          </button>
        </form>
      </div>
    </footer>
  {/if}
</div>

<Sheet open={killing} title="Kill terminal" onclose={() => (killing = false)}>
  <div role="alert" class="alert flex flex-col items-stretch gap-3 alert-soft alert-error">
    <p class="flex items-center gap-2 font-medium">
      <TriangleAlert class="size-4 shrink-0" />Kill {summary?.name ?? 'this terminal'}?
    </p>
    <p class="text-sm">
      {summary?.command
        ? `This stops ${summary.command} and closes the terminal in VS Code.`
        : 'This closes the terminal in VS Code.'}
    </p>
    <div class="flex gap-2">
      <button class="btn flex-1 btn-error btn-sm" onclick={kill}>Kill</button>
      <button class="btn flex-1 btn-sm" onclick={() => (killing = false)}>Cancel</button>
    </div>
  </div>
</Sheet>
