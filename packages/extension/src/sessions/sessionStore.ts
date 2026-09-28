import { readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type {
  HookEvent,
  PermissionLevel,
  QueuedRequest,
  SessionDetail
} from '@pocket-pilot/protocol';
import type { FSWatcher } from 'chokidar';

import { watchTargets } from '../fsWatch';
import { asRecord, asString, type JsonRecord } from '../json';
import { type Activity, toolStatuses } from './activityParts';
import { exportedRequests } from './exportedRequests';
import { LineTailer } from './lineTailer';
import { applyLogEntry, parseLogEntry } from './mutationLog';
import {
  editedPaths,
  lastRequestAt,
  type LogSummary,
  projectDetail,
  projectSummary,
  requestText
} from './projection';
import { currentQueue } from './queue';
import {
  markOf,
  newEntry,
  rememberRequests,
  requestsOf,
  rootOf,
  type SessionEntry,
  settledOf,
  startedOf,
  summaryOf,
  syncUnlogged
} from './sessionEntry';
import { matchesRequest } from './transcript';
import { pendingTurns } from './unloggedTurns';

const HOT_SESSIONS = 8;
const DEBOUNCE_MS = 150;
const MTIME_SLACK_MS = 2000;
const PERMISSION_OVERLAY_MS = 120_000;
const LOG_SUFFIX = '.jsonl';

export interface SessionFolders {
  sessions: string;
  transcripts: string | null;
}

type Listener = (sessionId: string | null) => void;

function summaryKey(entry: SessionEntry): string {
  return JSON.stringify(summaryOf(entry));
}

export class SessionStore {
  private readonly entries = new Map<string, SessionEntry>();
  private readonly hot: string[] = [];
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly listeners = new Set<Listener>();
  private watcher: FSWatcher | null = null;
  private disposed = false;

  constructor(
    private readonly folders: SessionFolders,
    private readonly report: (message: string) => void
  ) {}

  onDidChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  summaries(): LogSummary[] {
    return [...this.entries.values()]
      .flatMap((entry) => {
        const summary = summaryOf(entry);
        return summary && summary.requestCount > 0 ? [summary] : [];
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async start(): Promise<void> {
    const watched = [this.folders.sessions, this.folders.transcripts].flatMap((folder) =>
      folder === null ? [] : [{ path: folder, depth: 0 }]
    );
    const startedAt = Date.now();
    this.watcher = watchTargets(
      watched,
      (event, path) => this.onFileEvent(event, path),
      (error) => this.report(`Session watcher failed: ${String(error)}`),
      () => void this.reconcile(startedAt)
    );
    const files = await readdir(this.folders.sessions).catch(() => []);
    for (const file of files.filter((name) => name.endsWith(LOG_SUFFIX))) {
      if (this.disposed) return;
      await this.refresh(basename(file, LOG_SUFFIX), false);
    }
    this.emit(null);
  }

  async detail(sessionId: string, limit: number): Promise<SessionDetail | null> {
    const entry = await this.loaded(sessionId);
    if (!entry) return null;
    await this.readTranscript(entry);
    const summary = summaryOf(entry);
    if (!summary) return null;
    const activity = this.activity(entry);
    const detail = projectDetail(
      rootOf(entry),
      summary,
      limit,
      activity,
      pendingTurns(entry.unlogged, summary.modelId, activity.statuses, activity.settled)
    );
    const expected = entry.permission;
    return {
      ...detail,
      permission:
        expected && Date.now() - expected.at < PERMISSION_OVERLAY_MS
          ? expected.level
          : detail.permission,
      queued: currentQueue(
        detail.queued,
        entry.queue,
        startedOf(entry),
        entry.mark.writtenAt,
        Date.now()
      )
    };
  }

  expectQueue(sessionId: string, items: QueuedRequest[]): void {
    const entry = this.entries.get(sessionId);
    if (!entry) return;
    entry.queue = {
      items,
      at: Date.now(),
      seen: new Set(startedOf(entry).map((turn) => turn.key))
    };
    this.emit(sessionId);
  }

  expectPermission(sessionId: string, level: PermissionLevel): void {
    const entry = this.entries.get(sessionId);
    if (!entry) return;
    entry.permission = { level, at: Date.now() };
    this.emit(sessionId);
  }

  async editedPaths(sessionId: string): Promise<string[] | null> {
    const entry = await this.loaded(sessionId);
    return entry ? editedPaths(rootOf(entry)) : null;
  }

  async hook(event: HookEvent): Promise<void> {
    if (!this.entries.has(event.sessionId) && this.folders.transcripts === null) return;
    const entry = this.entryFor(event.sessionId);
    entry.hookedAt ??= event.at;
    const before = summaryKey(entry);
    await this.readTranscript(entry);
    entry.events.hook(event);
    if (event.kind === 'prompt') entry.stoppedAt = null;
    if (event.kind === 'stop') entry.stoppedAt = event.at;
    syncUnlogged(entry);
    this.touch(entry);
    this.emitChange(entry, before);
  }

  applyExport(root: unknown, at: number): void {
    const exported = requestsOf(root);
    const last = exported.at(-1);
    if (!last) return;
    const entry = this.exportTarget(exported, requestText(last));
    if (!entry || entry.mark.writtenAt >= at) return;
    const requests = exportedRequests(exported, entry.root, at);
    const before = summaryKey(entry);
    const summary = projectSummary(
      { ...asRecord(entry.root), requests },
      entry.id,
      entry.summary?.updatedAt ?? entry.hookedAt ?? at
    );
    const cold = entry.root === undefined && entry.summary;
    entry.exported = {
      requests,
      at,
      summary: cold ? { ...summary, title: cold.title, modeId: cold.modeId } : summary
    };
    rememberRequests(entry, requests);
    syncUnlogged(entry);
    this.emitChange(entry, before);
  }

  dispose(): void {
    this.disposed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.listeners.clear();
    void this.watcher?.close();
  }

  private async loaded(sessionId: string): Promise<SessionEntry | null> {
    const entry = this.entries.get(sessionId);
    if (!entry || !summaryOf(entry)) return null;
    if (entry.root === undefined) await this.readLog(entry);
    if (!this.entries.has(sessionId)) return null;
    this.touch(entry);
    return entry;
  }

  private async reconcile(since: number): Promise<void> {
    const logsIn = async (folder: string | null): Promise<string[]> => {
      if (folder === null) return [];
      const names = await readdir(folder).catch(() => []);
      return names.filter((name) => name.endsWith(LOG_SUFFIX)).map((name) => join(folder, name));
    };
    const [logs, transcripts] = await Promise.all([
      logsIn(this.folders.sessions),
      logsIn(this.folders.transcripts)
    ]);
    const files = [...logs, ...transcripts];
    const modified = await Promise.all(
      files.map((file) =>
        stat(file).then(
          (info) => info.mtimeMs >= since - MTIME_SLACK_MS,
          () => false
        )
      )
    );
    if (this.disposed) return;
    const present = new Set(logs.map((file) => basename(file, LOG_SUFFIX)));
    for (const entry of this.entries.values()) {
      if (entry.summary !== null && !present.has(entry.id))
        this.onFileEvent('unlink', entry.log.path);
    }
    for (const file of files.filter((_file, index) => modified[index])) {
      this.onFileEvent('change', file);
    }
  }

  private onFileEvent(event: string, path: string): void {
    if (!path.endsWith(LOG_SUFFIX)) return;
    const sessionId = basename(path, LOG_SUFFIX);
    const isTranscript =
      this.folders.transcripts !== null && path.startsWith(this.folders.transcripts);
    if (isTranscript) {
      void this.refreshTranscript(sessionId);
      return;
    }
    if (event === 'unlink') {
      this.entries.delete(sessionId);
      this.emit(null);
      return;
    }
    clearTimeout(this.timers.get(sessionId));
    this.timers.set(
      sessionId,
      setTimeout(() => {
        this.timers.delete(sessionId);
        void this.refresh(sessionId, true);
      }, DEBOUNCE_MS)
    );
  }

  private entryFor(sessionId: string): SessionEntry {
    const existing = this.entries.get(sessionId);
    if (existing) return existing;
    const created = newEntry(sessionId, join(this.folders.sessions, sessionId + LOG_SUFFIX));
    this.entries.set(sessionId, created);
    return created;
  }

  private activity(entry: SessionEntry): Activity {
    const turns = entry.events.turns();
    const last = requestsOf(rootOf(entry)).at(-1);
    const turn = last ? entry.events.turnFor(requestText(last)) : undefined;
    const { writtenAt } = markOf(entry);
    return {
      statuses: toolStatuses(turns.flatMap((candidate) => candidate.events)),
      events: turn?.events.filter((event) => event.at > writtenAt) ?? [],
      toolsOnly: entry.exported !== null,
      settled: settledOf(entry)
    };
  }

  private exportTarget(requests: JsonRecord[], text: string): SessionEntry | null {
    const ids = requests.flatMap((request) => asString(request.requestId) ?? []);
    const entries = [...this.entries.values()];
    const known = entries.filter((entry) => ids.some((id) => entry.requestIds.has(id)));
    const candidates =
      known.length > 0
        ? known
        : entries.filter((entry) =>
            entry.events.turns().some((turn) => matchesRequest(turn.content, text))
          );
    const updated = (entry: SessionEntry): number => summaryOf(entry)?.updatedAt ?? 0;
    return candidates.sort((a, b) => updated(b) - updated(a))[0] ?? null;
  }

  private async refresh(sessionId: string, notify: boolean): Promise<void> {
    const entry = this.entryFor(sessionId);
    const before = summaryKey(entry);
    await this.readLog(entry);
    if (!this.entries.has(sessionId)) {
      if (notify) this.emit(null);
      return;
    }
    this.touch(entry);
    if (notify) this.emitChange(entry, before);
  }

  private async refreshTranscript(sessionId: string): Promise<void> {
    const entry = this.entries.get(sessionId);
    if (!entry) return;
    const before = summaryKey(entry);
    await this.readTranscript(entry);
    if (!this.entries.has(sessionId)) return;
    this.emitChange(entry, before);
  }

  private readLog(entry: SessionEntry): Promise<void> {
    entry.reading = entry.reading
      .then(() => this.applyLog(entry))
      .catch((error: unknown) => {
        this.report(`Failed to read session ${entry.id}: ${String(error)}`);
      });
    return entry.reading;
  }

  private async applyLog(entry: SessionEntry): Promise<void> {
    const read = await entry.log.read();
    if (!read) {
      if (entry.hookedAt === null) this.entries.delete(entry.id);
      return;
    }
    let root = read.reset ? undefined : entry.root;
    try {
      for (const line of read.lines) {
        const parsed = parseLogEntry(line);
        if (parsed) root = applyLogEntry(root, parsed);
      }
    } catch (error) {
      this.report(`Resetting session ${entry.id}: ${String(error)}`);
      entry.log = new LineTailer(entry.log.path);
      entry.root = undefined;
      return;
    }
    entry.root = root;
    const modified = await stat(entry.log.path).then(
      (info) => info.mtimeMs,
      () => Date.now()
    );
    entry.summary = root === undefined ? null : projectSummary(root, entry.id, modified);
    entry.mark = { writtenAt: modified, lastRequestAt: lastRequestAt(root) };
    rememberRequests(entry, requestsOf(root));
    if (entry.exported && modified >= entry.exported.at) entry.exported = null;
    if (entry.permission && modified >= entry.permission.at) entry.permission = null;
    syncUnlogged(entry);
  }

  private readTranscript(entry: SessionEntry): Promise<void> {
    entry.reading = entry.reading
      .then(() => this.applyTranscript(entry))
      .catch((error: unknown) => {
        this.report(`Failed to read transcript ${entry.id}: ${String(error)}`);
      });
    return entry.reading;
  }

  private async applyTranscript(entry: SessionEntry): Promise<void> {
    if (!this.folders.transcripts) return;
    entry.transcript ??= new LineTailer(join(this.folders.transcripts, entry.id + LOG_SUFFIX));
    const read = await entry.transcript.read();
    if (!read) return;
    if (read.reset) entry.events.clear();
    entry.events.append(read.lines);
    syncUnlogged(entry);
  }

  private touch(entry: SessionEntry): void {
    const index = this.hot.indexOf(entry.id);
    if (index >= 0) this.hot.splice(index, 1);
    this.hot.push(entry.id);
    for (const evicted of this.hot.splice(0, Math.max(0, this.hot.length - HOT_SESSIONS))) {
      const cold = this.entries.get(evicted);
      if (!cold) continue;
      cold.root = undefined;
      cold.log = new LineTailer(cold.log.path);
      if (cold.unlogged.length > 0) continue;
      cold.transcript = null;
      cold.events.clear();
    }
  }

  private emitChange(entry: SessionEntry, before: string): void {
    this.emit(entry.id);
    if (summaryKey(entry) !== before) this.emit(null);
  }

  private emit(sessionId: string | null): void {
    for (const listener of this.listeners) listener(sessionId);
  }
}
