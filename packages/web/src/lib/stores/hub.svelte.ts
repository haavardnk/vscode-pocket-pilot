import {
  applyPatch,
  applyTerminalPatch,
  type CodeQuery,
  type CodeResultFor,
  type Command,
  type ServerMessage,
  type SessionDetail,
  type TerminalDetail,
  type WindowState
} from '@pocket-pilot/protocol';

import { type Connection, HubSocket, socketUrl } from '../api/socket';
import { repositoryGroups, resolveRepository } from '../hub/views';

const REPOSITORY_KEY = 'pocket-pilot-repository';
export const PAGE_SIZE = 20;
const MAX_LIMIT = 500;

interface Subscription {
  windowId: string;
  sessionId: string;
  limit: number;
}

interface TerminalWatch {
  windowId: string;
  terminalId: string;
}

class HubStore {
  connection = $state<Connection>('connecting');
  quickTunnel = $state(false);
  loaded = $state(false);
  version = $state<string | null>(null);
  windows = $state<WindowState[]>([]);
  mismatch = $state(false);
  incompatibleWindows = $state<string[]>([]);
  detail = $state<SessionDetail | null>(null);
  detailMissing = $state(false);
  limit = $state(PAGE_SIZE);
  terminal = $state<TerminalDetail | null>(null);
  terminalMissing = $state(false);
  private storedRepository = $state<string | null>(localStorage.getItem(REPOSITORY_KEY));
  groups = $derived(repositoryGroups(this.windows));
  repository = $derived(resolveRepository(this.groups, this.storedRepository));
  private subscription: Subscription | null = null;
  private terminalWatch: TerminalWatch | null = null;
  private socket: HubSocket | null = null;

  start(onRejected: () => void): void {
    if (this.socket) return;
    this.socket = new HubSocket(socketUrl(location), {
      message: (message) => this.apply(message),
      unreadable: () => {
        this.mismatch = true;
      },
      connection: (state) => {
        if (state === 'connecting' && this.connection === 'offline') return;
        this.connection = state;
        if (state !== 'open') return;
        this.reportPresence();
        if (this.subscription) this.socket?.send({ type: 'subscribe', ...this.subscription });
        if (this.terminalWatch) {
          this.socket?.send({ type: 'watchTerminal', ...this.terminalWatch });
        }
      },
      rejected: onRejected
    });
    this.socket.connect();
    document.addEventListener('visibilitychange', this.wake);
    addEventListener('online', this.wake);
  }

  stop(): void {
    this.socket?.close();
    this.socket = null;
    document.removeEventListener('visibilitychange', this.wake);
    removeEventListener('online', this.wake);
    this.connection = 'connecting';
    this.loaded = false;
    this.windows = [];
    this.mismatch = false;
    this.incompatibleWindows = [];
    this.detail = null;
    this.subscription = null;
    this.terminal = null;
    this.terminalWatch = null;
  }

  selectRepository(key: string): void {
    this.storedRepository = key;
    localStorage.setItem(REPOSITORY_KEY, key);
  }

  subscribe(windowId: string, sessionId: string): void {
    const current = this.subscription;
    if (current?.windowId === windowId && current.sessionId === sessionId) return;
    this.detail = null;
    this.detailMissing = false;
    this.limit = PAGE_SIZE;
    this.subscription = { windowId, sessionId, limit: PAGE_SIZE };
    this.socket?.send({ type: 'subscribe', ...this.subscription });
  }

  loadEarlier(): void {
    if (!this.subscription) return;
    this.limit = Math.min(MAX_LIMIT, this.limit + PAGE_SIZE);
    this.subscription = { ...this.subscription, limit: this.limit };
    this.socket?.send({ type: 'subscribe', ...this.subscription });
  }

  unsubscribe(): void {
    if (!this.subscription) return;
    this.subscription = null;
    this.detail = null;
    this.detailMissing = false;
    this.socket?.send({ type: 'unsubscribe' });
  }

  watchTerminal(windowId: string, terminalId: string): void {
    const current = this.terminalWatch;
    if (current?.windowId === windowId && current.terminalId === terminalId) return;
    this.terminal = null;
    this.terminalMissing = false;
    this.terminalWatch = { windowId, terminalId };
    this.socket?.send({ type: 'watchTerminal', ...this.terminalWatch });
  }

  unwatchTerminal(): void {
    if (!this.terminalWatch) return;
    this.terminalWatch = null;
    this.terminal = null;
    this.terminalMissing = false;
    this.socket?.send({ type: 'unwatchTerminal' });
  }

  command(command: Command): Promise<void> {
    if (!this.socket) return Promise.reject(new Error('Not connected'));
    return this.socket.command(command);
  }

  async query<Q extends CodeQuery>(query: Q): Promise<CodeResultFor<Q['kind']>> {
    if (!this.socket) throw new Error('Not connected');
    const result = await this.socket.query(query);
    if (result.kind !== query.kind) throw new Error('Unexpected response');
    return result as CodeResultFor<Q['kind']>;
  }

  private readonly wake = (): void => {
    this.reportPresence();
    if (document.visibilityState === 'visible') this.socket?.reconnectNow();
  };

  private reportPresence(): void {
    this.socket?.send({ type: 'presence', visible: document.visibilityState === 'visible' });
  }

  private apply(message: ServerMessage): void {
    if (message.type === 'snapshot') {
      this.version = message.version;
      this.windows = message.windows;
      this.incompatibleWindows = message.incompatibleWindows;
      this.loaded = true;
      this.mismatch = false;
      return;
    }
    if (message.type === 'incompatibleWindows') {
      this.incompatibleWindows = message.names;
      return;
    }
    if (message.type === 'window') {
      const index = this.windows.findIndex((window) => window.windowId === message.window.windowId);
      if (index === -1) this.windows.push(message.window);
      else this.windows[index] = message.window;
      return;
    }
    if (message.type === 'windowRemoved') {
      this.windows = this.windows.filter((window) => window.windowId !== message.windowId);
      return;
    }
    if (message.type === 'terminal' || message.type === 'terminalPatch') {
      this.applyTerminal(message);
      return;
    }
    if (message.type !== 'session' && message.type !== 'sessionPatch') return;
    const current = this.subscription;
    if (current?.windowId !== message.windowId || current.sessionId !== message.sessionId) return;
    if (message.type === 'sessionPatch') {
      if (this.detail) applyPatch(this.detail, message.patch);
      else this.socket?.send({ type: 'subscribe', ...current });
      return;
    }
    this.detail = message.detail;
    this.detailMissing = message.detail === null;
  }

  private applyTerminal(
    message: Extract<ServerMessage, { type: 'terminal' | 'terminalPatch' }>
  ): void {
    const current = this.terminalWatch;
    if (current?.windowId !== message.windowId || current.terminalId !== message.terminalId) return;
    if (message.type === 'terminalPatch') {
      if (this.terminal) applyTerminalPatch(this.terminal, message.patch);
      else this.socket?.send({ type: 'watchTerminal', ...current });
      return;
    }
    this.terminal = message.detail;
    this.terminalMissing = message.detail === null;
  }
}

export const hub = new HubStore();
