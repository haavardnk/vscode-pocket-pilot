import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { type IncomingHttpHeaders, type IncomingMessage, request } from 'node:http';
import { type AddressInfo, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { authInfoSchema } from '@pocket-pilot/protocol';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { Hub } from '../src/cluster/hub';
import { HOOK_HEADER, installHooks } from '../src/hooks/hookFile';
import { PushService } from '../src/push/pushService';
import { PushStore } from '../src/push/pushStore';
import { vapidKeys } from '../src/push/vapid';
import { ACCESS_TOKEN_HEADER, type AccessCheck } from '../src/server/accessCheck';
import { type RunningServer, startServer, TOKEN_COOKIE } from '../src/server/app';
import { DeviceStore } from '../src/server/devices';
import { PairingStore } from '../src/server/pairing';
import { PhoneRegistry } from '../src/server/phones';
import { HOOK_PATH } from '../src/server/tunnelTraffic';

interface Response {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

interface Fixture {
  folder: string;
  port: number;
  tunnelPort: number;
  server: RunningServer;
  hub: Hub;
  sent: string[];
}

interface RequestOptions {
  tunnel?: boolean;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

const PUBLIC_HOST = 'abc.trycloudflare.com';
const PUBLIC_ORIGIN = `https://${PUBLIC_HOST}`;
const HOOK_SECRET = 'hook-secret';

function closedPort(): Promise<number> {
  const probe = createServer();
  return new Promise((resolve) =>
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    })
  );
}

async function start(namedTunnel = false, access: AccessCheck | null = null): Promise<Fixture> {
  const folder = await mkdtemp(join(tmpdir(), 'pocket-pilot-server-'));
  await writeFile(join(folder, 'index.html'), '<!doctype html><title>app</title>');
  await writeFile(join(folder, 'manifest.webmanifest'), '{}');
  const sent: string[] = [];
  const devices = new DeviceStore(join(folder, 'devices.json'), () => 30);
  const phones = new PhoneRegistry();
  const hub = new Hub('1.0.0');
  const server = await startServer({
    port: 0,
    namedTunnel,
    access,
    webRoot: folder,
    clusterSecret: 'secret',
    hookSecret: HOOK_SECRET,
    hub,
    devices,
    pairing: new PairingStore(join(folder, 'pairing.json')),
    phones,
    push: new PushService({
      store: new PushStore(join(folder, 'push.json')),
      keys: await vapidKeys(join(folder, 'vapid.json')),
      activeDevices: async () => new Set((await devices.list()).map((device) => device.id)),
      visible: (deviceId) => phones.visible(deviceId),
      send: async (_subscription, payload) => {
        sent.push(payload);
      },
      report: () => undefined
    }),
    password: { enabled: async () => false, verify: async () => false },
    expireDays: () => 30,
    phoneVisible: () => undefined,
    report: () => undefined
  });
  await new Promise<void>((resolve) => server.tunnel.listen(0, '127.0.0.1', resolve));
  const { port: tunnelPort } = server.tunnel.address() as AddressInfo;
  return { folder, port: server.port, tunnelPort, server, hub, sent };
}

async function cleanUp(fixture: Fixture): Promise<void> {
  fixture.server.tunnel.close();
  fixture.server.tunnel.closeAllConnections();
  await fixture.server.close();
  await rm(fixture.folder, { recursive: true, force: true });
}

function viaTunnel(headers: Record<string, string> = {}): Record<string, string> {
  return { host: PUBLIC_HOST, 'x-forwarded-proto': 'https', ...headers };
}

function send(fixture: Fixture, path: string, options: RequestOptions = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const target = {
      host: '127.0.0.1',
      port: options.tunnel ? fixture.tunnelPort : fixture.port,
      path,
      method: options.method ?? 'GET',
      headers: options.headers,
      agent: false
    };
    request(target, (response: IncomingMessage) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () =>
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString()
        })
      );
    })
      .on('error', reject)
      .end(options.body);
  });
}

function opened(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
}

function refused(socket: WebSocket): Promise<number> {
  socket.on('error', () => undefined);
  return new Promise((resolve) =>
    socket.once('unexpected-response', (_request, response) => {
      socket.terminate();
      resolve(response.statusCode ?? 0);
    })
  );
}

async function pair(fixture: Fixture, origin: string): Promise<Response> {
  const { code } = await new PairingStore(join(fixture.folder, 'pairing.json')).create();
  return send(fixture, '/api/pair', {
    tunnel: true,
    method: 'POST',
    headers: viaTunnel({ origin, 'content-type': 'application/json' }),
    body: JSON.stringify({ code, deviceName: 'Phone' })
  });
}

