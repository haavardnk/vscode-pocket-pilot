import type { PushEvent, RequestState, SessionSummary, WindowState } from '@pocket-pilot/protocol';

export interface SessionAlert {
  event: PushEvent;
  windowId: string;
  windowName: string;
  session: SessionSummary;
}

interface Tracked {
  state: RequestState | null;
  requestCount: number;
  alert: Omit<SessionAlert, 'event'>;
  timer: NodeJS.Timeout | null;
}

const IMMEDIATE: Partial<Record<RequestState, PushEvent>> = {
  failed: 'failed',
  needsInput: 'needsInput'
};

export class StatusWatcher {
  private readonly sessions = new Map<string, Tracked>();

  constructor(
    private readonly emit: (alert: SessionAlert) => void,
    private readonly finishDelayMs = 3000
  ) {}

  observe(windows: readonly WindowState[]): void {
    const seen = new Set<string>();
    for (const window of windows)
      for (const session of window.sessions) {
        const key = JSON.stringify([window.windowId, session.id]);
        seen.add(key);
        this.track(key, { windowId: window.windowId, windowName: window.name, session });
      }
    for (const [key, tracked] of this.sessions)
      if (!seen.has(key)) {
        if (tracked.timer) clearTimeout(tracked.timer);
        this.sessions.delete(key);
      }
  }

  dispose(): void {
    for (const tracked of this.sessions.values()) if (tracked.timer) clearTimeout(tracked.timer);
    this.sessions.clear();
  }

  private track(key: string, alert: Omit<SessionAlert, 'event'>): void {
    const { lastRequestState: state, requestCount } = alert.session;
    const tracked = this.sessions.get(key);
    if (!tracked) {
      this.sessions.set(key, { state, requestCount, alert, timer: null });
      return;
    }
    tracked.alert = alert;
    if (tracked.state === state && tracked.requestCount === requestCount) return;
    tracked.state = state;
    tracked.requestCount = requestCount;
    if (tracked.timer) clearTimeout(tracked.timer);
    tracked.timer = null;
    const immediate = state ? IMMEDIATE[state] : undefined;
    if (immediate) {
      this.emit({ ...alert, event: immediate });
      return;
    }
    if (state !== 'complete') return;
    tracked.timer = setTimeout(() => {
      tracked.timer = null;
      this.emit({ ...tracked.alert, event: 'finished' });
    }, this.finishDelayMs);
  }
}
