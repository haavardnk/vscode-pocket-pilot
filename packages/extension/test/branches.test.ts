import type { BranchResult } from '@pocket-pilot/protocol';
import { describe, expect, it } from 'vitest';

import { branchList, gitErrorMessage, switchTarget } from '../src/git/branches';
import type { GitRef } from '../src/git/gitState';

const ROOT = '/repo';

const refs: GitRef[] = [
  { type: 0, name: 'feat/web', commit: 'a1' },
  { type: 0, name: 'main', commit: 'b2' },
  { type: 0, name: 'fix/sw', commit: 'c3' },
  { type: 1, name: 'origin/HEAD', remote: 'origin', commit: 'b2' },
  { type: 1, name: 'origin/main', remote: 'origin', commit: 'b2' },
  { type: 1, name: 'origin/feat/new', remote: 'origin', commit: 'd4' },
  { type: 1, name: 'fork/main', remote: 'fork', commit: 'e5' },
  { type: 2, name: 'v1.0', commit: 'f6' }
];

const list: BranchResult = branchList(
  refs,
  {
    HEAD: { name: 'feat/web', commit: 'a1' },
    worktrees: [
      { path: ROOT, ref: 'refs/heads/feat/web', detached: false },
      { path: '/elsewhere', ref: 'refs/heads/fix/sw', detached: false },
      { path: '/detached', ref: 'b2', detached: true }
    ]
  },
  ROOT
);

describe('branchList', () => {
  it('lists local branches with worktrees and remote-only branches', () => {
    expect(list).toEqual({
      kind: 'branches',
      current: 'feat/web',
      local: [
        { name: 'feat/web', commit: 'a1', worktree: null },
        { name: 'main', commit: 'b2', worktree: null },
        { name: 'fix/sw', commit: 'c3', worktree: '/elsewhere' }
      ],
      remote: [{ remote: 'origin', name: 'feat/new', commit: 'd4' }]
    });
  });

  it('has no current branch on a detached head', () => {
    expect(branchList(refs, { HEAD: { commit: 'b2' }, worktrees: [] }, ROOT).current).toBeNull();
  });
});

describe('switchTarget', () => {
  it.each<[string, string | null, ReturnType<typeof switchTarget>]>([
    ['main', null, { kind: 'local', name: 'main' }],
    ['feat/web', null, null],
    ['feat/new', 'origin', { kind: 'track', name: 'feat/new', upstream: 'origin/feat/new' }]
  ])('resolves %s from %s', (name, remote, target) => {
    expect(switchTarget(list, name, remote)).toEqual(target);
  });

  it.each<[string, string | null, string]>([
    ['gone', null, 'no longer in the list'],
    ['main', 'origin', 'no longer in the list'],
    ['--orphan', null, 'no longer in the list'],
    ['fix/sw', null, 'checked out in /elsewhere']
  ])('refuses %s from %s', (name, remote, message) => {
    expect(() => switchTarget(list, name, remote)).toThrow(message);
  });
});

describe('gitErrorMessage', () => {
  it.each<[unknown, string]>([
    [{ gitErrorCode: 'DirtyWorkTree', stderr: 'error: …' }, 'conflict with this branch'],
    [{ gitErrorCode: 'LocalChangesOverwritten' }, 'conflict with this branch'],
    [{ gitErrorCode: 'BranchAlreadyExists' }, 'already exists'],
    [{ stderr: "fatal: 'x' is already checked out at '/w'" }, 'another worktree'],
    [{ stderr: "fatal: 'x' is already used by worktree at '/w'" }, 'another worktree'],
    [{ stderr: '\nfatal: bad revision\nmore' }, 'bad revision'],
    [new Error('plain failure'), 'plain failure']
  ])('explains %j', (error, message) => {
    expect(gitErrorMessage(error)).toContain(message);
  });
});
