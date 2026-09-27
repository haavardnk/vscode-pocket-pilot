<script lang="ts">
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import type { Agent, ConfigValue, Model, ModelConfigOption } from '@pocket-pilot/protocol';
  import { onDestroy } from 'svelte';

  import Composer from '../lib/components/Composer.svelte';
  import ConnectionBanner from '../lib/components/ConnectionBanner.svelte';
  import ModelSheet from '../lib/components/ModelSheet.svelte';
  import ModeSheet from '../lib/components/ModeSheet.svelte';
  import { agentLabel, modelLabel, windowsForRepository } from '../lib/hub/views';
  import { hub } from '../lib/stores/hub.svelte';
  import { router } from '../lib/stores/router.svelte';
  import { toasts } from '../lib/stores/toasts.svelte';

  const OPEN_TIMEOUT_MS = 15_000;

  interface Pending {
    windowId: string;
    known: Set<string>;
    timer: ReturnType<typeof setTimeout>;
  }

  let chosenWindowId = $state<string | null>(null);
  let modeId = $state<string | null>(null);
  let modelId = $state<string | null>(null);
  let sheet = $state<'mode' | 'model' | null>(null);
  let pending = $state<Pending | null>(null);

  const candidates = $derived(windowsForRepository(hub.windows, hub.groups, hub.repository));
  const target = $derived(
    candidates.find((window) => window.windowId === chosenWindowId) ?? candidates[0]
  );

  $effect(() => {
    if (!pending) return;
    const window = hub.windows.find((candidate) => candidate.windowId === pending?.windowId);
    const created = window?.sessions.find((session) => !pending?.known.has(session.id));
    if (!created) return;
    clearTimeout(pending.timer);
    router.replace({ name: 'session', windowId: pending.windowId, sessionId: created.id });
  });

  onDestroy(() => {
    if (pending) clearTimeout(pending.timer);
  });

  function selectWindow(windowId: string): void {
    chosenWindowId = windowId;
    modeId = null;
    modelId = null;
  }

  async function start(text: string): Promise<boolean> {
    if (!target) return false;
    const windowId = target.windowId;
    const known = new Set(target.sessions.map((session) => session.id));
    try {
      await hub.command({ kind: 'newSession', windowId, text, modeId, modelId });
    } catch (error) {
      toasts.error(error);
      return false;
    }
    const timer = setTimeout(() => {
      toasts.show(`Chat started in ${target.name}`);
      router.replace({ name: 'chats' });
    }, OPEN_TIMEOUT_MS);
    pending = { windowId, known, timer };
    return true;
  }

  function selectMode(agent: Agent): void {
    sheet = null;
    modeId = agent.id;
  }

  function selectModel(model: Model): void {
    sheet = null;
    modelId = model.id;
  }

  function configure(model: Model, option: ModelConfigOption, value: ConfigValue | null): void {
    if (!target) return;
    hub
      .command({
        kind: 'setModelConfig',
        windowId: target.windowId,
        modelId: model.id,
        key: option.key,
        value
      })
      .catch((error: unknown) => toasts.error(error));
  }
</script>

<div class="flex flex-1 flex-col">
  <header class="sticky top-0 z-20 bg-base-100/90 pt-safe backdrop-blur">
    <div class="flex h-14 items-center gap-1 px-2">
      <button
        class="btn btn-square btn-ghost"
        aria-label="Back"
        onclick={() => router.go({ name: 'chats' })}
      >
        <ChevronLeft class="size-6" />
      </button>
      <h1 class="flex-1 font-semibold">New chat</h1>
    </div>
    <ConnectionBanner />
  </header>

  <main class="flex flex-1 flex-col gap-4 px-4 py-4">
    {#if !target}
      <p class="p-10 text-center text-base-content/70">
        No VS Code window is open for this repository.
      </p>
    {:else if pending}
      <div class="flex flex-col items-center gap-3 p-10 text-center">
        <span class="loading loading-spinner text-primary"></span>
        <p class="text-base-content/70">Starting chat in {target.name}…</p>
      </div>
    {:else if candidates.length > 1}
      <label class="flex flex-col gap-1">
        <span class="text-sm text-base-content/60">Window</span>
        <select
          class="select w-full"
          value={target.windowId}
          onchange={(event) => selectWindow(event.currentTarget.value)}
        >
          {#each candidates as window (window.windowId)}
            <option value={window.windowId}>{window.name}</option>
          {/each}
        </select>
      </label>
    {:else}
      <p class="text-sm text-base-content/60">Starts in {target.name}</p>
    {/if}
  </main>

  {#if target && !pending}
    <footer class="sticky bottom-(--dock-height) z-20 border-t border-base-300 bg-base-100">
      <div class="px-3 py-3">
        <Composer
          busy={false}
          disabled={hub.connection !== 'open'}
          agentLabel={agentLabel(target.agents, modeId)}
          modelLabel={modelLabel(target.models, modelId)}
          permission={null}
          placeholder="What should the agent do?"
          onmode={() => (sheet = 'mode')}
          onmodel={() => (sheet = 'model')}
          onpermission={null}
          onsend={start}
        />
      </div>
    </footer>
    <ModeSheet
      open={sheet === 'mode'}
      agents={target.agents}
      current={modeId}
      onselect={selectMode}
      onclose={() => (sheet = null)}
    />
    <ModelSheet
      open={sheet === 'model'}
      models={target.models}
      current={modelId}
      onselect={selectModel}
      onconfig={configure}
      onclose={() => (sheet = null)}
    />
  {/if}
</div>
