import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { sep } from 'node:path';

import type { Command, HookEvent, SessionDetail, TerminalSummary } from '@pocket-pilot/protocol';
import * as vscode from 'vscode';

import type { TerminalUpdate } from '../cluster/localWindow';
import type { CodeFolder } from '../code/folders';
import { errorMessage } from '../errors';
import { asRecord, asString, parseJson } from '../json';
import { type ChatLink, ChatLinks } from './chatLinks';
import { loadNodePty, type SpawnPty } from './nodePty';
import { OwnedTerminal } from './ownedTerminal';
import { type ShellLaunch, shellLaunch } from './shellLaunch';
import { TerminalLog } from './terminalLog';

const FLUSH_MS = 100;
const TERMINAL_TOOL = 'run_in_terminal';

export type TerminalCommand = Extract<
  Command,
  { kind: 'terminalInput' | 'killTerminal' | 'killTerminals' | 'createTerminal' }
>;

interface Owned {
  cwd: string | null;
  shell: string;
}

interface TerminalRecord {
  id: string;
  terminal: vscode.Terminal;
  log: TerminalLog;
  owned: Owned | null;
  home: boolean;
  sessionId: string | null;
  flushTimer: NodeJS.Timeout | undefined;
}

export function isTerminalCommand(command: Command): command is TerminalCommand {
  return (
    command.kind === 'terminalInput' ||
    command.kind === 'killTerminal' ||
    command.kind === 'killTerminals' ||
    command.kind === 'createTerminal'
  );
}

function displayPath(location: vscode.Uri | string | undefined): string | null {
  if (!location) return null;
  const path =
    typeof location === 'string'
      ? location
      : location.scheme === 'file'
        ? location.fsPath
        : location.toString();
  const home = homedir();
  return path === home || path.startsWith(`${home}${sep}`) ? `~${path.slice(home.length)}` : path;
}

function isAgent(terminal: vscode.Terminal): boolean {
  const options = terminal.creationOptions;
  return 'env' in options && options.env?.COPILOT_AGENT === '1';
}

function creationCwd(terminal: vscode.Terminal): vscode.Uri | string | undefined {
  const options = terminal.creationOptions;
  return 'cwd' in options ? options.cwd : undefined;
}

export class TerminalService implements vscode.Disposable {
  private readonly records = new Map<vscode.Terminal, TerminalRecord>();
  private readonly executions = new WeakMap<vscode.TerminalShellExecution, string>();
  private readonly links = new ChatLinks();
  private readonly changed = new vscode.EventEmitter<void>();
  private readonly updated = new vscode.EventEmitter<TerminalUpdate>();
  private readonly linked = new vscode.EventEmitter<string>();
  private readonly subscriptions: vscode.Disposable[];
  private watched = new Set<string>();
  private spawn: SpawnPty | null | undefined;

  readonly onDidChange = this.changed.event;
  readonly onDidUpdate = this.updated.event;
  readonly onDidLink = this.linked.event;

  constructor(
    private readonly folders: () => readonly CodeFolder[],
    private readonly report: (message: string) => void
  ) {
    this.subscriptions = [
      this.changed,
      this.updated,
      this.linked,
      vscode.window.onDidOpenTerminal((terminal) => {
        this.add(terminal);
      }),
      vscode.window.onDidCloseTerminal((terminal) => this.remove(terminal)),
      vscode.window.onDidChangeTerminalState(() => this.changed.fire()),
      vscode.window.onDidChangeTerminalShellIntegration(() => this.changed.fire()),
      vscode.window.onDidStartTerminalShellExecution((event) => this.started(event)),
      vscode.window.onDidEndTerminalShellExecution((event) => this.ended(event))
    ];
    for (const terminal of vscode.window.terminals) this.add(terminal);
  }

