import type { GitStatus } from '@pocket-pilot/protocol';
import * as vscode from 'vscode';

import { type GitApi, type GitExtension, type GitRepository, gitStatusOf } from './gitState';

const GIT_EXTENSION = 'vscode.git';

export class GitStatusSource implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  private readonly subscriptions: vscode.Disposable[] = [this.changed];
  private readonly repositories = new Map<GitRepository, vscode.Disposable>();
  private apiSubscriptions: vscode.Disposable[] = [];
  private api: GitApi | null = null;

  readonly onDidChange = this.changed.event;

  constructor(private readonly report: (message: string) => void) {}

  async start(): Promise<void> {
    const extension = vscode.extensions.getExtension<GitExtension>(GIT_EXTENSION);
    if (!extension) return;
    const git = await Promise.resolve(extension.activate()).catch((error: unknown) => {
      this.report(`Cannot load the Git extension: ${String(error)}`);
      return null;
    });
    if (!git) return;
    this.subscriptions.push(
      git.onDidChangeEnablement((enabled) => (enabled ? this.attach(git) : this.detach()))
    );
    this.attach(git);
  }

  statusFor(root: string): GitStatus | null {
    const repository = this.api?.getRepository(vscode.Uri.file(root));
    return repository ? gitStatusOf(repository.state) : null;
  }

  dispose(): void {
    this.detach();
    for (const subscription of this.subscriptions) subscription.dispose();
  }

  private attach(git: GitExtension): void {
    if (this.api || !git.enabled) return;
    const api = git.getAPI(1);
    this.api = api;
    this.apiSubscriptions = [
      api.onDidOpenRepository((repository) => this.watch(repository)),
      api.onDidCloseRepository((repository) => this.unwatch(repository)),
      api.onDidChangeState(() => this.changed.fire())
    ];
    for (const repository of api.repositories) this.watch(repository);
    this.changed.fire();
  }

  private detach(): void {
    for (const subscription of [...this.apiSubscriptions, ...this.repositories.values()]) {
      subscription.dispose();
    }
    this.apiSubscriptions = [];
    this.repositories.clear();
    if (!this.api) return;
    this.api = null;
    this.changed.fire();
  }

  private watch(repository: GitRepository): void {
    if (this.repositories.has(repository)) return;
    this.repositories.set(
      repository,
      repository.state.onDidChange(() => this.changed.fire())
    );
    this.changed.fire();
  }

  private unwatch(repository: GitRepository): void {
    this.repositories.get(repository)?.dispose();
    this.repositories.delete(repository);
    this.changed.fire();
  }
}
