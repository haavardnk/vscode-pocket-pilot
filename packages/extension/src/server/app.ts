import type { Server } from 'node:http';

import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import {
  type AuthInfo,
  type Device,
  loginRequestSchema,
  pairRequestSchema
} from '@pocket-pilot/protocol';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';

import { acceptFollower } from '../cluster/followerLink';
import type { Hub } from '../cluster/hub';
import { LOOPBACK, sameSecret } from '../cluster/sharedState';
import { errorMessage } from '../errors';
import { parseHook } from '../hooks/hookEvent';
import { HOOK_HEADER } from '../hooks/hookFile';
import type { DeviceStore } from './devices';
import type { PairingStore } from './pairing';
import type { PhoneRegistry } from './phones';
import { acceptPhone } from './phoneSocket';
import { type PushEndpoint, registerPushRoutes } from './pushRoutes';
import { HOOK_PATH, INTERNAL_PATH, tunnelTraffic } from './tunnelTraffic';

export const TOKEN_COOKIE = 'pocket_pilot_token';

const MAX_PAYLOAD = 16 * 1024 * 1024;
const MAX_COOKIE_DAYS = 400;
const AUTH_RATE_LIMIT = { max: 10, timeWindow: '1 minute' };
const HOOK_WAIT_MS = 1500;

export interface PasswordCheck {
  enabled(): Promise<boolean>;
  verify(password: string): Promise<boolean>;
}

export interface ServerOptions {
  port: number;
  namedTunnel: boolean;
  webRoot: string;
  clusterSecret: string;
  hookSecret: string;
  hub: Hub;
  devices: DeviceStore;
  pairing: PairingStore;
  phones: PhoneRegistry;
  push: PushEndpoint;
  password: PasswordCheck;
  expireDays: () => number;
  phoneVisible: () => void;
  report: (message: string) => void;
}

export interface RunningServer {
  port: number;
  tunnel: Server;
  revokeMissing(): Promise<void>;
  close(): Promise<void>;
}

