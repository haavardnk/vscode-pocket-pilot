import { dirname } from 'node:path';

import type { FSWatcher } from 'chokidar';

import { watchTargets } from '../fsWatch';
import { readSessionFlags, type SessionFlags } from './sessionFlags';

const READ_DELAY_MS = 300;
const PENDING_MS = 120_000;
const UNFLAGGED: SessionFlags = { pinned: false, archived: false };

interface Pending {
  flags: Partial<SessionFlags>;
  timer: NodeJS.Timeout;
}

export class FlagStore {
  private stored = new Map<string, SessionFlags>();
  private readonly pending = new Map<string, Pending>();
  private readonly listeners = new Set<() => void>();
  private watcher: FSWatcher | null = null;
  private readTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly database: string | null,
    private readonly report: (message: string) => void
  ) {}

  onDidChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    const database = this.database;
    if (database === null) return;
    this.read(database);
    const watcher = watchTargets(
      [{ path: dirname(database), depth: 0 }],
      (_event, path) => {
        if (path !== database) return;
        clearTimeout(this.readTimer);
        this.readTimer = setTimeout(() => this.read(database), READ_DELAY_MS);
      },
      (error) => this.report(`State watcher failed: ${String(error)}`),
      () => this.read(database)
    );
    this.watcher = watcher;
    await new Promise<void>((resolve) => watcher.once('ready', () => resolve()));
  }

  flags(sessionId: string): SessionFlags {
    return {
      ...UNFLAGGED,
      ...this.stored.get(sessionId),
      ...this.pending.get(sessionId)?.flags
    };
  }

  expect(sessionId: string, flags: Partial<SessionFlags>): void {
    const existing = this.pending.get(sessionId);
    clearTimeout(existing?.timer);
    this.pending.set(sessionId, {
      flags: { ...existing?.flags, ...flags },
      timer: setTimeout(() => {
        this.pending.delete(sessionId);
        this.emit();
      }, PENDING_MS)
    });
    this.emit();
  }

  dispose(): void {
    clearTimeout(this.readTimer);
    for (const pending of this.pending.values()) clearTimeout(pending.timer);
    this.pending.clear();
    this.listeners.clear();
    void this.watcher?.close();
  }

  private read(database: string): void {
    let next: Map<string, SessionFlags>;
    try {
      next = readSessionFlags(database);
    } catch (error) {
      this.report(`Cannot read chat state: ${String(error)}`);
      return;
    }
    const changed = JSON.stringify([...next]) !== JSON.stringify([...this.stored]);
    this.stored = next;
    for (const [sessionId, pending] of this.pending) {
      const current = { ...UNFLAGGED, ...next.get(sessionId) };
      const settled =
        (pending.flags.pinned ?? current.pinned) === current.pinned &&
        (pending.flags.archived ?? current.archived) === current.archived;
      if (!settled) continue;
      clearTimeout(pending.timer);
      this.pending.delete(sessionId);
    }
    if (changed) this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
