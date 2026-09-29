import type { GitStatus } from '@pocket-pilot/protocol';
import type { Event, Uri } from 'vscode';

export interface GitChange {
  readonly uri: Pick<Uri, 'fsPath'>;
}

export interface GitBranch {
  readonly name?: string;
  readonly commit?: string;
  readonly upstream?: { readonly remote: string; readonly name: string };
  readonly ahead?: number;
  readonly behind?: number;
}

export interface GitRef {
  readonly type: number;
  readonly name?: string;
  readonly commit?: string;
  readonly remote?: string;
}

export interface GitWorktree {
  readonly path: string;
  readonly ref: string;
  readonly detached: boolean;
}

export interface GitRepositoryState {
  readonly HEAD: GitBranch | undefined;
  readonly worktrees: readonly GitWorktree[];
  readonly mergeChanges: readonly GitChange[];
  readonly indexChanges: readonly GitChange[];
  readonly workingTreeChanges: readonly GitChange[];
  readonly untrackedChanges: readonly GitChange[];
  readonly onDidChange: Event<void>;
}

export interface GitRepository {
  readonly rootUri: Uri;
  readonly state: GitRepositoryState;
  getBranches(query: { remote?: boolean; sort?: 'committerdate' }): Promise<GitRef[]>;
  checkout(treeish: string): Promise<void>;
  createBranch(name: string, checkout: boolean, ref?: string): Promise<void>;
  setBranchUpstream(name: string, upstream: string): Promise<void>;
  fetch(options: { all?: boolean; prune?: boolean }): Promise<void>;
  createStash(options: { message?: string; includeUntracked?: boolean }): Promise<void>;
}

export interface GitApi {
  readonly repositories: readonly GitRepository[];
  readonly onDidOpenRepository: Event<GitRepository>;
  readonly onDidCloseRepository: Event<GitRepository>;
  readonly onDidChangeState: Event<'uninitialized' | 'initialized'>;
  getRepository(uri: Uri): GitRepository | null;
}

export interface GitExtension {
  readonly enabled: boolean;
  readonly onDidChangeEnablement: Event<boolean>;
  getAPI(version: 1): GitApi;
}

export function gitStatusOf(state: GitRepositoryState): GitStatus {
  const head = state.HEAD;
  const changed = new Set(
    [
      ...state.mergeChanges,
      ...state.indexChanges,
      ...state.workingTreeChanges,
      ...state.untrackedChanges
    ].map((change) => change.uri.fsPath)
  );
  return {
    branch: head?.name ?? null,
    commit: head?.commit ?? null,
    upstream:
      head?.name && head.upstream
        ? {
            remote: head.upstream.remote,
            branch: head.upstream.name,
            ahead: head.ahead ?? 0,
            behind: head.behind ?? 0
          }
        : null,
    changed: changed.size
  };
}