describe('server', () => {
  let fixture: Fixture;

  beforeAll(async () => {
    fixture = await start();
  });

  afterAll(async () => {
    fixture.server.tunnel.close();
    await rm(fixture.folder, { recursive: true, force: true });
  });

  it('serves only the cluster link on the local port', async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${fixture.port}/internal`);
    await opened(socket);
    socket.close();
    const [page, auth] = await Promise.all([send(fixture, '/'), send(fixture, '/api/auth')]);
    expect([page.status, auth.status]).toEqual([404, 404]);
  });

  it('redirects plain HTTP tunnel requests to HTTPS', async () => {
    const response = await send(fixture, '/api/auth?x=1', {
      tunnel: true,
      headers: viaTunnel({ 'x-forwarded-proto': 'http' })
    });
    expect(response.status).toBe(308);
    expect(response.headers.location).toBe(`${PUBLIC_ORIGIN}/api/auth?x=1`);
  });

  it('sends a returning sign-in to the app', async () => {
    const response = await send(fixture, '/signin', { tunnel: true, headers: viaTunnel() });
    expect([response.status, response.headers.location]).toEqual([302, '/']);
  });

  it('serves web files installed after start and refuses missing ones', async () => {
    await mkdir(join(fixture.folder, 'assets'), { recursive: true });
    await writeFile(join(fixture.folder, 'assets', 'index-new.js'), 'export {};');
    const get = (path: string): Promise<Response> =>
      send(fixture, path, { tunnel: true, headers: viaTunnel() });
    const [script, missing, page] = await Promise.all([
      get('/assets/index-new.js'),
      get('/assets/index-old.js?v=1'),
      get('/chats')
    ]);
    expect([script.status, script.body]).toEqual([200, 'export {};']);
    expect(missing.status).toBe(404);
    expect([page.status, page.body]).toEqual([200, '<!doctype html><title>app</title>']);
  });

  it('refuses cluster links through the tunnel', async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${fixture.tunnelPort}/internal`, {
      headers: viaTunnel()
    });
    expect(await refused(socket)).toBe(403);
  });

  it.each([
    ['the hook secret', false, HOOK_SECRET, 204, 1],
    ['a wrong secret', false, 'guess', 403, 0],
    ['the tunnel', true, HOOK_SECRET, 403, 0]
  ])('handles chat hooks sent with %s', async (_name, tunnel, secret, status, calls) => {
    const window = {
      watch: vi.fn(),
      watchTerminals: vi.fn(),
      run: vi.fn(),
      query: vi.fn(),
      hook: vi.fn(async () => {})
    };
    fixture.hub.addWindow(
      {
        windowId: 'ws1',
        name: 'ws1',
        workspace: null,
        repositories: [],
        folders: [],
        sessions: [],
        terminals: [],
        canOrganize: true,
        agents: [],
        models: []
      },
      window
    );
    const response = await send(fixture, HOOK_PATH, {
      tunnel,
      method: 'POST',
      headers: {
        ...(tunnel ? viaTunnel() : {}),
        'content-type': 'application/json',
        [HOOK_HEADER]: secret
      },
      body: JSON.stringify({
        hook_event_name: 'Stop',
        session_id: 's1',
        timestamp: '2026-01-01T00:00:00.000Z',
        transcript_path: '/u/workspaceStorage/ws1/GitHub.copilot-chat/transcripts/s1.jsonl'
      })
    });
    fixture.hub.removeWindow('ws1', window);
    expect(response.status).toBe(status);
    expect(window.hook).toHaveBeenCalledTimes(calls);
  });

  it.skipIf(process.platform === 'win32').each([
    ['a running server', HOOK_SECRET, 1],
    ['a wrong secret', 'guess', 0],
    ['a closed port', HOOK_SECRET, 0]
  ])('runs the installed hook command against %s', async (name, secret, calls) => {
    const window = {
      watch: vi.fn(),
      watchTerminals: vi.fn(),
      run: vi.fn(),
      query: vi.fn(),
      hook: vi.fn(async () => {})
    };
    fixture.hub.addWindow(
      {
        windowId: 'ws2',
        name: 'ws2',
        workspace: null,
        repositories: [],
        folders: [],
        sessions: [],
        terminals: [],
        canOrganize: true,
        agents: [],
        models: []
      },
      window
    );
    const port = name === 'a closed port' ? await closedPort() : fixture.port;
    const folder = join(fixture.folder, `it's ${calls} hooks`);
    const hookFile = join(folder, 'pocket-pilot.json');
    await installHooks({ hookFile, headersFile: join(folder, 'hook-headers'), port, secret });
    const text = await readFile(hookFile, 'utf8');
    expect(text).not.toContain(secret);
    const { hooks } = JSON.parse(text) as {
      hooks: Record<string, { command: string }[]>;
    };
    const output = await new Promise<string>((resolve, reject) => {
      const child = execFile(
        'sh',
        ['-c', hooks.Stop?.[0]?.command ?? 'false'],
        (error, stdout, stderr) => (error ? reject(error) : resolve(stdout + stderr))
      );
      child.stdin?.end(
        JSON.stringify({
          hook_event_name: 'Stop',
          session_id: 's1',
          transcript_path: "/u/workspaceStorage/ws2/it's here/s1.jsonl"
        })
      );
    });
    fixture.hub.removeWindow('ws2', window);
    expect(output).toBe('');
    expect(window.hook).toHaveBeenCalledTimes(calls);
  });

  it('refuses cross-origin pairing', async () => {
    expect((await pair(fixture, 'https://evil.test')).status).toBe(403);
  });

  it('releases the port on close', async () => {
    await fixture.server.close();
    const probe = createServer();
    await new Promise<void>((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(fixture.port, '127.0.0.1', resolve);
    });
    probe.close();
  });
});

