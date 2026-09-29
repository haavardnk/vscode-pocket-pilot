import {
  applyTerminalPatch,
  type CodeQuery,
  type CodeResult,
  type Command,
  diffDetail,
  type HookEvent,
  type ServerMessage,
  type SessionDetail,
  type SessionWatch,
  type TerminalDetail,
  type TerminalPatch,
  type WindowState
} from '@pocket-pilot/protocol';

export const EMPTY_WINDOW = 'empty-';
const LAST_WINDOW = 'Pocket Pilot needs one open VS Code window';

export interface WindowLink {
  watch(sessions: SessionWatch[]): void;
  watchTerminals(terminalIds: string[]): void;
  run(command: Command): Promise<void>;
  query(query: CodeQuery): Promise<CodeResult>;
  hook(event: HookEvent): Promise<void>;
}

export interface HubClient {
  send(message: ServerMessage): void;
}

export interface HubEvents {
  windowsChanged(): void;
}

interface Subscription {
  windowId: string;
  sessionId: string;
  limit: number;
}

export interface TerminalWatch {
  windowId: string;
  terminalId: string;
}

interface WindowEntry {
  link: WindowLink;
  state: WindowState;
  details: Map<string, SessionDetail | null>;
  watched: string;
  terminals: Map<string, TerminalDetail | null>;
  watchedTerminals: string;
}

function trim(detail: SessionDetail | null, limit: number): SessionDetail | null {
  if (!detail || detail.requests.length <= limit) return detail;
  return { ...detail, requests: detail.requests.slice(-limit) };
}

export class Hub {
  private readonly windows = new Map<string, WindowEntry>();
  private readonly clients = new Map<HubClient, Subscription | null>();
  private readonly sent = new Map<HubClient, SessionDetail | null>();
  private readonly terminalWatches = new Map<HubClient, TerminalWatch>();
  private readonly incompatible = new Map<object, string>();

  constructor(
    private readonly version: string,
    private readonly events: Partial<HubEvents> = {}
  ) {}

  get clientCount(): number {
    return this.clients.size;
  }

  windowStates(): WindowState[] {
    return [...this.windows.values()].map((entry) => entry.state);
  }

  addWindow(state: WindowState, link: WindowLink): void {
    this.windows.set(state.windowId, {
      link,
      state,
      details: new Map(),
      watched: '',
      terminals: new Map(),
      watchedTerminals: ''
    });
    this.broadcast({ type: 'window', window: state });
    this.syncWatches(state.windowId);
    this.syncTerminalWatches(state.windowId);
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

  addIncompatible(key: object, name: string): void {
    this.incompatible.set(key, name);
    this.broadcast({ type: 'incompatibleWindows', names: [...this.incompatible.values()] });
  }

  removeIncompatible(key: object): void {
    if (!this.incompatible.delete(key)) return;
    this.broadcast({ type: 'incompatibleWindows', names: [...this.incompatible.values()] });
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

  terminalUpdate(windowId: string, terminalId: string, detail: TerminalDetail | null): void {
    const entry = this.windows.get(windowId);
    if (!entry) return;
    entry.terminals.set(terminalId, detail);
    for (const client of this.terminalClients(windowId, terminalId)) {
      client.send({ type: 'terminal', windowId, terminalId, detail });
    }
  }

  terminalPatch(windowId: string, terminalId: string, patch: TerminalPatch): void {
    const detail = this.windows.get(windowId)?.terminals.get(terminalId);
    if (!detail) return;
    applyTerminalPatch(detail, patch);
    for (const client of this.terminalClients(windowId, terminalId)) {
      client.send({ type: 'terminalPatch', windowId, terminalId, patch });
    }
  }

  connect(client: HubClient): void {
    this.clients.set(client, null);
    client.send({
      type: 'snapshot',
      version: this.version,
      windows: this.windowStates(),
      incompatibleWindows: [...this.incompatible.values()]
    });
  }

  disconnect(client: HubClient): void {
    const subscription = this.clients.get(client);
    if (!this.clients.delete(client)) return;
    this.sent.delete(client);
    if (subscription) this.syncWatches(subscription.windowId);
    const terminal = this.terminalWatches.get(client);
    this.terminalWatches.delete(client);
    if (terminal) this.syncTerminalWatches(terminal.windowId);
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

  watchTerminal(client: HubClient, next: TerminalWatch | null): void {
    if (!this.clients.has(client)) return;
    const previous = this.terminalWatches.get(client);
    if (next) this.terminalWatches.set(client, next);
    else this.terminalWatches.delete(client);
    if (previous && previous.windowId !== next?.windowId) {
      this.syncTerminalWatches(previous.windowId);
    }
    if (!next) return;
    const entry = this.windows.get(next.windowId);
    const cached = entry?.terminals.get(next.terminalId);
    if (!entry || cached !== undefined) {
      client.send({ type: 'terminal', ...next, detail: cached ?? null });
    }
    this.syncTerminalWatches(next.windowId);
  }

  async command(command: Command): Promise<void> {
    const entry = this.windows.get(command.windowId);
    if (!entry) throw new Error('Window is no longer open');
    if (command.kind === 'closeWindow' && this.windows.size < 2) throw new Error(LAST_WINDOW);
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

  private terminalClients(windowId: string, terminalId: string): HubClient[] {
    return [...this.terminalWatches]
      .filter(([, watch]) => watch.windowId === windowId && watch.terminalId === terminalId)
      .map(([client]) => client);
  }

  private syncTerminalWatches(windowId: string): void {
    const entry = this.windows.get(windowId);
    if (!entry) return;
    const terminalIds = [
      ...new Set(
        [...this.terminalWatches.values()]
          .filter((watch) => watch.windowId === windowId)
          .map((watch) => watch.terminalId)
      )
    ].sort();
    const key = JSON.stringify(terminalIds);
    if (key === entry.watchedTerminals) return;
    entry.watchedTerminals = key;
    for (const terminalId of entry.terminals.keys()) {
      if (!terminalIds.includes(terminalId)) entry.terminals.delete(terminalId);
    }
    entry.link.watchTerminals(terminalIds);
  }

  private broadcast(message: ServerMessage): void {
    for (const client of this.clients.keys()) client.send(message);
  }
}
