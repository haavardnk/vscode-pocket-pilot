import { relative } from 'node:path';

import type {
  Baseline,
  DiffContent,
  EditState,
  SessionChange,
  SessionDetail
} from '@pocket-pilot/protocol';

import { type EditingEntry, type EditingSessions, EMPTY_HASH } from '../sessions/editingState';
import type { LiveEdits, LiveSpan } from '../sessions/liveEdits';
import { requestEdit, requestPaths, type Timeline } from '../sessions/timeline';
import { diffBlobs, diffCounts } from './diff';
import type { EditChanges, EditTarget } from './editChanges';
import { type Blob, textBlob } from './files';
import { type CodeFolder, type FolderLocation, locate } from './folders';
import { headBlob, repositoryInfo } from './git';
import { isInside } from './paths';

const MAX_SESSION_FILES = 200;
const MAX_REQUESTS = 500;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export interface SessionChangeSources {
  folders: () => readonly CodeFolder[];
  language: (path: string) => string | null;
  editing: EditingSessions;
  editedPaths: (sessionId: string) => Promise<string[] | null>;
  detail: (sessionId: string, limit: number) => Promise<SessionDetail | null>;
  current: (path: string) => Promise<Blob>;
  live: LiveEdits;
  edits: EditChanges;
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

interface RequestTarget {
  path: string;
  state: EditState;
  span: LiveSpan | null;
  preferLive: boolean;
  timeline: Timeline;
  requestId: string;
}

interface Snapshot {
  kind: Baseline;
  blob: Blob;
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

  async requestChanges(sessionId: string, requestId: string): Promise<SessionChange[]> {
    const targets = await this.requestTargets(sessionId, requestId);
    const compared = await Promise.all(targets.map((target) => this.compareRequest(target)));
    return compared.map(({ file }) => file).sort((a, b) => collator.compare(a.label, b.label));
  }

  async requestDiff(sessionId: string, requestId: string, path: string): Promise<SessionDiff> {
    const targets = await this.requestTargets(sessionId, requestId);
    const target = targets.find((candidate) => candidate.path === path);
    if (!target) throw new Error('File is not part of this request');
    const { file, diff } = await this.compareRequest(target);
    return { language: this.sources.language(path), file, diff };
  }

  async editDiff(sessionId: string, target: EditTarget): Promise<SessionDiff> {
    const [edit, entries] = await Promise.all([
      this.sources.edits.resolve(sessionId, target),
      this.sources.editing.entries(sessionId)
    ]);
    if (!edit) return this.requestDiff(sessionId, target.requestId, target.path);
    const state = entries.find((entry) => entry.path === target.path)?.state ?? 'pending';
    const { file, diff } = this.describe(
      target.path,
      { kind: 'edit', blob: edit.before },
      edit.after,
      state
    );
    return { language: this.sources.language(target.path), file, diff };
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
      this.sources.current(target.path)
    ]);
    const after = target.entry?.deleted ? 'missing' : current;
    return this.describe(target.path, baseline, after, target.entry?.state ?? 'pending');
  }

  private async requestTargets(sessionId: string, requestId: string): Promise<RequestTarget[]> {
    const detail = await this.sources.detail(sessionId, MAX_REQUESTS);
    if (!detail) throw new Error('Unknown session');
    const index = detail.requests.findIndex((request) => request.id === requestId);
    const request = detail.requests[index];
    if (!request) throw new Error('Unknown request');
    const [timeline, entries] = await Promise.all([
      this.sources.editing.timeline(sessionId),
      this.sources.editing.entries(sessionId)
    ]);
    const span = this.sources.live.span(sessionId, {
      message: request.message,
      timestamp: request.timestamp,
      until: detail.requests[index + 1]?.timestamp ?? null
    });
    const edited = request.parts.flatMap((part) => (part.kind === 'edit' ? [part.path] : []));
    const paths = new Set([
      ...requestPaths(timeline, requestId),
      ...(span?.files.keys() ?? []),
      ...edited
    ]);
    const states = new Map(entries.map((entry) => [entry.path, entry.state]));
    return [...paths].slice(0, MAX_SESSION_FILES).map((path) => ({
      path,
      state: states.get(path) ?? 'pending',
      span,
      preferLive: index === detail.requests.length - 1,
      timeline,
      requestId
    }));
  }

  private async compareRequest(target: RequestTarget): Promise<Comparison> {
    const { path, span } = target;
    const logged = requestEdit(target.timeline, target.requestId, path);
    const captured = span?.files.get(path);
    if (span && captured !== undefined && (target.preferLive || !logged)) {
      const after = await span.after(path);
      return this.describe(path, { kind: 'request', blob: captured }, after, target.state);
    }
    if (logged) {
      return this.describe(
        path,
        { kind: 'request', blob: textBlob(logged.before) },
        textBlob(logged.after),
        target.state
      );
    }
    const after = await this.sources.current(path);
    return this.describe(path, { kind: 'none', blob: 'missing' }, after, target.state);
  }

  private describe(path: string, before: Snapshot, after: Blob, state: EditState): Comparison {
    const location = locate(this.sources.folders(), path);
    const diff = diffBlobs(before.blob, after);
    const known = before.kind !== 'none';
    return {
      diff,
      file: {
        path,
        label: this.label(path, location),
        folderId: location?.folder.id ?? null,
        relativePath: location?.relative ?? null,
        change: changeKind(before.blob, after, known),
        state,
        baseline: before.kind,
        ...(known ? diffCounts(diff) : { additions: null, deletions: null })
      }
    };
  }

  private async baseline(
    sessionId: string,
    target: Target,
    location: FolderLocation | null
  ): Promise<Snapshot> {
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
