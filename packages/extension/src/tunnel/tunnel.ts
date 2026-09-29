import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Server as HttpServer } from 'node:http';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { clusterSecretFile } from '../cluster/sharedState';
import { errorMessage } from '../errors';
import { LineTailer } from '../sessions/lineTailer';
import { installCloudflared } from './install';
import { keeperFiles, keeperRunning, spawnKeeper, stopKeeper } from './keeperClient';
import { type KeeperIdentity, processAlive, readKeeperRecord, sameKeeper } from './keeperRecord';
import type { NamedTunnel } from './named';
import { type OriginLink, serveLink } from './originLink';
import { cloudflaredRelease } from './release';
import {
  clearTunnelStatus,
  readTunnelStatus,
  type TunnelStatus,
  writeTunnelStatus
} from './status';

const MONITOR_MS = 2_000;
const MIN_RETRY_MS = 2_000;
const MAX_RETRY_MS = 60_000;
const STABLE_MS = 60_000;
const LOG_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\S+Z /;

export interface TunnelSettings {
  named: NamedTunnel | null;
  cloudflaredPath: string;
}

export interface TunnelOptions extends TunnelSettings {
  origin: HttpServer;
  secret: string;
  leaderPort: number;
  keeperScript: string;
  version: string;
  storage: string;
  statusFile: string;
  report: (message: string) => void;
}

export interface Tunnel {
  close(keepTunnel: boolean): Promise<void>;
}

async function resolveBinary(options: TunnelOptions, signal: AbortSignal): Promise<string> {
  if (options.cloudflaredPath) return options.cloudflaredPath;
  const release = cloudflaredRelease(process.platform, process.arch);
  if (!release)
    throw new Error(
      `cloudflared has no ${process.platform}-${process.arch} build. Set pocketPilot.tunnel.cloudflaredPath.`
    );
  return installCloudflared(join(options.storage, 'cloudflared'), release, signal, options.report);
}

function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

async function keeperIdentity(options: TunnelOptions): Promise<KeeperIdentity> {
  return {
    script: options.keeperScript,
    scriptHash: sha256(await readFile(options.keeperScript)),
    version: options.version,
    port: options.leaderPort,
    cloudflaredPath: options.cloudflaredPath,
    hostname: options.named?.hostname ?? null,
    tokenHash: options.named ? sha256(options.named.token) : null
  };
}

export async function startTunnel(options: TunnelOptions): Promise<Tunnel> {
  const { report } = options;
  const quick = !options.named;
  const files = keeperFiles(options.storage);
  const log = new LineTailer(files.log);
  const abort = new AbortController();
  let identity: KeeperIdentity | null = null;
  let writing = Promise.resolve();
  let keeper: number | null = null;
  let keeperSince = 0;
  let failures = 0;
  let retryAt = 0;

  const publish = (status: TunnelStatus): void => {
    if (abort.signal.aborted) return;
    if (status.state === 'error') report(`Cloudflare tunnel: ${status.message}`);
    writing = writing
      .then(() => writeTunnelStatus(options.statusFile, status))
      .catch((error: unknown) =>
        report(`Could not save the tunnel status: ${errorMessage(error)}`)
      );
  };

  const fail = (message: string): void => {
    failures += 1;
    retryAt = Date.now() + Math.min(MAX_RETRY_MS, MIN_RETRY_MS * 2 ** (failures - 1));
    publish({ state: 'error', quick, message });
  };

  const ensure = async (): Promise<void> => {
    identity ??= await keeperIdentity(options);
    const record = await readKeeperRecord(files.record);
    if (keeper !== null && record?.pid === keeper && processAlive(keeper)) {
      if (Date.now() - keeperSince >= STABLE_MS) failures = 0;
      return;
    }
    if (record && sameKeeper(record, identity) && (await keeperRunning(record))) {
      report(`Using the running tunnel keeper ${record.pid}`);
      keeper = record.pid;
      keeperSince = Date.now();
      return;
    }
    if (keeper !== null) {
      keeper = null;
      const last = await readTunnelStatus(options.statusFile);
      fail(last?.state === 'error' ? last.message : 'The tunnel keeper stopped unexpectedly');
    }
    if (Date.now() < retryAt) return;
    await stopKeeper(files, report);
    publish({ state: 'starting', quick });
    const binary = await resolveBinary(options, abort.signal);
    if (abort.signal.aborted) return;
    keeper = await spawnKeeper({
      identity,
      config: {
        binary,
        originPort: options.leaderPort + 1,
        leaderPort: options.leaderPort,
        hostname: identity.hostname,
        linkFile: files.link,
        secretFile: clusterSecretFile(options.storage),
        recordFile: files.record,
        statusFile: options.statusFile,
        pidFile: files.cloudflaredPid
      },
      token: options.named?.token ?? null,
      log: files.log
    });
    keeperSince = Date.now();
  };

  const tick = async (): Promise<void> => {
    try {
      await ensure();
    } catch (error) {
      if (!abort.signal.aborted) fail(errorMessage(error));
    }
    const read = await log.read().catch(() => null);
    for (const line of read?.lines ?? []) report(line.replace(LOG_TIMESTAMP, ''));
  };

  const linking = serveLink(options.origin, options.secret, files.link);
  const running = linking.then(
    async () => {
      while (!abort.signal.aborted) {
        await tick();
        await delay(MONITOR_MS, undefined, { signal: abort.signal }).catch(() => undefined);
      }
    },
    async (error: unknown) => {
      await stopKeeper(files, report).catch(() => undefined);
      publish({ state: 'error', quick, message: errorMessage(error) });
    }
  );
  const link: OriginLink | null = await linking.catch(() => null);

  return {
    close: async (keepTunnel) => {
      abort.abort();
      await running;
      await link?.close();
      await writing;
      if (keepTunnel && keeper !== null) return;
      await stopKeeper(files, report);
      await clearTunnelStatus(options.statusFile);
    }
  };
}
