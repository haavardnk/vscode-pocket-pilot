import type {
  ExecutionPatch,
  TerminalDetail,
  TerminalExecution,
  TerminalPatch
} from '@pocket-pilot/protocol';

import { ExecutionScreen } from './screen';

const MAX_EXECUTIONS = 50;
const MAX_LINES = 5000;

export interface ExecutionStart {
  id: string;
  command: string;
  cwd: string | null;
  startedAt: number;
}

interface ExecutionRecord extends ExecutionStart {
  endedAt: number | null;
  exitCode: number | null;
  sessionId: string | null;
  callId: string | null;
  screen: ExecutionScreen;
}

interface Sent {
  total: number;
  fields: string;
}

type ExecutionFields = Omit<TerminalExecution, 'lines'>;

function fields(record: ExecutionRecord): ExecutionFields {
  const { screen, ...start } = record;
  return {
    ...start,
    alternate: screen.alternate,
    dropped: screen.dropped,
    tail: screen.tail
  };
}

export class TerminalLog {
  private readonly records: ExecutionRecord[] = [];
  private dropped = 0;
  private sent: Map<string, Sent> | null = null;
  private sentDropped = 0;

  constructor(private readonly changed: () => void) {}

  get running(): ExecutionRecord | undefined {
    return this.records.findLast((record) => record.endedAt === null);
  }

  get lastExitCode(): number | null {
    return this.records.findLast((record) => record.endedAt !== null)?.exitCode ?? null;
  }

  get streaming(): boolean {
    return this.sent !== null;
  }

  find(id: string): ExecutionRecord | undefined {
    return this.records.find((record) => record.id === id);
  }

  start(start: ExecutionStart): void {
    this.records.push({
      ...start,
      endedAt: null,
      exitCode: null,
      sessionId: null,
      callId: null,
      screen: new ExecutionScreen(MAX_LINES)
    });
    this.enforceBudget();
    this.changed();
  }

  async write(id: string, data: string): Promise<void> {
    const record = this.find(id);
    if (!record) return;
    await record.screen.write(data);
    this.enforceBudget();
    this.changed();
  }

  end(id: string, exitCode: number | null, endedAt: number, command: string): void {
    const record = this.find(id);
    if (!record || record.endedAt !== null) return;
    record.endedAt = endedAt;
    record.exitCode = exitCode;
    if (command) record.command = command;
    this.changed();
  }

  async finish(id: string): Promise<void> {
    const record = this.find(id);
    if (!record) return;
    await record.screen.finish();
    this.changed();
  }

  link(id: string, sessionId: string, callId: string): void {
    const record = this.find(id);
    if (!record) return;
    record.sessionId = sessionId;
    record.callId = callId;
    this.changed();
  }

  detail(terminalId: string): TerminalDetail {
    this.sent = new Map(
      this.records.map((record) => [
        record.id,
        { total: record.screen.total, fields: JSON.stringify(fields(record)) }
      ])
    );
    this.sentDropped = this.dropped;
    return {
      id: terminalId,
      dropped: this.dropped,
      executions: this.records.map((record) => ({
        ...fields(record),
        lines: record.screen.lines.slice()
      }))
    };
  }

  patch(): TerminalPatch | null {
    const sent = this.sent;
    if (!sent) return null;
    const executions: ExecutionPatch[] = [];
    for (const record of this.records) {
      const previous = sent.get(record.id);
      const { screen } = record;
      const from = Math.max(previous?.total ?? 0, screen.dropped);
      const append = screen.lines.slice(from - screen.dropped);
      const current = fields(record);
      const key = JSON.stringify(current);
      if (previous && append.length === 0 && previous.fields === key) continue;
      sent.set(record.id, { total: screen.total, fields: key });
      executions.push({ ...current, append });
    }
    for (const id of sent.keys()) {
      if (!this.find(id)) sent.delete(id);
    }
    if (executions.length === 0 && this.sentDropped === this.dropped) return null;
    this.sentDropped = this.dropped;
    return { dropped: this.dropped, executions };
  }

  stopStreaming(): void {
    this.sent = null;
  }

  dispose(): void {
    for (const record of this.records) record.screen.dispose();
  }

  private enforceBudget(): void {
    let lines = this.records.reduce((sum, record) => sum + record.screen.lines.length, 0);
    while (
      this.records.length > 1 &&
      (this.records.length > MAX_EXECUTIONS || lines > MAX_LINES) &&
      this.records[0]?.endedAt !== null
    ) {
      const removed = this.records.shift();
      if (!removed) break;
      removed.screen.dispose();
      lines -= removed.screen.lines.length;
      this.dropped += 1;
    }
  }
}
