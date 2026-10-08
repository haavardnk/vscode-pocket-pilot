import { stat } from 'node:fs/promises';
import { basename, resolve, sep } from 'node:path';

import type { OpenTarget, QueryResultFor } from '@pocket-pilot/protocol';

import { expandRoot } from './projectRoots';

const WORKSPACE_EXTENSION = '.code-workspace';

export interface OpenCandidate {
  id: string;
  fsPath: string;
  kind: OpenTarget['kind'];
}

function shortPath(fsPath: string, home: string): string {
  return fsPath === home || fsPath.startsWith(`${home}${sep}`)
    ? `~${fsPath.slice(home.length)}`
    : fsPath;
}

export function openTarget(candidate: OpenCandidate, home: string): OpenTarget {
  const name = basename(candidate.fsPath);
  return {
    id: candidate.id,
    name:
      candidate.kind === 'workspace' && name.endsWith(WORKSPACE_EXTENSION)
        ? name.slice(0, -WORKSPACE_EXTENSION.length)
        : name,
    path: shortPath(candidate.fsPath, home),
    kind: candidate.kind
  };
}

function unique(candidates: readonly OpenCandidate[], skip: ReadonlySet<string>): OpenCandidate[] {
  const seen = new Set(skip);
  return candidates.filter((candidate) => {
    if (seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  });
}

export function typedPath(input: string, home: string): string {
  const expanded = expandRoot(input, home);
  if (!expanded) throw new Error('Enter a full path starting with / or ~');
  return resolve(expanded);
}

export async function targetKind(fsPath: string, home: string): Promise<OpenTarget['kind']> {
  const stats = await stat(fsPath).catch(() => null);
  if (stats?.isDirectory()) return 'folder';
  if (stats?.isFile() && fsPath.endsWith(WORKSPACE_EXTENSION)) return 'workspace';
  const shown = shortPath(fsPath, home);
  throw new Error(
    stats
      ? `${shown} is not a folder or a ${WORKSPACE_EXTENSION} file`
      : `There is nothing at ${shown}`
  );
}

export function openTargets(
  recent: readonly OpenCandidate[],
  projects: readonly OpenCandidate[],
  home: string
): QueryResultFor<'openTargets'> {
  const recentTargets = unique(recent, new Set()).map((candidate) => openTarget(candidate, home));
  const recentIds = new Set(recentTargets.map((target) => target.id));
  return {
    kind: 'openTargets',
    recent: recentTargets,
    projects: unique(projects, recentIds)
      .map((candidate) => openTarget(candidate, home))
      .sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path))
  };
}
