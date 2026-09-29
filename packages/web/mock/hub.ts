import {
  type Command,
  type CopilotUsage,
  diffDetail,
  type Query,
  type QueryResult,
  queuePlan,
  type ServerMessage,
  type SessionDetail,
  type TerminalDetail,
  type TerminalExecution,
  type TerminalLine,
  type TerminalSummary,
  type WindowState,
  type WorkspaceFolder
} from '@pocket-pilot/protocol';

import { MockBranches } from './branches.ts';
import { dropDisabled, redoCheckpoint, restoreCheckpoint } from './checkpoints.ts';
import { MockCode } from './code.ts';
import {
  copilotUsage,
  GREEN,
  initialWindows,
  line,
  type MockWindow,
  OPEN_TARGETS,
  openedWindow,
  ownedTerminal,
  refreshSummary
} from './fixtures.ts';

const REPLY_DELAY_MS = 800;
const INTERRUPTED = 130;

type TerminalCommand = Extract<
  Command,
  { kind: 'terminalInput' | 'killTerminal' | 'killTerminals' | 'createTerminal' }
>;

export interface TerminalWatch {
  windowId: string;
  terminalId: string;
}

export interface MockClient {
  send(message: ServerMessage): void;
  subscription: { windowId: string; sessionId: string; limit: number } | null;
  terminal: TerminalWatch | null;
}

function folderOf(window: MockWindow, folderId: string): WorkspaceFolder {
  const folder = window.state.folders.find((candidate) => candidate.id === folderId);
  if (!folder) throw new Error('Workspace folder is no longer open');
  return folder;
}

export class MockHub {
  private windows: MockWindow[] = [];
  private usage: CopilotUsage | null = null;
  private readonly clients = new Set<MockClient>();
  private readonly sent = new Map<MockClient, SessionDetail>();
  private readonly code = new MockCode();
  private readonly branches = new MockBranches();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private nextId = 1;

  constructor() {
    this.reset();
  }

  private id(prefix: string): string {
    return `${prefix}-mock-${this.nextId++}`;
  }

  reset(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.nextId = 1;
    const now = Date.now();
    this.windows = initialWindows(now);
    this.usage = copilotUsage(now);
    this.code.reset();
    this.branches.reset();
    this.sent.clear();
    for (const client of this.clients) {
      client.subscription = null;
      client.terminal = null;
      client.send(this.snapshot());
    }
  }

  connect(client: MockClient): void {
    this.clients.add(client);
    client.send(this.snapshot());
  }

  setUsage(usage: CopilotUsage): void {
    this.usage = usage;
    this.broadcast({ type: 'usage', usage });
  }

  disconnect(client: MockClient): void {
    this.clients.delete(client);
    this.sent.delete(client);
  }

  subscribe(client: MockClient, subscription: MockClient['subscription']): void {
    client.subscription = subscription;
    this.sent.delete(client);
    if (subscription) this.sendDetail(client);
  }

  watchTerminal(client: MockClient, target: TerminalWatch | null): void {
    client.terminal = target && { windowId: target.windowId, terminalId: target.terminalId };
    if (!client.terminal) return;
    const { windowId, terminalId } = client.terminal;
    const detail =
      this.windows
        .find((window) => window.state.windowId === windowId)
        ?.terminals.get(terminalId) ?? null;
    client.send({ type: 'terminal', windowId, terminalId, detail });
  }

  query(query: Query): QueryResult {
    const window = this.windows.find((candidate) => candidate.state.windowId === query.windowId);
    if (!window) throw new Error('Window is no longer open');
    if (query.kind === 'openTargets') return { kind: 'openTargets', ...OPEN_TARGETS };
    if (query.kind === 'branches') {
      return this.branches.list(query.windowId, folderOf(window, query.folderId));
    }
    return this.code.query(query);
  }

