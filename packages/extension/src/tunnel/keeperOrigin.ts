import { once } from 'node:events';
import { createServer, type Socket } from 'node:net';

import { LOOPBACK } from '../cluster/sharedState';
import { openLink } from './originLink';

export interface KeeperOrigin {
  close(): Promise<void>;
}

function relay(client: Socket, upstream: Socket): void {
  upstream.once('close', () => client.destroy());
  client.once('close', () => upstream.destroy());
  client.pipe(upstream);
  upstream.pipe(client);
}

export async function listenOrigin(
  port: number,
  linkFile: string,
  secret: string
): Promise<KeeperOrigin> {
  const sockets = new Set<Socket>();
  const server = createServer({ allowHalfOpen: true, pauseOnConnect: true }, (client) => {
    sockets.add(client);
    client.once('close', () => sockets.delete(client));
    client.on('error', () => client.destroy());
    openLink(linkFile, secret).then(
      (upstream) => {
        if (client.destroyed) upstream.destroy();
        else relay(client, upstream);
      },
      () => client.destroy()
    );
  });
  server.listen({ host: LOOPBACK, port });
  try {
    await once(server, 'listening');
  } catch (error) {
    throw (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
      ? new Error(`Port ${port} for the tunnel is used by another program`)
      : error;
  }

  return {
    close: async () => {
      const closed = once(server, 'close');
      server.close();
      for (const socket of sockets) socket.destroy();
      await closed;
    }
  };
}
