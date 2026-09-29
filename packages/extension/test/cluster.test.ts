import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  type Command,
  type HookEvent,
  type Query,
  type QueryResult,
  type ServerMessage,
  type SessionDetail,
  type SessionWatch,
  VERSION_MISMATCH,
  type WindowState
} from '@pocket-pilot/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';

import { Cluster, type Role } from '../src/cluster/cluster';
import { followLeader } from '../src/cluster/followerClient';
import { newNonce, proof, validProof } from '../src/cluster/handshake';
import { type Leader, startLeader } from '../src/cluster/leader';
import type { Disposable, LocalWindow, TerminalUpdate } from '../src/cluster/localWindow';
import { clusterSecret, hookSecret, sharedFiles } from '../src/cluster/sharedState';
import { HOOK_HEADER } from '../src/hooks/hookFile';
import { PairingStore } from '../src/server/pairing';
import { readOptional } from '../src/storage/sharedFile';
import { keeperFiles } from '../src/tunnel/keeperClient';
import { processAlive, readKeeperRecord } from '../src/tunnel/keeperRecord';
import { bundleKeeper } from './keeperBundle';

const PUBLIC_HOST = 'abc.trycloudflare.com';
const PUBLIC_ORIGIN = `https://${PUBLIC_HOST}`;
const TUNNEL_HEADERS = { host: PUBLIC_HOST, 'x-forwarded-proto': 'https' };

class FakeWindow implements LocalWindow {
  readonly commands: Command[] = [];
  readonly hooks: HookEvent[] = [];
  watches: readonly SessionWatch[] = [];
  terminalWatches: readonly string[] = [];
  private readonly sessionListeners = new Set<
    (value: { sessionId: string; detail: SessionDetail | null }) => void
  >();
  private readonly terminalListeners = new Set<(value: TerminalUpdate) => void>();

  constructor(readonly windowId: string) {}

  state(): WindowState {
    return {
      windowId: this.windowId,
      name: this.windowId,
      workspace: null,
      repositories: [],
      folders: [],
      sessions: [],
      terminals: [],
      canOrganize: true,
      agents: [],
      models: []
    };
  }

  setWatches(watches: readonly SessionWatch[]): void {
    this.watches = watches;
  }

  setTerminalWatches(terminalIds: readonly string[]): void {
    this.terminalWatches = terminalIds;
  }

  run(command: Command): Promise<void> {
    this.commands.push(command);
    return command.kind === 'setMode'
      ? Promise.reject(new Error('Unknown agent'))
      : Promise.resolve();
  }

  hook(event: HookEvent): Promise<void> {
    this.hooks.push(event);
    return Promise.resolve();
  }

  query(query: Query): Promise<QueryResult> {
    return query.kind === 'tree'
      ? Promise.resolve({ kind: 'tree', entries: [], truncated: false })
      : Promise.reject(new Error('Not a git repository'));
  }

  onDidChangeState = (): Disposable => ({ dispose: () => undefined });

  onDidChangeSession = (
    listener: (value: { sessionId: string; detail: SessionDetail | null }) => void
  ): Disposable => {
    this.sessionListeners.add(listener);
    return { dispose: () => this.sessionListeners.delete(listener) };
  };

  emitSession(sessionId: string, detail: SessionDetail | null): void {
    for (const listener of this.sessionListeners) listener({ sessionId, detail });
  }

  onDidChangeTerminal = (listener: (value: TerminalUpdate) => void): Disposable => {
    this.terminalListeners.add(listener);
    return { dispose: () => this.terminalListeners.delete(listener) };
  };

  emitTerminal(update: TerminalUpdate): void {
    for (const listener of this.terminalListeners) listener(update);
  }
}

let storage: string;
let port: number;
let cloudflared: string;
let keeperScript: string;
const report = (): void => undefined;

