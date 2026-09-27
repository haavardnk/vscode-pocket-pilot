import { randomUUID, timingSafeEqual } from 'node:crypto';

import {
  type Command,
  type FollowerMessage,
  followerMessageSchema,
  type LeaderMessage,
  parseMessage
} from '@pocket-pilot/protocol';
import type { WebSocket } from 'ws';

import type { Hub, WindowLink } from './hub';

const REGISTER_TIMEOUT_MS = 5000;
const COMMAND_TIMEOUT_MS = 30_000;

interface Pending {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

function sameSecret(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
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

  const link: WindowLink = {
    watch: (sessions) => send({ type: 'watch', sessions }),
    run: (command: Command) =>
      new Promise<void>((resolve, reject) => {
        const requestId = randomUUID();
        const timer = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error('The window did not respond'));
        }, COMMAND_TIMEOUT_MS);
        pending.set(requestId, { resolve, reject, timer });
        send({ type: 'command', requestId, command });
      })
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
    const waiting = pending.get(message.requestId);
    if (!waiting) return;
    pending.delete(message.requestId);
    clearTimeout(waiting.timer);
    if (message.ok) waiting.resolve();
    else waiting.reject(new Error(message.error ?? 'Command failed'));
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
