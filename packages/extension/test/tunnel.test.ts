import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readLogLine, runCloudflared } from '../src/tunnel/cloudflared';
import { installCloudflared } from '../src/tunnel/install';
import { type NamedTunnel, normalizeHostname, parseTunnelToken } from '../src/tunnel/named';
import { reapStale, recordPid } from '../src/tunnel/stalePid';
import type { TunnelStatus } from '../src/tunnel/status';

const TOKEN = Buffer.from(JSON.stringify({ a: 'account', t: 'tunnel', s: 'secret' })).toString(
  'base64'
);
const BINARY = Buffer.from('#!/bin/sh\necho cloudflared\n');
const SPAWNED = { timeout: 5000 };

let folder: string;

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'pocket-pilot-tunnel-'));
});

afterAll(() => rm(folder, { recursive: true, force: true }));

function serve(body: Buffer): Promise<{ server: Server; url: string }> {
  const server = createServer((_request, response) => response.end(body));
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${port}/cloudflared` });
    })
  );
}

async function fakeCloudflared(name: string, script: string): Promise<string> {
  const file = join(folder, name);
  await writeFile(file, `#!/bin/sh\n${script}\n`);
  await chmod(file, 0o755);
  return file;
}

function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false
  );
}

describe('tunnel input', () => {
  it.each([
    [
      '2026-09-25T10:00:00Z INF |  https://quiet-fox.trycloudflare.com   |',
      { kind: 'url', url: 'https://quiet-fox.trycloudflare.com' }
    ],
    ['2026-09-25T10:00:00Z INF Registered tunnel connection connIndex=0', { kind: 'connected' }],
    [
      '2026-09-25T10:00:00Z ERR failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel"',
      {
        kind: 'error',
        message: 'failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel"'
      }
    ],
    ['2026-09-25T10:00:00Z INF Thank you for trying Cloudflare Tunnel.', null]
  ])('reads the cloudflared log line %s', (line, event) => {
    expect(readLogLine(line)).toEqual(event);
  });

  it.each([
    [TOKEN, TOKEN],
    [`sudo cloudflared service install ${TOKEN}`, TOKEN],
    [Buffer.from(JSON.stringify({ a: 'account' })).toString('base64'), null],
    ['not a token', null]
  ])('parses the tunnel token %s', (input, token) => {
    expect(parseTunnelToken(input)).toBe(token);
  });

  it.each([
    ['https://Agent.Example.com/', 'agent.example.com'],
    ['agent.example.com/path', 'agent.example.com'],
    ['agent', null],
    ['-bad.example.com', null]
  ])('normalizes the hostname %s', (input, hostname) => {
    expect(normalizeHostname(input)).toBe(hostname);
  });
});

describe('installCloudflared', () => {
  it.each([false, true])('installs a verified download (archive %s)', async (archive) => {
    const target = join(folder, `install-${archive}`);
    const source = join(folder, `source-${archive}`);
    await mkdir(join(target, '0.9.0'), { recursive: true });
    await mkdir(source);
    await writeFile(join(source, 'cloudflared'), BINARY);
    await promisify(execFile)('tar', [
      '-czf',
      join(source, 'download.tgz'),
      '-C',
      source,
      'cloudflared'
    ]);
    const body = archive ? await readFile(join(source, 'download.tgz')) : BINARY;
    const { server, url } = await serve(body);
    const sha256 = createHash('sha256').update(body).digest('hex');
    try {
      const binary = await installCloudflared(
        target,
        { version: '1.0.0', url, sha256, archive },
        new AbortController().signal,
        () => undefined
      );
      expect(binary).toBe(join(target, '1.0.0', 'cloudflared'));
      expect(await readFile(binary)).toEqual(BINARY);
      expect((await stat(binary)).mode & 0o111).toBe(0o111);
      expect(await readdir(target)).toEqual(['1.0.0']);
    } finally {
      server.close();
    }
  });

  it('rejects a download with the wrong checksum', async () => {
    const target = join(folder, 'install-wrong');
    const { server, url } = await serve(BINARY);
    try {
      await expect(
        installCloudflared(
          target,
          { version: '1.0.0', url, sha256: '0'.repeat(64), archive: false },
          new AbortController().signal,
          () => undefined
        )
      ).rejects.toThrow(/checksum/);
      expect(await readdir(target)).toEqual([]);
    } finally {
      server.close();
    }
  });
});

