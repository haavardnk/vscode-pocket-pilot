import {
  type ClientMessage,
  type Command,
  parseMessage,
  type ServerMessage,
  serverMessageSchema
} from '@pocket-pilot/protocol';

export type Connection = 'connecting' | 'open' | 'offline';

const COMMAND_TIMEOUT_MS = 30_000;
const MIN_RETRY_MS = 500;
const MAX_RETRY_MS = 10_000;

interface Pending {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface SocketHandlers {
  message(message: ServerMessage): void;
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
      if (!message) return;
      if (message.type === 'result')
        this.settle(message.requestId, message.ok ? null : (message.error ?? 'Failed'));
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
    const requestId = crypto.randomUUID();
    return new Promise<void>((resolve, reject) => {
      if (!this.send({ type: 'command', requestId, command })) {
        reject(new Error('Not connected'));
        return;
      }
      const timer = setTimeout(
        () => this.settle(requestId, 'VS Code did not respond'),
        COMMAND_TIMEOUT_MS
      );
      this.pending.set(requestId, { resolve, reject, timer });
    });
  }

  close(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.socket?.close();
    this.socket = null;
    this.failPending('Disconnected');
  }

  private settle(requestId: string, error: string | null): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    clearTimeout(pending.timer);
    if (error === null) pending.resolve();
    else pending.reject(new Error(error));
  }

  private failPending(reason: string): void {
    for (const requestId of [...this.pending.keys()]) this.settle(requestId, reason);
  }
}

export function socketUrl(location: Location): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}
