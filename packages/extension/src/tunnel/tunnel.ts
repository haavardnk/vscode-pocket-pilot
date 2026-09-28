import type { Server as HttpServer } from 'node:http';
import { join } from 'node:path';

import { errorMessage } from '../errors';
import { type Cloudflared, runCloudflared } from './cloudflared';
import { installCloudflared } from './install';
import type { NamedTunnel } from './named';
import { cloudflaredRelease } from './release';
import { reapStale } from './stalePid';
import { clearTunnelStatus, type TunnelStatus, writeTunnelStatus } from './status';

export interface TunnelSettings {
  named: NamedTunnel | null;
  cloudflaredPath: string;
}

export interface TunnelOptions extends TunnelSettings {
  origin: HttpServer;
  port: number;
  storage: string;
  statusFile: string;
  report: (message: string) => void;
}

export interface Tunnel {
  close(): Promise<void>;
}

function listen(server: HttpServer, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const fail = (error: NodeJS.ErrnoException): void =>
      reject(
        error.code === 'EADDRINUSE'
          ? new Error(`Port ${port} for the tunnel is used by another program`)
          : error
      );
    server.once('error', fail);
    server.listen({ host: '127.0.0.1', port }, () => {
      server.off('error', fail);
      resolve();
    });
  });
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

export async function startTunnel(options: TunnelOptions): Promise<Tunnel> {
  const quick = !options.named;
  const pidFile = join(options.storage, 'cloudflared.pid');
  const abort = new AbortController();
  let writing = Promise.resolve();

  const publish = (status: TunnelStatus): void => {
    if (abort.signal.aborted) return;
    if (status.state === 'ready') options.report(`Cloudflare tunnel ready at ${status.url}`);
    if (status.state === 'error') options.report(`Cloudflare tunnel: ${status.message}`);
    writing = writing
      .then(() => writeTunnelStatus(options.statusFile, status))
      .catch((error: unknown) =>
        options.report(`Could not save the tunnel status: ${errorMessage(error)}`)
      );
  };

  const launch = async (): Promise<Cloudflared | null> => {
    await reapStale(pidFile, options.report);
    const binary = await resolveBinary(options, abort.signal);
    if (abort.signal.aborted) return null;
    return runCloudflared({
      binary,
      origin: `http://127.0.0.1:${options.port}`,
      named: options.named,
      pidFile,
      onStatus: publish,
      report: options.report
    });
  };

  publish({ state: 'starting', quick });
  const listening = listen(options.origin, options.port);
  const running = listening.then(launch).catch((error: unknown) => {
    publish({ state: 'error', quick, message: errorMessage(error) });
    return null;
  });
  await listening.catch(() => undefined);

  return {
    close: async () => {
      abort.abort();
      await (await running)?.close();
      options.origin.close();
      options.origin.closeAllConnections();
      await writing;
      await clearTunnelStatus(options.statusFile);
    }
  };
}
