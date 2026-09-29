import {
  challengeSchema,
  type FollowerMessage,
  type LeaderMessage,
  leaderMessageSchema,
  mismatchReply,
  parseMessage
} from '@pocket-pilot/protocol';
import WebSocket from 'ws';

import { errorMessage } from '../errors';
import { INTERNAL_PATH } from '../server/tunnelTraffic';
import type { FollowerHandle } from './cluster';
import { newNonce, proof, validProof } from './handshake';
import type { Disposable, LocalWindow } from './localWindow';
import { clusterSecret, LOOPBACK } from './sharedState';

interface FollowerOptions {
  port: number;
  secret: string;
}

const MAX_PAYLOAD = 16 * 1024 * 1024;
const HANDSHAKE_TIMEOUT_MS = 5000;

function connectFollower(
  window: LocalWindow,
  options: FollowerOptions,
  report: (message: string) => void
): { opened: Promise<void>; closed: Promise<void>; close: () => void } {
  const socket = new WebSocket(`ws://${LOOPBACK}:${options.port}${INTERNAL_PATH}`, {
    maxPayload: MAX_PAYLOAD
  });
  const subscriptions: Disposable[] = [];
  const nonce = newNonce();
  let verified = false;
  let warned = false;
  const send = (message: FollowerMessage): void => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  const run = async (
    message: Extract<LeaderMessage, { type: 'command' | 'hook' }>
  ): Promise<void> => {
    try {
      await (message.type === 'hook' ? window.hook(message.event) : window.run(message.command));
      send({ type: 'result', requestId: message.requestId, ok: true, error: null });
    } catch (error) {
      send({ type: 'result', requestId: message.requestId, ok: false, error: errorMessage(error) });
    }
  };

  const query = async (message: Extract<LeaderMessage, { type: 'query' }>): Promise<void> => {
    const { requestId } = message;
    try {
      const result = await window.query(message.query);
      send({ type: 'queryResult', requestId, result, error: null });
    } catch (error) {
      send({ type: 'queryResult', requestId, result: null, error: errorMessage(error) });
    }
  };

  let accept: () => void = () => undefined;
  let refuse: (error: Error) => void = () => undefined;
  const opened = new Promise<void>((resolve, reject) => {
    accept = resolve;
    refuse = reject;
    socket.once('error', reject);
  });
  const handshakeTimer = setTimeout(
    () => refuse(new Error('The leader did not answer the cluster check')),
    HANDSHAKE_TIMEOUT_MS
  );
  socket.once('open', () => send({ type: 'hello', nonce }));

  const verify = (text: string): void => {
    const challenge = parseMessage(challengeSchema, text);
    if (!challenge || !validProof(options.secret, 'leader', options.port, nonce, challenge.proof)) {
      refuse(new Error('The leader failed the cluster check'));
      return;
    }
    verified = true;
    clearTimeout(handshakeTimer);
    send({
      type: 'register',
      proof: proof(options.secret, 'follower', options.port, challenge.nonce),
      window: window.state()
    });
    subscriptions.push(
      window.onDidChangeState((state) => send({ type: 'window', window: state })),
      window.onDidChangeSession(({ sessionId, detail }) =>
        send({ type: 'session', sessionId, detail })
      ),
      window.onDidChangeTerminal((update) =>
        send(
          'patch' in update
            ? { type: 'terminalPatch', terminalId: update.terminalId, patch: update.patch }
            : { type: 'terminal', terminalId: update.terminalId, detail: update.detail }
        )
      )
    );
    accept();
  };

  const closed = new Promise<void>((resolve) => {
    socket.once('close', () => {
      clearTimeout(handshakeTimer);
      for (const subscription of subscriptions) subscription.dispose();
      window.setWatches([]);
      window.setTerminalWatches([]);
      resolve();
    });
  });

  socket.on('error', (error) => {
    if (subscriptions.length > 0) report(`Leader connection error: ${error.message}`);
  });
  const unreadable = (text: string): void => {
    const reply = mismatchReply(text);
    if (reply) send(reply);
    if (warned) return;
    warned = true;
    report('The leader window runs a different Pocket Pilot version. Reload every VS Code window.');
  };

  socket.on('message', (data) => {
    const text = data.toString();
    if (!verified) {
      verify(text);
      return;
    }
    const message = parseMessage(leaderMessageSchema, text);
    if (!message) {
      unreadable(text);
      return;
    }
    if (message.type === 'challenge') return;
    if (message.type === 'watch') window.setWatches(message.sessions);
    else if (message.type === 'watchTerminals') window.setTerminalWatches(message.terminalIds);
    else if (message.type === 'query') void query(message);
    else void run(message);
  });

  return { opened, closed, close: () => socket.close() };
}

export async function followLeader(
  window: LocalWindow,
  storage: string,
  port: number,
  report: (message: string) => void
): Promise<FollowerHandle> {
  const connection = connectFollower(
    window,
    { port, secret: await clusterSecret(storage) },
    report
  );
  try {
    await connection.opened;
  } catch (error) {
    connection.close();
    throw error;
  }
  return { closed: connection.closed, close: connection.close };
}
