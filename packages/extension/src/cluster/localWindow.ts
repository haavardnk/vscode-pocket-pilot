import type {
  Command,
  HookEvent,
  Query,
  QueryResult,
  SessionDetail,
  SessionWatch,
  TerminalDetail,
  TerminalPatch,
  WindowState
} from '@pocket-pilot/protocol';

export interface Disposable {
  dispose(): void;
}

type Subscribe<T> = (listener: (value: T) => void) => Disposable;

export type TerminalUpdate =
  | { terminalId: string; detail: TerminalDetail | null }
  | { terminalId: string; patch: TerminalPatch };

export interface LocalWindow {
  readonly windowId: string;
  state(): WindowState;
  setWatches(watches: readonly SessionWatch[]): void;
  setTerminalWatches(terminalIds: readonly string[]): void;
  run(command: Command): Promise<void>;
  query(query: Query): Promise<QueryResult>;
  hook(event: HookEvent): Promise<void>;
  readonly onDidChangeState: Subscribe<WindowState>;
  readonly onDidChangeSession: Subscribe<{ sessionId: string; detail: SessionDetail | null }>;
  readonly onDidChangeTerminal: Subscribe<TerminalUpdate>;
}
