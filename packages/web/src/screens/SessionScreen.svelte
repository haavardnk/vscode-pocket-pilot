<script lang="ts">
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import Square from '@lucide/svelte/icons/square';
  import type {
    Agent,
    ConfigValue,
    Delivery,
    Model,
    ModelConfigOption
  } from '@pocket-pilot/protocol';

  import Composer from '../lib/components/Composer.svelte';
  import ConnectionBanner from '../lib/components/ConnectionBanner.svelte';
  import LiveActivity from '../lib/components/LiveActivity.svelte';
  import ModelSheet from '../lib/components/ModelSheet.svelte';
  import ModeSheet from '../lib/components/ModeSheet.svelte';
  import RequestItem from '../lib/components/RequestItem.svelte';
  import StatusBadge from '../lib/components/StatusBadge.svelte';
  import { agentLabel, modelLabel, pendingTool } from '../lib/hub/views';
  import { hub } from '../lib/stores/hub.svelte';
  import { router } from '../lib/stores/router.svelte';
  import { toasts } from '../lib/stores/toasts.svelte';

  interface Props {
    windowId: string;
    sessionId: string;
  }

  const { windowId, sessionId }: Props = $props();

  let sheet = $state<'mode' | 'model' | null>(null);
  let deciding = $state(false);
  let stopping = $state(false);
  let followBottom = true;

  const hostWindow = $derived(hub.windows.find((candidate) => candidate.windowId === windowId));
  const summary = $derived(hostWindow?.sessions.find((candidate) => candidate.id === sessionId));
  const detail = $derived(hub.detail);
  const status = $derived(detail?.status ?? summary?.status ?? 'idle');
  const busy = $derived(status === 'running' || status === 'needsInput');
  const modeId = $derived(detail?.modeId ?? summary?.modeId ?? null);
  const modelId = $derived(detail?.modelId ?? summary?.modelId ?? null);
  const tool = $derived(pendingTool(detail));
  const connected = $derived(hub.connection === 'open' && hostWindow !== undefined);

  $effect(() => {
    hub.subscribe(windowId, sessionId);
    return () => hub.unsubscribe();
  });

  $effect.pre(() => {
    if (!hub.detail) return;
    followBottom = innerHeight + scrollY >= document.documentElement.scrollHeight - 120;
  });

  $effect(() => {
    if (!hub.detail || !followBottom) return;
    scrollTo({ top: document.documentElement.scrollHeight });
  });

  async function run(action: () => Promise<void>): Promise<boolean> {
    try {
      await action();
      return true;
    } catch (error) {
      toasts.error(error);
      return false;
    }
  }

  function send(text: string, delivery: Delivery | null): Promise<boolean> {
    followBottom = true;
    return run(() => hub.command({ kind: 'send', windowId, sessionId, text, delivery }));
  }

  async function stop(): Promise<void> {
    stopping = true;
    await run(() => hub.command({ kind: 'stop', windowId, sessionId }));
    stopping = false;
  }

  async function decide(decision: 'accept' | 'skip'): Promise<void> {
    deciding = true;
    await run(() => hub.command({ kind: 'toolDecision', windowId, sessionId, decision }));
    deciding = false;
  }

  function selectMode(agent: Agent): void {
    sheet = null;
    void run(() => hub.command({ kind: 'setMode', windowId, sessionId, modeId: agent.id }));
  }

  function selectModel(model: Model): void {
    sheet = null;
    void run(() => hub.command({ kind: 'setModel', windowId, sessionId, modelId: model.id }));
  }

  function configure(model: Model, option: ModelConfigOption, value: ConfigValue | null): void {
    void run(() =>
      hub.command({ kind: 'setModelConfig', windowId, modelId: model.id, key: option.key, value })
    );
  }
</script>

