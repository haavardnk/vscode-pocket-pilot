import {
  type Command,
  type CopilotUsage,
  diffDetail,
  type Query,
  type QueryResult,
  type ServerMessage,
  type SessionDetail,
  type WindowState,
  type WorkspaceFolder
} from '@pocket-pilot/protocol';

import { MockBranches } from './branches.ts';
import { MockChats } from './chats.ts';
import { MockCode } from './code.ts';
import {
  copilotUsage,
  initialWindows,
  type MockWindow,
  OPEN_TARGETS,
  openedWindow,
  refreshSummary,
  SCREENSHOT
} from './fixtures.ts';
import { isTerminalCommand, MockTerminals } from './terminals.ts';

const REPLY_DELAY_MS = 800;

export interface TerminalWatch {
  windowId: string;
  terminalId: string;
}

export interface MockClient {
  send(message: ServerMessage): void;
  subscription: { windowId: string; sessionId: string; limit: number } | null;
  terminal: TerminalWatch | null;
}

function folderOf(window: MockWindow, folderId: string): WorkspaceFolder {
  const folder = window.state.folders.find((candidate) => candidate.id === folderId);
  if (!folder) throw new Error('Workspace folder is no longer open');
  return folder;
}

export class MockHub {
  private windows: MockWindow[] = [];
  private usage: CopilotUsage | null = null;
  private readonly clients = new Set<MockClient>();
  private readonly sent = new Map<MockClient, SessionDetail>();
  private readonly code = new MockCode();
  private readonly branches = new MockBranches();
  private readonly terminals = new MockTerminals({
    clients: () => this.clients,
    broadcast: (message) => this.broadcast(message),
    id: (prefix) => this.id(prefix),
    later: (action) => this.later(action)
  });
  private readonly chats = new MockChats({
    id: (prefix) => this.id(prefix),
    later: (action) => this.later(action),
    changed: (window, sessionId) => this.changed(window, sessionId),
    runTool: (window, sessionId, tool) => this.terminals.runTool(window, sessionId, tool)
  });
  private timers: ReturnType<typeof setTimeout>[] = [];
  private nextId = 1;

  constructor() {
    this.reset();
  }

  private id(prefix: string): string {
    return `${prefix}-mock-${this.nextId++}`;
  }

  reset(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.nextId = 1;
    const now = Date.now();
    this.windows = initialWindows(now);
    this.usage = copilotUsage(now);
    this.code.reset();
    this.branches.reset();
    this.chats.reset();
    this.sent.clear();
    for (const client of this.clients) {
      client.subscription = null;
      client.terminal = null;
      client.send(this.snapshot());
    }
  }

  connect(client: MockClient): void {
    this.clients.add(client);
    client.send(this.snapshot());
  }

  setUsage(usage: CopilotUsage): void {
    this.usage = usage;
    this.broadcast({ type: 'usage', usage });
  }

  disconnect(client: MockClient): void {
    this.clients.delete(client);
    this.sent.delete(client);
  }

  subscribe(client: MockClient, subscription: MockClient['subscription']): void {
    client.subscription = subscription;
    this.sent.delete(client);
    if (subscription) this.sendDetail(client);
  }

  watchTerminal(client: MockClient, target: TerminalWatch | null): void {
    client.terminal = target && { windowId: target.windowId, terminalId: target.terminalId };
    if (!client.terminal) return;
    const { windowId, terminalId } = client.terminal;
    const detail =
      this.windows
        .find((window) => window.state.windowId === windowId)
        ?.terminals.get(terminalId) ?? null;
    client.send({ type: 'terminal', windowId, terminalId, detail });
  }

  query(query: Query): QueryResult {
    const window = this.windows.find((candidate) => candidate.state.windowId === query.windowId);
    if (!window) throw new Error('Window is no longer open');
    if (query.kind === 'openTargets') return { kind: 'openTargets', ...OPEN_TARGETS };
    if (query.kind === 'branches') {
      return this.branches.list(query.windowId, folderOf(window, query.folderId));
    }
    if (query.kind === 'requestImage') return this.chats.photo(query.requestId, query.imageId);
    if (query.kind === 'toolImage') {
      if (query.callId !== 'shot' || query.index !== 0) {
        throw new Error('Image is no longer available');
      }
      return SCREENSHOT;
    }
    return this.code.query(query);
  }

