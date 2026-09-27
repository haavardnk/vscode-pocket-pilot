import type { CodeQuery, CodeResult, FileChange, TreeEntry } from '@pocket-pilot/protocol';

import { diffBlobs, type DiffCounts, diffCounts } from './diff';
import { fileContent, readBlob } from './files';
import type { CodeFolder } from './folders';
import {
  gitStatus,
  headBlob,
  ignoredPaths,
  lineCounts,
  repositoryInfo,
  type StatusEntry
} from './git';
import { relativeSegments, resolveInFolder } from './paths';
import type { SessionChanges } from './sessionChanges';
import { listDirectory } from './tree';

const MAX_CHANGES = 2000;
const UNKNOWN_COUNTS: DiffCounts = { additions: null, deletions: null };

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export interface CodeSources {
  folders: () => readonly CodeFolder[];
  language: (path: string) => string | null;
  sessions: SessionChanges;
}

function childChanges(
  statuses: readonly StatusEntry[],
  directory: string
): Map<string, FileChange> {
  const prefix = directory ? `${directory}/` : '';
  const kinds = new Map<string, Set<FileChange>>();
  for (const status of statuses) {
    if (!status.path.startsWith(prefix)) continue;
    const name = status.path.slice(prefix.length).split('/')[0] ?? '';
    const seen = kinds.get(name) ?? new Set<FileChange>();
    seen.add(status.change);
    kinds.set(name, seen);
  }
  return new Map(
    [...kinds].map(([name, seen]) => {
      const [first] = seen;
      return [name, seen.size === 1 && first ? first : 'modified'];
    })
  );
}

async function untrackedCounts(root: string, path: string): Promise<DiffCounts> {
  const read = await resolveInFolder(root, path)
    .then(readBlob)
    .catch(() => null);
  if (!read || read.blob === 'missing') return UNKNOWN_COUNTS;
  return diffCounts(diffBlobs('missing', read.blob));
}

export class CodeService {
  constructor(private readonly sources: CodeSources) {}

  async query(query: CodeQuery): Promise<CodeResult> {
    switch (query.kind) {
      case 'tree':
        return this.tree(this.folder(query.folderId), query.path);
      case 'file':
        return this.file(this.folder(query.folderId), query.path);
      case 'gitChanges':
        return this.gitChanges(this.folder(query.folderId));
      case 'gitDiff':
        return this.gitDiff(this.folder(query.folderId), query.path);
      case 'sessionChanges':
        return {
          kind: 'sessionChanges',
          files: await this.sources.sessions.changes(query.sessionId)
        };
      case 'sessionDiff':
        return {
          kind: 'sessionDiff',
          ...(await this.sources.sessions.diff(query.sessionId, query.path))
        };
    }
  }

  private folder(folderId: string): CodeFolder {
    const folder = this.sources.folders().find((candidate) => candidate.id === folderId);
    if (!folder) throw new Error('Workspace folder is no longer open');
    return folder;
  }

  private async tree(folder: CodeFolder, path: string): Promise<CodeResult> {
    const directory = relativeSegments(path).join('/');
    const listing = await listDirectory(await resolveInFolder(folder.root, directory));
    const info = await repositoryInfo(folder.root);
    const probe = (entry: { name: string }): string =>
      directory ? `${directory}/${entry.name}` : entry.name;
    const [statuses, ignored] = info
      ? await Promise.all([
          gitStatus(folder.root, info, directory || '.'),
          ignoredPaths(folder.root, listing.entries.map(probe))
        ])
      : [[], new Set<string>()];
    const changes = childChanges(statuses, directory);
    const entries: TreeEntry[] = listing.entries.map((entry) => ({
      ...entry,
      ignored: ignored.has(probe(entry)),
      change: changes.get(entry.name) ?? null
    }));
    return { kind: 'tree', entries, truncated: listing.truncated };
  }

  private async file(folder: CodeFolder, path: string): Promise<CodeResult> {
    const relative = relativeSegments(path).join('/');
    const target = await resolveInFolder(folder.root, relative);
    const [{ size, blob }, info] = await Promise.all([
      readBlob(target),
      repositoryInfo(folder.root)
    ]);
    const statuses = info && relative ? await gitStatus(folder.root, info, relative) : [];
    return {
      kind: 'file',
      language: this.sources.language(target),
      size,
      change: statuses.find((status) => status.path === relative)?.change ?? null,
      content: fileContent(blob, target)
    };
  }

  private async gitChanges(folder: CodeFolder): Promise<CodeResult> {
    const info = await repositoryInfo(folder.root);
    if (!info)
      return { kind: 'gitChanges', repository: false, branch: null, truncated: false, files: [] };
    const [statuses, counts] = await Promise.all([
      gitStatus(folder.root, info, '.'),
      lineCounts(folder.root, info)
    ]);
    const listed = statuses.sort((a, b) => collator.compare(a.path, b.path)).slice(0, MAX_CHANGES);
    const files = [];
    for (const status of listed) {
      const known =
        counts.get(status.path) ??
        (status.change === 'untracked'
          ? await untrackedCounts(folder.root, status.path)
          : UNKNOWN_COUNTS);
      files.push({ ...status, ...known });
    }
    return {
      kind: 'gitChanges',
      repository: true,
      branch: info.branch,
      truncated: statuses.length > MAX_CHANGES,
      files
    };
  }

  private async gitDiff(folder: CodeFolder, path: string): Promise<CodeResult> {
    const relative = relativeSegments(path).join('/');
    const target = await resolveInFolder(folder.root, relative);
    const info = await repositoryInfo(folder.root);
    if (!info) throw new Error('Folder is not a git repository');
    const status =
      (await gitStatus(folder.root, info, '.')).find((entry) => entry.path === relative) ?? null;
    const [before, after] = await Promise.all([
      headBlob(folder.root, info, status?.previousPath ?? relative),
      readBlob(target)
    ]);
    const diff = diffBlobs(before, after.blob);
    return {
      kind: 'gitDiff',
      language: this.sources.language(target),
      file: status && { ...status, ...diffCounts(diff) },
      diff
    };
  }
}