declare module 'fastify' {
  interface FastifyRequest {
    device: Device | null;
  }
}

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const { hub, devices, pairing, phones, password, report } = options;
  const app = Fastify({
    logger: false,
    bodyLimit: 64 * 1024,
    forceCloseConnections: true
  });

  app.decorateRequest('device', null);
  const tunnel = tunnelTraffic(app, options.namedTunnel);
  const sameOrigin = (request: FastifyRequest): boolean => {
    const { origin, upgrade } = request.headers;
    if (origin === undefined) return request.method === 'GET' && upgrade === undefined;
    return origin === `https://${request.headers.host}`;
  };

  await app.register(fastifyHelmet, {
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'self'"],
        'connect-src': ["'self'"],
        'img-src': ["'self'", 'data:', 'https://avatars.githubusercontent.com'],
        'style-src': ["'self'", "'unsafe-inline'"],
        'script-src': ["'self'"],
        'worker-src': ["'self'"],
        'manifest-src': ["'self'"],
        'frame-ancestors': ["'none'"],
        'form-action': ["'none'"]
      }
    }
  });
  await app.register(fastifyCookie);
  await app.register(fastifyRateLimit, { global: false });
  await app.register(fastifyWebsocket, { options: { maxPayload: MAX_PAYLOAD } });

  app.setErrorHandler((error: { statusCode?: number; message: string }, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) report(`Server error: ${error.message}`);
    void reply
      .code(statusCode)
      .send({ error: statusCode >= 500 ? 'Internal error' : error.message });
  });

  const authenticate = async (request: FastifyRequest): Promise<Device | null> => {
    const token = request.cookies[TOKEN_COOKIE];
    return token ? devices.authenticate(token) : null;
  };

  const authInfo = async (request: FastifyRequest, device: Device | null): Promise<AuthInfo> => ({
    device,
    passwordEnabled: await password.enabled(),
    connection: tunnel.connection
  });

  const signIn = async (
    request: FastifyRequest,
    reply: FastifyReply,
    deviceName: string
  ): Promise<AuthInfo> => {
    const { device, token } = await devices.add(deviceName);
    const days = options.expireDays();
    void reply.setCookie(TOKEN_COOKIE, token, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: (days > 0 ? Math.min(days, MAX_COOKIE_DAYS) : MAX_COOKIE_DAYS) * 86_400
    });
    report(`Paired ${deviceName}`);
    return authInfo(request, device);
  };

  const requireOrigin = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!sameOrigin(request)) await reply.code(403).send({ error: 'Cross-origin request refused' });
  };

  app.get('/api/auth', async (request) => authInfo(request, await authenticate(request)));

  app.post(
    '/api/pair',
    { config: { rateLimit: AUTH_RATE_LIMIT }, preHandler: requireOrigin },
    async (request, reply) => {
      const body = pairRequestSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Enter the 6 digit code' });
      if (!(await pairing.consume(body.data.code))) {
        return reply.code(401).send({ error: 'The code is wrong or expired' });
      }
      return signIn(request, reply, body.data.deviceName);
    }
  );

  app.post(
    '/api/login',
    { config: { rateLimit: AUTH_RATE_LIMIT }, preHandler: requireOrigin },
    async (request, reply) => {
      const body = loginRequestSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Enter the password' });
      if (!(await password.enabled()))
        return reply.code(404).send({ error: 'Password sign-in is off' });
      if (!(await password.verify(body.data.password)))
        return reply.code(401).send({ error: 'Wrong password' });
      return signIn(request, reply, body.data.deviceName);
    }
  );

  app.post('/api/logout', { preHandler: requireOrigin }, async (request, reply) => {
    const device = await authenticate(request);
    if (device) {
      await devices.remove([device.id]);
      phones.close(device.id);
    }
    void reply.clearCookie(TOKEN_COOKIE, { path: '/' });
    return authInfo(request, null);
  });

  app.register(async (scope) => {
    scope.addHook('preValidation', async (request, reply) => {
      if (!sameOrigin(request))
        return reply.code(403).send({ error: 'Cross-origin request refused' });
      request.device = await authenticate(request);
      if (!request.device) return reply.code(401).send({ error: 'Pair this device first' });
    });
    scope.get('/ws', { websocket: true }, (socket, request) => {
      const device = request.device;
      if (!device) return socket.close(4401, 'unauthorized');
      phones.add(socket, device.id);
      acceptPhone(
        socket,
        hub,
        (visible) => {
          phones.setVisible(socket, visible);
          if (visible) options.phoneVisible();
        },
        report
      );
    });
    registerPushRoutes(scope, options.push);
  });

  app.register(async (scope) => {
    scope.addHook('preValidation', async (request, reply) => {
      if (tunnel.carries(request)) return reply.code(403).send({ error: 'Local only' });
    });
    scope.get(INTERNAL_PATH, { websocket: true }, (socket) =>
      acceptFollower(socket, hub, options.clusterSecret, report)
    );
    scope.post(HOOK_PATH, { bodyLimit: MAX_PAYLOAD }, async (request, reply) => {
      const secret = request.headers[HOOK_HEADER];
      if (typeof secret !== 'string' || !sameSecret(options.hookSecret, secret)) {
        return reply.code(403).send({ error: 'Forbidden' });
      }
      const hook = parseHook(request.body);
      if (hook) {
        let timer: NodeJS.Timeout | undefined;
        await Promise.race([
          hub
            .hook(hook.windowId, hook.event)
            .catch((error: unknown) => report(`Chat hook failed: ${errorMessage(error)}`)),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, HOOK_WAIT_MS);
          })
        ]);
        clearTimeout(timer);
      }
      return reply.code(204).send();
    });
  });

  await app.register(fastifyStatic, {
    root: options.webRoot,
    wildcard: false,
    setHeaders: (reply, file) => {
      const immutable = /[/\\]assets[/\\]/.test(file);
      reply.header('cache-control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
    }
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.method !== 'GET' || request.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'Not found' });
    }
    return reply.header('cache-control', 'no-cache').sendFile('index.html');
  });

  try {
    await app.listen({ host: LOOPBACK, port: options.port });
  } catch (error) {
    await app.close();
    throw error;
  }

  const address = app.server.address();
  return {
    port: typeof address === 'object' && address ? address.port : options.port,
    tunnel: tunnel.server,
    revokeMissing: async () => {
      phones.closeMissing(new Set((await devices.list()).map((device) => device.id)));
    },
    close: async () => {
      await app.close();
      app.server.closeAllConnections();
    }
  };
}
