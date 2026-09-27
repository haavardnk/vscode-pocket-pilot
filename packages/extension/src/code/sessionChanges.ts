import { relative } from 'node:path';

import type { Baseline, DiffContent, SessionChange } from '@pocket-pilot/protocol';

import { type EditingEntry, type EditingSessions, EMPTY_HASH } from '../sessions/editingState';
import { diffBlobs, diffCounts } from './diff';
import { type Blob, readBlob } from './files';
import { type CodeFolder, type FolderLocation, locate } from './folders';
import { headBlob, repositoryInfo } from './git';
import { isInside } from './paths';

const MAX_SESSION_FILES = 200;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export interface SessionChangeSources {
  folders: () => readonly CodeFolder[];
  language: (path: string) => string | null;
  editing: EditingSessions;
  editedPaths: (sessionId: string) => Promise<string[] | null>;
  home: string;
}

export interface SessionDiff {
  language: string | null;
  file: SessionChange;
  diff: DiffContent;
}

interface Target {
  path: string;
  entry: EditingEntry | null;
}

interface Comparison {
  file: SessionChange;
  diff: DiffContent;
}

function changeKind(before: Blob, after: Blob, known: boolean): SessionChange['change'] {
  if (after === 'missing') return 'deleted';
  if (before === 'missing' && known) return 'added';
  return 'modified';
}

export class SessionChanges {
  constructor(private readonly sources: SessionChangeSources) {}

  async paths(sessionId: string): Promise<string[]> {
    return (await this.targets(sessionId)).map((target) => target.path);
  }

  async changes(sessionId: string): Promise<SessionChange[]> {
    const targets = (await this.targets(sessionId)).slice(0, MAX_SESSION_FILES);
    const compared = await Promise.all(targets.map((target) => this.compare(sessionId, target)));
    return compared.map(({ file }) => file).sort((a, b) => collator.compare(a.label, b.label));
  }

  async diff(sessionId: string, path: string): Promise<SessionDiff> {
    const target = (await this.targets(sessionId)).find((candidate) => candidate.path === path);
    if (!target) throw new Error('File is not part of this chat');
    const { file, diff } = await this.compare(sessionId, target);
    return { language: this.sources.language(path), file, diff };
  }

  private async targets(sessionId: string): Promise<Target[]> {
    const edited = await this.sources.editedPaths(sessionId);
    if (edited === null) throw new Error('Unknown session');
    const entries = await this.sources.editing.entries(sessionId);
    const recorded = new Map(entries.map((entry) => [entry.path, entry]));
    return [...new Set([...recorded.keys(), ...edited])].map((path) => ({
      path,
      entry: recorded.get(path) ?? null
    }));
  }

  private async compare(sessionId: string, target: Target): Promise<Comparison> {
    const location = locate(this.sources.folders(), target.path);
    const [baseline, current] = await Promise.all([
      this.baseline(sessionId, target, location),
      readBlob(target.path)
    ]);
    const after = target.entry?.deleted ? 'missing' : current.blob;
    const diff = diffBlobs(baseline.blob, after);
    const known = baseline.kind !== 'none';
    return {
      diff,
      file: {
        path: target.path,
        label: this.label(target.path, location),
        folderId: location?.folder.id ?? null,
        relativePath: location?.relative ?? null,
        change: changeKind(baseline.blob, after, known),
        state: target.entry?.state ?? 'pending',
        baseline: baseline.kind,
        ...(known ? diffCounts(diff) : { additions: null, deletions: null })
      }
    };
  }

  private async baseline(
    sessionId: string,
    target: Target,
    location: FolderLocation | null
  ): Promise<{ kind: Baseline; blob: Blob }> {
    if (target.entry) {
      const hash = target.entry.baselineHash;
      const blob =
        hash === EMPTY_HASH ? 'missing' : await this.sources.editing.blob(sessionId, hash);
      return { kind: 'session', blob };
    }
    const info = location ? await repositoryInfo(location.folder.root) : null;
    if (!location || !info) return { kind: 'none', blob: 'missing' };
    return { kind: 'commit', blob: await headBlob(location.folder.root, info, location.relative) };
  }

  private label(path: string, location: FolderLocation | null): string {
    if (location) {
      return this.sources.folders().length > 1
        ? `${location.folder.name}/${location.relative}`
        : location.relative;
    }
    if (isInside(this.sources.home, path)) return `~/${relative(this.sources.home, path)}`;
    return path;
  }
}
