import {
  type CodeQuery,
  type CodeResult,
  type Command,
  diffDetail,
  type HookEvent,
  type PullRequestState,
  type ServerMessage,
  type SessionDetail,
  type SessionWatch,
  type WindowState
} from '@pocket-pilot/protocol';

export const EMPTY_WINDOW = 'empty-';

export interface WindowLink {
  watch(sessions: SessionWatch[]): void;
  run(command: Command): Promise<void>;
  query(query: CodeQuery): Promise<CodeResult>;
  hook(event: HookEvent): Promise<void>;
}

export interface HubClient {
  send(message: ServerMessage): void;
}

export interface HubEvents {
  clientsChanged(count: number): void;
  windowsChanged(): void;
}

interface Subscription {
  windowId: string;
  sessionId: string;
  limit: number;
}

interface WindowEntry {
  link: WindowLink;
  state: WindowState;
  details: Map<string, SessionDetail | null>;
  watched: string;
}

function trim(detail: SessionDetail | null, limit: number): SessionDetail | null {
  if (!detail || detail.requests.length <= limit) return detail;
  return { ...detail, requests: detail.requests.slice(-limit) };
}

export class Hub {
  private readonly windows = new Map<string, WindowEntry>();
  private readonly clients = new Map<HubClient, Subscription | null>();
  private readonly sent = new Map<HubClient, SessionDetail | null>();
  private pullRequests: PullRequestState;

  constructor(
    private readonly version: string,
    initialPullRequests: PullRequestState,
    private readonly events: Partial<HubEvents> = {}
  ) {
    this.pullRequests = initialPullRequests;
  }

  get clientCount(): number {
    return this.clients.size;
  }

  windowStates(): WindowState[] {
    return [...this.windows.values()].map((entry) => entry.state);
  }

  addWindow(state: WindowState, link: WindowLink): void {
    this.windows.set(state.windowId, { link, state, details: new Map(), watched: '' });
    this.broadcast({ type: 'window', window: state });
    this.syncWatches(state.windowId);
    this.events.windowsChanged?.();
  }

  updateWindow(state: WindowState): void {
    const entry = this.windows.get(state.windowId);
    if (!entry) return;
    entry.state = state;
    this.broadcast({ type: 'window', window: state });
    this.events.windowsChanged?.();
  }

  removeWindow(windowId: string, link: WindowLink): void {
    if (this.windows.get(windowId)?.link !== link) return;
    this.windows.delete(windowId);
    this.broadcast({ type: 'windowRemoved', windowId });
    this.events.windowsChanged?.();
  }

  sessionUpdate(windowId: string, sessionId: string, detail: SessionDetail | null): void {
    const entry = this.windows.get(windowId);
    if (!entry) return;
    entry.details.set(sessionId, detail);
    for (const [client, subscription] of this.clients) {
      if (subscription?.windowId !== windowId || subscription.sessionId !== sessionId) continue;
      this.sendDetail(client, windowId, sessionId, trim(detail, subscription.limit));
    }
  }

  setPullRequests(state: PullRequestState): void {
    this.pullRequests = state;
    this.broadcast({ type: 'pullRequests', state });
  }

  connect(client: HubClient): void {
    this.clients.set(client, null);
    client.send({
      type: 'snapshot',
      version: this.version,
      windows: this.windowStates(),
      pullRequests: this.pullRequests
    });
    this.events.clientsChanged?.(this.clients.size);
  }

  disconnect(client: HubClient): void {
    const subscription = this.clients.get(client);
    if (!this.clients.delete(client)) return;
    this.sent.delete(client);
    if (subscription) this.syncWatches(subscription.windowId);
    this.events.clientsChanged?.(this.clients.size);
  }

  subscribe(client: HubClient, next: Subscription | null): void {
    if (!this.clients.has(client)) return;
    const previous = this.clients.get(client) ?? null;
    this.clients.set(client, next);
    this.sent.delete(client);
    if (previous && previous.windowId !== next?.windowId) this.syncWatches(previous.windowId);
    if (!next) return;
    const entry = this.windows.get(next.windowId);
    if (!entry) {
      this.sendDetail(client, next.windowId, next.sessionId, null);
      return;
    }
    const cached = entry.details.get(next.sessionId);
    if (cached !== undefined) {
      this.sendDetail(client, next.windowId, next.sessionId, trim(cached, next.limit));
    }
    this.syncWatches(next.windowId);
  }

  async command(command: Command): Promise<void> {
    const entry = this.windows.get(command.windowId);
    if (!entry) throw new Error('Window is no longer open');
    await entry.link.run(command);
  }

  async query(query: CodeQuery): Promise<CodeResult> {
    const entry = this.windows.get(query.windowId);
    if (!entry) throw new Error('Window is no longer open');
    return entry.link.query(query);
  }

  async hook(windowId: string | null, event: HookEvent): Promise<void> {
    const targets = [...this.windows.values()].filter((entry) =>
      windowId === null
        ? entry.state.windowId.startsWith(EMPTY_WINDOW)
        : entry.state.windowId === windowId
    );
    await Promise.all(targets.map((entry) => entry.link.hook(event)));
  }

  private sendDetail(
    client: HubClient,
    windowId: string,
    sessionId: string,
    detail: SessionDetail | null
  ): void {
    const previous = this.sent.get(client);
    this.sent.set(client, detail);
    if (previous && detail) {
      const patch = diffDetail(previous, detail);
      if (patch) client.send({ type: 'sessionPatch', windowId, sessionId, patch });
      return;
    }
    client.send({ type: 'session', windowId, sessionId, detail });
  }

  private syncWatches(windowId: string): void {
    const entry = this.windows.get(windowId);
    if (!entry) return;
    const limits = new Map<string, number>();
    for (const subscription of this.clients.values()) {
      if (subscription?.windowId !== windowId) continue;
      limits.set(
        subscription.sessionId,
        Math.max(limits.get(subscription.sessionId) ?? 0, subscription.limit)
      );
    }
    const sessions = [...limits].map(([sessionId, limit]) => ({ sessionId, limit }));
    const key = JSON.stringify(sessions);
    if (key === entry.watched) return;
    entry.watched = key;
    for (const sessionId of entry.details.keys()) {
      if (!limits.has(sessionId)) entry.details.delete(sessionId);
    }
    entry.link.watch(sessions);
  }

  private broadcast(message: ServerMessage): void {
    for (const client of this.clients.keys()) client.send(message);
  }
}
