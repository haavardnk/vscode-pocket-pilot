import * as vscode from 'vscode';

import { parseJson } from '../json';
import { type NamedTunnel, namedTunnelSchema } from '../tunnel/named';

const SECRET_KEY = 'pocketPilot.tunnel';
const CONTEXT_KEY = 'pocketPilot.hasTunnel';

export class TunnelSecret implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  private readonly subscription: vscode.Disposable;

  readonly onDidChange = this.changed.event;

  constructor(private readonly secrets: vscode.SecretStorage) {
    this.subscription = secrets.onDidChange((event) => {
      if (event.key !== SECRET_KEY) return;
      void this.updateContext();
      this.changed.fire();
    });
    void this.updateContext();
  }

  async get(): Promise<NamedTunnel | null> {
    const stored = await this.secrets.get(SECRET_KEY);
    if (stored === undefined) return null;
    const result = namedTunnelSchema.safeParse(parseJson(stored));
    return result.success ? result.data : null;
  }

  async store(tunnel: NamedTunnel): Promise<void> {
    await this.secrets.store(SECRET_KEY, JSON.stringify(tunnel));
  }

  async clear(): Promise<void> {
    await this.secrets.delete(SECRET_KEY);
  }

  dispose(): void {
    this.subscription.dispose();
    this.changed.dispose();
  }

  private async updateContext(): Promise<void> {
    await vscode.commands.executeCommand('setContext', CONTEXT_KEY, (await this.get()) !== null);
  }
}
