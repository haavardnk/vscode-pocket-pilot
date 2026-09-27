import { clientMessageSchema, parseMessage, type ServerMessage } from '@pocket-pilot/protocol';
import type { WebSocket } from 'ws';

import type { Hub, HubClient } from '../cluster/hub';
import { errorMessage } from '../errors';

const HEARTBEAT_MS = 30_000;
const MAX_BUFFERED_BYTES = 8 * 1024 * 1024;

export function acceptPhone(
  socket: WebSocket,
  hub: Hub,
  refreshPullRequests: () => void,
  report: (message: string) => void
): void {
  let alive = true;
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

  socket.on('message', (data) => {
    const message = parseMessage(clientMessageSchema, data.toString());
    if (!message) {
      report('Ignoring malformed phone message');
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
    if (message.type === 'refreshPullRequests') {
      refreshPullRequests();
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