describe('runCloudflared', () => {
  it.each<[string, NamedTunnel | null, string, string]>([
    [
      'quick',
      null,
      'https://quiet-fox.trycloudflare.com',
      'tunnel --no-autoupdate --url http://127.0.0.1:1'
    ],
    [
      'named',
      { hostname: 'agent.example.com', token: TOKEN },
      'https://agent.example.com',
      `${TOKEN} tunnel --no-autoupdate run`
    ]
  ])('reports the %s tunnel address once connected', async (name, named, url, invocation) => {
    const record = join(folder, `${name}-invocation`);
    const binary = await fakeCloudflared(
      `${name}-cloudflared`,
      [
        `echo "$TUNNEL_TOKEN $*" > "${record}"`,
        'echo "2026-09-25T10:00:00Z INF |  https://quiet-fox.trycloudflare.com   |" >&2',
        'echo "2026-09-25T10:00:00Z INF Registered tunnel connection connIndex=0" >&2',
        'exec sleep 60'
      ].join('\n')
    );
    const statuses: TunnelStatus[] = [];
    const tunnel = runCloudflared({
      binary,
      origin: 'http://127.0.0.1:1',
      named,
      pidFile: join(folder, `${name}.pid`),
      onStatus: (status) => statuses.push(status),
      report: () => undefined
    });
    await expect.poll(() => statuses.length, SPAWNED).toBe(1);
    await tunnel.close();
    expect(statuses).toEqual([{ state: 'ready', quick: named === null, url }]);
    expect((await readFile(record, 'utf8')).trim()).toBe(invocation);
  });

  it('reports the last error when cloudflared exits', async () => {
    const binary = await fakeCloudflared(
      'failing-cloudflared',
      'echo "2026-09-25T10:00:00Z ERR Unauthorized: Invalid tunnel secret" >&2\nexit 1'
    );
    const statuses: TunnelStatus[] = [];
    const tunnel = runCloudflared({
      binary,
      origin: 'http://127.0.0.1:1',
      named: { hostname: 'agent.example.com', token: TOKEN },
      pidFile: join(folder, 'failing.pid'),
      onStatus: (status) => statuses.push(status),
      report: () => undefined
    });
    await expect.poll(() => statuses.length, SPAWNED).toBe(1);
    await tunnel.close();
    expect(statuses).toEqual([
      { state: 'error', quick: false, message: 'Unauthorized: Invalid tunnel secret' }
    ]);
  });

  it.each<[NamedTunnel | null, RegExp]>([
    [null, /deleted the quick tunnel/],
    [{ hostname: 'agent.example.com', token: TOKEN }, /does not know this tunnel/]
  ])('restarts a tunnel Cloudflare no longer knows (%o)', async (named, message) => {
    const name = `gone-cloudflared-${named ? 'named' : 'quick'}`;
    const program = join(folder, `${name}.cjs`);
    await writeFile(
      program,
      [
        "process.on('SIGTERM', () => {",
        "  console.error('2026-09-28T07:39:10Z ERR Connection terminated');",
        '  process.exit(0);',
        '});',
        `console.error(${JSON.stringify('2026-09-28T07:39:07Z ERR Register tunnel error from server side error="Unauthorized: Tunnel not found" connIndex=0')});`,
        'setInterval(() => undefined, 1000);'
      ].join('\n')
    );
    const binary = await fakeCloudflared(name, `exec "${process.execPath}" "${program}"`);
    const statuses: TunnelStatus[] = [];
    const tunnel = runCloudflared({
      binary,
      origin: 'http://127.0.0.1:1',
      named,
      pidFile: join(folder, `${name}.pid`),
      onStatus: (status) => statuses.push(status),
      report: () => undefined
    });
    await expect.poll(() => statuses.length, SPAWNED).toBe(1);
    await tunnel.close();
    expect(statuses).toEqual([
      { state: 'error', quick: named === null, message: expect.stringMatching(message) }
    ]);
  });

  it('stops the process on close', async () => {
    const pidFile = join(folder, 'pid');
    const record = join(folder, 'sleeping.pid');
    const binary = await fakeCloudflared(
      'sleeping-cloudflared',
      `echo $$ > "${pidFile}"\nexec sleep 60`
    );
    const tunnel = runCloudflared({
      binary,
      origin: 'http://127.0.0.1:1',
      named: null,
      pidFile: record,
      onStatus: () => undefined,
      report: () => undefined
    });
    await expect.poll(() => exists(pidFile), SPAWNED).toBe(true);
    await expect.poll(() => exists(record), SPAWNED).toBe(true);
    const pid = Number(await readFile(pidFile, 'utf8'));
    expect(JSON.parse(await readFile(record, 'utf8'))).toEqual({ pid, binary });
    await tunnel.close();
    expect(() => process.kill(pid, 0)).toThrow();
    expect(await exists(record)).toBe(false);
  });
});

describe('reapStale', () => {
  it.each([
    ['stops cloudflared left behind', true],
    ['leaves an unrelated process alone', false]
  ])('%s', async (_name, matches) => {
    const binary = join(folder, `stale-${matches}`);
    await writeFile(binary, `#!${process.execPath}\nsetInterval(() => undefined, 1000);\n`);
    await chmod(binary, 0o755);
    const child = spawn(binary, ['tunnel'], { stdio: 'ignore' });
    const exited = new Promise<boolean>((resolve) => child.once('exit', () => resolve(true)));
    const pid = child.pid;
    if (pid === undefined) throw new Error('fake cloudflared did not start');
    const file = join(folder, `stale-${matches}.pid`);
    await recordPid(file, { pid, binary: matches ? binary : join(folder, 'other') });
    try {
      await reapStale(file, () => undefined);
      const stopped = await Promise.race([
        exited,
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 500))
      ]);
      expect(stopped).toBe(matches);
      expect(await exists(file)).toBe(false);
    } finally {
      child.kill('SIGKILL');
    }
  });
});
