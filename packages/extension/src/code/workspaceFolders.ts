import type { Repository, WindowState } from '@pocket-pilot/protocol';
import * as vscode from 'vscode';

import type { GitStatusSource } from '../git/gitStatus';
import { folderRepository } from '../git/repository';
import { type CodeFolder, codeFolder } from './folders';

export class WorkspaceFolders {
  private folders: CodeFolder[] = [];
  private repositories: Repository[] = [];
  private folderRepositories = new Map<string, string>();
  private version = 0;
  private gitKey = '';

  constructor(
    private readonly git: GitStatusSource,
    private readonly changed: () => void
  ) {}

  list(): CodeFolder[] {
    return this.folders;
  }

  state(): Pick<WindowState, 'repositories' | 'folders'> {
    return {
      repositories: this.repositories,
      folders: this.folders.map(({ id, name, root }) => ({
        id,
        name,
        repositoryKey: this.folderRepositories.get(id) ?? null,
        git: this.git.statusFor(root)
      }))
    };
  }

  gitChanged(): void {
    const key = JSON.stringify(this.folders.map((folder) => this.git.statusFor(folder.root)));
    if (key === this.gitKey) return;
    this.gitKey = key;
    this.changed();
  }

  async refresh(): Promise<void> {
    const version = ++this.version;
    const folders = (vscode.workspace.workspaceFolders ?? []).filter(
      (folder) => folder.uri.scheme === 'file'
    );
    this.folders = folders.map((folder) => codeFolder(folder.name, folder.uri.fsPath));
    this.changed();
    const resolved = await Promise.all(
      this.folders.map(async ({ id, root }) => ({ id, repository: await folderRepository(root) }))
    );
    if (version !== this.version) return;
    this.folderRepositories = new Map(resolved.map(({ id, repository }) => [id, repository.key]));
    this.repositories = [
      ...new Map(resolved.map(({ repository }) => [repository.key, repository])).values()
    ];
    this.changed();
  }
}
