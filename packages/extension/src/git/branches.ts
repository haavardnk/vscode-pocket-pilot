import { resolve } from 'node:path';

import type { BranchResult } from '@pocket-pilot/protocol';

import type { GitRef, GitRepositoryState } from './gitState';

const LOCAL_REF = 0;
const REMOTE_REF = 1;
const HEADS_PREFIX = 'refs/heads/';

export type SwitchTarget =
  { kind: 'local'; name: string } | { kind: 'track'; name: string; upstream: string };

interface GitError {
  gitErrorCode?: unknown;
  stderr?: unknown;
  message?: unknown;
}

const CONFLICT = 'Your uncommitted changes conflict with this branch. Stash them and try again.';
const IN_WORKTREE = 'This branch is checked out in another worktree';

const ERROR_MESSAGES: Record<string, string> = {
  DirtyWorkTree: CONFLICT,
  LocalChangesOverwritten: CONFLICT,
  WorktreeBranchAlreadyUsed: IN_WORKTREE,
  BranchAlreadyExists: 'A branch with this name already exists',
  InvalidBranchName: 'Git rejected this branch name',
  AuthenticationFailed: 'Git could not sign in to the remote. Check VS Code on the desktop.',
  RemoteConnectionError: 'Could not reach the remote'
};

export function branchList(
  refs: readonly GitRef[],
  state: Pick<GitRepositoryState, 'HEAD' | 'worktrees'>,
  root: string
): BranchResult {
  const elsewhere = new Map(
    state.worktrees
      .filter((worktree) => !worktree.detached && resolve(worktree.path) !== resolve(root))
      .filter((worktree) => worktree.ref.startsWith(HEADS_PREFIX))
      .map((worktree) => [worktree.ref.slice(HEADS_PREFIX.length), worktree.path])
  );
  const local = refs.flatMap(({ type, name, commit }) =>
    type === LOCAL_REF && name
      ? [{ name, commit: commit ?? null, worktree: elsewhere.get(name) ?? null }]
      : []
  );
  const localNames = new Set(local.map((branch) => branch.name));
  const remote = refs.flatMap((ref) => {
    if (ref.type !== REMOTE_REF || !ref.remote || !ref.name?.startsWith(`${ref.remote}/`))
      return [];
    const name = ref.name.slice(ref.remote.length + 1);
    if (name === 'HEAD' || localNames.has(name)) return [];
    return [{ remote: ref.remote, name, commit: ref.commit ?? null }];
  });
  return { kind: 'branches', current: state.HEAD?.name ?? null, local, remote };
}

export function switchTarget(
  list: BranchResult,
  name: string,
  remote: string | null
): SwitchTarget | null {
  if (remote === null) {
    const branch = list.local.find((candidate) => candidate.name === name);
    if (!branch) throw new Error('This branch is no longer in the list');
    if (branch.worktree) throw new Error(`This branch is checked out in ${branch.worktree}`);
    return branch.name === list.current ? null : { kind: 'local', name };
  }
  const branch = list.remote.find(
    (candidate) => candidate.remote === remote && candidate.name === name
  );
  if (!branch) throw new Error('This branch is no longer in the list');
  return { kind: 'track', name, upstream: `${remote}/${name}` };
}

function firstLine(text: string): string | null {
  const line = text
    .split('\n')
    .map((candidate) => candidate.replace(/^(fatal|error):\s*/, '').trim())
    .find((candidate) => candidate !== '');
  return line ?? null;
}

export function gitErrorMessage(error: unknown): string {
  const details: GitError = typeof error === 'object' && error !== null ? error : {};
  const stderr = typeof details.stderr === 'string' ? details.stderr : '';
  const code = typeof details.gitErrorCode === 'string' ? details.gitErrorCode : '';
  if (/already (checked out|used by worktree) at/.test(stderr)) return IN_WORKTREE;
  const known = ERROR_MESSAGES[code];
  if (known) return known;
  const fromStderr = firstLine(stderr);
  if (fromStderr) return fromStderr;
  return typeof details.message === 'string' && details.message !== ''
    ? details.message
    : String(error);
}
