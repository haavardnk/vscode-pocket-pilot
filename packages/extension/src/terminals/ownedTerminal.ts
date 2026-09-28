import * as vscode from 'vscode';

import { errorMessage } from '../errors';
import type { SpawnPty } from './nodePty';
import { PtySession } from './ptySession';
import type { ShellLaunch } from './shellLaunch';

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

export interface OwnedOutput {
  data(data: string): void;
  resize(cols: number, rows: number): void;
  failed(message: string): void;
}

export class OwnedTerminal implements vscode.Pseudoterminal {
  private readonly written = new vscode.EventEmitter<string>();
  private readonly closed = new vscode.EventEmitter<number | void>();
  private readonly session: PtySession;

  readonly onDidWrite = this.written.event;
  readonly onDidClose = this.closed.event;

  constructor(
    spawn: SpawnPty,
    launch: ShellLaunch,
    cwd: string | undefined,
    private readonly output: OwnedOutput
  ) {
    this.session = new PtySession(spawn, launch, cwd, {
      data: (data) => {
        this.written.fire(data);
        output.data(data);
      },
      exit: (exitCode) => this.closed.fire(exitCode)
    });
  }

  open(dimensions: vscode.TerminalDimensions | undefined): void {
    const cols = dimensions?.columns ?? DEFAULT_COLS;
    const rows = dimensions?.rows ?? DEFAULT_ROWS;
    this.output.resize(cols, rows);
    try {
      this.session.start(cols, rows);
    } catch (error) {
      const message = `The shell could not start: ${errorMessage(error)}`;
      this.written.fire(`${message}\r\n`);
      this.output.data(`${message}\r\n`);
      this.output.failed(message);
    }
  }

  handleInput(data: string): void {
    this.session.input(data);
  }

  setDimensions(dimensions: vscode.TerminalDimensions): void {
    this.session.resize(dimensions.columns, dimensions.rows);
    this.output.resize(dimensions.columns, dimensions.rows);
  }

  close(): void {
    this.session.kill();
    this.written.dispose();
    this.closed.dispose();
  }
}
