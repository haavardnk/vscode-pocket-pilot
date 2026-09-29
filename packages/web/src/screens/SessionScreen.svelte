<script module lang="ts">
  let saved: { key: string; top: number } | null = null;
</script>

<script lang="ts">
  import {
    type Agent,
    type ConfigValue,
    type Delivery,
    type Handoff,
    type ImageUpload,
    type Model,
    type ModelConfigOption,
    type PermissionLevel,
    type QuestionAnswers,
    type QueuedRequest,
    type QueueEntry,
    queueEntry,
    type RequestImage,
    type RequestView
  } from '@pocket-pilot/protocol';
  import { tick, untrack } from 'svelte';

  import { setChatContext } from '../lib/chatContext';
  import CheckpointBar from '../lib/components/CheckpointBar.svelte';
  import Composer, { type Draft } from '../lib/components/Composer.svelte';
  import EditingBar from '../lib/components/EditingBar.svelte';
  import HandoffBar from '../lib/components/HandoffBar.svelte';
  import Loading from '../lib/components/Loading.svelte';
  import MessageActionsSheet from '../lib/components/MessageActionsSheet.svelte';
  import ModelSheet from '../lib/components/ModelSheet.svelte';
  import ModeSheet from '../lib/components/ModeSheet.svelte';
  import PermissionSheet from '../lib/components/PermissionSheet.svelte';
  import QueuedMessages from '../lib/components/QueuedMessages.svelte';
  import RequestItem from '../lib/components/RequestItem.svelte';
  import SendingEcho from '../lib/components/SendingEcho.svelte';
  import SessionActionsSheet from '../lib/components/SessionActionsSheet.svelte';
  import SessionHeader from '../lib/components/SessionHeader.svelte';
  import TodoList from '../lib/components/TodoList.svelte';
  import ToolApproval from '../lib/components/ToolApproval.svelte';
  import { windowRef } from '../lib/git';
  import { windowGitHub } from '../lib/github';
  import { type MessageEdit, restoreImpact } from '../lib/hub/checkpoints';
  import { handoffSource } from '../lib/hub/handoffs';
  import { agentLabel, modelLabel, pendingTool } from '../lib/hub/views';
  import { getPane } from '../lib/pane';
  import { requestPhoto } from '../lib/photos/chatPhotos';
  import { reusePhoto } from '../lib/photos/prepare';
  import { inChat, parseRoute } from '../lib/routing';
  import { hub } from '../lib/stores/hub.svelte';
  import { router } from '../lib/stores/router.svelte';
  import { toasts } from '../lib/stores/toasts.svelte';

  interface Props {
    windowId: string;
    sessionId: string;
  }

  const { windowId, sessionId }: Props = $props();

  const pane = getPane();

  setChatContext({
    get github() {
      return github;
    },
    get windowId() {
      return windowId;
    },
    get sessionId() {
      return sessionId;
    }
  });

  let sheet = $state<'mode' | 'model' | 'permission' | 'actions' | null>(null);
  let handingOff = $state(false);
  let echo = $state<{ text: string; images: ImageUpload[]; after: string | null } | null>(null);
  let acting = $state<RequestView | null>(null);
  let editing = $state<MessageEdit | null>(null);
  let root = $state<HTMLElement>();
  let composer = $state<ReturnType<typeof Composer>>();
  let queuedMessages = $state<ReturnType<typeof QueuedMessages>>();
  let draft: Draft = { text: '', images: [] };
  let followBottom = true;
  let scrolled = 0;

  const hostWindow = $derived(hub.windows.find((candidate) => candidate.windowId === windowId));
  const summary = $derived(hostWindow?.sessions.find((candidate) => candidate.id === sessionId));
  const branch = $derived(hostWindow && windowRef(hostWindow));
  const github = $derived(hostWindow ? windowGitHub(hostWindow) : null);
  const detail = $derived(hub.detail);
  const status = $derived(detail?.status ?? summary?.status ?? 'idle');
  const busy = $derived(status === 'running' || status === 'needsInput');
  const modeId = $derived(detail?.modeId ?? summary?.modeId ?? null);
  const modelId = $derived(detail?.modelId ?? summary?.modelId ?? null);
  const tool = $derived(pendingTool(detail));
  const todos = $derived(
    detail?.todos && (busy || detail.todos.some((todo) => todo.status !== 'completed'))
      ? detail.todos
      : null
  );
  const connected = $derived(hub.connection === 'open' && hostWindow !== undefined);
  const echoing = $derived(
    echo && detail && (detail.requests.at(-1)?.id ?? null) === echo.after ? echo : null
  );
  const handoffAgent = $derived(
    detail && hostWindow && !echoing && !editing
      ? handoffSource(hostWindow.agents, detail, modeId)
      : null
  );
  const picked = $derived(editing ?? { modeId, modelId, permission: detail?.permission ?? null });
  const photos = $derived(
    hostWindow?.models.find((model) => model.id === picked.modelId)?.vision !== false
  );
  const editIndex = $derived(
    indexOf(editing?.target.kind === 'request' ? editing.target.request : null)
  );
  const editingQueued = $derived(editing?.target.kind === 'queued' ? editing.target.item.id : null);
  const actionTarget = $derived.by(() => {
    const index = indexOf(acting);
    if (!acting || !detail || index < 0) return null;
    return { request: acting, impact: restoreImpact(detail.requests, index) };
  });

  $effect(() => {
    echo = null;
    acting = null;
    editing = null;
    const key = `${windowId}/${sessionId}`;
    const restored =
      saved?.key === key && untrack(() => hub.detail?.id) === sessionId ? saved.top : null;
    saved = null;
    hub.subscribe(windowId, sessionId);
    followBottom = restored === null;
    void tick().then(() => {
      if (restored === null) followEnd();
      else pane.element?.scrollTo({ top: restored });
    });
    return () => {
      if (!inChat(parseRoute(location.hash), windowId, sessionId)) {
        hub.unsubscribe();
        return;
      }
      if (!followBottom) saved = { key, top: scrolled };
    };
  });

  $effect(() => {
    const element = pane.element;
    if (!root || !element) return;
    const observer = new ResizeObserver(followEnd);
    observer.observe(root);
    observer.observe(element);
    element.addEventListener('scroll', onscroll, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', onscroll);
    };
  });

  function followEnd(): void {
    const element = pane.element;
    if (!element || !hub.detail || !followBottom || router.tab !== 'chats') return;
    element.scrollTop = element.scrollHeight;
  }

  function onscroll(): void {
    const element = pane.element;
    if (!element || router.tab !== 'chats') return;
    scrolled = element.scrollTop;
    followBottom = element.clientHeight + element.scrollTop >= element.scrollHeight - 120;
  }

  async function run(action: () => Promise<void>): Promise<boolean> {
    try {
      await action();
      return true;
    } catch (error) {
      toasts.error(error);
      return false;
    }
  }

  async function send(
    text: string,
    delivery: Delivery | null,
    images: ImageUpload[]
  ): Promise<boolean> {
    if (editing) {
      const edit = editing;
      return edit.target.kind === 'queued'
        ? saveQueued(edit, edit.target.item, text, images)
        : sendEdit(edit, edit.target.request, text, images);
    }
    followBottom = true;
    if (delivery === null) echo = { text, images, after: detail?.requests.at(-1)?.id ?? null };
    const sent = await run(() =>
      hub.command({ kind: 'send', windowId, sessionId, text, images, delivery })
    );
    if (!sent) echo = null;
    return sent;
  }

  function changeQueue(expected: string[], queue: QueueEntry[]): Promise<boolean> {
    return run(() => hub.command({ kind: 'setQueue', windowId, sessionId, expected, queue }));
  }

  function indexOf(request: RequestView | null): number {
    if (!request || !detail) return -1;
    return detail.requests.findIndex((candidate) => candidate.id === request.id);
  }

  function photosOf(requestId: string, images: RequestImage[]): Promise<ImageUpload>[] {
    return images.map((image) =>
      requestPhoto(windowId, sessionId, requestId, image.id).then(reusePhoto)
    );
  }

  function fillFrom(text: string, requestId: string, images: RequestImage[], focus: boolean): void {
    composer?.fill({ text, images: [] }, focus);
    void composer?.attach(photosOf(requestId, images));
  }

  function startEdit(request: RequestView): void {
    if (!detail) return;
    draft = composer?.current() ?? { text: '', images: [] };
    editing = {
      target: { kind: 'request', request },
      modeId,
      modelId: request.modelId ?? modelId,
      permission: detail.permission
    };
    fillFrom(request.message, request.id, request.images, true);
  }

  function editQueued(item: QueuedRequest): void {
    if (!detail) return;
    draft = composer?.current() ?? { text: '', images: [] };
    editing = {
      target: { kind: 'queued', item: $state.snapshot(item) },
      modeId: item.modeId ?? modeId,
      modelId: item.modelId ?? modelId,
      permission: item.permission ?? detail.permission
    };
    fillFrom(item.text, item.id, item.images, true);
  }

  function cancelEdit(): void {
    editing = null;
    composer?.fill(draft, false);
  }

  async function saveQueued(
    edit: MessageEdit,
    item: QueuedRequest,
    text: string,
    images: ImageUpload[]
  ): Promise<boolean> {
    const base = $state.snapshot(detail?.queued ?? []);
    if (!queuedMessages || !base.some((other) => other.id === item.id)) {
      toasts.show('This message already left the queue', 'error');
      return false;
    }
    const saved = await queuedMessages.change(
      base,
      base.map((other) =>
        other.id === item.id
          ? {
              ...queueEntry(other),
              text,
              modeId: edit.modeId,
              modelId: edit.modelId,
              permission: edit.permission,
              images
            }
          : queueEntry(other)
      )
    );
    if (!saved) return false;
    editing = null;
    composer?.fill(draft, false);
    return true;
  }

  async function sendEdit(
    edit: MessageEdit,
    request: RequestView,
    text: string,
    images: ImageUpload[]
  ): Promise<boolean> {
    followBottom = true;
    echo = { text, images, after: detail?.requests[editIndex - 1]?.id ?? null };
    const sent = await run(() =>
      hub.command({
        kind: 'editRequest',
        windowId,
        sessionId,
        requestId: request.id,
        text,
        images,
        modeId: edit.modeId,
        modelId: edit.modelId,
        permission: edit.permission
      })
    );
    if (!sent) {
      echo = null;
      return false;
    }
    editing = null;
    composer?.fill(draft, false);
    return true;
  }

  function restored(request: RequestView): void {
    const current = composer?.current();
    if (!current || current.text.trim() || current.images.length > 0) return;
    fillFrom(request.message, request.id, request.images, false);
  }

  async function handoff(agent: Agent, item: Handoff, autopilot: boolean): Promise<void> {
    followBottom = true;
    handingOff = true;
    if (item.send) {
      echo = { text: item.prompt, images: [], after: detail?.requests.at(-1)?.id ?? null };
    }
    const done = await run(() =>
      hub.command({
        kind: 'handoff',
        windowId,
        sessionId,
        agentId: agent.id,
        handoffId: item.id,
        autopilot
      })
    );
    handingOff = false;
    if (!done) echo = null;
    else if (!item.send && composer) composer.fill({ ...composer.current(), text: item.prompt });
  }

  function answer(resolveId: string, answers: QuestionAnswers | null): Promise<boolean> {
    followBottom = true;
    return run(() =>
      hub.command({ kind: 'answerQuestions', windowId, sessionId, resolveId, answers })
    );
  }

  function confirm(button: string): Promise<boolean> {
    followBottom = true;
    return run(() => hub.command({ kind: 'confirm', windowId, sessionId, button }));
  }

  function elicit(): Promise<boolean> {
    return run(() => hub.command({ kind: 'acceptElicitation', windowId, sessionId }));
  }

  function selectPermission(level: PermissionLevel): void {
    sheet = null;
    if (editing) {
      editing.permission = level;
      return;
    }
    void run(() => hub.command({ kind: 'setPermission', windowId, sessionId, level }));
  }

  function selectMode(agent: Agent): void {
    sheet = null;
    if (editing) {
      editing.modeId = agent.id;
      return;
    }
    void run(() => hub.command({ kind: 'setMode', windowId, sessionId, modeId: agent.id }));
  }

  function selectModel(model: Model): void {
    sheet = null;
    if (editing) {
      editing.modelId = model.id;
      return;
    }
    void run(() => hub.command({ kind: 'setModel', windowId, sessionId, modelId: model.id }));
  }

  function configure(model: Model, option: ModelConfigOption, value: ConfigValue | null): void {
    void run(() =>
      hub.command({ kind: 'setModelConfig', windowId, modelId: model.id, key: option.key, value })
    );
  }
