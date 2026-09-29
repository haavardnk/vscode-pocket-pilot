import type { SessionDetail, SessionWatch } from '@pocket-pilot/protocol';

export interface SessionUpdate {
  sessionId: string;
  detail: SessionDetail | null;
}

export class DetailFeed {
  private readonly queues = new Map<string, Promise<void>>();
  private watches = new Map<string, number>();

  constructor(
    private readonly load: (sessionId: string, limit: number) => Promise<SessionDetail | null>,
    private readonly publish: (update: SessionUpdate) => void,
    private readonly report: (message: string) => void
  ) {}

  watching(sessionId: string): boolean {
    return this.watches.has(sessionId);
  }

  setWatches(watches: readonly SessionWatch[]): void {
    const next = new Map(watches.map((watch) => [watch.sessionId, watch.limit]));
    const changed = [...next].filter(([sessionId, limit]) => this.watches.get(sessionId) !== limit);
    this.watches = next;
    for (const [sessionId] of changed) this.push(sessionId);
  }

  pushWatched(sessionId: string): void {
    if (this.watches.has(sessionId)) this.push(sessionId);
  }

  pushAll(): void {
    for (const sessionId of this.watches.keys()) this.push(sessionId);
  }

  private push(sessionId: string): void {
    const previous = this.queues.get(sessionId) ?? Promise.resolve();
    const next = previous
      .then(async () => {
        const limit = this.watches.get(sessionId);
        if (limit === undefined) return;
        const detail = await this.load(sessionId, limit);
        if (!this.watches.has(sessionId)) return;
        this.publish({ sessionId, detail });
      })
      .catch((error: unknown) => this.report(`Session detail failed: ${String(error)}`))
      .finally(() => {
        if (this.queues.get(sessionId) === next) this.queues.delete(sessionId);
      });
    this.queues.set(sessionId, next);
  }
}