  run(command: Command): void {
    const window = this.windows.find((candidate) => candidate.state.windowId === command.windowId);
    if (!window) throw new Error('Window is no longer open');
    if (command.kind === 'closeWindow') {
      if (this.windows.length < 2) throw new Error('Pocket Pilot needs one open VS Code window');
      this.later(() => {
        this.windows = this.windows.filter((candidate) => candidate !== window);
        this.broadcast({ type: 'windowRemoved', windowId: command.windowId });
      });
      return;
    }
    if (command.kind === 'openWindow') {
      this.open(command.target);
      return;
    }
    if (
      command.kind === 'checkoutBranch' ||
      command.kind === 'createBranch' ||
      command.kind === 'fetchBranches'
    ) {
      this.branches.run(command, folderOf(window, command.folderId));
      this.broadcast({ type: 'window', window: window.state });
      return;
    }
    if (command.kind === 'setModelConfig') {
      this.configure(command);
      return;
    }
    if (
      command.kind === 'terminalInput' ||
      command.kind === 'killTerminal' ||
      command.kind === 'killTerminals' ||
      command.kind === 'createTerminal'
    ) {
      this.runTerminal(window, command);
      return;
    }
    if (command.kind === 'newSession') {
      const id = this.id('session');
      window.details.set(id, {
        id,
        title: command.text.slice(0, 40),
        status: 'idle',
        modelId: command.modelId,
        modeId: command.modeId ?? 'agent',
        permission: 'default',
        editedFiles: 0,
        todos: null,
        totalRequests: 0,
        requests: [],
        queued: []
      });
      this.later(() => this.ask(window, id, command.text));
      return;
    }
    const detail = window.details.get(command.sessionId);
    if (!detail) throw new Error('Chat not found');
    if (command.kind === 'editDecision') {
      this.code.decide(detail.id, command.path, command.decision);
      return;
    }
    if (command.kind === 'setPinned' || command.kind === 'setArchived') {
      const summary = window.state.sessions.find((session) => session.id === detail.id);
      if (!summary) throw new Error('Chat not found');
      if (command.kind === 'setPinned') summary.pinned = command.pinned;
      else summary.archived = command.archived;
      this.broadcast({ type: 'window', window: window.state });
      return;
    }
    if (command.kind === 'send') {
      if (detail.status === 'idle' || detail.status === 'failed') {
        dropDisabled(detail);
        this.changed(window, detail.id);
        this.later(() => this.ask(window, detail.id, command.text));
      } else {
        detail.queued.push({
          id: this.id('queued'),
          delivery: command.delivery ?? 'queued',
          text: command.text,
          attachments: 0
        });
        this.changed(window, detail.id);
      }
      return;
    }
    if (command.kind === 'setQueue') {
      const plan = queuePlan(detail.queued, command.expected, command.queue);
      detail.queued =
        plan.kind === 'remove'
          ? detail.queued.filter((item) => !plan.ids.includes(item.id))
          : command.queue.map((item) => ({ ...item, id: this.id('queued'), attachments: 0 }));
      this.changed(window, detail.id);
      return;
    }
    if (command.kind === 'stop') {
      const last = detail.requests.at(-1);
      if (last?.state === 'pending') last.state = 'cancelled';
      last?.parts.forEach((part) => {
        if (part.kind !== 'tool') return;
        part.awaitingConfirmation = false;
        part.grouped = true;
        if (part.status === 'running') part.status = 'failed';
      });
      detail.status = 'idle';
      detail.queued = [];
      this.changed(window, detail.id);
      return;
    }
    if (command.kind === 'toolDecision') {
      const last = detail.requests.at(-1);
      const tool = last?.parts.find((part) => part.kind === 'tool' && part.awaitingConfirmation);
      if (!last || tool?.kind !== 'tool') throw new Error('No tool is waiting');
      tool.awaitingConfirmation = false;
      tool.grouped = true;
      tool.status = command.decision === 'accept' ? 'done' : 'failed';
      if (command.decision === 'accept') this.runTool(window, detail.id, tool);
      last.parts.push({
        kind: 'markdown',
        text: command.decision === 'accept' ? 'Tests passed.' : 'Skipped the tool.'
      });
      this.changed(window, detail.id);
      this.later(() => this.finish(window, detail.id, 'All done.'));
      return;
    }
    if (command.kind === 'answerQuestions') {
      const last = detail.requests.at(-1);
      const part = last?.parts.find(
        (candidate) => candidate.kind === 'questions' && candidate.resolveId === command.resolveId
      );
      if (!last || part?.kind !== 'questions' || part.state !== 'pending') {
        throw new Error('The questions are no longer waiting');
      }
      part.state = 'done';
      part.answers = command.answers;
      last.state = 'pending';
      detail.status = 'running';
      this.changed(window, detail.id);
      this.later(() =>
        this.finish(
          window,
          detail.id,
          command.answers ? 'Thanks, planning now.' : 'Going with defaults.'
        )
      );
      return;
    }
    if (command.kind === 'confirm') {
      const part = detail.requests
        .at(-1)
        ?.parts.find(
          (candidate) => candidate.kind === 'confirmation' && candidate.state === 'pending'
        );
      if (part?.kind !== 'confirmation' || !part.buttons.includes(command.button)) {
        throw new Error('Nothing is waiting for confirmation');
      }
      part.state = 'done';
      this.ask(window, detail.id, `${command.button}: "${part.title}"`);
      return;
    }
    if (command.kind === 'acceptElicitation') {
      const part = detail.requests
        .at(-1)
        ?.parts.find(
          (candidate) => candidate.kind === 'elicitation' && candidate.state === 'pending'
        );
      if (part?.kind !== 'elicitation') throw new Error('Nothing is waiting for approval');
      part.state = 'accepted';
      this.changed(window, detail.id);
      return;
    }
    if (command.kind === 'handoff') {
      const agents = window.state.agents;
      const handoff = agents
        .find((agent) => agent.id === command.agentId)
        ?.handoffs.find((item) => item.id === command.handoffId);
      if (!handoff) throw new Error('This handoff is no longer offered');
      const target =
        agents.find((agent) => agent.id === handoff.agent) ??
        agents.find((agent) => agent.name === handoff.agent);
      if (target) detail.modeId = target.id;
      if (command.autopilot) detail.permission = 'autopilot';
      this.changed(window, detail.id);
      if (handoff.send) this.later(() => this.ask(window, detail.id, handoff.prompt));
      return;
    }
    if (command.kind === 'restoreCheckpoint') {
      restoreCheckpoint(detail, command.requestId);
      this.changed(window, detail.id);
      return;
    }
    if (command.kind === 'redoCheckpoint') {
      redoCheckpoint(detail);
      this.changed(window, detail.id);
      return;
    }
    if (command.kind === 'setPermission') {
      dropDisabled(detail);
      detail.permission = command.level;
    }
    if (command.kind === 'setMode') detail.modeId = command.modeId;
    if (command.kind === 'setModel') detail.modelId = command.modelId;
    this.changed(window, detail.id);
  }