describe.each([
  { namedTunnel: false, connection: 'quickTunnel', manifest: 404 },
  { namedTunnel: true, connection: 'tunnel', manifest: 200 }
])('server through a $connection', ({ namedTunnel, connection, manifest }) => {
  let fixture: Fixture;

  beforeAll(async () => {
    fixture = await start(namedTunnel);
  });

  afterAll(() => cleanUp(fixture));

  it('pairs with a secure cookie and opens the phone socket', async () => {
    const paired = await pair(fixture, PUBLIC_ORIGIN);
    expect(paired.status).toBe(200);
    expect(authInfoSchema.parse(JSON.parse(paired.body)).connection).toBe(connection);
    const cookie = paired.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain(`${TOKEN_COOKIE}=`);
    expect(cookie).toMatch(/;\s*secure/i);

    const socket = new WebSocket(`ws://127.0.0.1:${fixture.tunnelPort}/ws`, {
      origin: PUBLIC_ORIGIN,
      headers: viaTunnel({ cookie: cookie.split(';')[0] ?? '' })
    });
    await opened(socket);
    socket.close();
  });

  it('serves the install files only through a named tunnel', async () => {
    const response = await send(fixture, '/manifest.webmanifest', {
      tunnel: true,
      headers: viaTunnel()
    });
    expect(response.status).toBe(manifest);
  });
});

describe('server behind Cloudflare Access', () => {
  let fixture: Fixture;

  beforeAll(async () => {
    fixture = await start(true, { allows: async (token) => token === 'approved' });
  });

  afterAll(() => cleanUp(fixture));

  it.each([
    [{}, 403],
    [{ [ACCESS_TOKEN_HEADER]: 'forged' }, 403],
    [{ [ACCESS_TOKEN_HEADER]: 'approved' }, 200]
  ])('answers a tunnel request with %o by %i', async (headers, status) => {
    const response = await send(fixture, '/manifest.webmanifest', {
      tunnel: true,
      headers: viaTunnel(headers)
    });
    expect(response.status).toBe(status);
  });
});

describe('push routes', () => {
  let fixture: Fixture;
  let cookie: string;

  const call = (method: string, path: string, body?: unknown): Promise<Response> =>
    send(fixture, path, {
      tunnel: true,
      method,
      headers: viaTunnel({
        origin: PUBLIC_ORIGIN,
        cookie,
        ...(body === undefined ? {} : { 'content-type': 'application/json' })
      }),
      body: body === undefined ? undefined : JSON.stringify(body)
    });

  const registration = (endpoint: string): unknown => ({
    subscription: { endpoint, keys: { p256dh: 'p256dh', auth: 'auth' } },
    events: null
  });

  beforeAll(async () => {
    fixture = await start(true);
    const paired = await pair(fixture, PUBLIC_ORIGIN);
    cookie = paired.headers['set-cookie']?.[0]?.split(';')[0] ?? '';
  });

  afterAll(() => cleanUp(fixture));

  it('registers, tests and removes a subscription', async () => {
    const registered = await call('PUT', '/api/push', registration('https://fcm.googleapis.com/x'));
    expect(registered.status).toBe(200);
    expect(JSON.parse(registered.body)).toMatchObject({
      events: { finished: true, needsInput: true, failed: true }
    });

    expect((await call('POST', '/api/push/test')).status).toBe(204);
    expect(JSON.parse(fixture.sent[0] ?? '{}')).toMatchObject({ title: 'Pocket Pilot' });

    expect((await call('DELETE', '/api/push')).status).toBe(204);
    expect((await call('POST', '/api/push/test')).status).toBe(404);
  });

  it('refuses push services outside the allowlist', async () => {
    const response = await call('PUT', '/api/push', registration('https://127.0.0.1/x'));
    expect(response.status).toBe(400);
  });

  it.each([
    { origin: undefined, status: 200 },
    { origin: PUBLIC_ORIGIN, status: 200 },
    { origin: 'https://evil.test', status: 403 }
  ])('reads settings with origin $origin', async ({ origin, status }) => {
    const response = await send(fixture, '/api/push', {
      tunnel: true,
      headers: viaTunnel({ cookie, ...(origin === undefined ? {} : { origin }) })
    });
    expect(response.status).toBe(status);
  });

  it.each(['DELETE', 'POST'])('refuses %s without an origin', async (method) => {
    const path = method === 'POST' ? '/api/push/test' : '/api/push';
    const response = await send(fixture, path, {
      tunnel: true,
      method,
      headers: viaTunnel({ cookie })
    });
    expect(response.status).toBe(403);
  });

  it('refuses the phone socket without an origin', async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${fixture.tunnelPort}/ws`, {
      headers: viaTunnel({ cookie })
    });
    expect(await refused(socket)).toBe(403);
  });
});
