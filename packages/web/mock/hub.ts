import type {
  Command,
  PullRequestState,
  ServerMessage,
  SessionDetail,
  WindowState
} from '@pocket-pilot/protocol';

import {
  initialPullRequests,
  initialWindows,
  type MockWindow,
  refreshSummary
} from './fixtures.ts';

const REPLY_DELAY_MS = 800;

export interface MockClient {
  send(message: ServerMessage): void;
  subscription: { windowId: string; sessionId: string; limit: number } | null;
}

export class MockHub {
  private windows: MockWindow[] = [];
  private pullRequests: PullRequestState = initialPullRequests(Date.now());
  private readonly clients = new Set<MockClient>();
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
    this.pullRequests = initialPullRequests(now);
    for (const client of this.clients) {
      client.subscription = null;
      client.send(this.snapshot());
    }
  }

  connect(client: MockClient): void {
    this.clients.add(client);
    client.send(this.snapshot());
  }

  disconnect(client: MockClient): void {
    this.clients.delete(client);
  }

  subscribe(client: MockClient, subscription: MockClient['subscription']): void {
    client.subscription = subscription;
    if (subscription) this.sendDetail(client);
  }

  refreshPullRequests(): void {
    this.pullRequests = { ...this.pullRequests, fetchedAt: Date.now() };
    this.broadcast({ type: 'pullRequests', state: this.pullRequests });
  }

  run(command: Command): void {
    const window = this.windows.find((candidate) => candidate.state.windowId === command.windowId);
    if (!window) throw new Error('Window is no longer open');
    if (command.kind === 'setModelConfig') {
      this.configure(command);
      return;
    }
    if (command.kind === 'newSession') {
      const id = this.id('session');
      window.details.set(id, {
        id,
        title: command.text.slice(0, 40),
        status: 'idle',
        modelId: command.modelId,
        modeId: command.modeId ?? 'agent',
        totalRequests: 0,
        requests: [],
        queued: [],
        live: []
      });
      this.later(() => this.ask(window, id, command.text));
      return;
    }
    const detail = window.details.get(command.sessionId);
    if (!detail) throw new Error('Chat not found');
    if (command.kind === 'send') {
      if (detail.status === 'idle' || detail.status === 'failed')
        this.ask(window, detail.id, command.text);
      else {
        detail.queued.push({
          id: this.id('queued'),
          delivery: command.delivery ?? 'queued',
          text: command.text
        });
        this.changed(window, detail.id);
      }
      return;
    }
    if (command.kind === 'stop') {
      const last = detail.requests.at(-1);
      if (last?.state === 'pending') last.state = 'cancelled';
      last?.parts.forEach((part) => {
        if (part.kind === 'tool') part.awaitingConfirmation = false;
      });
      detail.status = 'idle';
      detail.queued = [];
      detail.live = [];
      this.changed(window, detail.id);
      return;
    }
    if (command.kind === 'toolDecision') {
      const last = detail.requests.at(-1);
      const tool = last?.parts.find((part) => part.kind === 'tool' && part.awaitingConfirmation);
      if (!last || tool?.kind !== 'tool') throw new Error('No tool is waiting');
      tool.awaitingConfirmation = false;
      last.parts.push({
        kind: 'markdown',
        text: command.decision === 'accept' ? 'Tests passed.' : 'Skipped the tool.'
      });
      this.changed(window, detail.id);
      this.later(() => this.finish(window, detail.id, 'All done.'));
      return;
    }
    if (command.kind === 'setMode') detail.modeId = command.modeId;
    if (command.kind === 'setModel') detail.modelId = command.modelId;
    this.changed(window, detail.id);
  }

  private ask(window: MockWindow, sessionId: string, text: string): void {
    const detail = window.details.get(sessionId);
    if (!detail) return;
    detail.requests.push({
      id: this.id('request'),
      timestamp: Date.now(),
      message: text,
      modelId: detail.modelId,
      state: 'pending',
      error: null,
      parts: []
    });
    detail.totalRequests += 1;
    detail.status = 'running';
    detail.live = [
      { kind: 'tool', at: Date.now(), callId: this.id('call'), name: 'read_file', state: 'running' }
    ];
    this.changed(window, sessionId);
    this.later(() => this.finish(window, sessionId, `Done: ${text}`));
  }

  private finish(window: MockWindow, sessionId: string, reply: string): void {
    const detail = window.details.get(sessionId);
    const last = detail?.requests.at(-1);
    if (!detail || last?.state !== 'pending') return;
    last.parts.push({ kind: 'markdown', text: reply });
    last.state = 'complete';
    detail.status = 'idle';
    detail.live = [];
    this.changed(window, sessionId);
    const next = detail.queued.shift();
    if (next) this.ask(window, sessionId, next.text);
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
    client.send({
      type: 'session',
      windowId: subscription.windowId,
      sessionId: subscription.sessionId,
      detail: detail && trim(detail, subscription.limit)
    });
  }

  private broadcast(message: ServerMessage): void {
    for (const client of this.clients) client.send(message);
  }

  private snapshot(): ServerMessage {
    const windows: WindowState[] = this.windows.map((window) => window.state);
    return { type: 'snapshot', version: '0.0.0-mock', windows, pullRequests: this.pullRequests };
  }
}

function trim(detail: SessionDetail, limit: number): SessionDetail {
  return { ...detail, requests: detail.requests.slice(-limit) };
}
