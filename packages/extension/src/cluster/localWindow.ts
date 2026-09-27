import type { Command, SessionDetail, SessionWatch, WindowState } from '@pocket-pilot/protocol';

export interface Disposable {
  dispose(): void;
}

export type Subscribe<T> = (listener: (value: T) => void) => Disposable;

export interface LocalWindow {
  readonly windowId: string;
  state(): WindowState;
  setWatches(watches: readonly SessionWatch[]): void;
  run(command: Command): Promise<void>;
  readonly onDidChangeState: Subscribe<WindowState>;
  readonly onDidChangeSession: Subscribe<{ sessionId: string; detail: SessionDetail | null }>;
}
