import { describe, expect, it } from 'vitest';

import { type GitBranch, type GitChange, gitStatusOf } from '../src/git/gitState';

const change = (fsPath: string): GitChange => ({ uri: { fsPath } });

function state(HEAD: GitBranch | undefined, index: string[] = [], workingTree: string[] = []) {
  return {
    HEAD,
    mergeChanges: [],
    indexChanges: index.map(change),
    workingTreeChanges: workingTree.map(change),
    untrackedChanges: [change('/r/new.ts')],
    onDidChange: () => ({ dispose: () => undefined })
  };
}

describe('gitStatusOf', () => {
  it('reports the branch, its upstream and unique changed files', () => {
    const head: GitBranch = {
      name: 'feat/x',
      commit: 'abc1234def',
      upstream: { remote: 'origin', name: 'feat/x' },
      ahead: 2,
      behind: 1
    };
    expect(gitStatusOf(state(head, ['/r/a.ts', '/r/b.ts'], ['/r/a.ts']))).toEqual({
      branch: 'feat/x',
      commit: 'abc1234def',
      upstream: { remote: 'origin', branch: 'feat/x', ahead: 2, behind: 1 },
      changed: 3
    });
  });

  it.each<[string, GitBranch | undefined]>([
    ['a detached head', { commit: 'abc1234def', upstream: { remote: 'origin', name: 'main' } }],
    ['an unpublished branch', { name: 'local', commit: 'abc1234def' }],
    ['an empty repository', undefined]
  ])('has no upstream on %s', (_, head) => {
    expect(gitStatusOf(state(head))).toEqual({
      branch: head?.name ?? null,
      commit: head?.commit ?? null,
      upstream: null,
      changed: 1
    });
  });
});
