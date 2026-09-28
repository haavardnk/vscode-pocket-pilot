import {
  type ClientMessage,
  type CodeQuery,
  type CodeResult,
  type Command,
  parseMessage,
  type ServerMessage,
  serverMessageSchema,
  stableRequestSchema,
  VERSION_MISMATCH
} from '@pocket-pilot/protocol';

export type Connection = 'connecting' | 'open' | 'offline';

const REQUEST_TIMEOUT_MS = 30_000;
const MIN_RETRY_MS = 500;
const MAX_RETRY_MS = 10_000;

interface Handlers {
  resolve: (result: CodeResult | null) => void;
  reject: (error: Error) => void;
}

interface Pending extends Handlers {
  timer: ReturnType<typeof setTimeout>;
}

export interface SocketHandlers {
  message(message: ServerMessage): void;
  unreadable(): void;
  connection(state: Connection): void;
  rejected(): void;
}

export class HubSocket {
  private socket: WebSocket | null = null;
  private retry = MIN_RETRY_MS;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly pending = new Map<string, Pending>();
  private stopped = false;

  constructor(
    private readonly url: string,
    private readonly handlers: SocketHandlers
  ) {}

  connect(): void {
    this.stopped = false;
    clearTimeout(this.timer);
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;
    this.handlers.connection('connecting');
    const socket = new WebSocket(this.url);
    let opened = false;
    this.socket = socket;
    socket.addEventListener('open', () => {
      opened = true;
      this.retry = MIN_RETRY_MS;
      this.handlers.connection('open');
    });
    socket.addEventListener('message', (event: MessageEvent<string>) => {
      const message = parseMessage(serverMessageSchema, event.data);
      if (!message) {
        const reply = parseMessage(stableRequestSchema, event.data);
        if (reply) this.settle(reply.requestId, VERSION_MISMATCH);
        this.handlers.unreadable();
        return;
      }
      if (message.type === 'result')
        this.settle(message.requestId, message.ok ? null : (message.error ?? 'Failed'));
      else if (message.type === 'queryResult')
        this.settle(
          message.requestId,
          message.result ? null : (message.error ?? 'Failed'),
          message.result
        );
      else this.handlers.message(message);
    });
    socket.addEventListener('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.failPending('Disconnected');
      if (this.stopped) return;
      this.handlers.connection('offline');
      if (!opened) this.handlers.rejected();
      this.timer = setTimeout(() => this.connect(), this.retry);
      this.retry = Math.min(MAX_RETRY_MS, this.retry * 2);
    });
  }

  reconnectNow(): void {
    if (this.stopped || this.socket) return;
    this.retry = MIN_RETRY_MS;
    this.connect();
  }

  send(message: ClientMessage): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  command(command: Command): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.request((requestId) => ({ type: 'command', requestId, command }), {
        resolve: () => resolve(),
        reject
      });
    });
  }

  query(query: CodeQuery): Promise<CodeResult> {
    return new Promise<CodeResult>((resolve, reject) => {
      this.request((requestId) => ({ type: 'query', requestId, query }), {
        resolve: (result) => (result ? resolve(result) : reject(new Error('Empty result'))),
        reject
      });
    });
  }

  close(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.socket?.close();
    this.socket = null;
    this.failPending('Disconnected');
  }

  private request(message: (requestId: string) => ClientMessage, handlers: Handlers): void {
    const requestId = crypto.randomUUID();
    if (!this.send(message(requestId))) {
      handlers.reject(new Error('Not connected'));
      return;
    }
    const timer = setTimeout(
      () => this.settle(requestId, 'VS Code did not respond'),
      REQUEST_TIMEOUT_MS
    );
    this.pending.set(requestId, { ...handlers, timer });
  }

  private settle(requestId: string, error: string | null, result: CodeResult | null = null): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    clearTimeout(pending.timer);
    if (error === null) pending.resolve(result);
    else pending.reject(new Error(error));
  }

  private failPending(reason: string): void {
    for (const requestId of [...this.pending.keys()]) this.settle(requestId, reason);
  }
}

export function socketUrl(location: Location): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}
