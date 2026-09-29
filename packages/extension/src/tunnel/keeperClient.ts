import { type ChildProcess, spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import {
  clearKeeperRecord,
  KEEPER_CONFIG,
  type KeeperConfig,
  type KeeperIdentity,
  type KeeperRecord,
  processAlive,
  readKeeperRecord,
  writeKeeperRecord
} from './keeperRecord';
import { commandLine, reapStale } from './stalePid';

const EXIT_TIMEOUT_MS = 8_000;
const EXIT_POLL_MS = 100;

export interface KeeperFiles {
  record: string;
  log: string;
  cloudflaredPid: string;
}

export interface KeeperLaunch {
  identity: KeeperIdentity;
  config: KeeperConfig;
  token: string | null;
  log: string;
}

export function keeperFiles(storage: string): KeeperFiles {
  return {
    record: join(storage, 'tunnel-keeper.json'),
    log: join(storage, 'tunnel-keeper.log'),
    cloudflaredPid: join(storage, 'cloudflared.pid')
  };
}

export async function keeperRunning(record: KeeperRecord): Promise<boolean> {
  if (!processAlive(record.pid)) return false;
  const command = await commandLine(record.pid);
  return command === null ? process.platform === 'win32' : command.includes(record.script);
}

function launch(script: string, env: NodeJS.ProcessEnv, log: string): ChildProcess {
  mkdirSync(dirname(log), { recursive: true });
  const fd = openSync(log, 'w', 0o600);
  try {
    return spawn(process.execPath, [script], {
      detached: true,
      stdio: ['ignore', fd, fd],
      env,
      windowsHide: true
    });
  } finally {
    closeSync(fd);
  }
}

export async function spawnKeeper(options: KeeperLaunch): Promise<number> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    [KEEPER_CONFIG]: JSON.stringify(options.config)
  };
  delete env.TUNNEL_TOKEN;
  if (options.token) env.TUNNEL_TOKEN = options.token;
  const child = launch(options.identity.script, env, options.log);
  child.once('error', () => undefined);
  child.unref();
  const { pid } = child;
  if (pid === undefined) throw new Error('Could not start the tunnel keeper');
  await writeKeeperRecord(options.config.recordFile, { ...options.identity, pid });
  return pid;
}

export async function stopKeeper(
  files: KeeperFiles,
  report: (message: string) => void
): Promise<void> {
  const record = await readKeeperRecord(files.record);
  await clearKeeperRecord(files.record);
  if (!record || !(await keeperRunning(record))) return;
  const deadline = Date.now() + EXIT_TIMEOUT_MS;
  while (processAlive(record.pid)) {
    if (Date.now() > deadline) {
      report(`Tunnel keeper ${record.pid} did not stop in time`);
      if (process.platform === 'win32') return;
      try {
        process.kill(record.pid, 'SIGKILL');
      } catch {
        return;
      }
      await reapStale(files.cloudflaredPid, report);
      return;
    }
    await delay(EXIT_POLL_MS);
  }
}
