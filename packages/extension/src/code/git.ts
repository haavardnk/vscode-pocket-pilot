import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { FileChange } from '@pocket-pilot/protocol';

import type { DiffCounts } from './diff';
import { type Blob, MAX_FILE_BYTES } from './files';

const run = promisify(execFile);
const TIMEOUT_MS = 10_000;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const CONFLICTS = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);

export interface RepositoryInfo {
  prefix: string;
  branch: string | null;
  head: string | null;
}

export interface StatusEntry {
  path: string;
  previousPath: string | null;
  change: FileChange;
}

interface GitOptions {
  input?: string;
  maxBuffer?: number;
}

async function git(cwd: string, args: string[], options: GitOptions = {}): Promise<Buffer> {
  const pending = run('git', ['-c', 'core.quotepath=off', ...args], {
    cwd,
    encoding: 'buffer',
    timeout: TIMEOUT_MS,
    maxBuffer: options.maxBuffer ?? MAX_OUTPUT_BYTES,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }
  });
  pending.child.stdin?.end(options.input);
  const { stdout } = await pending;
  return stdout;
}

async function gitText(cwd: string, args: string[]): Promise<string | null> {
  return git(cwd, args).then(
    (stdout) => stdout.toString('utf8'),
    () => null
  );
}

function records(output: string): string[] {
  const parts = output.split('\0');
  if (parts.at(-1) === '') parts.pop();
  return parts;
}

export function statusChange(code: string): FileChange {
  if (code === '??') return 'untracked';
  if (CONFLICTS.has(code)) return 'conflicted';
  if (code.includes('R')) return 'renamed';
  if (code.includes('D')) return 'deleted';
  if (code.includes('A') || code.includes('C')) return 'added';
  return 'modified';
}

export function parseStatus(output: string, prefix: string): StatusEntry[] {
  const parts = records(output);
  const entries: StatusEntry[] = [];
  const local = (path: string): string | null =>
    path.startsWith(prefix) ? path.slice(prefix.length) : null;
  for (let index = 0; index < parts.length; index++) {
    const record = parts[index] ?? '';
    const code = record.slice(0, 2);
    const path = local(record.slice(3));
    const moved = code[0] === 'R' || code[0] === 'C';
    const previous = moved ? (parts[++index] ?? null) : null;
    if (path === null || path === '') continue;
    entries.push({
      path,
      previousPath: code[0] === 'R' && previous !== null ? local(previous) : null,
      change: statusChange(code)
    });
  }
  return entries;
}

export function parseNumstat(output: string): Map<string, DiffCounts> {
  const parts = records(output);
  const counts = new Map<string, DiffCounts>();
  const count = (value: string | undefined): number | null =>
    value === undefined || value === '-' ? null : Number(value);
  for (let index = 0; index < parts.length; index++) {
    const [additions, deletions, inline] = (parts[index] ?? '').split('\t');
    const path = inline === '' ? parts[(index += 2)] : inline;
    if (path) counts.set(path, { additions: count(additions), deletions: count(deletions) });
  }
  return counts;
}

export async function repositoryInfo(root: string): Promise<RepositoryInfo | null> {
  const prefix = await gitText(root, ['rev-parse', '--show-prefix']);
  if (prefix === null) return null;
  const [head, branch] = await Promise.all([
    gitText(root, ['rev-parse', '--verify', '-q', 'HEAD^{commit}']),
    gitText(root, ['symbolic-ref', '--short', '-q', 'HEAD'])
  ]);
  const commit = head?.trim() || null;
  return {
    prefix: prefix.trim(),
    head: commit,
    branch: branch?.trim() || commit?.slice(0, 7) || null
  };
}

export async function gitStatus(
  root: string,
  info: RepositoryInfo,
  pathspec: string
): Promise<StatusEntry[]> {
  const output = await git(root, [
    '--literal-pathspecs',
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
    '--',
    pathspec
  ]);
  return parseStatus(output.toString('utf8'), info.prefix);
}

export async function lineCounts(
  root: string,
  info: RepositoryInfo
): Promise<Map<string, DiffCounts>> {
  const output = await git(root, [
    'diff',
    info.head ?? EMPTY_TREE,
    '--numstat',
    '-z',
    '-M',
    '--relative',
    '--',
    '.'
  ]);
  return parseNumstat(output.toString('utf8'));
}

export async function ignoredPaths(root: string, paths: string[]): Promise<Set<string>> {
  if (paths.length === 0) return new Set();
  const output = await git(root, ['check-ignore', '--stdin', '-z'], {
    input: paths.map((path) => `${path}\0`).join('')
  }).catch((error: { code?: unknown; stdout?: Buffer }) => {
    if (error.code === 1) return Buffer.alloc(0);
    throw error;
  });
  return new Set(records(output.toString('utf8')));
}

export async function headBlob(root: string, info: RepositoryInfo, path: string): Promise<Blob> {
  if (info.head === null) return 'missing';
  return git(root, ['show', `${info.head}:./${path}`], { maxBuffer: MAX_FILE_BYTES }).catch(
    (error: { code?: unknown }) => {
      if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return 'tooLarge';
      if (error.code === 128) return 'missing';
      throw error;
    }
  );
}