  private ask(window: MockWindow, sessionId: string, text: string): void {
    const detail = window.details.get(sessionId);
    if (!detail) return;
    detail.requests.push({
      id: this.id('request'),
      timestamp: Date.now(),
      message: text,
      modelId: detail.modelId,
      agentName:
        window.state.agents.find((agent) => agent.id === detail.modeId && agent.id !== 'agent')
          ?.name ?? null,
      state: 'pending',
      error: null,
      editable: true,
      disabled: false,
      editedPaths: [],
      parts: [
        {
          kind: 'tool',
          callId: this.id('call'),
          toolId: 'read_file',
          message: 'Read `README.md`',
          detail: null,
          title: null,
          grouped: true,
          awaitingConfirmation: false,
          status: 'running',
          terminal: null,
          subagent: null,
          parentCallId: null
        }
      ]
    });
    detail.totalRequests += 1;
    detail.status = 'running';
    this.changed(window, sessionId);
    this.later(() => this.finish(window, sessionId, `Done: ${text}`));
  }

  private finish(window: MockWindow, sessionId: string, reply: string): void {
    const detail = window.details.get(sessionId);
    const last = detail?.requests.at(-1);
    if (!detail || last?.state !== 'pending') return;
    last.parts.forEach((part) => {
      if (part.kind === 'tool' && part.status === 'running') part.status = 'done';
    });
    last.parts.push({ kind: 'markdown', text: reply });
    last.state = 'complete';
    detail.status = 'idle';
    this.changed(window, sessionId);
    const next = detail.queued.shift();
    if (next) this.ask(window, sessionId, next.text);
  }

