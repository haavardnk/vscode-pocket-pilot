import type { Pty, SpawnPty } from './nodePty';
import type { ShellLaunch } from './shellLaunch';

export interface PtyEvents {
  data(data: string): void;
  exit(exitCode: number): void;
}

export class PtySession {
  private pty: Pty | undefined;
  private listeners: { dispose(): void }[] = [];
  private exited = false;

  constructor(
    private readonly spawn: SpawnPty,
    private readonly launch: ShellLaunch,
    private readonly cwd: string | undefined,
    private readonly events: PtyEvents
  ) {}

  start(cols: number, rows: number): void {
    if (this.pty || this.exited) return;
    const pty = this.spawn(this.launch.file, this.launch.args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: this.cwd,
      env: this.launch.env
    });
    this.pty = pty;
    this.listeners = [
      pty.onData((data) => this.events.data(data)),
      pty.onExit(({ exitCode }) => this.exit(exitCode))
    ];
  }

  input(data: string): void {
    if (!this.exited) this.pty?.write(data);
  }

  resize(cols: number, rows: number): void {
    if (!this.exited) this.pty?.resize(cols, rows);
  }

  kill(): void {
    if (this.exited) return;
    this.exited = true;
    this.release();
    this.pty?.kill();
  }

  private exit(exitCode: number): void {
    if (this.exited) return;
    this.exited = true;
    this.release();
    this.events.exit(exitCode);
  }

  private release(): void {
    for (const listener of this.listeners) listener.dispose();
    this.listeners = [];
  }
}
