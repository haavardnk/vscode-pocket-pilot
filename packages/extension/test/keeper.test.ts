import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
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

const PID = 424_242;
const URL = 'https://kept-fox.trycloudflare.com';
const TIMING = { recordMs: 30, probeMs: 30, graceMs: 300 };

let folder: string;
let leader: Server;
let leaderPort: number;

const files = (): { record: string; status: string; pid: string } => ({
  record: join(folder, 'tunnel-keeper.json'),
  status: join(folder, 'tunnel.json'),
  pid: join(folder, 'cloudflared.pid')
});

function record(pid: number): KeeperRecord {
  return {
    pid,
    script: 'keeper.cjs',
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

async function start(): Promise<{ running: Promise<void> }> {
  const binary = join(folder, 'cloudflared');
  await writeFile(
    binary,
    `#!/bin/sh\necho "INF | ${URL} |"\necho "INF Registered tunnel connection"\nexec sleep 60\n`
  );
  await chmod(binary, 0o755);
  await writeKeeperRecord(files().record, record(PID));
  const running = runKeeper({
    pid: PID,
    binary,
    origin: 'http://127.0.0.1:1',
    leaderPort,
    named: null,
    recordFile: files().record,
    statusFile: files().status,
    pidFile: files().pid,
    timing: TIMING,
    signal: new AbortController().signal,
    report: () => undefined
  });
  await until(async () => (await readOptional(files().status))?.includes(URL) ?? false);
  return { running };
}

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'pocket-pilot-keeper-'));
  leader = createServer((socket) => socket.destroy());
  await new Promise<void>((resolve) => leader.listen(0, '127.0.0.1', resolve));
  leaderPort = (leader.address() as { port: number }).port;
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
});