  private runTerminal(window: MockWindow, command: TerminalCommand): void {
    if (command.kind === 'createTerminal') {
      if (window.terminals.has(command.terminalId)) throw new Error('Terminal already exists');
      const folders = window.state.folders;
      const folder =
        command.folderId === null
          ? folders[0]
          : folders.find((candidate) => candidate.id === command.folderId);
      if (command.folderId !== null && !folder) throw new Error('Folder is no longer open');
      const { summary, detail } = ownedTerminal(
        command.terminalId,
        folder ? `~/Git/${folder.name}` : null
      );
      window.state.terminals.push(summary);
      window.terminals.set(detail.id, detail);
      this.broadcast({ type: 'window', window: window.state });
      return;
    }
    if (command.kind === 'killTerminals') {
      const ids = window.state.terminals.map((terminal) => terminal.id);
      window.state.terminals = [];
      this.broadcast({ type: 'window', window: window.state });
      for (const id of ids) this.closeTerminal(window, id);
      return;
    }
    const summary = window.state.terminals.find((terminal) => terminal.id === command.terminalId);
    const detail = window.terminals.get(command.terminalId);
    if (!summary || !detail) throw new Error('Terminal is no longer open');
    if (command.kind === 'killTerminal') {
      window.state.terminals = window.state.terminals.filter((terminal) => terminal !== summary);
      this.broadcast({ type: 'window', window: window.state });
      this.closeTerminal(window, detail.id);
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
    this.later(() =>
      this.endExecution(window, summary, execution, 0, [line(`Ran ${command.text}`)])
    );
  }

  private closeTerminal(window: MockWindow, terminalId: string): void {
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

  private runTool(
    window: MockWindow,
    sessionId: string,
    tool: Extract<SessionDetail['requests'][number]['parts'][number], { kind: 'tool' }>
  ): void {
    const summary = window.state.terminals.find(
      (terminal) => terminal.agent && terminal.sessionId === sessionId
    );
    if (tool.toolId !== 'run_in_terminal' || !tool.detail || !summary) return;
    const execution = this.startExecution(window, summary, tool.detail, tool.callId);
    this.endExecution(window, summary, execution, 0, [line('✓ 292 tests passed', GREEN)]);
    tool.terminal = { terminalId: summary.id, executionId: execution.id };
  }

  private startExecution(
    window: MockWindow,
    summary: TerminalSummary,
    command: string,
    callId: string | null
  ): TerminalExecution {
    const execution: TerminalExecution = {
      id: this.id('execution'),
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
    this.broadcast({ type: 'window', window: window.state });
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
    this.broadcast({ type: 'window', window: window.state });
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
    return [...this.clients].filter(
      (client) =>
        client.terminal?.windowId === window.state.windowId &&
        client.terminal.terminalId === terminalId
    );
  }

  private open(targetId: string): void {
    const opened = [...OPEN_TARGETS.recent, ...OPEN_TARGETS.projects].find(
      (candidate) => candidate.id === targetId
    );
    if (!opened) throw new Error('This folder is no longer in the list');
    if (this.windows.some((window) => window.state.workspace === targetId)) return;
    const window = openedWindow(this.id('window'), opened);
    this.later(() => {
      this.windows.push(window);
      this.broadcast({ type: 'window', window: window.state });
    });
  }

  private configure(command: Extract<Command, { kind: 'setModelConfig' }>): void {
    for (const window of this.windows) {
      const option = window.state.models
        .find((model) => model.id === command.modelId)
        ?.options.find((candidate) => candidate.key === command.key);
      if (option) option.value = command.value;
      this.broadcast({ type: 'window', window: window.state });
    }
  }

  private later(action: () => void): void {
    this.timers.push(setTimeout(action, REPLY_DELAY_MS));
  }

  private changed(window: MockWindow, sessionId: string): void {
    refreshSummary(window, sessionId, Date.now());
    this.broadcast({ type: 'window', window: window.state });
    for (const client of this.clients) {
      const subscription = client.subscription;
      if (
        subscription?.windowId === window.state.windowId &&
        subscription.sessionId === sessionId
      ) {
        this.sendDetail(client);
      }
    }
  }

  private sendDetail(client: MockClient): void {
    const subscription = client.subscription;
    if (!subscription) return;
    const window = this.windows.find(
      (candidate) => candidate.state.windowId === subscription.windowId
    );
    const detail = window?.details.get(subscription.sessionId) ?? null;
    const { windowId, sessionId } = subscription;
    const previous = this.sent.get(client);
    if (!detail) {
      this.sent.delete(client);
      client.send({ type: 'session', windowId, sessionId, detail: null });
      return;
    }
    const next = structuredClone(trim(detail, subscription.limit));
    this.sent.set(client, next);
    if (!previous) {
      client.send({ type: 'session', windowId, sessionId, detail: next });
      return;
    }
    const patch = diffDetail(previous, next);
    if (patch) client.send({ type: 'sessionPatch', windowId, sessionId, patch });
  }

  private broadcast(message: ServerMessage): void {
    for (const client of this.clients) client.send(message);
  }

  private snapshot(): ServerMessage {
    const windows: WindowState[] = this.windows.map((window) => window.state);
    return {
      type: 'snapshot',
      version: '0.0.0-mock',
      windows,
      incompatibleWindows: [],
      usage: this.usage
    };
  }
}

function trim(detail: SessionDetail, limit: number): SessionDetail {
  return { ...detail, requests: detail.requests.slice(-limit) };
}
