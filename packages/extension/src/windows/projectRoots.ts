import type { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

const MAX_DEPTH = 2;
const MAX_PROJECTS = 1000;

const SKIPPED = new Set(['node_modules']);

export function expandRoot(root: string, home: string): string | null {
  const trimmed = root.trim();
  const expanded =
    trimmed === '~' ? home : /^~[\\/]/.test(trimmed) ? join(home, trimmed.slice(2)) : trimmed;
  return isAbsolute(expanded) ? expanded : null;
}

async function entries(directory: string): Promise<Dirent[]> {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function scan(directory: string, depth: number, found: string[]): Promise<void> {
  if (found.length >= MAX_PROJECTS) return;
  const children = await entries(directory);
  if (children.some((child) => child.name === '.git')) {
    found.push(directory);
    return;
  }
  if (depth >= MAX_DEPTH) return;
  const folders = children.filter(
    (child) => child.isDirectory() && !child.name.startsWith('.') && !SKIPPED.has(child.name)
  );
  for (const folder of folders) await scan(join(directory, folder.name), depth + 1, found);
}

export async function scanRoots(roots: readonly string[], home: string): Promise<string[]> {
  const found: string[] = [];
  const directories = roots.flatMap((root) => expandRoot(root, home) ?? []);
  for (const directory of new Set(directories)) await scan(directory, 0, found);
  return [...new Set(found)].slice(0, MAX_PROJECTS);
}
