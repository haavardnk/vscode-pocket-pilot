import { connect } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

import { LOOPBACK } from '../cluster/sharedState';
import { errorMessage } from '../errors';
import { runCloudflared } from './cloudflared';
import { clearKeeperRecord, readKeeperRecord } from './keeperRecord';
import type { NamedTunnel } from './named';
import { reapStale } from './stalePid';
import { clearTunnelStatus, type TunnelStatus, writeTunnelStatus } from './status';

export interface KeeperTiming {
  recordMs: number;
  probeMs: number;
  graceMs: number;
}

export const KEEPER_TIMING: KeeperTiming = { recordMs: 1_000, probeMs: 2_000, graceMs: 30_000 };

export interface KeeperOptions {
  pid: number;
  binary: string;
  origin: string;
  leaderPort: number;
  named: NamedTunnel | null;
  recordFile: string;
  statusFile: string;
  pidFile: string;
  timing: KeeperTiming;
  signal: AbortSignal;
  report: (message: string) => void;
}

type Ending = 'stopped' | 'replaced' | 'orphaned';

function leaderListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: LOOPBACK, port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

async function supervise(options: KeeperOptions): Promise<Ending> {
  const { timing, signal } = options;
  let seen = Date.now();
  let probed = 0;
  while (!signal.aborted) {
    await delay(timing.recordMs, undefined, { signal }).catch(() => undefined);
    if (signal.aborted) break;
    const record = await readKeeperRecord(options.recordFile);
    if (!record) return 'stopped';
    if (record.pid !== options.pid) return 'replaced';
    const now = Date.now();
    if (now - probed < timing.probeMs) continue;
    probed = now;
    if (await leaderListening(options.leaderPort)) seen = now;
    else if (now - seen >= timing.graceMs) return 'orphaned';
  }
  return 'stopped';
}

export async function runKeeper(options: KeeperOptions): Promise<void> {
  const { report } = options;
  await reapStale(options.pidFile, report);
  let writing = Promise.resolve();
  let ending: Ending | null = null;
  const publish = (status: TunnelStatus): void => {
    if (ending) return;
    if (status.state === 'ready') report(`Cloudflare tunnel ready at ${status.url}`);
    if (status.state === 'error') report(`Cloudflare tunnel: ${status.message}`);
    writing = writing
      .then(() => writeTunnelStatus(options.statusFile, status))
      .catch((error: unknown) =>
        report(`Could not save the tunnel status: ${errorMessage(error)}`)
      );
  };
  const cloudflared = runCloudflared({
    binary: options.binary,
    origin: options.origin,
    named: options.named,
    pidFile: options.pidFile,
    onStatus: publish,
    report
  });
  try {
    ending = await supervise(options);
  } finally {
    ending ??= 'stopped';
    await cloudflared.close();
    await writing;
  }
  if (ending === 'replaced') return;
  if (ending === 'orphaned') {
    report('No VS Code window is serving Pocket Pilot, so the tunnel stopped');
    const record = await readKeeperRecord(options.recordFile);
    if (record && record.pid !== options.pid) return;
    await clearKeeperRecord(options.recordFile);
  }
  await clearTunnelStatus(options.statusFile);
}
