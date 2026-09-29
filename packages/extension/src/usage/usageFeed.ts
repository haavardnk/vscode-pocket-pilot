import type { CopilotUsage, RequestState, WindowState } from '@pocket-pilot/protocol';

import { errorMessage } from '../errors';

export interface UsageReader {
  read(): Promise<CopilotUsage>;
  onDidChangeAccess(listener: () => void): { dispose(): void };
}

export interface UsageFeedOptions {
  reader: UsageReader;
  publish(usage: CopilotUsage): void;
  hasClients(): boolean;
  report(message: string): void;
}

const MIN_INTERVAL_MS = 30_000;
const STALE_MS = 2 * 60_000;
const SETTLE_MS = 5_000;
const POLL_MS = 15 * 60_000;
const SETTLED: ReadonlySet<RequestState | null> = new Set(['complete', 'cancelled', 'failed']);

export class UsageFeed {
  private readonly requests = new Map<string, string>();
  private readonly access: { dispose(): void };
  private readonly poll: NodeJS.Timeout;
  private timer: NodeJS.Timeout | null = null;
  private lastRead = 0;
  private reading = false;
  private again = false;
  private failing = false;
  private known = false;
  private disposed = false;

  constructor(private readonly options: UsageFeedOptions) {
    this.access = options.reader.onDidChangeAccess(() => void this.read());
    this.poll = setInterval(() => {
      if (options.hasClients()) this.refresh();
    }, POLL_MS);
    void this.read();
  }

  phoneVisible(): void {
    if (Date.now() - this.lastRead >= STALE_MS) this.refresh();
  }

  observe(windows: readonly WindowState[]): void {
    const previous = new Map(this.requests);
    this.requests.clear();
    const sessions = windows.flatMap((window) =>
      window.sessions.map((session) => ({
        key: JSON.stringify([window.windowId, session.id]),
        session
      }))
    );
    for (const { key, session } of sessions) {
      const state = `${session.requestCount}:${session.lastRequestState}`;
      this.requests.set(key, state);
      const before = previous.get(key);
      if (before !== undefined && before !== state && SETTLED.has(session.lastRequestState)) {
        this.schedule(SETTLE_MS);
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    clearInterval(this.poll);
    if (this.timer) clearTimeout(this.timer);
    this.access.dispose();
  }

  private refresh(): void {
    const wait = this.lastRead + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) this.schedule(wait);
    else void this.read();
  }

  private schedule(delay: number): void {
    if (this.timer || this.disposed) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.refresh();
    }, delay);
  }

  private async read(): Promise<void> {
    if (this.disposed) return;
    if (this.reading) {
      this.again = true;
      return;
    }
    this.reading = true;
    this.lastRead = Date.now();
    try {
      this.publish(await this.options.reader.read());
      this.failing = false;
    } catch (error) {
      if (!this.failing) this.options.report(`Copilot usage check failed: ${errorMessage(error)}`);
      this.failing = true;
      if (!this.known) this.publish({ state: 'unavailable', reason: 'Could not reach GitHub' });
    } finally {
      this.reading = false;
    }
    if (!this.again) return;
    this.again = false;
    await this.read();
  }

  private publish(usage: CopilotUsage): void {
    if (this.disposed) return;
    this.known = true;
    this.options.publish(usage);
  }
}
