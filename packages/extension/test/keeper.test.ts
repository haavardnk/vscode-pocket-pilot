import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer, request } from 'node:http';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readOptional } from '../src/storage/sharedFile';
import { runKeeper } from '../src/tunnel/keeper';
import {
  clearKeeperRecord,
  type KeeperRecord,
  readKeeperRecord,
  writeKeeperRecord
} from '../src/tunnel/keeperRecord';
import { serveLink } from '../src/tunnel/originLink';

const PID = 424_242;
const URL = 'https://kept-fox.trycloudflare.com';
const TIMING = { recordMs: 30, probeMs: 30, graceMs: 300 };
const SECRET = 'cluster-secret';

let folder: string;
let leader: Server;
let leaderPort: number;
let originPort: number;

const files = (): {
  record: string;
  status: string;
  pid: string;
  link: string;
  secret: string;
} => ({
  record: join(folder, 'tunnel-keeper.json'),
  status: join(folder, 'tunnel.json'),
  pid: join(folder, 'cloudflared.pid'),
  link: join(folder, 'tunnel-link.json'),
  secret: join(folder, 'cluster-secret')
});

function record(pid: number): KeeperRecord {
  return {
    pid,
    script: 'keeper.cjs',
    scriptHash: 'hash',
    version: 'test',
    port: leaderPort,
    cloudflaredPath: '',
    hostname: null,
    tokenHash: null
  };
}

async function until(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function start(): Promise<{ running: Promise<void>; stop: AbortController }> {
  const binary = join(folder, 'cloudflared');
  await writeFile(
    binary,
    `#!/bin/sh\necho "INF | ${URL} |"\necho "INF Registered tunnel connection"\nexec sleep 60\n`
  );
  await chmod(binary, 0o755);
  await writeKeeperRecord(files().record, record(PID));
  const stop = new AbortController();
  const running = keep(binary, stop.signal);
  await until(async () => (await readOptional(files().status))?.includes(URL) ?? false);
  return { running, stop };
}

function keep(binary: string, signal: AbortSignal): Promise<void> {
  return runKeeper({
    pid: PID,
    binary,
    originPort,
    leaderPort,
    named: null,
    linkFile: files().link,
    secretFile: files().secret,
    recordFile: files().record,
    statusFile: files().status,
    pidFile: files().pid,
    timing: TIMING,
    signal,
    report: () => undefined
  });
}

function get(): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: originPort, path: '/' }, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => (body += chunk.toString()));
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.end();
  });
}

async function listening(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as { port: number }).port;
}

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'pocket-pilot-keeper-'));
  await writeFile(files().secret, SECRET);
  leader = createServer((socket) => socket.destroy());
  leaderPort = await listening(leader);
  const probe = createServer();
  originPort = await listening(probe);
  await new Promise((resolve) => probe.close(resolve));
});

afterEach(async () => {
  leader.close();
  await rm(folder, { recursive: true, force: true });
});

describe('tunnel keeper', () => {
  it('keeps the tunnel while a leader answers and stops once none does', async () => {
    const { running } = await start();
    await new Promise((resolve) => setTimeout(resolve, TIMING.graceMs * 2));
    expect(await readKeeperRecord(files().record)).toEqual(record(PID));

    leader.close();
    await running;
    expect(await readOptional(files().status)).toBeNull();
    expect(await readOptional(files().record)).toBeNull();
    expect(await readOptional(files().pid)).toBeNull();
  });

  it.each([
    ['stops when its record is removed', null, false],
    ['hands the status to its replacement', PID + 1, true]
  ])('%s', async (_name, next, statusKept) => {
    const { running } = await start();
    if (next === null) await clearKeeperRecord(files().record);
    else await writeKeeperRecord(files().record, record(next));
    await running;
    expect((await readOptional(files().status)) !== null).toBe(statusKept);
    expect(await readOptional(files().pid)).toBeNull();
  });

  it('relays the origin only to a window that passes the link check', async () => {
    const { running, stop } = await start();
    const origin = createHttpServer((_request, response) => response.end('window'));
    const link = await serveLink(origin, SECRET, files().link);
    expect(await get()).toBe('window');
    await link.close();

    const received: Buffer[] = [];
    const squatter = createServer((socket) => {
      socket.on('data', (chunk: Buffer) => {
        received.push(chunk);
        socket.write('forged proof\n');
      });
    });
    await writeFile(files().link, JSON.stringify({ port: await listening(squatter) }));
    await expect(get()).rejects.toThrow();
    expect(Buffer.concat(received).toString()).not.toContain('GET');
    squatter.close();

    stop.abort();
    await running;
  });

  it('reports a taken origin port without starting cloudflared', async () => {
    const taken = createServer();
    await new Promise<void>((resolve) => taken.listen(originPort, '127.0.0.1', resolve));
    await keep(join(folder, 'missing-cloudflared'), new AbortController().signal);
    taken.close();
    expect(JSON.parse((await readOptional(files().status)) ?? '')).toEqual({
      state: 'error',
      quick: true,
      message: `Port ${originPort} for the tunnel is used by another program`
    });
    expect(await readOptional(files().pid)).toBeNull();
  });
});
