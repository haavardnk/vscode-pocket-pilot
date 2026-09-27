import { type ChildProcess, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';

import type { NamedTunnel } from './named';
import type { TunnelStatus } from './status';

const ERROR = /^\S+ (?:ERR|FTL) (.+)$/;
const QUICK_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
const CONNECTED = /Registered tunnel connection/;
const MIN_RESTART_MS = 2_000;
const MAX_RESTART_MS = 60_000;
const KILL_TIMEOUT_MS = 5_000;

export type LogEvent =
  { kind: 'error'; message: string } | { kind: 'url'; url: string } | { kind: 'connected' };

export interface CloudflaredOptions {
  binary: string;
  origin: string;
  named: NamedTunnel | null;
  onStatus: (status: TunnelStatus) => void;
  report: (message: string) => void;
}

export interface Cloudflared {
  close(): Promise<void>;
}

interface Running {
  child: ChildProcess;
  exited: Promise<void>;
}

export function readLogLine(line: string): LogEvent | null {
  const error = ERROR.exec(line)?.[1];
  if (error) return { kind: 'error', message: error.trim() };
  const url = QUICK_URL.exec(line)?.[0];
  if (url) return { kind: 'url', url };
  return CONNECTED.test(line) ? { kind: 'connected' } : null;
}

function environment(named: NamedTunnel | null): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.TUNNEL_TOKEN;
  return named ? { ...env, TUNNEL_TOKEN: named.token } : env;
}

export function runCloudflared(options: CloudflaredOptions): Cloudflared {
  const { named } = options;
  const quick = !named;
  const args = named
    ? ['tunnel', '--no-autoupdate', 'run']
    : ['tunnel', '--no-autoupdate', '--url', options.origin];
  const env = environment(named);
  let running: Running | null = null;
  let closed = false;
  let failures = 0;
  let timer: NodeJS.Timeout | undefined;

  const launch = (): void => {
    let url = named ? `https://${named.hostname}` : null;
    let ready = false;
    let lastError = '';
    const child = spawn(options.binary, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    const onLine = (line: string): void => {
      const event = readLogLine(line);
      if (!event) return;
      if (event.kind === 'error') {
        lastError = event.message;
        options.report(`cloudflared: ${event.message}`);
        return;
      }
      if (event.kind === 'url') {
        if (quick) url = event.url;
        return;
      }
      if (ready || !url) return;
      ready = true;
      failures = 0;
      options.onStatus({ state: 'ready', quick, url });
    };
    const streams = [child.stdout, child.stderr].filter((stream): stream is Readable => !!stream);
    for (const stream of streams) createInterface({ input: stream }).on('line', onLine);
    const exited = new Promise<void>((resolve) => {
      let ended = false;
      const end = (message: string): void => {
        if (ended) return;
        ended = true;
        running = null;
        resolve();
        if (closed) return;
        options.onStatus({ state: 'error', quick, message });
        failures += 1;
        timer = setTimeout(launch, Math.min(MAX_RESTART_MS, MIN_RESTART_MS * 2 ** (failures - 1)));
      };
      child.once('error', (error) => end(`Could not run cloudflared: ${error.message}`));
      child.once('close', (code) => end(lastError || `cloudflared exited with code ${code}`));
    });
    running = { child, exited };
  };

  launch();

  return {
    close: async () => {
      closed = true;
      clearTimeout(timer);
      const current = running;
      if (!current) return;
      const kill = setTimeout(() => current.child.kill('SIGKILL'), KILL_TIMEOUT_MS);
      current.child.kill('SIGTERM');
      await current.exited;
      clearTimeout(kill);
    }
  };
}
