import { execFile } from 'node:child_process';
import { basename } from 'node:path';
import { promisify } from 'node:util';

import type { Repository } from '@pocket-pilot/protocol';
import gitUrlParse from 'git-url-parse';

const run = promisify(execFile);

function parseRemote(remote: string): Repository | null {
  try {
    const { source, owner, name } = gitUrlParse(remote);
    if (!source || !owner || !name) return null;
    const label = `${owner}/${name}`;
    return {
      key: `${source}/${label}`.toLowerCase(),
      label,
      github: source === 'github.com' ? { owner, name } : null
    };
  } catch {
    return null;
  }
}

export function repositoryFor(remote: string | null, folder: string): Repository {
  const parsed = remote ? parseRemote(remote) : null;
  if (parsed) return parsed;
  const name = basename(folder);
  return { key: `local/${name}`, label: name, github: null };
}

export async function originUrl(folder: string): Promise<string | null> {
  try {
    const { stdout } = await run('git', ['config', '--get', 'remote.origin.url'], {
      cwd: folder,
      timeout: 5000
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function folderRepository(folder: string): Promise<Repository> {
  return repositoryFor(await originUrl(folder), folder);
}
