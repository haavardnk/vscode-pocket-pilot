import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';

import type { ClientMessage, Device, PushEvents } from '@pocket-pilot/protocol';
import { WebSocketServer } from 'ws';

import { type MockClient, MockHub } from './hub.ts';

const PORT = Number(process.env.MOCK_PORT ?? 48112);
const DIST = join(import.meta.dirname, '..', 'dist');
const COOKIE = 'pocket_pilot_token';
const PAIRING_CODE = '123456';
const PASSWORD = 'correct horse';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json'
};

const hub = new MockHub();
const devices = new Map<string, Device>();
const pushes = new Map<string, { subscription: unknown; events: PushEvents }>();
const pushTests: string[] = [];

const PUSH_KEY =
  'BBbSzvfmzP9RzBcphct00u2qmFYTkZtBi63G1ymzZCRN1Vu7kqN5uFDQ0-TNu8K1uOVrCEtMZKTEG5x2Unvwqfw';
const DEFAULT_EVENTS: PushEvents = { finished: true, needsInput: true, failed: true };

function tokenOf(request: IncomingMessage): string | null {
  const match = new RegExp(`(?:^|; )${COOKIE}=([^;]+)`).exec(request.headers.cookie ?? '');
  return match?.[1] ?? null;
}

function deviceOf(request: IncomingMessage): Device | null {
  const token = tokenOf(request);
  return token ? (devices.get(token) ?? null) : null;
}

function json(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): void {
  response.writeHead(status, { 'content-type': 'application/json', ...headers });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function signIn(response: ServerResponse, name: unknown): void {
  const token = randomBytes(16).toString('hex');
  const device: Device = {
    id: token.slice(0, 8),
    name: String(name || 'Phone'),
    pairedAt: Date.now(),
    lastSeenAt: Date.now()
  };
  devices.set(token, device);
  json(
    response,
    200,
    { device, passwordEnabled: true, connection: 'quickTunnel' },
    { 'set-cookie': `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict` }
  );
}

async function serveStatic(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const pathname = new URL(request.url ?? '/', 'http://mock').pathname;
  const file = normalize(join(DIST, pathname));
  const target = file.startsWith(DIST) && extname(file) ? file : join(DIST, 'index.html');
  try {
    const body = await readFile(target);
    response.writeHead(200, {
      'content-type': TYPES[extname(target)] ?? 'application/octet-stream'
    });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = request.url ?? '/';
  if (url === '/__reset' && request.method === 'POST') {
    hub.reset();
    devices.clear();
    pushes.clear();
    pushTests.length = 0;
    return json(response, 200, {});
  }
  if (url === '/__push') return json(response, 200, { pushes: [...pushes.values()], pushTests });
  if (url === '/api/auth')
    return json(response, 200, {
      device: deviceOf(request),
      passwordEnabled: true,
      connection: 'quickTunnel'
    });
  if (url === '/api/pair' && request.method === 'POST') {
    const body = await readBody(request);
    if (body.code !== PAIRING_CODE)
      return json(response, 401, { error: 'The code is wrong or expired' });
    return signIn(response, body.deviceName);
  }
  if (url === '/api/login' && request.method === 'POST') {
    const body = await readBody(request);
    if (body.password !== PASSWORD) return json(response, 401, { error: 'Wrong password' });
    return signIn(response, body.deviceName);
  }
  if (url === '/api/logout' && request.method === 'POST') {
    const token = tokenOf(request);
    if (token) devices.delete(token);
    return json(
      response,
      200,
      { device: null, passwordEnabled: true, connection: 'quickTunnel' },
      { 'set-cookie': `${COOKIE}=; Path=/; Max-Age=0` }
    );
  }
  if (url.startsWith('/api/push')) return handlePush(request, response, url);
  if (url.startsWith('/api/')) return json(response, 404, { error: 'Not found' });
  await serveStatic(request, response);
}

async function handlePush(
  request: IncomingMessage,
  response: ServerResponse,
  url: string
): Promise<void> {
  const device = deviceOf(request);
  if (!device) return json(response, 401, { error: 'Pair this device first' });
  const stored = pushes.get(device.id);
  if (url === '/api/push/test' && request.method === 'POST') {
    if (!stored) return json(response, 404, { error: 'Notifications are off on this device' });
    pushTests.push(device.id);
    return json(response, 204, null);
  }
  if (url !== '/api/push') return json(response, 404, { error: 'Not found' });
  if (request.method === 'GET')
    return json(response, 200, { publicKey: PUSH_KEY, events: stored?.events ?? null });
  if (request.method === 'DELETE') {
    pushes.delete(device.id);
    return json(response, 204, null);
  }
  const body = await readBody(request);
  const events = (body.events as PushEvents | null) ?? stored?.events ?? DEFAULT_EVENTS;
  pushes.set(device.id, { subscription: body.subscription, events });
  return json(response, 200, { publicKey: PUSH_KEY, events });
}

const server = createServer((request, response) => {
  handle(request, response).catch((error: unknown) => {
    console.error(error);
    json(response, 500, { error: 'Internal error' });
  });
});

const sockets = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  if (request.url !== '/ws' || !deviceOf(request)) {
    socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');
    return;
  }
  sockets.handleUpgrade(request, socket, head, (ws) => {
    const client: MockClient = {
      subscription: null,
      terminal: null,
      send: (message) => ws.send(JSON.stringify(message))
    };
    hub.connect(client);
    ws.on('message', (raw: Buffer) => {
      const message = JSON.parse(raw.toString('utf8')) as ClientMessage;
      if (message.type === 'presence') return;
      if (message.type === 'subscribe') hub.subscribe(client, message);
      else if (message.type === 'unsubscribe') hub.subscribe(client, null);
      else if (message.type === 'watchTerminal') hub.watchTerminal(client, message);
      else if (message.type === 'unwatchTerminal') hub.watchTerminal(client, null);
      else if (message.type === 'query') {
        try {
          const result = hub.query(message.query);
          client.send({ type: 'queryResult', requestId: message.requestId, result, error: null });
        } catch (error) {
          const text = error instanceof Error ? error.message : String(error);
          client.send({
            type: 'queryResult',
            requestId: message.requestId,
            result: null,
            error: text
          });
        }
      } else {
        try {
          hub.run(message.command);
          client.send({ type: 'result', requestId: message.requestId, ok: true, error: null });
        } catch (error) {
          const text = error instanceof Error ? error.message : String(error);
          client.send({ type: 'result', requestId: message.requestId, ok: false, error: text });
        }
      }
    });
    ws.on('close', () => hub.disconnect(client));
  });
});

server.listen(PORT, () =>
  console.log(`Mock Pocket Pilot on http://localhost:${PORT} (code ${PAIRING_CODE})`)
);
