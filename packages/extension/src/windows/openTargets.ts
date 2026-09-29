import { basename, sep } from 'node:path';

import type { OpenTarget, WindowResult } from '@pocket-pilot/protocol';

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

function openTarget(candidate: OpenCandidate, home: string): OpenTarget {
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

export function openTargets(
  recent: readonly OpenCandidate[],
  projects: readonly OpenCandidate[],
  home: string
): WindowResult {
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
