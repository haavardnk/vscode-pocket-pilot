import * as vscode from 'vscode';

import type { PasswordCheck } from '../server/app';
import { hashPassword, verifyPassword } from '../server/password';

const SECRET_KEY = 'pocketPilot.password';
const CONTEXT_KEY = 'pocketPilot.hasPassword';
const MIN_LENGTH = 8;

export class PasswordSecret implements PasswordCheck, vscode.Disposable {
  private readonly subscription: vscode.Disposable;

  constructor(private readonly secrets: vscode.SecretStorage) {
    this.subscription = secrets.onDidChange((event) => {
      if (event.key === SECRET_KEY) void this.updateContext();
    });
    void this.updateContext();
  }

  async enabled(): Promise<boolean> {
    return (await this.secrets.get(SECRET_KEY)) !== undefined;
  }

  async verify(password: string): Promise<boolean> {
    const stored = await this.secrets.get(SECRET_KEY);
    return stored !== undefined && verifyPassword(stored, password);
  }

  async prompt(): Promise<boolean> {
    const password = await vscode.window.showInputBox({
      title: 'Pocket Pilot Password',
      prompt: 'Phones can sign in with this password instead of a pairing code.',
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) =>
        value.length < MIN_LENGTH ? `Use at least ${MIN_LENGTH} characters` : null
    });
    if (password === undefined) return false;
    const confirmation = await vscode.window.showInputBox({
      title: 'Pocket Pilot Password',
      prompt: 'Enter the password again.',
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => (value === password ? null : 'The passwords do not match')
    });
    if (confirmation === undefined) return false;
    await this.secrets.store(SECRET_KEY, await hashPassword(password));
    return true;
  }

  async clear(): Promise<void> {
    await this.secrets.delete(SECRET_KEY);
  }

  dispose(): void {
    this.subscription.dispose();
  }

  private async updateContext(): Promise<void> {
    await vscode.commands.executeCommand('setContext', CONTEXT_KEY, await this.enabled());
  }
}
