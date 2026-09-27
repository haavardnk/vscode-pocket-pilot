import {
  type PushRegistration,
  pushRegistrationSchema,
  type PushSettings
} from '@pocket-pilot/protocol';
import type { FastifyInstance, FastifyRequest } from 'fastify';

export interface PushEndpoint {
  settings(deviceId: string): Promise<PushSettings>;
  register(deviceId: string, registration: PushRegistration, origin: string): Promise<PushSettings>;
  unregister(deviceId: string): Promise<void>;
  test(deviceId: string): Promise<void>;
}

export class PushError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

const WRITE_RATE_LIMIT = { max: 10, timeWindow: '1 minute' };

function deviceId(request: FastifyRequest): string {
  if (!request.device) throw new PushError(401, 'Not paired');
  return request.device.id;
}

export function registerPushRoutes(scope: FastifyInstance, push: PushEndpoint): void {
  scope.get('/api/push', (request) => push.settings(deviceId(request)));

  scope.put('/api/push', { config: { rateLimit: WRITE_RATE_LIMIT } }, (request) => {
    const body = pushRegistrationSchema.safeParse(request.body);
    if (!body.success) throw new PushError(400, 'Invalid push subscription');
    return push.register(deviceId(request), body.data, request.headers.origin ?? '');
  });

  scope.delete('/api/push', async (request, reply) => {
    await push.unregister(deviceId(request));
    return reply.code(204).send();
  });

  scope.post(
    '/api/push/test',
    { config: { rateLimit: WRITE_RATE_LIMIT } },
    async (request, reply) => {
      try {
        await push.test(deviceId(request));
        return await reply.code(204).send();
      } catch (error) {
        if (!(error instanceof PushError)) throw error;
        return reply.code(error.statusCode).send({ error: error.message });
      }
    }
  );
}
