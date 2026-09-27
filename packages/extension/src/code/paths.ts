import { realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';

export function relativeSegments(path: string): string[] {
  if (path.includes('\0') || path.includes('\\')) throw new Error('Invalid path');
  const segments = path.split('/').filter((segment) => segment !== '' && segment !== '.');
  if (segments.some((segment) => segment === '..' || segment === '.git')) {
    throw new Error('Path is not accessible');
  }
  return segments;
}

export function isInside(root: string, path: string): boolean {
  const offset = relative(root, path);
  return offset !== '..' && !offset.startsWith(`..${sep}`) && !isAbsolute(offset);
}

export async function resolveInFolder(root: string, path: string): Promise<string> {
  const target = join(root, ...relativeSegments(path));
  const realRoot = await realpath(root);
  const realTarget = await realpath(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (realTarget !== null && !isInside(realRoot, realTarget)) {
    throw new Error('Path is outside the workspace folder');
  }
  return target;
}