</script>

<div class="flex flex-1 flex-col" bind:this={root}>
  <SessionHeader
    {windowId}
    {sessionId}
    title={detail?.title ?? summary?.title ?? 'Chat'}
    {status}
    place={hostWindow ? (branch ? `${hostWindow.name} · ${branch}` : hostWindow.name) : null}
    editedFiles={detail?.editedFiles ?? 0}
    {busy}
    disabled={!connected}
    onactions={summary && hostWindow?.canOrganize ? () => (sheet = 'actions') : null}
  />

  <main class="flex flex-1 flex-col gap-6 px-4 py-4">
    {#if hub.detailMissing || (hub.loaded && !hostWindow)}
      <div class="flex flex-col items-center gap-3 p-10 text-center">
        <p class="text-base-content/70">This chat is no longer available.</p>
        <button class="btn btn-sm" onclick={() => router.go({ name: 'chats' })}
          >Back to chats</button
        >
      </div>
    {:else if !detail}
      <Loading />
    {:else}
      {#if detail.totalRequests > detail.requests.length}
        <button class="btn self-center btn-ghost btn-sm" onclick={() => hub.loadEarlier()}>
          Load earlier ({detail.totalRequests - detail.requests.length})
        </button>
      {/if}
      {#if detail.requests.length === 0 && !echoing}
        <p class="p-10 text-center text-base-content/60">No messages yet.</p>
      {/if}
      {#each detail.requests as request, index (request.id)}
        {#if request.disabled && !detail.requests[index - 1]?.disabled}
          <CheckpointBar {windowId} {sessionId} disabled={!connected} />
        {/if}
        <RequestItem
          {request}
          {windowId}
          {sessionId}
          disabled={!connected}
          dimmed={editIndex >= 0 && index >= editIndex}
          onmessage={editing ? null : () => (acting = request)}
          onanswer={answer}
          onconfirm={confirm}
          onelicit={elicit}
        />
      {/each}
      {#if echoing}
        <SendingEcho text={echoing.text} images={echoing.images} />
      {/if}
      {#if status === 'running' || echoing}
        <p class="flex items-center gap-2 text-sm text-base-content/60" role="status">
          <span class="loading loading-xs loading-dots"></span>Working
        </p>
      {/if}
    {/if}
  </main>

  {#if detail && hostWindow}
    <footer class="sticky bottom-(--dock-height) z-20 border-t border-base-300 bg-base-100">
      <div class="flex flex-col gap-3 px-3 pt-3 pb-3">
        {#if todos}
          <TodoList {todos} />
        {/if}
        {#if detail.queued.length > 0}
          <QueuedMessages
            bind:this={queuedMessages}
            queued={detail.queued}
            disabled={!connected || editing?.target.kind === 'request'}
            editingId={editingQueued}
            onchange={changeQueue}
            onedit={editQueued}
          />
        {/if}
        {#if tool}
          <ToolApproval {windowId} {sessionId} {tool} disabled={!connected} />
        {/if}
        {#if handoffAgent}
          {@const agent = handoffAgent}
          <HandoffBar
            {agent}
            disabled={handingOff || !connected}
            onselect={(item, autopilot) => void handoff(agent, item, autopilot)}
          />
        {/if}
        {#if editing}
          <EditingBar
            title={editingQueued ? 'Editing queued message' : 'Editing message'}
            impact={editIndex >= 0 ? restoreImpact(detail.requests, editIndex) : null}
            oncancel={cancelEdit}
          />
        {/if}
        <Composer
          bind:this={composer}
          busy={busy && !editing}
          disabled={!connected}
          agentLabel={agentLabel(hostWindow.agents, picked.modeId)}
          modelLabel={modelLabel(hostWindow.models, picked.modelId)}
          {photos}
          permission={picked.permission}
          placeholder={editing ? 'Edit message' : busy ? 'Steer or queue a message' : 'Message'}
          onmode={() => (sheet = 'mode')}
          onmodel={() => (sheet = 'model')}
          onpermission={() => (sheet = 'permission')}
          onsend={send}
        />
      </div>
    </footer>
    <ModeSheet
      open={sheet === 'mode'}
      agents={hostWindow.agents}
      current={picked.modeId}
      onselect={selectMode}
      onclose={() => (sheet = null)}
    />
    <ModelSheet
      open={sheet === 'model'}
      models={hostWindow.models}
      current={picked.modelId}
      onselect={selectModel}
      onconfig={configure}
      onclose={() => (sheet = null)}
    />
    <PermissionSheet
      open={sheet === 'permission'}
      current={picked.permission ?? detail.permission}
      onselect={selectPermission}
      onclose={() => (sheet = null)}
    />
    <MessageActionsSheet
      target={actionTarget}
      {windowId}
      {sessionId}
      disabled={!connected}
      onedit={startEdit}
      onrestored={restored}
      onclose={() => (acting = null)}
    />
  {/if}
  <SessionActionsSheet
    target={sheet === 'actions' && summary ? { windowId, session: summary } : null}
    onarchived={() => router.go({ name: 'chats' })}
    onclose={() => (sheet = null)}
  />
</div>