  summaries(): TerminalSummary[] {
    return [...this.records.values()].map(({ id, terminal, log, owned, home, sessionId }) => ({
      id,
      name: terminal.name,
      cwd: owned ? owned.cwd : displayPath(terminal.shellIntegration?.cwd ?? creationCwd(terminal)),
      shell: owned?.shell ?? terminal.state.shell ?? null,
      agent: isAgent(terminal),
      sessionId,
      command: log.running?.command ?? null,
      lastExitCode: log.lastExitCode,
      owned: owned !== null,
      home,
      exited: terminal.exitStatus !== undefined
    }));
  }

  watch(terminalIds: readonly string[]): void {
    const next = new Set(terminalIds);
    for (const record of this.records.values()) {
      if (next.has(record.id)) continue;
      record.log.stopStreaming();
      clearTimeout(record.flushTimer);
      record.flushTimer = undefined;
    }
    for (const terminalId of next) {
      if (this.watched.has(terminalId)) continue;
      const record = this.find(terminalId);
      this.updated.fire({ terminalId, detail: record ? record.log.detail(terminalId) : null });
    }
    this.watched = next;
  }

  run(command: TerminalCommand): void {
    if (command.kind === 'createTerminal') {
      this.create(command.terminalId, command.folderId);
      return;
    }
    if (command.kind === 'killTerminals') {
      for (const record of this.records.values()) record.terminal.dispose();
      return;
    }
    const record = this.find(command.terminalId);
    if (!record) throw new Error('Terminal is no longer open');
    if (command.kind === 'killTerminal') record.terminal.dispose();
    else record.terminal.sendText(command.text, command.execute);
  }

  hook(event: HookEvent): void {
    if (event.kind !== 'toolStart' || event.toolName !== TERMINAL_TOOL || !event.command) return;
    this.apply(
      this.links.expect(
        { sessionId: event.sessionId, callId: event.callId },
        event.command,
        event.at
      )
    );
  }

  decorate(detail: SessionDetail): SessionDetail {
    return {
      ...detail,
      requests: detail.requests.map((request) => ({
        ...request,
        parts: request.parts.map((part) => {
          if (part.kind !== 'tool' || part.toolId !== TERMINAL_TOOL) return part;
          const ref = this.links.ref(part.callId);
          if (ref) return { ...part, terminal: ref };
          if (!part.detail) return part;
          const link = this.links.claim(
            { sessionId: detail.id, callId: part.callId },
            asString(asRecord(parseJson(part.detail)).command) ?? part.detail,
            request.timestamp
          );
          if (!link) return part;
          this.link(link);
          return {
            ...part,
            terminal: { terminalId: link.terminalId, executionId: link.executionId }
          };
        })
      }))
    };
  }

  dispose(): void {
    for (const record of this.records.values()) {
      clearTimeout(record.flushTimer);
      record.log.dispose();
    }
    this.records.clear();
    for (const subscription of this.subscriptions) subscription.dispose();
  }

  private find(terminalId: string): TerminalRecord | undefined {
    return [...this.records.values()].find((record) => record.id === terminalId);
  }

  private create(terminalId: string, folderId: string | null): void {
    if (this.find(terminalId)) throw new Error('Terminal already exists');
    const folder =
      folderId === null ? undefined : this.folders().find((candidate) => candidate.id === folderId);
    if (folderId !== null && !folder) throw new Error('Folder is no longer open');
    const cwd = folder?.root ?? homedir();
    const home = folder === undefined;
    const spawn = this.ptySpawn();
    const launch = spawn && this.defaultShell();
    if (!spawn || !launch) {
      this.add(vscode.window.createTerminal({ cwd }), terminalId, null, home);
      return;
    }
    const pty = new OwnedTerminal(spawn, launch, cwd, {
      data: (data) => void this.find(terminalId)?.log.writeStream(data),
      resize: (cols, rows) => this.find(terminalId)?.log.resizeStream(cols, rows),
      failed: (message) => this.report(message)
    });
    this.add(
      vscode.window.createTerminal({ name: launch.name, pty }),
      terminalId,
      { cwd: displayPath(cwd), shell: launch.name },
      home
    );
  }

