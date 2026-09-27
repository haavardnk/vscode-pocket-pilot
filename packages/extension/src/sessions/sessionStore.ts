import { readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type { SessionDetail, SessionSummary } from '@pocket-pilot/protocol';
import type { FSWatcher } from 'chokidar';

import { watchTargets } from '../fsWatch';
import { LineTailer } from './lineTailer';
import { applyLogEntry, parseLogEntry } from './mutationLog';
import { projectDetail, projectSummary } from './projection';
import { TranscriptBuffer } from './transcript';

const HOT_SESSIONS = 8;
const DEBOUNCE_MS = 150;
const MTIME_SLACK_MS = 2000;
const LOG_SUFFIX = '.jsonl';

export interface SessionFolders {
  sessions: string;
  transcripts: string | null;
}

interface SessionEntry {
  id: string;
  log: LineTailer;
  root: unknown;
  summary: SessionSummary | null;
  transcript: LineTailer | null;
  events: TranscriptBuffer;
  reading: Promise<void>;
}

type Listener = (sessionId: string | null) => void;

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

  summaries(): SessionSummary[] {
    return [...this.entries.values()]
      .flatMap((entry) => (entry.summary && entry.summary.requestCount > 0 ? [entry.summary] : []))
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
    const entry = this.entries.get(sessionId);
    if (!entry?.summary) return null;
    if (entry.root === undefined) await this.readLog(entry);
    if (!this.entries.has(sessionId) || !entry.summary) return null;
    this.touch(entry);
    await this.readTranscript(entry);
    return projectDetail(entry.root, entry.summary, limit, (text) => entry.events.liveFor(text));
  }

  dispose(): void {
    this.disposed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.listeners.clear();
    void this.watcher?.close();
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
      if (this.entries.has(sessionId)) this.emit(sessionId);
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
    const created: SessionEntry = {
      id: sessionId,
      log: new LineTailer(join(this.folders.sessions, sessionId + LOG_SUFFIX)),
      root: undefined,
      summary: null,
      transcript: null,
      events: new TranscriptBuffer(),
      reading: Promise.resolve()
    };
    this.entries.set(sessionId, created);
    return created;
  }

  private async refresh(sessionId: string, notify: boolean): Promise<void> {
    const entry = this.entryFor(sessionId);
    const before = JSON.stringify(entry.summary);
    await this.readLog(entry);
    if (!this.entries.has(sessionId)) {
      if (notify) this.emit(null);
      return;
    }
    this.touch(entry);
    if (!notify) return;
    this.emit(sessionId);
    if (JSON.stringify(entry.summary) !== before) this.emit(null);
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
      this.entries.delete(entry.id);
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
      cold.transcript = null;
      cold.events.clear();
    }
  }

  private emit(sessionId: string | null): void {
    for (const listener of this.listeners) listener(sessionId);
  }
}
