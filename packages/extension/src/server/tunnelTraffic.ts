import type { Server } from 'node:http';
import type { Socket } from 'node:net';

import type { Connection } from '@pocket-pilot/protocol';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { forwardTo } from './forward';

export const INTERNAL_PATH = '/internal';

const INSTALL_FILES = new Set(['/manifest.webmanifest', '/sw.js', '/registerSW.js']);

export interface TunnelTraffic {
  server: Server;
  connection: Connection;
  carries(request: FastifyRequest): boolean;
}

export function tunnelTraffic(app: FastifyInstance, named: boolean): TunnelTraffic {
  const sockets = new WeakSet<Socket>();
  const server = forwardTo(app.server).on('connection', (socket: Socket) => sockets.add(socket));
  const carries = (request: FastifyRequest): boolean => sockets.has(request.raw.socket);

  app.addHook('onRequest', async (request, reply) => {
    const pathname = request.url.split('?')[0] ?? '';
    if (!carries(request)) {
      if (pathname !== INTERNAL_PATH) return reply.code(404).send({ error: 'Not found' });
      return;
    }
    if (request.headers['x-forwarded-proto'] !== 'https')
      return reply.redirect(`https://${request.host}${request.url}`, 308);
    if (!named && INSTALL_FILES.has(pathname)) return reply.code(404).send({ error: 'Not found' });
  });

  return { server, connection: named ? 'tunnel' : 'quickTunnel', carries };
}
