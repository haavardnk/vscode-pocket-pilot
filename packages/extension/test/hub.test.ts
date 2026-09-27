import type {
  PullRequestState,
  ServerMessage,
  SessionDetail,
  SessionWatch,
  WindowState
} from '@pocket-pilot/protocol';
import { describe, expect, it, vi } from 'vitest';

import { Hub, type HubClient, type WindowLink } from '../src/cluster/hub';

const noPullRequests: PullRequestState = {
  status: 'disabled',
  fetchedAt: null,
  errors: [],
  pullRequests: []
};

function windowState(windowId: string): WindowState {
  return { windowId, name: windowId, repositories: [], sessions: [], agents: [], models: [] };
}

function detail(count: number): SessionDetail {
  return {
    id: 's1',
    title: 'Session',
    status: 'idle',
    modelId: null,
    modeId: null,
    permission: 'default',
    totalRequests: count,
    requests: Array.from({ length: count }, (_, index) => ({
      id: `r${index}`,
      timestamp: index,
      message: `m${index}`,
      modelId: null,
      state: 'complete' as const,
      error: null,
      parts: []
    })),
    queued: [],
    live: []
  };
}

function link(): WindowLink & { watches: SessionWatch[][] } {
  const watches: SessionWatch[][] = [];
  return {
    watches,
    watch: (sessions) => watches.push(sessions),
    run: vi.fn(() => Promise.resolve())
  };
}

function client(): HubClient & { messages: ServerMessage[] } {
  const messages: ServerMessage[] = [];
  return { messages, send: (message) => messages.push(message) };
}

describe('Hub', () => {
  it('sends a snapshot on connect and broadcasts window changes', () => {
    const hub = new Hub('1.0.0', noPullRequests);
    const phone = client();
    hub.connect(phone);
    const window = link();
    hub.addWindow(windowState('w1'), window);
    hub.removeWindow('w1', link());
    hub.removeWindow('w1', window);
    expect(phone.messages.map((message) => message.type)).toEqual([
      'snapshot',
      'window',
      'windowRemoved'
    ]);
  });

  it('watches the largest limit per session and trims details per client', () => {
    const hub = new Hub('1.0.0', noPullRequests);
    const window = link();
    hub.addWindow(windowState('w1'), window);
    const small = client();
    const large = client();
    hub.connect(small);
    hub.connect(large);
    hub.subscribe(small, { windowId: 'w1', sessionId: 's1', limit: 2 });
    hub.subscribe(large, { windowId: 'w1', sessionId: 's1', limit: 5 });
    expect(window.watches.at(-1)).toEqual([{ sessionId: 's1', limit: 5 }]);

    hub.sessionUpdate('w1', 's1', detail(5));
    const lastSession = (phone: {
      messages: ServerMessage[];
    }): SessionDetail | null | undefined => {
      const message = phone.messages.findLast((item) => item.type === 'session');
      return message?.type === 'session' ? message.detail : undefined;
    };
    expect(lastSession(small)?.requests.map((request) => request.id)).toEqual(['r3', 'r4']);
    expect(lastSession(large)?.requests).toHaveLength(5);

    const late = client();
    hub.connect(late);
    hub.subscribe(late, { windowId: 'w1', sessionId: 's1', limit: 1 });
    expect(lastSession(late)?.requests.map((request) => request.id)).toEqual(['r4']);

    hub.disconnect(large);
    hub.disconnect(late);
    expect(window.watches.at(-1)).toEqual([{ sessionId: 's1', limit: 2 }]);
    hub.subscribe(small, null);
    expect(window.watches.at(-1)).toEqual([]);
  });

  it('routes commands to the owning window', async () => {
    const hub = new Hub('1.0.0', noPullRequests);
    const window = link();
    hub.addWindow(windowState('w1'), window);
    const command = { kind: 'stop' as const, windowId: 'w1', sessionId: 's1' };
    await hub.command(command);
    expect(window.run).toHaveBeenCalledWith(command);
    await expect(hub.command({ ...command, windowId: 'w2' })).rejects.toThrow(
      'Window is no longer open'
    );
  });
});
