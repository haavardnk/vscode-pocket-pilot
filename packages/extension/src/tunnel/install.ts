import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { access, chmod, mkdir, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

import type { CloudflaredRelease } from './release';

const BINARY = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function download(url: string, file: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, { signal });
  if (!response.ok || !response.body)
    throw new Error(`Downloading cloudflared failed with HTTP ${response.status}`);
  const hash = createHash('sha256');
  await pipeline(
    Readable.fromWeb(response.body),
    async function* (source: AsyncIterable<Buffer>) {
      for await (const chunk of source) {
        hash.update(chunk);
        yield chunk;
      }
    },
    createWriteStream(file, { mode: 0o600 })
  );
  return hash.digest('hex');
}

async function extract(archive: string, folder: string): Promise<string> {
  await promisify(execFile)('tar', ['-xzf', archive, '-C', folder, 'cloudflared']);
  return join(folder, 'cloudflared');
}

export async function installCloudflared(
  folder: string,
  release: CloudflaredRelease,
  signal: AbortSignal,
  report: (message: string) => void
): Promise<string> {
  const target = join(folder, release.version, BINARY);
  if (await exists(target)) return target;
  report(`Downloading cloudflared ${release.version}`);
  const staging = join(folder, `.staging-${randomUUID()}`);
  await mkdir(staging, { recursive: true });
  try {
    const archive = join(staging, 'download');
    const digest = await download(release.url, archive, signal);
    if (digest !== release.sha256)
      throw new Error(`The cloudflared download does not match its checksum (${digest})`);
    const binary = release.archive ? await extract(archive, staging) : archive;
    await chmod(binary, 0o755);
    await mkdir(join(folder, release.version), { recursive: true });
    await rename(binary, target).catch(async (error: unknown) => {
      if (!(await exists(target))) throw error;
    });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  const stale = (await readdir(folder)).filter((entry) => entry !== release.version);
  await Promise.all(
    stale.map((entry) => rm(join(folder, entry), { recursive: true, force: true }))
  );
  return target;
}