  run(command: Command): void {
    const window = this.windows.find((candidate) => candidate.state.windowId === command.windowId);
    if (!window) throw new Error('Window is no longer open');
    if (command.kind === 'closeWindow') {
      if (this.windows.length < 2) throw new Error('Pocket Pilot needs one open VS Code window');
      this.later(() => {
        this.windows = this.windows.filter((candidate) => candidate !== window);
        this.broadcast({ type: 'windowRemoved', windowId: command.windowId });
      });
      return;
    }
    if (command.kind === 'openWindow') {
      this.open(command.target);
      return;
    }
    if (
      command.kind === 'checkoutBranch' ||
      command.kind === 'createBranch' ||
      command.kind === 'fetchBranches'
    ) {
      this.branches.run(command, folderOf(window, command.folderId));
      this.broadcast({ type: 'window', window: window.state });
      return;
    }
    if (command.kind === 'setModelConfig') {
      this.configure(command);
      return;
    }
    if (isTerminalCommand(command)) {
      this.terminals.run(window, command);
      return;
    }
    if (command.kind === 'newSession') {
      this.chats.create(window, command);
      return;
    }
    const detail = window.details.get(command.sessionId);
    if (!detail) throw new Error('Chat not found');
    if (command.kind === 'editDecision') {
      this.code.decide(detail.id, command.path, command.decision);
      return;
    }
    if (command.kind === 'setPinned' || command.kind === 'setArchived') {
      const summary = window.state.sessions.find((session) => session.id === detail.id);
      if (!summary) throw new Error('Chat not found');
      if (command.kind === 'setPinned') summary.pinned = command.pinned;
      else summary.archived = command.archived;
      this.broadcast({ type: 'window', window: window.state });
      return;
    }
    this.chats.run(window, detail, command);
  }

  private open(targetId: string): void {
    const opened = [...OPEN_TARGETS.recent, ...OPEN_TARGETS.projects].find(
      (candidate) => candidate.id === targetId
    );
    if (!opened) throw new Error('This folder is no longer in the list');
    if (this.windows.some((window) => window.state.workspace === targetId)) return;
    const window = openedWindow(this.id('window'), opened);
    this.later(() => {
      this.windows.push(window);
      this.broadcast({ type: 'window', window: window.state });
    });
  }

  private configure(command: Extract<Command, { kind: 'setModelConfig' }>): void {
    for (const window of this.windows) {
      const option = window.state.models
        .find((model) => model.id === command.modelId)
        ?.options.find((candidate) => candidate.key === command.key);
      if (option) option.value = command.value;
      this.broadcast({ type: 'window', window: window.state });
    }
  }

  private later(action: () => void): void {
    this.timers.push(setTimeout(action, REPLY_DELAY_MS));
  }

  private changed(window: MockWindow, sessionId: string): void {
    refreshSummary(window, sessionId, Date.now());
    this.broadcast({ type: 'window', window: window.state });
    for (const client of this.clients) {
      const subscription = client.subscription;
      if (
        subscription?.windowId === window.state.windowId &&
        subscription.sessionId === sessionId
      ) {
        this.sendDetail(client);
      }
    }
  }

  private sendDetail(client: MockClient): void {
    const subscription = client.subscription;
    if (!subscription) return;
    const window = this.windows.find(
      (candidate) => candidate.state.windowId === subscription.windowId
    );
    const detail = window?.details.get(subscription.sessionId) ?? null;
    const { windowId, sessionId } = subscription;
    const previous = this.sent.get(client);
    if (!detail) {
      this.sent.delete(client);
      client.send({ type: 'session', windowId, sessionId, detail: null });
      return;
    }
    const next = structuredClone(trim(detail, subscription.limit));
    this.sent.set(client, next);
    if (!previous) {
      client.send({ type: 'session', windowId, sessionId, detail: next });
      return;
    }
    const patch = diffDetail(previous, next);
    if (patch) client.send({ type: 'sessionPatch', windowId, sessionId, patch });
  }

  private broadcast(message: ServerMessage): void {
    for (const client of this.clients) client.send(message);
  }

  private snapshot(): ServerMessage {
    const windows: WindowState[] = this.windows.map((window) => window.state);
    return {
      type: 'snapshot',
      version: '0.0.0-mock',
      windows,
      incompatibleWindows: [],
      usage: this.usage
    };
  }
}

function trim(detail: SessionDetail, limit: number): SessionDetail {
  return { ...detail, requests: detail.requests.slice(-limit) };
}