async function canListen(candidate: number): Promise<boolean> {
  const server = createServer();
  const listening = await new Promise<boolean>((resolve) => {
    server.once('error', () => resolve(false));
    server.listen(candidate, '127.0.0.1', () => resolve(true));
  });
  if (listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  return listening;
}

async function freePortPair(): Promise<number> {
  for (;;) {
    const candidate = 10_000 + 2 * Math.floor(Math.random() * 10_000);
    if ((await canListen(candidate)) && (await canListen(candidate + 1))) return candidate;
  }
}

async function waitFor(check: () => boolean, timeout = 5000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function until(check: () => Promise<boolean>, timeout = 10_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Timed out');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function tunnelUrl(): Promise<string | null> {
  const text = await readOptional(sharedFiles(storage).tunnel);
  const status = text ? (JSON.parse(text) as { state: string; url?: string }) : null;
  return status?.state === 'ready' ? (status.url ?? null) : null;
}

function cluster(window: FakeWindow, roles: Role[]): Cluster<Leader> {
  return new Cluster<Leader>({
    lead: () =>
      startLeader({
        window,
        storage,
        port,
        tunnel: { named: null, cloudflaredPath: cloudflared },
        keeperScript,
        version: 'test',
        webRoot: storage,
        password: { enabled: () => Promise.resolve(false), verify: () => Promise.resolve(false) },
        usage: {
          read: () => Promise.resolve({ state: 'needsAccess' }),
          onDidChangeAccess: () => ({ dispose: () => undefined })
        },
        expireDays: () => 30,
        report
      }),
    follow: () => followLeader(window, storage, port, report),
    portInUse: 'Port in use',
    onRole: (role) => roles.push(role),
    report
  });
}

function post(
  path: string,
  body: unknown,
  origin: string
): Promise<{ status: number; cookie: string | null }> {
  return new Promise((resolve, reject) => {
    const text = JSON.stringify(body);
    const req = request(
      {
        host: '127.0.0.1',
        port: port + 1,
        path,
        method: 'POST',
        headers: {
          ...TUNNEL_HEADERS,
          'content-type': 'application/json',
          origin,
          'content-length': Buffer.byteLength(text)
        }
      },
      (res) => {
        res.resume();
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            cookie: res.headers['set-cookie']?.[0]?.split(';')[0] ?? null
          })
        );
      }
    );
    req.on('error', reject);
    req.end(text);
  });
}

function phone(cookie: string | null): {
  socket: WebSocket;
  messages: ServerMessage[];
  closed: Promise<number>;
} {
  const socket = new WebSocket(`ws://127.0.0.1:${port + 1}/ws`, {
    origin: PUBLIC_ORIGIN,
    headers: { ...TUNNEL_HEADERS, ...(cookie ? { cookie } : {}) }
  });
  const messages: ServerMessage[] = [];
  socket.on('message', (data) => messages.push(JSON.parse(data.toString()) as ServerMessage));
  const closed = new Promise<number>((resolve) => {
    socket.on('close', (code) => resolve(code));
    socket.on('error', () => resolve(-1));
  });
  return { socket, messages, closed };
}

beforeAll(async () => {
  storage = await mkdtemp(join(tmpdir(), 'pocket-pilot-cluster-'));
  await writeFile(join(storage, 'index.html'), '<!doctype html><title>Pocket Pilot</title>');
  port = await freePortPair();
  cloudflared = join(storage, 'cloudflared');
  await writeFile(
    cloudflared,
    '#!/bin/sh\necho "INF | https://q$$.trycloudflare.com |"\necho "INF Registered tunnel connection"\nexec sleep 60\n'
  );
  await chmod(cloudflared, 0o755);
  keeperScript = await bundleKeeper(storage);
});

afterAll(() => rm(storage, { recursive: true, force: true }));

