import { basename, dirname } from 'node:path';

import type { SessionDetail } from '@pocket-pilot/protocol';
import type { FSWatcher } from 'chokidar';

import { watchTargets } from '../fsWatch';
import type { EditingSessions } from './editingState';
import { requestPaths, type Timeline } from './timeline';

const RESTORE_OVERLAY_MS = 600_000;
const STATE_FILE = 'state.json';

interface Restored {
  requestIds: readonly string[];
  at: number;
}

type Listener = (sessionId: string) => void;

function latest(epochs: readonly number[]): number {
  return epochs.reduce((max, epoch) => Math.max(max, epoch), 0);
}

export function disabledRequests({ checkpoints, operations, currentEpoch }: Timeline): string[] {
  if (currentEpoch === null) return [];
  const epochs = [...operations, ...checkpoints].map((item) => item.epoch);
  if (currentEpoch > latest(epochs)) return [];
  const starts = checkpoints.filter((checkpoint) => checkpoint.stopId === null);
  const applied = latest(
    [...operations, ...starts].flatMap((item) => (item.epoch < currentEpoch ? [item.epoch] : []))
  );
  return starts.flatMap((checkpoint) =>
    checkpoint.epoch > applied && checkpoint.requestId !== null ? [checkpoint.requestId] : []
  );
}

export class Checkpoints {
  private readonly restored = new Map<string, Restored>();
  private readonly listeners = new Set<Listener>();
  private watcher: FSWatcher | null = null;

  constructor(
    private readonly root: string | null,
    private readonly editing: EditingSessions,
    private readonly report: (message: string) => void
  ) {}

  onDidChange(listener: Listener): void {
    this.listeners.add(listener);
  }

  start(): void {
    if (this.root === null) return;
    this.watcher = watchTargets(
      [{ path: this.root, depth: 1 }],
      (_event, path) => {
        if (basename(path) === STATE_FILE) this.emit(basename(dirname(path)));
      },
      (error) => this.report(`Editing state watcher failed: ${String(error)}`),
      () => undefined
    );
  }

  expect(sessionId: string, requestIds: readonly string[]): void {
    this.restored.set(sessionId, { requestIds, at: Date.now() });
    this.emit(sessionId);
  }

  async disabled(sessionId: string): Promise<readonly string[]> {
    return this.disabledIn(sessionId, await this.editing.timeline(sessionId));
  }

  async decorate(detail: SessionDetail): Promise<SessionDetail> {
    const timeline = await this.editing.timeline(detail.id);
    const disabled = new Set(await this.disabledIn(detail.id, timeline));
    return {
      ...detail,
      requests: detail.requests.map((request) => ({
        ...request,
        disabled: disabled.has(request.id),
        editedPaths: [
          ...new Set([
            ...requestPaths(timeline, request.id),
            ...request.parts.flatMap((part) => (part.kind === 'edit' ? [part.path] : []))
          ])
        ]
      }))
    };
  }

  dispose(): void {
    this.listeners.clear();
    void this.watcher?.close();
  }

  private async disabledIn(sessionId: string, timeline: Timeline): Promise<readonly string[]> {
    const restored = this.restored.get(sessionId);
    if (restored && Date.now() - restored.at < RESTORE_OVERLAY_MS) {
      const savedAt = await this.editing.savedAt(sessionId);
      if (savedAt === null || savedAt < restored.at) return restored.requestIds;
    }
    if (this.restored.get(sessionId) === restored) this.restored.delete(sessionId);
    return disabledRequests(timeline);
  }

  private emit(sessionId: string): void {
    for (const listener of this.listeners) listener(sessionId);
  }
}
