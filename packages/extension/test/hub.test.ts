import type {
  ServerMessage,
  SessionDetail,
  SessionWatch,
  WindowState
} from '@pocket-pilot/protocol';
import { describe, expect, it, vi } from 'vitest';

import { EMPTY_WINDOW, Hub, type HubClient, type WindowLink } from '../src/cluster/hub';

function windowState(windowId: string): WindowState {
  return {
    windowId,
    name: windowId,
    workspace: null,
    repositories: [],
    folders: [],
    sessions: [],
    terminals: [],
    canOrganize: true,
    agents: [],
    models: []
  };
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
    editedFiles: 0,
    todos: null,
    requests: Array.from({ length: count }, (_, index) => ({
      id: `r${index}`,
      timestamp: index,
      message: `m${index}`,
      modelId: null,
      agentName: null,
      state: 'complete' as const,
      error: null,
      parts: []
    })),
    queued: []
  };
}

function link(): WindowLink & { watches: SessionWatch[][]; terminalWatches: string[][] } {
  const watches: SessionWatch[][] = [];
  const terminalWatches: string[][] = [];
  return {
    watches,
    terminalWatches,
    watch: (sessions) => watches.push(sessions),
    watchTerminals: (terminalIds) => terminalWatches.push(terminalIds),
    run: vi.fn(() => Promise.resolve()),
    query: vi.fn(() => Promise.reject(new Error('No code'))),
    hook: vi.fn(() => Promise.resolve())
  };
}

function client(): HubClient & { messages: ServerMessage[] } {
  const messages: ServerMessage[] = [];
  return { messages, send: (message) => messages.push(message) };
}

describe('Hub', () => {
  it('sends a snapshot on connect and broadcasts window changes', () => {
    const hub = new Hub('1.0.0');
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

  it('lists windows running another version', () => {
    const hub = new Hub('1.0.0');
    const first = {};
    const second = {};
    hub.addIncompatible(first, 'Old');
    hub.addIncompatible(second, 'Older');
    const phone = client();
    hub.connect(phone);
    hub.removeIncompatible(first);
    hub.removeIncompatible(first);
    expect(phone.messages).toEqual([
      expect.objectContaining({ type: 'snapshot', incompatibleWindows: ['Old', 'Older'] }),
      { type: 'incompatibleWindows', names: ['Older'] }
    ]);
  });

  it('keeps the latest Copilot usage for new phones', () => {
    const hub = new Hub('1.0.0');
    const early = client();
    hub.connect(early);
    hub.setUsage({ state: 'needsAccess' });
    const late = client();
    hub.connect(late);
    expect(early.messages).toEqual([
      expect.objectContaining({ type: 'snapshot', usage: null }),
      { type: 'usage', usage: { state: 'needsAccess' } }
    ]);
    expect(late.messages).toEqual([
      expect.objectContaining({ type: 'snapshot', usage: { state: 'needsAccess' } })
    ]);
  });

  it('watches the largest limit per session and trims details per client', () => {
    const hub = new Hub('1.0.0');
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

  it('sends patches after the first full detail', () => {
    const hub = new Hub('1.0.0');
    hub.addWindow(windowState('w1'), link());
    const phone = client();
    hub.connect(phone);
    hub.subscribe(phone, { windowId: 'w1', sessionId: 's1', limit: 10 });
    hub.sessionUpdate('w1', 's1', detail(2));
    hub.sessionUpdate('w1', 's1', detail(3));
    hub.sessionUpdate('w1', 's1', detail(3));
    hub.subscribe(phone, { windowId: 'w1', sessionId: 's1', limit: 10 });
    expect(
      phone.messages.flatMap((message) => {
        if (message.type === 'session') return [['session', message.detail?.requests.length]];
        if (message.type === 'sessionPatch') {
          return [['patch', message.patch.requestsFrom, message.patch.requests.length]];
        }
        return [];
      })
    ).toEqual([
      ['session', 2],
      ['patch', 2, 1],
      ['session', 3]
    ]);
  });

  it('caches watched terminals and fans out their patches', () => {
    const hub = new Hub('1.0.0');
    const window = link();
    hub.addWindow(windowState('w1'), window);
    const first = client();
    const second = client();
    hub.connect(first);
    hub.connect(second);
    hub.watchTerminal(first, { windowId: 'w1', terminalId: 't1' });
    expect(window.terminalWatches.at(-1)).toEqual(['t1']);
    hub.terminalUpdate('w1', 't1', { id: 't1', dropped: 0, executions: [], stream: null });
    const execution = {
      id: 'e1',
      command: 'ls',
      cwd: null,
      startedAt: 1,
      endedAt: null,
      exitCode: null,
      sessionId: null,
      callId: null,
      alternate: false,
      dropped: 0,
      tail: [],
      append: [[{ text: 'a.ts', fg: null, bg: null, flags: 0 }]]
    };
    hub.terminalPatch('w1', 't1', { dropped: 0, executions: [execution], stream: null });
    hub.watchTerminal(second, { windowId: 'w1', terminalId: 't1' });
    hub.watchTerminal(first, { windowId: 'gone', terminalId: 't1' });
    const terminalMessages = (phone: { messages: ServerMessage[] }): ServerMessage[] =>
      phone.messages.filter(
        (message) => message.type === 'terminal' || message.type === 'terminalPatch'
      );
    expect(terminalMessages(first).map((message) => message.type)).toEqual([
      'terminal',
      'terminalPatch',
      'terminal'
    ]);
    expect(terminalMessages(first).at(-1)).toEqual({
      type: 'terminal',
      windowId: 'gone',
      terminalId: 't1',
      detail: null
    });
    const cached = terminalMessages(second)[0];
    expect(cached?.type === 'terminal' && cached.detail?.executions[0]?.lines).toEqual(
      execution.append
    );
    hub.disconnect(second);
    expect(window.terminalWatches.at(-1)).toEqual([]);
  });

  it('routes hooks to their window or to every empty window', async () => {
    const hub = new Hub('1.0.0');
    const windows = ['w1', `${EMPTY_WINDOW}a`, `${EMPTY_WINDOW}b`].map((id) => {
      const window = link();
      hub.addWindow(windowState(id), window);
      return window;
    });
    const event = { kind: 'stop' as const, sessionId: 's1', at: 0 };
    await hub.hook('w1', event);
    await hub.hook(null, event);
    await hub.hook('gone', event);
    expect(windows.map((window) => vi.mocked(window.hook).mock.calls.length)).toEqual([1, 1, 1]);
  });

  it('routes commands to the owning window', async () => {
    const hub = new Hub('1.0.0');
    const window = link();
    hub.addWindow(windowState('w1'), window);
    const command = { kind: 'stop' as const, windowId: 'w1', sessionId: 's1' };
    await hub.command(command);
    expect(window.run).toHaveBeenCalledWith(command);
    await expect(hub.command({ ...command, windowId: 'w2' })).rejects.toThrow(
      'Window is no longer open'
    );
  });

  it('refuses to close the last window', async () => {
    const hub = new Hub('1.0.0');
    const window = link();
    hub.addWindow(windowState('w1'), window);
    const command = { kind: 'closeWindow' as const, windowId: 'w1' };
    await expect(hub.command(command)).rejects.toThrow('needs one open VS Code window');
    expect(window.run).not.toHaveBeenCalled();
    hub.addWindow(windowState('w2'), link());
    await hub.command(command);
    expect(window.run).toHaveBeenCalledWith(command);
  });
});