describe('cluster', () => {
  it('elects a leader, routes phones to followers, and fails over', async () => {
    const first = new FakeWindow('first');
    const second = new FakeWindow('second');
    const firstRoles: Role[] = [];
    const secondRoles: Role[] = [];
    const leader = cluster(first, firstRoles);
    const follower = cluster(second, secondRoles);
    leader.start();
    await waitFor(() => leader.role.kind === 'leader');
    follower.start();
    await waitFor(() => follower.role.kind === 'follower');

    expect(
      (await post('/api/pair', { code: '000000', deviceName: 'Phone' }, 'https://evil.test')).status
    ).toBe(403);
    expect(
      (await post('/api/pair', { code: '000000', deviceName: 'Phone' }, PUBLIC_ORIGIN)).status
    ).toBe(401);
    expect(await phone(null).closed).toBe(-1);

    const { code } = await new PairingStore(sharedFiles(storage).pairing).create();
    const paired = await post('/api/pair', { code, deviceName: 'Phone' }, PUBLIC_ORIGIN);
    expect(paired.status).toBe(200);
    expect(paired.cookie).toMatch(/^pocket_pilot_token=/);

    const client = phone(paired.cookie);
    await waitFor(() => client.messages.some((message) => message.type === 'snapshot'));
    const snapshot = client.messages.find((message) => message.type === 'snapshot');
    expect(
      snapshot?.type === 'snapshot' && snapshot.windows.map((window) => window.windowId).sort()
    ).toEqual(['first', 'second']);

    client.socket.send(
      JSON.stringify({ type: 'subscribe', windowId: 'second', sessionId: 's1', limit: 20 })
    );
    await waitFor(() => second.watches.length === 1);
    second.emitSession('s1', null);
    await waitFor(() => client.messages.some((message) => message.type === 'session'));

    client.socket.send(
      JSON.stringify({ type: 'watchTerminal', windowId: 'second', terminalId: 't1' })
    );
    await waitFor(() => second.terminalWatches.length === 1);
    second.emitTerminal({
      terminalId: 't1',
      detail: { id: 't1', dropped: 0, executions: [], stream: null }
    });
    second.emitTerminal({ terminalId: 't1', patch: { dropped: 1, executions: [], stream: null } });
    await waitFor(() => client.messages.some((message) => message.type === 'terminalPatch'));
    expect(
      client.messages.filter(
        (message) => message.type === 'terminal' || message.type === 'terminalPatch'
      )
    ).toEqual([
      {
        type: 'terminal',
        windowId: 'second',
        terminalId: 't1',
        detail: { id: 't1', dropped: 0, executions: [], stream: null }
      },
      {
        type: 'terminalPatch',
        windowId: 'second',
        terminalId: 't1',
        patch: { dropped: 1, executions: [], stream: null }
      }
    ]);
    client.socket.send(JSON.stringify({ type: 'unwatchTerminal' }));
    await waitFor(() => second.terminalWatches.length === 0);

    client.socket.send(
      JSON.stringify({
        type: 'command',
        requestId: 'a',
        command: { kind: 'stop', windowId: 'second', sessionId: 's1' }
      })
    );
    client.socket.send(
      JSON.stringify({
        type: 'command',
        requestId: 'b',
        command: { kind: 'setMode', windowId: 'second', sessionId: 's1', modeId: 'x' }
      })
    );
    await waitFor(
      () => client.messages.filter((message) => message.type === 'result').length === 2
    );
    const results = client.messages.filter((message) => message.type === 'result');
    expect(results).toEqual([
      { type: 'result', requestId: 'a', ok: true, error: null },
      { type: 'result', requestId: 'b', ok: false, error: 'Unknown agent' }
    ]);
    expect(second.commands.map((command) => command.kind)).toEqual(['stop', 'setMode']);

    const hooked = await fetch(`http://127.0.0.1:${port}/internal/hook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [HOOK_HEADER]: await hookSecret(storage)
      },
      body: JSON.stringify({
        hook_event_name: 'UserPromptSubmit',
        session_id: 's1',
        timestamp: '2026-01-01T00:00:00.000Z',
        transcript_path: '/u/workspaceStorage/second/GitHub.copilot-chat/transcripts/s1.jsonl',
        prompt: 'go'
      })
    });
    expect(hooked.status).toBe(204);
    expect(second.hooks).toEqual([
      { kind: 'prompt', sessionId: 's1', at: Date.UTC(2026, 0, 1), prompt: 'go' }
    ]);
    expect(first.hooks).toEqual([]);

    for (const [requestId, kind] of [
      ['c', 'tree'],
      ['d', 'gitChanges']
    ]) {
      client.socket.send(
        JSON.stringify({
          type: 'query',
          requestId,
          query: { kind, windowId: 'second', folderId: 'f', path: '' }
        })
      );
    }
    await waitFor(
      () => client.messages.filter((message) => message.type === 'queryResult').length === 2
    );
    expect(client.messages.filter((message) => message.type === 'queryResult')).toEqual([
      {
        type: 'queryResult',
        requestId: 'c',
        result: { kind: 'tree', entries: [], truncated: false },
        error: null
      },
      { type: 'queryResult', requestId: 'd', result: null, error: 'Not a git repository' }
    ]);

    client.socket.send(
      JSON.stringify({ type: 'command', requestId: 'e', command: { kind: 'teleport' } })
    );
    await waitFor(() =>
      client.messages.some((message) => message.type === 'result' && message.requestId === 'e')
    );
    expect(client.messages.at(-1)).toEqual({
      type: 'result',
      requestId: 'e',
      ok: false,
      error: VERSION_MISMATCH
    });

    const secret = await clusterSecret(storage);
    const forged = new WebSocket(`ws://127.0.0.1:${port}/internal`);
    const forgedClosed = new Promise<number>((resolve) => forged.once('close', resolve));
    await new Promise((resolve) => forged.once('open', resolve));
    forged.send(JSON.stringify({ type: 'register', proof: secret, window: first.state() }));
    expect(await forgedClosed).toBe(4003);

    const outdated = new WebSocket(`ws://127.0.0.1:${port}/internal`);
    await new Promise((resolve) => outdated.once('open', resolve));
    const nonce = newNonce();
    const challenge = new Promise<{ nonce: string; proof: string }>((resolve) =>
      outdated.once('message', (data) =>
        resolve(JSON.parse(data.toString()) as { nonce: string; proof: string })
      )
    );
    outdated.send(JSON.stringify({ type: 'hello', nonce }));
    const answer = await challenge;
    expect(validProof(secret, 'leader', port, nonce, answer.proof)).toBe(true);
    outdated.send(
      JSON.stringify({
        type: 'register',
        proof: proof(secret, 'follower', port, answer.nonce),
        window: { windowId: 'old', name: 'Old window' }
      })
    );
    await waitFor(() => client.messages.some((message) => message.type === 'incompatibleWindows'));
    outdated.close();
    await waitFor(
      () => client.messages.filter((message) => message.type === 'incompatibleWindows').length === 2
    );
    expect(client.messages.filter((message) => message.type === 'incompatibleWindows')).toEqual([
      { type: 'incompatibleWindows', names: ['Old window'] },
      { type: 'incompatibleWindows', names: [] }
    ]);

    await leader.stop();
    await client.closed;
    await waitFor(() => follower.role.kind === 'leader');
    expect(second.watches).toEqual([]);

    const again = phone(paired.cookie);
    await waitFor(() => again.messages.some((message) => message.type === 'snapshot'));
    again.socket.close();
    await follower.stop();
    expect(firstRoles.at(-1)).toEqual({ kind: 'stopped' });
  }, 20_000);

  it('refuses a leader that fails the cluster check', async () => {
    const rogue = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await new Promise((resolve) => rogue.once('listening', resolve));
    const received: string[] = [];
    rogue.on('connection', (socket) =>
      socket.on('message', (data) => {
        received.push(data.toString());
        socket.send(JSON.stringify({ type: 'challenge', nonce: 'n', proof: 'forged' }));
      })
    );
    const roguePort = (rogue.address() as { port: number }).port;

    await expect(followLeader(new FakeWindow('first'), storage, roguePort, report)).rejects.toThrow(
      'The leader failed the cluster check'
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(received.map((text) => (JSON.parse(text) as { type: string }).type)).toEqual(['hello']);
    expect(received.join()).not.toContain(await clusterSecret(storage));
    await new Promise((resolve) => rogue.close(resolve));
  });

  it('keeps the quick tunnel address when the leader window closes', async () => {
    const first = cluster(new FakeWindow('first'), []);
    const second = cluster(new FakeWindow('second'), []);
    first.start();
    await waitFor(() => first.role.kind === 'leader');
    second.start();
    await waitFor(() => second.role.kind === 'follower');
    await until(async () => (await tunnelUrl()) !== null);
    const url = await tunnelUrl();
    const keeper = (await readKeeperRecord(keeperFiles(storage).record))?.pid ?? 0;

    await first.stop(true);
    await waitFor(() => second.role.kind === 'leader');
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(await tunnelUrl()).toBe(url);
    expect((await readKeeperRecord(keeperFiles(storage).record))?.pid).toBe(keeper);

    await second.stop();
    expect(processAlive(keeper)).toBe(false);
    expect(await readOptional(sharedFiles(storage).tunnel)).toBeNull();
    expect(await readOptional(keeperFiles(storage).record)).toBeNull();
  }, 20_000);
});
