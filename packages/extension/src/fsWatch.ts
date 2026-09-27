import { existsSync } from 'node:fs';
import { dirname, isAbsolute, relative, sep } from 'node:path';

import { type EmitArgsWithName, type FSWatcher, watch } from 'chokidar';

type EventName = EmitArgsWithName[0];

const LIVE_DELAY_MS = 1000;

export interface WatchTarget {
  path: string;
  depth: number;
  children?: RegExp;
}

function existingAncestor(path: string): string {
  let current = path;
  while (!existsSync(current) && dirname(current) !== current) current = dirname(current);
  return current;
}

function relevant(path: string, targets: readonly WatchTarget[]): boolean {
  return targets.some((target) => {
    if (target.path === path || target.path.startsWith(path + sep)) return true;
    const inner = relative(target.path, path);
    if (!inner || inner.startsWith('..') || isAbsolute(inner)) return false;
    const parts = inner.split(sep);
    if (target.children && !target.children.test(parts[0] ?? '')) return false;
    return parts.length <= target.depth + 1;
  });
}

export function watchTargets(
  targets: readonly WatchTarget[],
  onChange: (event: EventName, path: string) => void,
  onError: (error: unknown) => void,
  onLive: () => void
): FSWatcher {
  const roots = [...new Set(targets.map((target) => existingAncestor(target.path)))];
  const watcher = watch(roots, {
    ignoreInitial: true,
    ignored: (path: string) => !relevant(path, targets)
  });
  watcher.on('all', onChange);
  watcher.on('error', onError);
  watcher.once('ready', () => {
    setTimeout(() => {
      if (!watcher.closed) onLive();
    }, LIVE_DELAY_MS).unref();
  });
  return watcher;
}
