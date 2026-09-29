import type { Server } from 'node:http';
import type { Socket } from 'node:net';

import type { Connection } from '@pocket-pilot/protocol';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { ACCESS_TOKEN_HEADER, type AccessCheck } from './accessCheck';
import { forwardTo } from './forward';

export const INTERNAL_PATH = '/internal';
export const HOOK_PATH = '/internal/hook';

const LOCAL_PATHS = new Set([INTERNAL_PATH, HOOK_PATH]);

const INSTALL_FILES = new Set(['/manifest.webmanifest', '/sw.js', '/registerSW.js']);

export interface TunnelTraffic {
  server: Server;
  connection: Connection;
  carries(request: FastifyRequest): boolean;
}

export function tunnelTraffic(
  app: FastifyInstance,
  named: boolean,
  access: AccessCheck | null
): TunnelTraffic {
  const sockets = new WeakSet<Socket>();
  const server = forwardTo(app.server).on('connection', (socket: Socket) => sockets.add(socket));
  const carries = (request: FastifyRequest): boolean => sockets.has(request.raw.socket);

  app.addHook('onRequest', async (request, reply) => {
    const pathname = request.url.split('?')[0] ?? '';
    if (!carries(request)) {
      if (!LOCAL_PATHS.has(pathname)) return reply.code(404).send({ error: 'Not found' });
      return;
    }
    if (request.headers['x-forwarded-proto'] !== 'https')
      return reply.redirect(`https://${request.host}${request.url}`, 308);
    if (access && !(await access.allows(request.headers[ACCESS_TOKEN_HEADER])))
      return reply.code(403).send({ error: 'Cloudflare Access did not approve this request' });
    if (!named && INSTALL_FILES.has(pathname)) return reply.code(404).send({ error: 'Not found' });
  });

  return { server, connection: named ? 'tunnel' : 'quickTunnel', carries };
}