<div class="flex min-h-dvh flex-col">
  <header class="sticky top-0 z-20 bg-base-100/90 pt-safe backdrop-blur">
    <div class="flex h-14 items-center gap-1 px-2">
      <button
        class="btn btn-square btn-ghost"
        aria-label="Back"
        onclick={() => router.go({ name: 'chats' })}
      >
        <ChevronLeft class="size-6" />
      </button>
      <div class="min-w-0 flex-1">
        <h1 class="truncate font-semibold">{detail?.title ?? summary?.title ?? 'Chat'}</h1>
        {#if hostWindow || status !== 'idle'}
          <div class="flex min-w-0 items-center gap-1.5">
            <StatusBadge {status} />
            {#if hostWindow}<p class="truncate text-xs text-base-content/60">
                {hostWindow.name}
              </p>{/if}
          </div>
        {/if}
      </div>
      {#if busy}
        <button
          class="btn btn-square btn-soft btn-error btn-sm"
          aria-label="Stop"
          disabled={!connected || stopping}
          onclick={() => void stop()}
        >
          <Square class="size-3.5 fill-current" />
        </button>
      {/if}
    </div>
    <ConnectionBanner />
  </header>

  <main class="flex flex-1 flex-col gap-6 px-4 py-4">
    {#if hub.detailMissing || (hub.loaded && !hostWindow)}
      <div class="flex flex-col items-center gap-3 p-10 text-center">
        <p class="text-base-content/70">This chat is no longer available.</p>
        <button class="btn btn-sm" onclick={() => router.go({ name: 'chats' })}
          >Back to chats</button
        >
      </div>
    {:else if !detail}
      <div class="flex justify-center p-10">
        <span class="loading loading-spinner text-primary"></span>
      </div>
    {:else}
      {#if detail.totalRequests > detail.requests.length}
        <button class="btn self-center btn-ghost btn-sm" onclick={() => hub.loadEarlier()}>
          Load earlier ({detail.totalRequests - detail.requests.length})
        </button>
      {/if}
      {#if detail.requests.length === 0}
        <p class="p-10 text-center text-base-content/60">No messages yet.</p>
      {/if}
      {#each detail.requests as request (request.id)}
        <RequestItem {request} />
      {/each}
      {#if status === 'running'}
        <LiveActivity events={detail.live} />
      {/if}
    {/if}
  </main>

  {#if detail && hostWindow}
    <footer class="sticky bottom-0 z-20 border-t border-base-300 bg-base-100 pb-safe">
      <div class="flex flex-col gap-3 px-3 pt-3 pb-3">
        {#if detail.queued.length > 0}
          <ul class="flex flex-col gap-1" aria-label="Queued messages">
            {#each detail.queued as queued (queued.id)}
              <li class="flex items-center gap-2 rounded-field bg-base-200 px-3 py-1.5 text-sm">
                <span class="badge badge-ghost badge-xs"
                  >{queued.delivery === 'steering' ? 'Steer' : 'Queued'}</span
                >
                <span class="truncate">{queued.text}</span>
              </li>
            {/each}
          </ul>
        {/if}
        {#if tool}
          <div
            role="alert"
            class="alert flex flex-col items-stretch gap-2 alert-soft alert-warning"
          >
            <p class="text-sm">
              <span class="font-medium">Allow tool?</span>
              {tool.message || tool.toolId}
            </p>
            <div class="flex gap-2">
              <button
                class="btn flex-1 btn-primary btn-sm"
                disabled={deciding || !connected}
                onclick={() => void decide('accept')}
              >
                Allow
              </button>
              <button
                class="btn flex-1 btn-sm"
                disabled={deciding || !connected}
                onclick={() => void decide('skip')}
              >
                Skip
              </button>
            </div>
          </div>
        {/if}
        <Composer
          {busy}
          disabled={!connected}
          agentLabel={agentLabel(hostWindow.agents, modeId)}
          modelLabel={modelLabel(hostWindow.models, modelId)}
          placeholder={busy ? 'Steer or queue a message' : 'Message'}
          onmode={() => (sheet = 'mode')}
          onmodel={() => (sheet = 'model')}
          onsend={send}
        />
      </div>
    </footer>
    <ModeSheet
      open={sheet === 'mode'}
      agents={hostWindow.agents}
      current={modeId}
      onselect={selectMode}
      onclose={() => (sheet = null)}
    />
    <ModelSheet
      open={sheet === 'model'}
      models={hostWindow.models}
      current={modelId}
      onselect={selectModel}
      onconfig={configure}
      onclose={() => (sheet = null)}
    />
  {/if}
</div>
