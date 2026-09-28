import {
  clientMessageSchema,
  mismatchReply,
  parseMessage,
  type ServerMessage
} from '@pocket-pilot/protocol';
import type { WebSocket } from 'ws';

import type { Hub, HubClient } from '../cluster/hub';
import { errorMessage } from '../errors';

const HEARTBEAT_MS = 30_000;
const MAX_BUFFERED_BYTES = 8 * 1024 * 1024;

export function acceptPhone(
  socket: WebSocket,
  hub: Hub,
  presence: (visible: boolean) => void,
  report: (message: string) => void
): void {
  let alive = true;
  let warned = false;
  const client: HubClient = {
    send: (message: ServerMessage) => {
      if (socket.readyState !== socket.OPEN) return;
      if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
        socket.terminate();
        return;
      }
      socket.send(JSON.stringify(message));
    }
  };

  const heartbeat = setInterval(() => {
    if (!alive) {
      socket.terminate();
      return;
    }
    alive = false;
    socket.ping();
  }, HEARTBEAT_MS);

  socket.on('pong', () => {
    alive = true;
  });

  const unreadable = (text: string): void => {
    const reply = mismatchReply(text);
    if (reply) client.send(reply);
    if (warned) return;
    warned = true;
    report('The phone runs a different Pocket Pilot version. Reload the Pocket Pilot app.');
  };

  socket.on('message', (data) => {
    const text = data.toString();
    const message = parseMessage(clientMessageSchema, text);
    if (!message) {
      unreadable(text);
      return;
    }
    if (message.type === 'subscribe') {
      hub.subscribe(client, {
        windowId: message.windowId,
        sessionId: message.sessionId,
        limit: message.limit
      });
      return;
    }
    if (message.type === 'unsubscribe') {
      hub.subscribe(client, null);
      return;
    }
    if (message.type === 'watchTerminal') {
      hub.watchTerminal(client, { windowId: message.windowId, terminalId: message.terminalId });
      return;
    }
    if (message.type === 'unwatchTerminal') {
      hub.watchTerminal(client, null);
      return;
    }
    if (message.type === 'presence') {
      presence(message.visible);
      return;
    }
    if (message.type === 'query') {
      const { requestId, query } = message;
      hub.query(query).then(
        (result) => client.send({ type: 'queryResult', requestId, result, error: null }),
        (error: unknown) => {
          report(`${query.kind} query failed: ${errorMessage(error)}`);
          client.send({ type: 'queryResult', requestId, result: null, error: errorMessage(error) });
        }
      );
      return;
    }
    const { requestId, command } = message;
    hub.command(command).then(
      () => client.send({ type: 'result', requestId, ok: true, error: null }),
      (error: unknown) => {
        report(`${command.kind} failed: ${errorMessage(error)}`);
        client.send({ type: 'result', requestId, ok: false, error: errorMessage(error) });
      }
    );
  });

  socket.on('close', () => {
    clearInterval(heartbeat);
    hub.disconnect(client);
  });

  hub.connect(client);
}