  private ptySpawn(): SpawnPty | null {
    if (vscode.env.remoteName !== undefined) return null;
    if (this.spawn !== undefined) return this.spawn;
    try {
      this.spawn = loadNodePty(vscode.env.appRoot);
    } catch (error) {
      this.spawn = null;
      this.report(`Phone terminals fall back to VS Code terminals: ${errorMessage(error)}`);
    }
    return this.spawn;
  }

  private defaultShell(): ShellLaunch | null {
    try {
      return shellLaunch();
    } catch (error) {
      this.report(`Phone terminals fall back to VS Code terminals: ${errorMessage(error)}`);
      return null;
    }
  }

  private add(
    terminal: vscode.Terminal,
    id: string = randomUUID(),
    owned: Owned | null = null,
    home = false
  ): TerminalRecord {
    const existing = this.records.get(terminal);
    if (existing) return existing;
    const record: TerminalRecord = {
      id,
      terminal,
      owned,
      home,
      sessionId: null,
      flushTimer: undefined,
      log: new TerminalLog(() => this.schedule(record), owned !== null)
    };
    this.records.set(terminal, record);
    this.changed.fire();
    if (this.watched.has(id)) this.updated.fire({ terminalId: id, detail: record.log.detail(id) });
    return record;
  }

  private remove(terminal: vscode.Terminal): void {
    const record = this.records.get(terminal);
    if (!record) return;
    this.records.delete(terminal);
    clearTimeout(record.flushTimer);
    record.log.dispose();
    this.links.forget(record.id);
    this.changed.fire();
    if (this.watched.has(record.id)) this.updated.fire({ terminalId: record.id, detail: null });
  }

  private started(event: vscode.TerminalShellExecutionStartEvent): void {
    const record = this.add(event.terminal);
    const { execution } = event;
    const output = execution.read();
    const id = randomUUID();
    const command = execution.commandLine.value;
    const at = Date.now();
    this.executions.set(execution, id);
    record.log.start({
      id,
      command,
      cwd: displayPath(execution.cwd ?? event.shellIntegration.cwd),
      startedAt: at
    });
    if (isAgent(event.terminal)) {
      this.apply(this.links.executed({ terminalId: record.id, executionId: id }, command, at));
    }
    void this.stream(record.log, id, output);
    this.changed.fire();
  }

  private ended(event: vscode.TerminalShellExecutionEndEvent): void {
    const record = this.records.get(event.terminal);
    const id = this.executions.get(event.execution);
    if (!record || !id) return;
    const before = record.log.find(id);
    const previous = before?.command;
    const command = event.execution.commandLine.value;
    record.log.end(id, event.exitCode ?? null, Date.now(), command);
    if (isAgent(event.terminal) && before?.callId === null && command && command !== previous) {
      this.apply(
        this.links.executed({ terminalId: record.id, executionId: id }, command, before.startedAt)
      );
    }
    this.changed.fire();
  }

  private async stream(log: TerminalLog, id: string, output: AsyncIterable<string>): Promise<void> {
    try {
      for await (const data of output) await log.write(id, data);
    } catch (error) {
      this.report(`Terminal output failed: ${errorMessage(error)}`);
    }
    await log.finish(id);
  }

  private apply(link: ChatLink | null): void {
    if (!link) return;
    this.link(link);
    this.linked.fire(link.sessionId);
  }

  private link(link: ChatLink): void {
    const record = this.find(link.terminalId);
    if (!record) return;
    record.log.link(link.executionId, link.sessionId, link.callId);
    record.sessionId = link.sessionId;
    this.changed.fire();
  }

  private schedule(record: TerminalRecord): void {
    if (!record.log.streaming || record.flushTimer) return;
    record.flushTimer = setTimeout(() => {
      record.flushTimer = undefined;
      const patch = record.log.patch();
      if (patch) this.updated.fire({ terminalId: record.id, patch });
    }, FLUSH_MS);
  }
}
