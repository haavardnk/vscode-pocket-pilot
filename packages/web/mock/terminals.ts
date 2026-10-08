import type {
  Command,
  ServerMessage,
  SessionDetail,
  TerminalDetail,
  TerminalExecution,
  TerminalLine,
  TerminalSummary
} from '@pocket-pilot/protocol';

import { GREEN, line, type MockWindow, ownedTerminal } from './fixtures.ts';
import type { MockClient } from './hub.ts';

const INTERRUPTED = 130;

type TerminalCommand = Extract<
  Command,
  { kind: 'terminalInput' | 'killTerminal' | 'killTerminals' | 'createTerminal' }
>;

type ToolPart = Extract<SessionDetail['requests'][number]['parts'][number], { kind: 'tool' }>;

export interface TerminalHost {
  clients: () => Iterable<MockClient>;
  broadcast: (message: ServerMessage) => void;
  id: (prefix: string) => string;
  later: (action: () => void) => void;
}

export function isTerminalCommand(command: Command): command is TerminalCommand {
  return (
    command.kind === 'terminalInput' ||
    command.kind === 'killTerminal' ||
    command.kind === 'killTerminals' ||
    command.kind === 'createTerminal'
  );
}

export class MockTerminals {
  private readonly host: TerminalHost;

  constructor(host: TerminalHost) {
    this.host = host;
  }

  run(window: MockWindow, command: TerminalCommand): void {
    if (command.kind === 'createTerminal') {
      if (window.terminals.has(command.terminalId)) throw new Error('Terminal already exists');
      const folder =
        command.folderId === null
          ? undefined
          : window.state.folders.find((candidate) => candidate.id === command.folderId);
      if (command.folderId !== null && !folder) throw new Error('Folder is no longer open');
      const { summary, detail } = ownedTerminal(
        command.terminalId,
        folder ? `~/Git/${folder.name}` : '~',
        !folder
      );
      window.state.terminals.push(summary);
      window.terminals.set(detail.id, detail);
      this.host.broadcast({ type: 'window', window: window.state });
      return;
    }
    if (command.kind === 'killTerminals') {
      const ids = window.state.terminals.map((terminal) => terminal.id);
      window.state.terminals = [];
      this.host.broadcast({ type: 'window', window: window.state });
      for (const id of ids) this.close(window, id);
      return;
    }
    const summary = window.state.terminals.find((terminal) => terminal.id === command.terminalId);
    const detail = window.terminals.get(command.terminalId);
    if (!summary || !detail) throw new Error('Terminal is no longer open');
    if (command.kind === 'killTerminal') {
      window.state.terminals = window.state.terminals.filter((terminal) => terminal !== summary);
      this.host.broadcast({ type: 'window', window: window.state });
      this.close(window, detail.id);
      return;
    }
    if (detail.stream) {
      this.typeInStream(window, detail, command.text, command.execute);
      return;
    }
    const running = detail.executions.find((execution) => execution.endedAt === null);
    if (!command.execute) {
      if (command.text === '\x03' && running)
        this.endExecution(window, summary, running, INTERRUPTED, [line('^C')]);
      return;
    }
    if (running) return;
    const execution = this.startExecution(window, summary, command.text, null);
    if (command.text === 'npm run dev') {
      this.appendOutput(window, summary.id, execution, [line('VITE ready in 312 ms', GREEN)]);
      return;
    }
    this.host.later(() =>
      this.endExecution(window, summary, execution, 0, [line(`Ran ${command.text}`)])
    );
  }

  runTool(window: MockWindow, sessionId: string, tool: ToolPart): void {
    const summary = window.state.terminals.find(
      (terminal) => terminal.agent && terminal.sessionId === sessionId
    );
    if (tool.toolId !== 'run_in_terminal' || !tool.detail || !summary) return;
    const execution = this.startExecution(window, summary, tool.detail, tool.callId);
    this.endExecution(window, summary, execution, 0, [line('✓ 292 tests passed', GREEN)]);
    tool.terminal = { terminalId: summary.id, executionId: execution.id };
  }

  private close(window: MockWindow, terminalId: string): void {
    window.terminals.delete(terminalId);
    for (const client of this.watchers(window, terminalId)) {
      client.send({ type: 'terminal', windowId: window.state.windowId, terminalId, detail: null });
    }
  }

  private typeInStream(
    window: MockWindow,
    detail: TerminalDetail,
    text: string,
    execute: boolean
  ): void {
    const stream = detail.stream;
    const prompt = stream?.tail[0]?.[0]?.text;
    if (!stream || !prompt) return;
    const append =
      text === '\x03'
        ? [line(`${prompt} ^C`)]
        : execute
          ? [
              line(`${prompt} ${text}`),
              line(text.startsWith('echo ') ? text.slice(5) : `Ran ${text}`)
            ]
          : [];
    stream.lines.push(...append);
    const patch = {
      dropped: detail.dropped,
      executions: [],
      stream: { dropped: stream.dropped, append, tail: stream.tail, alternate: stream.alternate }
    };
    for (const client of this.watchers(window, detail.id)) {
      client.send({
        type: 'terminalPatch',
        windowId: window.state.windowId,
        terminalId: detail.id,
        patch
      });
    }
  }

  private startExecution(
    window: MockWindow,
    summary: TerminalSummary,
    command: string,
    callId: string | null
  ): TerminalExecution {
    const execution: TerminalExecution = {
      id: this.host.id('execution'),
      command,
      cwd: summary.cwd,
      startedAt: Date.now(),
      endedAt: null,
      exitCode: null,
      sessionId: summary.sessionId,
      callId,
      alternate: false,
      dropped: 0,
      tail: [],
      lines: []
    };
    window.terminals.get(summary.id)?.executions.push(execution);
    summary.command = command;
    this.host.broadcast({ type: 'window', window: window.state });
    this.appendOutput(window, summary.id, execution, []);
    return execution;
  }

  private endExecution(
    window: MockWindow,
    summary: TerminalSummary,
    execution: TerminalExecution,
    exitCode: number,
    output: TerminalLine[]
  ): void {
    if (!window.terminals.has(summary.id) || execution.endedAt !== null) return;
    execution.endedAt = Date.now();
    execution.exitCode = exitCode;
    summary.command = null;
    summary.lastExitCode = exitCode;
    this.host.broadcast({ type: 'window', window: window.state });
    this.appendOutput(window, summary.id, execution, output);
  }

  private appendOutput(
    window: MockWindow,
    terminalId: string,
    execution: TerminalExecution,
    append: TerminalLine[]
  ): void {
    const detail = window.terminals.get(terminalId);
    if (!detail) return;
    const { lines, ...fields } = execution;
    lines.push(...append);
    const patch = { dropped: detail.dropped, executions: [{ ...fields, append }], stream: null };
    for (const client of this.watchers(window, terminalId)) {
      client.send({ type: 'terminalPatch', windowId: window.state.windowId, terminalId, patch });
    }
  }

  private watchers(window: MockWindow, terminalId: string): MockClient[] {
    return [...this.host.clients()].filter(
      (client) =>
        client.terminal?.windowId === window.state.windowId &&
        client.terminal.terminalId === terminalId
    );
  }
}
