import {
  type BranchCommand,
  branchNameError,
  type BranchResult,
  type LocalBranch,
  type RemoteBranch,
  type WorkspaceFolder
} from '@pocket-pilot/protocol';

const CONFLICTING = 'feat/conflict';
const FETCHED: RemoteBranch = {
  remote: 'origin',
  name: 'feat/fetched',
  commit: 'e1f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e'
};

interface MockBranch extends LocalBranch {
  upstream: string | null;
}

interface MockRepository {
  local: MockBranch[];
  remote: RemoteBranch[];
}

function local(name: string, commit: string | null, upstream: string | null = null): MockBranch {
  return { name, commit, worktree: null, upstream };
}

function repositories(): Map<string, MockRepository> {
  return new Map([
    [
      'w1/f1',
      {
        local: [
          local('feat/web', '4f2c9e1a7b3d5f60812c4e9a0b1d2c3e4f5a6b7c', 'origin/feat/web'),
          local('main', '0a1b2c3d4e5f60718293a4b5c6d7e8f901234567', 'origin/main'),
          local(CONFLICTING, '5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8'),
          {
            ...local('fix/sw', '7c8d9e0f1a2b3c4d5e6f708192a3b4c5d6e7f809'),
            worktree: '/Users/me/Git/pocket-pilot-sw'
          }
        ],
        remote: [
          {
            remote: 'origin',
            name: 'feat/branches',
            commit: 'c3d4e5f60718293a4b5c6d7e8f9012345670a1b2'
          },
          { remote: 'origin', name: 'renovate/zod', commit: null }
        ]
      }
    ],
    [
      'w2/f2',
      {
        local: [local('main', '9c1e5d7f3a2b4c6d8e0f1a2b3c4d5e6f7a8b9c0d', 'origin/main')],
        remote: []
      }
    ]
  ]);
}

export class MockBranches {
  private repositories = repositories();

  reset(): void {
    this.repositories = repositories();
  }

  list(windowId: string, folder: WorkspaceFolder): BranchResult {
    const repository = this.repository(windowId, folder);
    return {
      kind: 'branches',
      current: folder.git?.branch ?? null,
      local: repository.local.map(({ name, commit, worktree }) => ({ name, commit, worktree })),
      remote: repository.remote
    };
  }

  run(command: BranchCommand, folder: WorkspaceFolder): void {
    const repository = this.repository(command.windowId, folder);
    const git = folder.git;
    if (!git) throw new Error('This folder is not a Git repository');
    if (command.kind === 'fetchBranches') {
      if (!repository.remote.some((branch) => branch.name === FETCHED.name)) {
        repository.remote.push(FETCHED);
      }
      return;
    }
    if (command.kind === 'createBranch') {
      const invalid = branchNameError(command.name);
      if (invalid) throw new Error(invalid);
      if (repository.local.some((branch) => branch.name === command.name)) {
        throw new Error('A branch with this name already exists');
      }
      const created = local(command.name, git.commit);
      repository.local.unshift(created);
      this.switchTo(folder, created);
      return;
    }
    const branch = command.remote
      ? this.track(repository, command.remote, command.name)
      : repository.local.find((candidate) => candidate.name === command.name);
    if (!branch) throw new Error('This branch is no longer in the list');
    if (branch.worktree) throw new Error(`This branch is checked out in ${branch.worktree}`);
    if (command.name === CONFLICTING && git.changed > 0 && !command.stash) {
      throw new Error(
        'Your uncommitted changes conflict with this branch. Stash them and try again.'
      );
    }
    if (command.stash) git.changed = 0;
    if (command.remote) {
      repository.remote = repository.remote.filter(
        (candidate) => candidate.remote !== command.remote || candidate.name !== command.name
      );
      repository.local.unshift(branch);
    }
    this.switchTo(folder, branch);
  }

  private track(repository: MockRepository, remote: string, name: string): MockBranch | undefined {
    const branch = repository.remote.find(
      (candidate) => candidate.remote === remote && candidate.name === name
    );
    return branch && local(name, branch.commit, `${remote}/${name}`);
  }

  private switchTo(folder: WorkspaceFolder, branch: MockBranch): void {
    if (!folder.git) return;
    const [remote = '', ...rest] = branch.upstream?.split('/') ?? [];
    folder.git.branch = branch.name;
    folder.git.commit = branch.commit;
    folder.git.upstream = branch.upstream
      ? { remote, branch: rest.join('/'), ahead: 0, behind: 0 }
      : null;
  }

  private repository(windowId: string, folder: WorkspaceFolder): MockRepository {
    const key = `${windowId}/${folder.id}`;
    const repository = this.repositories.get(key) ?? { local: [], remote: [] };
    this.repositories.set(key, repository);
    return repository;
  }
}
