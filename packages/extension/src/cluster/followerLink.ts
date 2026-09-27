import { randomUUID } from 'node:crypto';

import {
  type CodeResult,
  type FollowerMessage,
  followerMessageSchema,
  type LeaderMessage,
  parseMessage
} from '@pocket-pilot/protocol';
import type { WebSocket } from 'ws';

import type { Hub, WindowLink } from './hub';
import { sameSecret } from './sharedState';

const REGISTER_TIMEOUT_MS = 5000;
const REQUEST_TIMEOUT_MS = 30_000;

type Reply = Extract<FollowerMessage, { type: 'result' | 'queryResult' }>;

interface Pending {
  settle: (reply: Reply) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

function commandOutcome(reply: Reply): void {
  if (reply.type !== 'result') throw new Error('Unexpected reply');
  if (!reply.ok) throw new Error(reply.error ?? 'Command failed');
}

function queryOutcome(reply: Reply): CodeResult {
  if (reply.type !== 'queryResult') throw new Error('Unexpected reply');
  if (!reply.result) throw new Error(reply.error ?? 'Query failed');
  return reply.result;
}

export function acceptFollower(
  socket: WebSocket,
  hub: Hub,
  secret: string,
  report: (message: string) => void
): void {
  const pending = new Map<string, Pending>();
  let windowId: string | null = null;
  const send = (message: LeaderMessage): void => socket.send(JSON.stringify(message));

  const request = <T>(
    message: (requestId: string) => LeaderMessage,
    outcome: (reply: Reply) => T
  ): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const requestId = randomUUID();
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error('The window did not respond'));
      }, REQUEST_TIMEOUT_MS);
      const settle = (reply: Reply): void => {
        try {
          resolve(outcome(reply));
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      };
      pending.set(requestId, { settle, reject, timer });
      send(message(requestId));
    });

  const link: WindowLink = {
    watch: (sessions) => send({ type: 'watch', sessions }),
    watchTerminals: (terminalIds) => send({ type: 'watchTerminals', terminalIds }),
    run: (command) =>
      request((requestId) => ({ type: 'command', requestId, command }), commandOutcome),
    query: (query) => request((requestId) => ({ type: 'query', requestId, query }), queryOutcome),
    hook: (event) => request((requestId) => ({ type: 'hook', requestId, event }), commandOutcome)
  };

  const registerTimer = setTimeout(
    () => socket.close(4001, 'register timeout'),
    REGISTER_TIMEOUT_MS
  );

  const handle = (message: FollowerMessage): void => {
    if (message.type === 'register') {
      if (windowId !== null || !sameSecret(secret, message.secret)) {
        socket.close(4003, 'forbidden');
        return;
      }
      clearTimeout(registerTimer);
      windowId = message.window.windowId;
      hub.addWindow(message.window, link);
      return;
    }
    if (windowId === null) {
      socket.close(4003, 'forbidden');
      return;
    }
    if (message.type === 'window') {
      if (message.window.windowId === windowId) hub.updateWindow(message.window);
      return;
    }
    if (message.type === 'session') {
      hub.sessionUpdate(windowId, message.sessionId, message.detail);
      return;
    }
    if (message.type === 'terminal') {
      hub.terminalUpdate(windowId, message.terminalId, message.detail);
      return;
    }
    if (message.type === 'terminalPatch') {
      hub.terminalPatch(windowId, message.terminalId, message.patch);
      return;
    }
    const waiting = pending.get(message.requestId);
    if (!waiting) return;
    pending.delete(message.requestId);
    clearTimeout(waiting.timer);
    waiting.settle(message);
  };

  socket.on('message', (data) => {
    const message = parseMessage(followerMessageSchema, data.toString());
    if (!message) {
      report('Ignoring malformed follower message');
      return;
    }
    handle(message);
  });

  socket.on('close', () => {
    clearTimeout(registerTimer);
    for (const waiting of pending.values()) {
      clearTimeout(waiting.timer);
      waiting.reject(new Error('The window disconnected'));
    }
    pending.clear();
    if (windowId !== null) hub.removeWindow(windowId, link);
  });
}
