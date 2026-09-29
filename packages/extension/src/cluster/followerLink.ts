import { randomUUID } from 'node:crypto';

import {
  type FollowerMessage,
  followerMessageSchema,
  type LeaderMessage,
  parseMessage,
  type QueryResult,
  stableRegisterSchema,
  stableRequestSchema,
  VERSION_MISMATCH
} from '@pocket-pilot/protocol';
import type { WebSocket } from 'ws';

import { newNonce, proof, validProof } from './handshake';
import type { Hub, WindowLink } from './hub';

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

function queryOutcome(reply: Reply): QueryResult {
  if (reply.type !== 'queryResult') throw new Error('Unexpected reply');
  if (!reply.result) throw new Error(reply.error ?? 'Query failed');
  return reply.result;
}

export interface FollowerCheck {
  secret: string;
  port: number;
}

export function acceptFollower(
  socket: WebSocket,
  hub: Hub,
  check: FollowerCheck,
  report: (message: string) => void
): void {
  const pending = new Map<string, Pending>();
  const nonce = newNonce();
  let challenged = false;
  let windowId: string | null = null;
  let incompatible = false;
  const send = (message: LeaderMessage): void => socket.send(JSON.stringify(message));
  const registered = (candidate: string): boolean =>
    validProof(check.secret, 'follower', check.port, nonce, candidate);

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
    if (message.type === 'hello') {
      if (challenged) {
        socket.close(4003, 'forbidden');
        return;
      }
      challenged = true;
      send({
        type: 'challenge',
        nonce,
        proof: proof(check.secret, 'leader', check.port, message.nonce)
      });
      return;
    }
    if (message.type === 'register') {
      if (windowId !== null || !challenged || !registered(message.proof)) {
        socket.close(4003, 'forbidden');
        return;
      }
      clearTimeout(registerTimer);
      windowId = message.window.windowId;
      hub.addWindow(message.window, link);
      return;
    }
    if (windowId === null) {
      if (!incompatible) socket.close(4003, 'forbidden');
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

  const unreadable = (text: string): void => {
    const reply = parseMessage(stableRequestSchema, text);
    const waiting = reply ? pending.get(reply.requestId) : undefined;
    if (reply && waiting) {
      pending.delete(reply.requestId);
      clearTimeout(waiting.timer);
      waiting.reject(new Error(VERSION_MISMATCH));
    }
    if (incompatible) return;
    const register = windowId === null ? parseMessage(stableRegisterSchema, text) : null;
    const name =
      windowId === null
        ? register && challenged && registered(register.proof)
          ? register.window.name
          : null
        : (hub.windowStates().find((state) => state.windowId === windowId)?.name ?? windowId);
    if (name === null) return;
    incompatible = true;
    clearTimeout(registerTimer);
    hub.addIncompatible(socket, name);
    report(`${name} runs a different Pocket Pilot version. Reload every VS Code window.`);
  };

  socket.on('message', (data) => {
    const text = data.toString();
    const message = parseMessage(followerMessageSchema, text);
    if (message) handle(message);
    else unreadable(text);
  });

  socket.on('close', () => {
    clearTimeout(registerTimer);
    hub.removeIncompatible(socket);
    for (const waiting of pending.values()) {
      clearTimeout(waiting.timer);
      waiting.reject(new Error('The window disconnected'));
    }
    pending.clear();
    if (windowId !== null) hub.removeWindow(windowId, link);
  });
}
